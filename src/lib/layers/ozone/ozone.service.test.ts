import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OzoneDescriptor, ProviderContext, RasterImage } from "@/types/layers";
import { __resetDedupeForTests } from "../geo-cache.service";
import {
  OZONE_SNAPSHOT_URL,
  __resetOzoneCacheForTests,
  createOzoneProvider,
  isAllowedImageUrl,
  isOzoneDescriptor,
  type DecodedImage,
} from "./ozone.service";

const LIVE_URL = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?LAYERS=X";

const descriptor: OzoneDescriptor = {
  layer: "OMI_Ozone_TOMS_Total_Column",
  product: "OMI_TOMS",
  date: "2026-10-29",
  imageUrl: LIVE_URL,
  width: 2048,
  height: 1024,
  attribution: "NASA GIBS / OMI (Aura)",
};

const fakeImage = {} as RasterImage;
const decoded = (coverage: number | null): DecodedImage => ({ image: fakeImage, flipped: true, coverage });

function ctx(signal: AbortSignal = new AbortController().signal): ProviderContext {
  return { signal, tier: "lo", flags: { mockError: false, forceSnapshot: false } };
}

function envelope(data: unknown, fallback = false): Response {
  return new Response(JSON.stringify({ ok: true, data, meta: { source: "gibs", dataDate: "2026-10-29", fetchedAt: "2026-11-02T00:00:00Z", fallback } }), {
    status: 200,
  });
}

interface Routes {
  api?: () => Response;
  images?: Record<string, () => Response>;
}

function stubFetch(routes: Routes): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("/api/orbital/ozone")) return routes.api ? routes.api() : envelope(descriptor);
    const handler = routes.images?.[url];
    if (!handler) throw new TypeError("network down");
    return handler();
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

const bigBlob = () => new Response(new Uint8Array(20000));

beforeEach(() => {
  __resetOzoneCacheForTests();
  __resetDedupeForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guards", () => {
  it("allows GIBS and bundled paths only", () => {
    expect(isAllowedImageUrl(LIVE_URL)).toBe(true);
    expect(isAllowedImageUrl(OZONE_SNAPSHOT_URL)).toBe(true);
    expect(isAllowedImageUrl("//evil.example/sites/orbitalwatch/data/x.png")).toBe(false);
    expect(isAllowedImageUrl("https://evil.example/x.png")).toBe(false);
    expect(isAllowedImageUrl("/sites/orbitalwatch/data/../../secret")).toBe(false);
  });
  it("validates descriptors", () => {
    expect(isOzoneDescriptor(descriptor)).toBe(true);
    expect(isOzoneDescriptor({ ...descriptor, width: 999 })).toBe(false);
    expect(isOzoneDescriptor({ ...descriptor, date: "2026-13-40" })).toBe(false);
    expect(isOzoneDescriptor({ ...descriptor, product: "nope" })).toBe(false);
    expect(isOzoneDescriptor(null)).toBe(false);
  });
});

describe("ozone provider", () => {
  const provider = (decode = async () => decoded(0.6)) => createOzoneProvider({ decode, now: () => 1234 });

  it("loads the happy path", async () => {
    stubFetch({ images: { [LIVE_URL]: bigBlob } });
    const r = await provider().load({ product: "OMI_TOMS" }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ dataDate: "2026-10-29", fetchedAt: 1234, isFallback: false, source: descriptor.layer, empty: false });
    expect(r.value.payload).toMatchObject({ kind: "raster", flipped: true, date: "2026-10-29" });
  });

  it("rejects a disallowed host", async () => {
    stubFetch({ api: () => envelope({ ...descriptor, imageUrl: "https://evil.example/x.png" }) });
    const r = await provider().load({ product: "OMI_TOMS" }, ctx());
    expect(r).toMatchObject({ ok: false, error: { code: "invalid" } });
  });

  it("reports an invalid descriptor", async () => {
    stubFetch({ api: () => envelope({ nope: true }) });
    const r = await provider().load({ product: "OMI_TOMS" }, ctx());
    expect(r).toMatchObject({ ok: false, error: { code: "invalid" } });
  });

  it("returns an empty error for a tiny blob", async () => {
    stubFetch({ images: { [LIVE_URL]: () => new Response(new Uint8Array(600)) } });
    const decode = vi.fn(async () => decoded(1));
    const r = await provider(decode).load({ product: "OMI_TOMS" }, ctx());
    expect(r).toMatchObject({ ok: false, error: { code: "empty" } });
    expect(decode).not.toHaveBeenCalled();
  });

  it("flags low coverage as empty", async () => {
    stubFetch({ images: { [LIVE_URL]: bigBlob } });
    const r = await provider(async () => decoded(0.002)).load({ product: "OMI_TOMS" }, ctx());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.empty).toBe(true);
  });

  it("retries with the snapshot when the live image fails", async () => {
    stubFetch({ images: { [OZONE_SNAPSHOT_URL]: bigBlob } });
    const r = await provider().load({ product: "OMI_TOMS" }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.isFallback).toBe(true);
    expect(r.value.dataDate).toBe("2026-10-29");
  });

  it("marks server-side fallbacks", async () => {
    stubFetch({ api: () => envelope(descriptor, true), images: { [LIVE_URL]: bigBlob } });
    const r = await provider().load({ product: "OMI_TOMS" }, ctx());
    expect(r.ok && r.value.isFallback).toBe(true);
  });

  it("resolves aborted when the signal fires", async () => {
    const controller = new AbortController();
    stubFetch({
      images: {
        [LIVE_URL]: () => {
          controller.abort();
          return bigBlob();
        },
      },
    });
    const r = await provider().load({ product: "OMI_TOMS" }, ctx(controller.signal));
    expect(r).toMatchObject({ ok: false, error: { code: "aborted" } });
  });
});
