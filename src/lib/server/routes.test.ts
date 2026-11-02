import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getFires } from "@/app/api/orbital/fires/route";
import { GET as getOzone } from "@/app/api/orbital/ozone/route";
import { GET as getPollution } from "@/app/api/orbital/pollution/route";
import { __resetMemoForTests } from "@/lib/server/memo";
import { fetchFires } from "@/lib/server/firms";
import { resolveOzone } from "@/lib/server/gibs";
import { fetchPollution } from "@/lib/server/open-meteo";
import type { ApiEnvelope, FiresDTO, OzoneDescriptor, PollutionDTO } from "@/types/layers";

vi.mock("@/lib/server/firms", () => ({ fetchFires: vi.fn() }));
vi.mock("@/lib/server/open-meteo", () => ({ fetchPollution: vi.fn(), upstreamCallCount: () => 0 }));
vi.mock("@/lib/server/gibs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/gibs")>();
  return { ...actual, resolveOzone: vi.fn() };
});

const FIRES: FiresDTO = {
  window: "24h",
  generatedAt: "2026-11-02T10:00:00Z",
  acqRange: { from: "2026-11-01", to: "2026-11-02" },
  sources: ["NOAA-20", "NOAA-21"],
  grid: { cols: 720, rows: 360, cells: [10, 200, 100] },
  hotspots: [10, 20, 55, 1],
  total: 1,
};
const POLLUTION: PollutionDTO = {
  time: "2026-11-02T12:00Z",
  points: [{ id: "a", name: "A", lat: 1, lon: 2, pm2_5: 1, pm10: 2, no2: 3, o3: 4, so2: 5, co: 6, eaqi: 1, usaqi: 2 }],
};
const DESCRIPTOR: OzoneDescriptor = {
  layer: "OMI_Ozone_TOMS_Total_Column",
  product: "OMI_TOMS",
  date: "2026-10-29",
  imageUrl: "https://example.test/img.png",
  width: 2048,
  height: 1024,
  attribution: "NASA",
};

const mockedFires = vi.mocked(fetchFires);
const mockedPollution = vi.mocked(fetchPollution);
const mockedOzone = vi.mocked(resolveOzone);

function req(path: string): Request {
  return new Request(`http://localhost/api/orbital/${path}`);
}

function stubSnapshots(files: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string) => {
      const path = new URL(input.toString()).pathname;
      return path in files ? Response.json(files[path]) : new Response("nope", { status: 404 });
    }),
  );
}

beforeEach(() => {
  __resetMemoForTests();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  stubSnapshots({});
});

describe("validation", () => {
  it.each([
    ["fires?window=bogus", getFires],
    ["fires?mock=nope", getFires],
    ["ozone?product=bogus", getOzone],
    ["ozone?size=1000", getOzone],
    ["ozone?mock=x", getOzone],
    ["pollution?mock=x", getPollution],
  ])("%s -> 400 no-store", async (path, handler) => {
    const res = await handler(req(path));
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as ApiEnvelope<unknown>;
    expect(body.ok).toBe(false);
    if (!body.ok) expect(body.error.code).toBe("invalid");
  });
});

describe("success envelopes", () => {
  it("fires 200 with cache headers", async () => {
    mockedFires.mockResolvedValue({ ok: true, value: FIRES });
    const res = await getFires(req("fires?window=24h&extra=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=3600, stale-while-revalidate=7200");
    const body = (await res.json()) as ApiEnvelope<FiresDTO>;
    expect(body.ok && body.meta.source).toBe("NOAA-20 + NOAA-21");
    expect(body.ok && body.meta.dataDate).toBe("2026-11-02");
    expect(mockedFires).toHaveBeenCalledWith("24h");
  });

  it("fires with total 0 is a valid 200", async () => {
    mockedFires.mockResolvedValue({ ok: true, value: { ...FIRES, total: 0, hotspots: [], acqRange: null } });
    const res = await getFires(req("fires"));
    expect(res.status).toBe(200);
  });

  it("pollution 200", async () => {
    mockedPollution.mockResolvedValue({ ok: true, value: POLLUTION });
    const res = await getPollution(req("pollution"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=3600, stale-while-revalidate=7200");
    const body = (await res.json()) as ApiEnvelope<PollutionDTO>;
    expect(body.ok && body.meta.dataDate).toBe(POLLUTION.time);
  });

  it("ozone 200 with 6 h ttl and fallback header when the product fell back", async () => {
    mockedOzone.mockResolvedValue({ descriptor: DESCRIPTOR, fallback: true });
    const res = await getOzone(req("ozone?product=OMPS&size=4096"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=21600, stale-while-revalidate=43200");
    expect(res.headers.get("X-Orbital-Fallback")).toBe("snapshot");
    expect(mockedOzone).toHaveBeenCalledWith({ product: "OMPS", size: 4096 });
  });
});

describe("memo", () => {
  it("de-duplicates concurrent and subsequent requests", async () => {
    mockedFires.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, value: FIRES };
    });
    const [a, b] = await Promise.all([getFires(req("fires?window=7d")), getFires(req("fires?window=7d"))]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    await getFires(req("fires?window=7d"));
    expect(mockedFires).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    mockedFires.mockResolvedValue({ ok: false, error: { code: "upstream", message: "x" } });
    await getFires(req("fires"));
    await getFires(req("fires"));
    expect(mockedFires).toHaveBeenCalledTimes(2);
  });
});

describe("dev flags and fallbacks", () => {
  it("mock=error -> 500 no-store", async () => {
    const res = await getFires(req("fires?mock=error"));
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mockedFires).not.toHaveBeenCalled();
  });

  it("upstream failure serves the snapshot with X-Orbital-Fallback", async () => {
    mockedFires.mockResolvedValue({ ok: false, error: { code: "upstream", message: "x" } });
    stubSnapshots({
      "/sites/orbitalwatch/data/snapshots.json": {
        fires: { date: "2026-10-30", path: "/sites/orbitalwatch/data/fires-snapshot-2026-10-30.json" },
      },
      "/sites/orbitalwatch/data/fires-snapshot-2026-10-30.json": FIRES,
    });
    const res = await getFires(req("fires"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Orbital-Fallback")).toBe("snapshot");
    const body = (await res.json()) as ApiEnvelope<FiresDTO>;
    expect(body.ok && body.meta.fallback).toBe(true);
  });

  it("mock=snapshot skips upstream (pollution)", async () => {
    stubSnapshots({
      "/sites/orbitalwatch/data/snapshots.json": {
        pollution: { date: "2026-10-30", path: "/sites/orbitalwatch/data/pollution-snapshot-2026-10-30.json" },
      },
      "/sites/orbitalwatch/data/pollution-snapshot-2026-10-30.json": POLLUTION,
    });
    const res = await getPollution(req("pollution?mock=snapshot"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Orbital-Fallback")).toBe("snapshot");
    expect(mockedPollution).not.toHaveBeenCalled();
  });

  it("rejects manifest paths outside the data directory", async () => {
    stubSnapshots({
      "/sites/orbitalwatch/data/snapshots.json": { pollution: { date: "2026-10-30", path: "/etc/passwd.json" } },
    });
    const res = await getPollution(req("pollution?mock=snapshot"));
    expect(res.status).toBe(503);
  });

  it("upstream failure and no snapshot -> 503 no-store", async () => {
    mockedPollution.mockResolvedValue({ ok: false, error: { code: "upstream", message: "x" } });
    const res = await getPollution(req("pollution"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
