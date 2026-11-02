import { describe, expect, it } from "vitest";
import { OZONE_SNAPSHOT, chainFrom, describeDomainsUrl, parseNewestDate, resolveOzone, wmsUrl } from "./gibs";

const FIXTURE = `<Domains xmlns:ows='http://www.opengis.net/ows/1.1'><SpaceDomain><BoundingBox crs='urn:ogc:def:crs:OGC:2:84' minx='-180' maxy='90' miny='-90' maxx='180'/></SpaceDomain><DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>2004-10-01/2004-11-18/P1D,2004-12-02/2006-02-27/P1D,2006-03-03/2008-09-27/P1D,2008-09-30/2016-05-29/P1D,2016-06-10/2016-06-10/P1D,2016-06-13/2017-03-11/P1D,2017-03-18/2023-12-02/P1D,2023-12-04/2024-02-10/P1D,2024-02-12/2024-03-27/P1D,2024-03-29/2026-10-29/P1D</Domain><Size>10</Size></DimensionDomain></Domains>`;

const xmlWith = (domain: string) => `<Domains><DimensionDomain><Domain>${domain}</Domain></DimensionDomain></Domains>`;

describe("parseNewestDate", () => {
  it("reads the real fixture", () => {
    expect(parseNewestDate(FIXTURE)).toBe("2026-10-29");
  });
  it("takes the max end over ranges and single dates", () => {
    expect(parseNewestDate(xmlWith("2004-10-01/2016-01-01/P1D,2016-01-03/2026-10-29/P1D,2026-11-01"))).toBe("2026-11-01");
  });
  it("returns null on garbage", () => {
    expect(parseNewestDate("<html>nope</html>")).toBeNull();
    expect(parseNewestDate(xmlWith("foo/bar/P1D"))).toBeNull();
  });
});

describe("urls and chain", () => {
  it("builds the WMS URL with latitude-first BBOX", () => {
    expect(wmsUrl("L", "2026-10-29", 2048, 1024)).toBe(
      "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=L&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/png&TRANSPARENT=true&TIME=2026-10-29",
    );
  });
  it("builds the DescribeDomains URL", () => {
    expect(describeDomainsUrl("L")).toBe("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/L/default/2km/all/all.xml");
  });
  it("orders the chain starting at the product", () => {
    expect(chainFrom("OMI_TOMS")).toEqual(["OMI_TOMS", "OMI_DOAS", "OMPS"]);
    expect(chainFrom("OMPS")).toEqual(["OMPS", "OMI_TOMS", "OMI_DOAS"]);
  });
});

interface MockOptions {
  /** Layer to image byte size (default 20000). */
  sizes?: Record<string, number>;
  failLayers?: string[];
}

function mockFetch(opts: MockOptions = {}): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const match = /\/1\.0\.0\/([A-Za-z_]+)\/|LAYERS=([A-Za-z_]+)/.exec(url);
    const name = match?.[1] ?? match?.[2] ?? "";
    if (opts.failLayers?.includes(name)) throw new Error("boom");
    if (url.includes("/wmts/")) return new Response(xmlWith("2024-03-29/2026-10-29/P1D"), { status: 200 });
    const size = opts.sizes?.[name] ?? 20000;
    if (init?.method === "HEAD") return new Response(null, { status: 200, headers: { "content-length": String(size) } });
    return new Response(new Uint8Array(size), { status: 200 });
  };
}

describe("resolveOzone", () => {
  it("returns the primary product when it has data", async () => {
    const r = await resolveOzone({ product: "OMI_TOMS", size: 2048, fetchImpl: mockFetch() });
    expect(r.fallback).toBe(false);
    expect(r.descriptor).toMatchObject({ product: "OMI_TOMS", date: "2026-10-29", width: 2048, height: 1024, layer: "OMI_Ozone_TOMS_Total_Column" });
    expect(r.descriptor.imageUrl).toBe(wmsUrl("OMI_Ozone_TOMS_Total_Column", "2026-10-29", 2048, 1024));
  });

  it("falls back to DOAS after 4 empty days on the primary", async () => {
    const r = await resolveOzone({ product: "OMI_TOMS", size: 4096, fetchImpl: mockFetch({ sizes: { OMI_Ozone_TOMS_Total_Column: 600 } }) });
    expect(r.fallback).toBe(true);
    expect(r.descriptor.product).toBe("OMI_DOAS");
    expect(r.descriptor.height).toBe(2048);
  });

  it("sets the OMPS attribution", async () => {
    const r = await resolveOzone({ product: "OMPS", size: 2048, fetchImpl: mockFetch() });
    expect(r.descriptor.attribution).toBe("NASA GIBS / OMPS (Suomi NPP)");
  });

  it("returns the snapshot when everything fails", async () => {
    const r = await resolveOzone({
      product: "OMI_TOMS",
      size: 2048,
      fetchImpl: mockFetch({ failLayers: ["OMI_Ozone_TOMS_Total_Column", "OMI_Ozone_DOAS_Total_Column", "OMPS_Ozone_Total_Column"] }),
    });
    expect(r.fallback).toBe(true);
    expect(r.descriptor).toMatchObject({ product: "snapshot", imageUrl: OZONE_SNAPSHOT.imageUrl, date: "2026-10-29" });
  });
});
