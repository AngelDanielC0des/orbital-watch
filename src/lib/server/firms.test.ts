import { describe, expect, it } from "vitest";
import {
  FIRMS_FILES,
  GRID_COLS,
  GRID_ROWS,
  cellIndex,
  createFirmsAccumulator,
  densityLevel,
  fetchFires,
  intensityLevel,
  parseCsvStream,
} from "./firms";

const HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight";
const LINES = [
  "-12.345,131.234,330.5,0.39,0.36,2026-11-02,0412,N20,n,2.0NRT,290.1,5.4,D",
  "34.5,-118.25,355.1,0.5,0.4,2026-11-02,2105,N20,h,2.0NRT,301.2,120.8,N",
  "34.5,-118.26,340.0,0.5,0.4,2026-11-01,0030,N20,n,2.0NRT,295.0,12.0,D",
];
const CSV = [HEADER, ...LINES].join("\n") + "\n";

function feed(csv: string) {
  const acc = createFirmsAccumulator();
  acc.beginFile();
  for (const line of csv.split("\n")) acc.pushLine(line);
  return acc;
}

function streamOf(text: string, chunk: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunk));
      offset += chunk;
    },
  });
}

describe("grid math", () => {
  it("maps the corners", () => {
    expect(cellIndex(90, -180)).toBe(0);
    expect(cellIndex(-90, 180)).toBe(GRID_COLS * GRID_ROWS - 1);
    expect(cellIndex(90, 180)).toBe(GRID_COLS - 1);
    expect(cellIndex(-90, -180)).toBe((GRID_ROWS - 1) * GRID_COLS);
    expect(cellIndex(0.1, 0.1)).toBe(179 * GRID_COLS + 360);
  });

  it("log-scales density and intensity", () => {
    expect(densityLevel(0)).toBe(0);
    expect(densityLevel(1)).toBe(38);
    expect(densityLevel(100)).toBe(255);
    expect(densityLevel(5000)).toBe(255);
    expect(intensityLevel(0)).toBe(0);
    expect(intensityLevel(1000)).toBe(255);
    expect(intensityLevel(100)).toBe(Math.round((255 * Math.log10(101)) / Math.log10(1001)));
  });
});

describe("accumulator", () => {
  it("bins real-shaped rows", () => {
    const acc = feed(CSV);
    expect(acc.rows).toBe(3);
    expect(acc.rejected).toBe(0);
    const dto = acc.finish("24h", ["NOAA-20"]);
    expect(dto.total).toBe(3);
    expect(dto.sources).toEqual(["NOAA-20"]);
    expect(dto.acqRange).toEqual({ from: "2026-11-01T00:30:00Z", to: "2026-11-02T21:05:00Z" });
    expect(dto.grid.cols).toBe(720);
    expect(dto.grid.cells).toHaveLength(6); // two non-empty cells
    const la = cellIndex(34.5, -118.25);
    const at = dto.grid.cells.indexOf(la);
    expect(dto.grid.cells.slice(at, at + 3)).toEqual([la, densityLevel(2), intensityLevel(120.8)]);
    expect(dto.hotspots).toEqual([34.5, -118.25, 120.8, 0, 34.5, -118.26, 12, 1, -12.345, 131.234, 5.4, 1]);
  });

  it("handles reordered and extra columns and CRLF", () => {
    const csv = ["daynight,extra,frp,acq_time,acq_date,longitude,latitude", "N,x,7.5,0905,2026-11-02,10.25,-3.5", ""].join("\r\n");
    const acc = createFirmsAccumulator();
    acc.beginFile();
    for (const line of csv.split("\n")) acc.pushLine(line);
    expect(acc.rows).toBe(1);
    const dto = acc.finish("24h", ["NOAA-21"]);
    expect(dto.hotspots).toEqual([-3.5, 10.25, 7.5, 0]);
    expect(dto.acqRange?.from).toBe("2026-11-02T09:05:00Z");
  });

  it("counts malformed rows as rejected", () => {
    const bad = [
      HEADER,
      LINES[0],
      "1.0,2.0,330.5,0.39,0.36,2026-11-02,0412,N20,n,2.0NRT,290.1",
      "NaN,2.0,330.5,0.39,0.36,2026-11-02,0412,N20,n,2.0NRT,290.1,5.4,D",
      "95,2.0,330.5,0.39,0.36,2026-11-02,0412,N20,n,2.0NRT,290.1,5.4,D",
      "1.0,200,330.5,0.39,0.36,2026-11-02,0412,N20,n,2.0NRT,290.1,5.4,D",
      "1.0,2.0,330.5,0.39,0.36,2026-11-02,0412,N20,n,2.0NRT,290.1,-1,D",
      "1.0,2.0,330.5,0.39,0.36,2026-11-02,0412,N20,n,2.0NRT,290.1,99999,D",
      "1.0,2.0,330.5,0.39,0.36,2026-11-02,0412,N20,n,2.0NRT,290.1,,D",
      "1.0,2.0,330.5,0.39,0.36,not-a-date,0412,N20,n,2.0NRT,290.1,5.4,D",
    ].join("\n");
    const acc = feed(bad);
    expect(acc.rows).toBe(1);
    expect(acc.rejected).toBe(8);
  });

  it("rejects every row of a file whose header lacks required columns", () => {
    const acc = feed("latitude,longitude\n1,2\n3,4\n");
    expect(acc.rows).toBe(0);
    expect(acc.rejected).toBe(2);
  });

  it("expects a new header after beginFile", () => {
    const acc = feed(CSV);
    acc.beginFile();
    for (const line of CSV.split("\n")) acc.pushLine(line);
    expect(acc.rows).toBe(6);
    expect(acc.rejected).toBe(0);
  });

  it("keeps only the strongest hotspots under the cap", () => {
    const lines = [HEADER];
    for (let i = 1; i <= 50; i += 1) {
      lines.push(`${i}.0,${i}.0,330.5,0.39,0.36,2026-11-02,0412,N20,n,2.0NRT,290.1,${i}.0,D`);
    }
    const dto = feed(lines.join("\n")).finish("24h", ["NOAA-20"], 5);
    expect(dto.total).toBe(50);
    expect(dto.hotspots).toHaveLength(20);
    const frps = dto.hotspots.filter((_, i) => i % 4 === 2);
    expect(frps).toEqual([50, 49, 48, 47, 46]);
  });

  it("returns a null acqRange for an empty file", () => {
    const dto = feed(HEADER + "\n").finish("48h", []);
    expect(dto.acqRange).toBeNull();
    expect(dto.total).toBe(0);
    expect(dto.grid.cells).toEqual([]);
  });
});

