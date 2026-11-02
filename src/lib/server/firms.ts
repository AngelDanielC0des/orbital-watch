/**
 * NASA FIRMS (VIIRS NOAA-20 / NOAA-21) active-fire CSV helpers (server side): streaming parser,
 * 0.5 degree binner and bounded top-N hotspot selection. Pure functions plus an injectable `fetchImpl`;
 * nothing here throws out of `fetchFires`. Memory stays bounded: bodies are never read as one string.
 */
import type { FireWindow, FiresDTO, LayerError, Result } from "@/types/layers";
import { err, layerError, ok, toLayerError } from "../layers/result";

/** Root of the FIRMS global CSV feeds. */
export const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire";

/** Global CSV per sensor and rolling window. */
export const FIRMS_FILES: Readonly<Record<FireWindow, readonly { sensor: "NOAA-20" | "NOAA-21"; url: string }[]>> = {
  "24h": [
    { sensor: "NOAA-20", url: `${FIRMS_BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv` },
    { sensor: "NOAA-21", url: `${FIRMS_BASE}/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv` },
  ],
  "48h": [
    { sensor: "NOAA-20", url: `${FIRMS_BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_48h.csv` },
    { sensor: "NOAA-21", url: `${FIRMS_BASE}/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_48h.csv` },
  ],
  "7d": [
    { sensor: "NOAA-20", url: `${FIRMS_BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_7d.csv` },
    { sensor: "NOAA-21", url: `${FIRMS_BASE}/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_7d.csv` },
  ],
};

/** Grid resolution in degrees. */
export const GRID_STEP = 0.5;
/** Grid columns (180 W to 180 E). */
export const GRID_COLS = 720;
/** Grid rows (90 N to 90 S). */
export const GRID_ROWS = 360;
/** Default cap of hotspots kept for the DTO. */
export const DEFAULT_MAX_HOTSPOTS = 2000;
/** Largest plausible FRP (MW); anything above is treated as a corrupt row. */
const MAX_FRP = 20000;

/** Row-major cell index (row 0 at 90 N, col 0 at 180 W), clamped to the grid. */
export function cellIndex(lat: number, lon: number): number {
  const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((90 - lat) / GRID_STEP)));
  const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((lon + 180) / GRID_STEP)));
  return row * GRID_COLS + col;
}

/** Log-scaled detection count 0-255 (saturates at 100 detections). */
export function densityLevel(count: number): number {
  return Math.min(255, Math.round((255 * Math.log10(1 + count)) / Math.log10(101)));
}

/** Log-scaled max FRP 0-255 (saturates at 1000 MW). */
export function intensityLevel(maxFrp: number): number {
  return Math.min(255, Math.round((255 * Math.log10(1 + maxFrp)) / Math.log10(1001)));
}

/** Incremental CSV consumer: feed lines, then `finish` into a DTO. */
export interface FirmsAccumulator {
  /** Next non-empty line is a header (call at the start of every file). */
  beginFile(): void;
  pushLine(line: string): void;
  /** Accepted data rows. */
  readonly rows: number;
  /** Data rows dropped as malformed or out of range. */
  readonly rejected: number;
  finish(window: FireWindow, sources: string[], maxHotspots?: number): FiresDTO;
}

interface ColumnMap {
  lat: number;
  lon: number;
  frp: number;
  date: number;
  time: number;
  daynight: number;
  width: number;
}

function parseHeader(line: string): ColumnMap | null {
  const names = line.split(",").map((name) => name.trim().toLowerCase());
  const lat = names.indexOf("latitude");
  const lon = names.indexOf("longitude");
  const frp = names.indexOf("frp");
  const date = names.indexOf("acq_date");
  const time = names.indexOf("acq_time");
  const daynight = names.indexOf("daynight");
  if (lat < 0 || lon < 0 || frp < 0 || date < 0 || time < 0 || daynight < 0) return null;
  return { lat, lon, frp, date, time, daynight, width: names.length };
}

function toIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,4}$/.test(time)) return null;
  const padded = time.padStart(4, "0");
  const hh = Number(padded.slice(0, 2));
  const mm = Number(padded.slice(2));
  if (hh > 23 || mm > 59) return null;
  return `${date}T${padded.slice(0, 2)}:${padded.slice(2)}:00Z`;
}

function toNumber(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? NaN : Number(trimmed);
}

/** Creates an empty accumulator (one per response; share it across both sensors). */
export function createFirmsAccumulator(): FirmsAccumulator {
  const counts = new Uint32Array(GRID_COLS * GRID_ROWS);
  const maxFrp = new Float32Array(GRID_COLS * GRID_ROWS);
  let columns: ColumnMap | null = null;
  let expectHeader = true;
  let rows = 0;
  let rejected = 0;
  let minTs: string | null = null;
  let maxTs: string | null = null;

  // Bounded min-heap of the strongest hotspots (root = weakest kept), as parallel typed arrays.
  let heapSize = 0;
  const heapCap = DEFAULT_MAX_HOTSPOTS;
  const hFrp = new Float32Array(heapCap);
  const hLat = new Float64Array(heapCap);
  const hLon = new Float64Array(heapCap);
  const hDay = new Uint8Array(heapCap);

  const swap = (a: number, b: number): void => {
    const f = hFrp[a];
    hFrp[a] = hFrp[b];
    hFrp[b] = f;
    const la = hLat[a];
    hLat[a] = hLat[b];
    hLat[b] = la;
    const lo = hLon[a];
    hLon[a] = hLon[b];
    hLon[b] = lo;
    const d = hDay[a];
    hDay[a] = hDay[b];
    hDay[b] = d;
  };
  const siftUp = (start: number): void => {
    let i = start;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (hFrp[parent] <= hFrp[i]) break;
      swap(parent, i);
      i = parent;
    }
  };
  const siftDown = (start: number): void => {
    let i = start;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < heapSize && hFrp[l] < hFrp[smallest]) smallest = l;
      if (r < heapSize && hFrp[r] < hFrp[smallest]) smallest = r;
      if (smallest === i) break;
      swap(smallest, i);
      i = smallest;
    }
  };
  const offer = (lat: number, lon: number, frp: number, day: number): void => {
    if (heapSize < heapCap) {
      hFrp[heapSize] = frp;
      hLat[heapSize] = lat;
      hLon[heapSize] = lon;
      hDay[heapSize] = day;
      heapSize += 1;
      siftUp(heapSize - 1);
    } else if (heapCap > 0 && frp > hFrp[0]) {
      hFrp[0] = frp;
      hLat[0] = lat;
      hLon[0] = lon;
      hDay[0] = day;
      siftDown(0);
    }
  };

  return {
    get rows() {
      return rows;
    },
    get rejected() {
      return rejected;
    },
    beginFile() {
      expectHeader = true;
      columns = null;
    },
    pushLine(rawLine: string) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line.trim() === "") return;
      if (expectHeader) {
        expectHeader = false;
        columns = parseHeader(line);
        return;
      }
      if (!columns) {
        rejected += 1;
        return;
      }
      const parts = line.split(",");
      if (parts.length < columns.width) {
        rejected += 1;
        return;
      }
      const lat = toNumber(parts[columns.lat]);
      const lon = toNumber(parts[columns.lon]);
      const frp = toNumber(parts[columns.frp]);
      const ts = toIso(parts[columns.date].trim(), parts[columns.time].trim());
      if (
        ts === null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        !Number.isFinite(frp) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180 ||
        frp < 0 ||
        frp > MAX_FRP
      ) {
        rejected += 1;
        return;
      }
      rows += 1;
      const index = cellIndex(lat, lon);
      counts[index] += 1;
      if (frp > maxFrp[index]) maxFrp[index] = frp;
      if (minTs === null || ts < minTs) minTs = ts;
      if (maxTs === null || ts > maxTs) maxTs = ts;
      offer(lat, lon, frp, parts[columns.daynight].trim().toUpperCase() === "D" ? 1 : 0);
    },
    finish(window, sources, maxHotspots = DEFAULT_MAX_HOTSPOTS) {
      const cells: number[] = [];
      for (let i = 0; i < counts.length; i += 1) {
        if (counts[i] === 0) continue;
        cells.push(i, densityLevel(counts[i]), intensityLevel(maxFrp[i]));
      }
      const order: number[] = [];
      for (let i = 0; i < heapSize; i += 1) order.push(i);
      order.sort((a, b) => hFrp[b] - hFrp[a]);
      const hotspots: number[] = [];
      for (const i of order.slice(0, Math.max(0, maxHotspots))) {
        hotspots.push(Number(hLat[i].toFixed(3)), Number(hLon[i].toFixed(3)), Number(hFrp[i].toFixed(1)), hDay[i]);
      }
      return {
        window,
        generatedAt: new Date().toISOString(),
        acqRange: minTs !== null && maxTs !== null ? { from: minTs, to: maxTs } : null,
        sources,
        grid: { cols: GRID_COLS, rows: GRID_ROWS, cells },
        hotspots,
        total: rows,
      };
    },
  };
}

