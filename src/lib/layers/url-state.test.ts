import { describe, expect, it } from "vitest";
import { flagsFor, parseLayerUrlState, writeLayerParams } from "./url-state";

describe("parseLayerUrlState", () => {
  it("returns empty state for an empty query", () => {
    expect(parseLayerUrlState("")).toEqual({
      visible: [],
      config: {},
      mockErrorLayer: null,
      forceSnapshot: false,
    });
  });

  it("parses, dedups, ignores unknown ids and uses catalog order", () => {
    const s = parseLayerUrlState("?layers=fires,bogus,ozone,fires,satellites");
    expect(s.visible).toEqual(["ozone", "fires"]);
  });

  it("parses pollutant and fire window, ignoring invalid values", () => {
    expect(parseLayerUrlState("pollutant=no2&fires=7d").config).toEqual({
      pollution: { pollutant: "no2" },
      fires: { window: "7d" },
    });
    expect(parseLayerUrlState("pollutant=xx&fires=3d").config).toEqual({});
  });

  it("reads dev flags per layer", () => {
    const s = parseLayerUrlState("mockError=fires&mock=snapshot");
    expect(flagsFor("fires", s)).toEqual({ mockError: true, forceSnapshot: true });
    expect(flagsFor("ozone", s)).toEqual({ mockError: false, forceSnapshot: true });
    expect(parseLayerUrlState("mockError=nope").mockErrorLayer).toBeNull();
  });
});

describe("writeLayerParams", () => {
  it("omits defaults and deletes stale keys", () => {
    const q = new URLSearchParams("layers=ozone&pollutant=no2&fires=7d&view=solar");
    writeLayerParams(q, { visible: [], pollutant: "pm2_5", fireWindow: "24h" });
    expect(q.toString()).toBe("view=solar");
  });

  it("writes in catalog order and never writes mock flags", () => {
    const q = new URLSearchParams("mockError=fires");
    writeLayerParams(q, { visible: ["fires", "ozone"], pollutant: "o3", fireWindow: "48h" });
    expect(q.get("layers")).toBe("ozone,fires");
    expect(q.get("pollutant")).toBe("o3");
    expect(q.get("fires")).toBe("48h");
    expect(q.has("mock")).toBe(false);
  });

  it("round trips", () => {
    const q = new URLSearchParams();
    writeLayerParams(q, { visible: ["pollution", "fires"], pollutant: "eaqi", fireWindow: "7d" });
    const s = parseLayerUrlState(q.toString());
    expect(s.visible).toEqual(["pollution", "fires"]);
    expect(s.config).toEqual({ pollution: { pollutant: "eaqi" }, fires: { window: "7d" } });
  });
});