describe("parseCsvStream", () => {
  it("parses a CSV delivered in 7-byte chunks", async () => {
    const acc = createFirmsAccumulator();
    await parseCsvStream(streamOf(CSV.replace(/\n/g, "\r\n"), 7), acc);
    expect(acc.rows).toBe(3);
    expect(acc.rejected).toBe(0);
  });

  it("handles multi-byte characters split across chunks and a missing trailing newline", async () => {
    const acc = createFirmsAccumulator();
    await parseCsvStream(streamOf(`${HEADER},ñ\n${LINES[0]},ñ`, 3), acc);
    expect(acc.rows).toBe(1);
  });

  it("aborts beyond maxBytes", async () => {
    const acc = createFirmsAccumulator();
    await expect(parseCsvStream(streamOf(CSV, 16), acc, 100)).rejects.toThrow("FIRMS payload too large");
  });
});

function csvResponse(body: string, status = 200): Response {
  return new Response(status === 200 ? body : null, { status });
}

describe("fetchFires", () => {
  it("merges both sensors", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(String(input));
      return csvResponse(CSV);
    };
    const result = await fetchFires("24h", { fetchImpl });
    expect(urls).toEqual(FIRMS_FILES["24h"].map((f) => f.url));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sources).toEqual(["NOAA-20", "NOAA-21"]);
      expect(result.value.total).toBe(6);
    }
  });

  it("succeeds partially when one sensor fails", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes("J2_VIIRS")) return csvResponse("", 503);
      return csvResponse(CSV);
    };
    const result = await fetchFires("48h", { fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sources).toEqual(["NOAA-20"]);
      expect(result.value.total).toBe(3);
    }
  });

  it("treats an empty 200 body as a failed sensor (Vercel regression)", async () => {
    const inits: (RequestInit | undefined)[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      inits.push(init);
      if (String(input).includes("J2_VIIRS")) return csvResponse("");
      return csvResponse(CSV);
    };
    const result = await fetchFires("24h", { fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sources).toEqual(["NOAA-20"]);
      expect(result.value.total).toBe(3);
    }
    expect(inits.every((i) => i?.cache === "no-store")).toBe(true);
  });

  it("succeeds partially when one fetch throws", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input).includes("J1_VIIRS")) throw new TypeError("network down");
      return csvResponse(CSV);
    };
    const result = await fetchFires("7d", { fetchImpl });
    expect(result.ok && result.value.sources).toEqual(["NOAA-21"]);
  });

  it("returns an upstream error when both fail", async () => {
    const fetchImpl: typeof fetch = async () => csvResponse("", 500);
    const result = await fetchFires("24h", { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("upstream");
  });
});