/**
 * Streams a CSV body into `acc` line by line (chunk boundaries and CRLF handled).
 * Throws `Error("FIRMS payload too large")` past `maxBytes`.
 */
export async function parseCsvStream(
  stream: ReadableStream<Uint8Array>,
  acc: FirmsAccumulator,
  maxBytes: number = 40 * 1024 * 1024,
): Promise<number> {
  acc.beginFile();
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let carry = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error("FIRMS payload too large");
      const text = carry + decoder.decode(value, { stream: true });
      let start = 0;
      let nl = text.indexOf("\n", start);
      while (nl !== -1) {
        acc.pushLine(text.slice(start, nl));
        start = nl + 1;
        nl = text.indexOf("\n", start);
      }
      carry = text.slice(start);
    }
    carry += decoder.decode();
    if (carry !== "") acc.pushLine(carry);
    return bytes;
  } catch (cause) {
    await reader.cancel().catch(() => undefined);
    throw cause;
  } finally {
    reader.releaseLock();
  }
}

/** Shorter than the 13-column header line: the download is empty or truncated. */
const MIN_CSV_BYTES = 64;

/**
 * Fetches both VIIRS sensors for `window` and bins them into one DTO. Partial success when a single
 * sensor fails (it is omitted from `sources`); both failing yields an `upstream` error.
 */
export async function fetchFires(
  window: FireWindow,
  opts: { fetchImpl?: typeof fetch; maxHotspots?: number } = {},
): Promise<Result<FiresDTO, LayerError>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const files = FIRMS_FILES[window];
  // `no-store`: the CSVs (4.5–29 MB) exceed the 2 MB Data Cache limit; on Vercel a cached/teed body came back
  // empty for the second sensor. The route memoises the binned DTO instead.
  const init: RequestInit = { cache: "no-store", signal: AbortSignal.timeout(window === "7d" ? 55000 : 25000) };
  const bodies = await Promise.all(
    files.map(async (file): Promise<Result<ReadableStream<Uint8Array>, LayerError>> => {
      try {
        const response = await fetchImpl(file.url, init);
        if (response.status !== 200 || !response.body) {
          await response.body?.cancel().catch(() => undefined);
          return err(layerError("upstream", `HTTP ${response.status} ${file.url}`));
        }
        return ok(response.body);
      } catch (cause) {
        return err(toLayerError(cause, "upstream"));
      }
    }),
  );
  const acc = createFirmsAccumulator();
  const sources: string[] = [];
  const failures: string[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const body = bodies[i];
    if (!body.ok) {
      failures.push(`${files[i].sensor}: ${body.error.detail ?? body.error.code}`);
      continue;
    }
    try {
      const bytes = await parseCsvStream(body.value, acc);
      // A real file always has at least the header line; an empty body is a failed download, not "no fires".
      if (bytes < MIN_CSV_BYTES) failures.push(`${files[i].sensor}: empty body`);
      else sources.push(files[i].sensor);
    } catch (cause) {
      failures.push(`${files[i].sensor}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  if (sources.length === 0) return err(layerError("upstream", failures.join("; ")));
  return ok(acc.finish(window, sources, opts.maxHotspots));
}
