import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineUIState } from "@/types/engine";
import type { EngineStoreState, useEngineStore } from "@/stores/engine-store";
import { createEngineBridge, formatRelative } from "./engine-bridge";

type FakeState = Pick<
  EngineStoreState,
  "time" | "setTimeState" | "setLoadingError" | "setLoadingDone" | "setEngineError" | "setFps"
>;

/**
 * Minimal store double: only the actions the bridge touches. `setTimeState` merges into `time`
 * like the real store, so "forced" comparisons see the latest values.
 */
function createFakeStore(time: Partial<EngineUIState["time"]> = {}) {
  const state: FakeState = {
    time: {
      ms: 0,
      speed: 1,
      playing: true,
      offsetMs: 0,
      isLive: true,
      clockUtc: "—",
      clockRel: "en vivo",
      daysOffset: 0,
      ...time,
    },
    setTimeState: vi.fn((update: Partial<EngineUIState["time"]>) => {
      state.time = { ...state.time, ...update };
    }),
    setLoadingError: vi.fn(),
    setLoadingDone: vi.fn(),
    setEngineError: vi.fn(),
    setFps: vi.fn(),
  };
  // The bridge only calls `getState()`; this cast is the single seam between the double and the
  // zustand hook type. The fake is a structural subset of the store state.
  const store = { getState: () => state } as typeof useEngineStore;
  return { store, state };
}

const tick = (overrides: Partial<{ ms: number; speed: number; playing: boolean; offsetMs: number; live: boolean }> = {}) => ({
  ms: 1_700_000_000_000,
  speed: 1,
  playing: true,
  offsetMs: 0,
  live: true,
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatRelative", () => {
  it("shows 'en vivo' when the clock is live", () => {
    expect(formatRelative(tick({ live: true, offsetMs: 0 }))).toBe("en vivo");
  });

  it("formats offsets of a day or more in days with a sign", () => {
    expect(formatRelative(tick({ live: false, offsetMs: 1.5 * 86_400_000 }))).toBe("+1.5 d");
  });

  it("formats offsets under a day in hours with a true minus sign", () => {
    expect(formatRelative(tick({ live: false, offsetMs: -3 * 3_600_000 }))).toBe("−3.0 h");
  });
});

describe("createEngineBridge.onTimeTick", () => {
  it("writes at most once per second while nothing relevant changed", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(5_000);
    const { store, state } = createFakeStore();
    const bridge = createEngineBridge(store);

    bridge.onTimeTick?.(tick());
    expect(state.setTimeState).toHaveBeenCalledTimes(1);

    now.mockReturnValue(5_400);
    bridge.onTimeTick?.(tick({ ms: 1 }));
    expect(state.setTimeState).toHaveBeenCalledTimes(1);

    now.mockReturnValue(6_100);
    bridge.onTimeTick?.(tick({ ms: 2 }));
    expect(state.setTimeState).toHaveBeenCalledTimes(2);
  });

  it("bypasses the throttle when playing changes", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(5_000);
    const { store, state } = createFakeStore();
    const bridge = createEngineBridge(store);

    bridge.onTimeTick?.(tick());
    now.mockReturnValue(5_100);
    bridge.onTimeTick?.(tick({ playing: false }));

    expect(state.setTimeState).toHaveBeenCalledTimes(2);
    expect(state.setTimeState).toHaveBeenLastCalledWith(expect.objectContaining({ playing: false }));
  });

  it("bypasses the throttle when speed changes", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(5_000);
    const { store, state } = createFakeStore();
    const bridge = createEngineBridge(store);

    bridge.onTimeTick?.(tick());
    now.mockReturnValue(5_100);
    bridge.onTimeTick?.(tick({ speed: 60 }));

    expect(state.setTimeState).toHaveBeenCalledTimes(2);
    expect(state.setTimeState).toHaveBeenLastCalledWith(expect.objectContaining({ speed: 60 }));
  });

  it("bypasses the throttle when live changes", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(5_000);
    const { store, state } = createFakeStore();
    const bridge = createEngineBridge(store);

    bridge.onTimeTick?.(tick());
    now.mockReturnValue(5_100);
    bridge.onTimeTick?.(tick({ live: false, offsetMs: -3 * 3_600_000 }));

    expect(state.setTimeState).toHaveBeenCalledTimes(2);
    expect(state.setTimeState).toHaveBeenLastCalledWith(
      expect.objectContaining({ isLive: false, clockRel: "−3.0 h" }),
    );
  });
});

describe("createEngineBridge.onError", () => {
  it("treats catalog-failed as non-fatal: no loading error, but the engine error is recorded", () => {
    const { store, state } = createFakeStore();
    const bridge = createEngineBridge(store);

    bridge.onError?.({ code: "catalog-failed", message: "catálogo no disponible" });

    expect(state.setLoadingError).not.toHaveBeenCalled();
    expect(state.setEngineError).toHaveBeenCalledWith({ code: "catalog-failed", message: "catálogo no disponible" });
  });

  it("sets a loading error for fatal codes", () => {
    const { store, state } = createFakeStore();
    const bridge = createEngineBridge(store);

    bridge.onError?.({ code: "webgl-unsupported", message: "Sin WebGL" });

    expect(state.setLoadingError).toHaveBeenCalledWith("Sin WebGL");
    expect(state.setEngineError).toHaveBeenCalledWith({ code: "webgl-unsupported", message: "Sin WebGL" });
  });
});
