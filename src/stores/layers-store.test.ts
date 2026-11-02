import { beforeEach, describe, expect, it } from "vitest";
import { getLayerState, useLayersStore } from "./layers-store";

const meta = { dataDate: "2026-11-01", fetchedAt: 123, isFallback: true, source: "OMI_TOMS" };
const get = () => useLayersStore.getState();

describe("layers store", () => {
  beforeEach(() => get().resetAll());

  it("starts idle with catalog defaults", () => {
    expect(get().layers.ozone).toEqual({
      id: "ozone", visible: false, opacity: 0.75, status: "idle", error: null,
      dataDate: null, fetchedAt: null, isFallback: false, source: null, config: { product: "OMI_TOMS" },
    });
    expect(get().layers.pollution.config).toEqual({ pollutant: "pm2_5" });
    expect(get().layers.fires.config).toEqual({ window: "24h", dayNight: "all" });
    expect(get().lastEnabled).toBeNull();
  });

  it("setVisible tracks lastEnabled and legend", () => {
    get().dismissLegend();
    get().setVisible("ozone", true);
    expect(get().lastEnabled).toBe("ozone");
    expect(get().legendDismissed).toBe(false);
    get().setVisible("fires", true);
    expect(get().lastEnabled).toBe("fires");
    get().setVisible("fires", false);
    expect(get().lastEnabled).toBe("ozone");
    get().setVisible("ozone", false);
    expect(get().lastEnabled).toBeNull();
  });

  it("hiding a non-last layer keeps lastEnabled", () => {
    get().setVisible("ozone", true);
    get().setVisible("fires", true);
    get().setVisible("ozone", false);
    expect(get().lastEnabled).toBe("fires");
  });

  it("setOpacity clamps and ignores NaN", () => {
    get().setOpacity("fires", 3);
    expect(get().layers.fires.opacity).toBe(1);
    get().setOpacity("fires", -1);
    expect(get().layers.fires.opacity).toBe(0);
    get().setOpacity("fires", Number.NaN);
    expect(get().layers.fires.opacity).toBe(0);
  });

  it("setConfig merges and is a no-op when unchanged", () => {
    get().setConfig("fires", { window: "7d" });
    expect(get().layers.fires.config).toEqual({ window: "7d", dayNight: "all" });
    const before = get();
    get().setConfig("fires", { window: "7d" });
    expect(get()).toBe(before);
    expect(get().layers.fires).toBe(before.layers.fires);
  });

  it("status transitions keep or reset the right fields", () => {
    get().setReady("ozone", meta);
    expect(get().layers.ozone).toMatchObject({ status: "ready", error: null, ...meta });
    get().setLoading("ozone");
    expect(get().layers.ozone).toMatchObject({ status: "loading", error: null, dataDate: "2026-11-01" });
    get().setError("ozone", { code: "network", message: "x" });
    expect(get().layers.ozone).toMatchObject({
      status: "error", error: { code: "network", message: "x" }, ...meta,
    });
    get().setEmpty("ozone", { ...meta, source: "OMPS" });
    expect(get().layers.ozone).toMatchObject({ status: "empty", error: null, source: "OMPS" });
  });

  it("requestRefresh bumps only that nonce", () => {
    get().requestRefresh("pollution");
    get().requestRefresh("pollution");
    expect(get().refreshNonce).toEqual({ ozone: 0, pollution: 2, fires: 0 });
  });

  it("keeps identity of untouched layers", () => {
    const { ozone, pollution, fires } = get().layers;
    get().setVisible("ozone", true);
    get().setOpacity("ozone", 0.5);
    get().setLoading("ozone");
    get().setReady("ozone", meta);
    get().setConfig("ozone", { product: "OMPS" });
    expect(get().layers.pollution).toBe(pollution);
    expect(get().layers.fires).toBe(fires);
    expect(get().layers.ozone).not.toBe(ozone);
  });

  it("hydrate maps a deep link to one mode (fires wins) and applies config", () => {
    get().hydrate({ visible: ["pollution", "fires"], config: { pollution: { pollutant: "no2" } } });
    expect(get().mode).toBe("fires");
    expect(get().layers.fires.visible).toBe(true);
    expect(get().layers.pollution).toMatchObject({ visible: false, config: { pollutant: "no2" } });
    expect(get().layers.ozone.visible).toBe(false);
    expect(get().lastEnabled).toBe("fires");
  });

  it("hydrate with ozone only enters the atmosphere mode on ozone", () => {
    get().hydrate({ visible: ["ozone"] });
    expect(get()).toMatchObject({ mode: "atmosphere", atmosphereLayer: "ozone" });
    expect(get().layers.ozone.visible).toBe(true);
  });

  it("setMode shows exactly the mode's layer", () => {
    get().setMode("fires");
    expect([get().layers.ozone.visible, get().layers.pollution.visible, get().layers.fires.visible]).toEqual([false, false, true]);
    get().setMode("atmosphere");
    expect([get().layers.ozone.visible, get().layers.pollution.visible, get().layers.fires.visible]).toEqual([false, true, false]);
    expect(get().lastEnabled).toBe("pollution");
    get().setMode("orbit");
    expect([get().layers.ozone.visible, get().layers.pollution.visible, get().layers.fires.visible]).toEqual([false, false, false]);
    expect(get().lastEnabled).toBeNull();
  });

  it("setAtmosphereLayer swaps the visible layer only inside the atmosphere mode", () => {
    get().setAtmosphereLayer("ozone");
    expect(get().layers.ozone.visible).toBe(false);
    get().setMode("atmosphere");
    expect(get().layers.ozone.visible).toBe(true);
    get().setAtmosphereLayer("pollution");
    expect([get().layers.ozone.visible, get().layers.pollution.visible]).toEqual([false, true]);
  });

  it("resetAll restores fresh copies", () => {
    get().setVisible("ozone", true);
    get().setConfig("ozone", { product: "OMPS" });
    const dirty = get().layers.ozone.config;
    get().resetAll();
    expect(get().layers.ozone.visible).toBe(false);
    expect(get().layers.ozone.config).toEqual({ product: "OMI_TOMS" });
    expect(get().layers.ozone.config).not.toBe(dirty);
    const first = get().layers.fires.config;
    get().resetAll();
    expect(get().layers.fires.config).not.toBe(first);
  });

  it("getLayerState reads the current layer", () => {
    get().setConfig("pollution", { pollutant: "o3" });
    expect(getLayerState("pollution").config.pollutant).toBe("o3");
  });
});
