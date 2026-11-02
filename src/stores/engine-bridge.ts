/**
 * The ONLY writer of `useEngineStore`. Maps low-frequency `EngineEvents` to store actions and
 * throttles the clock/fps so React never re-renders at frame rate.
 */
import type { EngineEvents, TimeTick } from "@/engine/contract";
import type { useEngineStore } from "@/stores/engine-store";

type EngineStoreApi = typeof useEngineStore;

const CLOCK_INTERVAL_MS = 1000;
const FPS_INTERVAL_MS = 500;

const utcFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
});

/** Relative-time label mirroring the legacy HUD ("en vivo", "+3 d", "-2 h"). */
export function formatRelative(tick: TimeTick): string {
  if (tick.live) return "en vivo";
  const days = tick.offsetMs / 86_400_000;
  const sign = days > 0 ? "+" : "−";
  const abs = Math.abs(days);
  return abs >= 1 ? `${sign}${abs.toFixed(1)} d` : `${sign}${(abs * 24).toFixed(1)} h`;
}

export function createEngineBridge(store: EngineStoreApi): EngineEvents {
  let lastClockAt = 0;
  let lastFpsAt = 0;
  const s = () => store.getState();

  return {
    onLoading: ({ ratio, text, error, done }) => {
      if (error) return s().setLoadingError(error);
      if (done) return s().setLoadingDone();
      s().setLoadingProgress(ratio, text);
    },
    onCatalog: ({ label, synthetic }) => s().setCatalogSource(label, synthetic),
    onViewChange: (view, focus, busy) => {
      s().setView(view);
      s().setFocusBody(focus);
      s().setIsBusy(busy);
    },
    onSatelliteSelected: (sat) => s().setSelectedSatellite(sat),
    onBodySelected: (body) => s().setSelectedBody(body),
    onFilterChange: (filter) => s().setFilter(filter),
    onNightModeChange: (on) => s().setNightMode(on),
    onVisibleCount: (count) => s().setVisibleCount(count),
    onTimeTick: (tick) => {
      const now = performance.now();
      const forced = tick.playing !== s().time.playing || tick.speed !== s().time.speed || tick.live !== s().time.isLive;
      if (!forced && now - lastClockAt < CLOCK_INTERVAL_MS) return;
      lastClockAt = now;
      s().setTimeState({
        ms: tick.ms,
        speed: tick.speed,
        playing: tick.playing,
        offsetMs: tick.offsetMs,
        isLive: tick.live,
        clockUtc: utcFormat.format(tick.ms),
        clockRel: formatRelative(tick),
        daysOffset: tick.offsetMs / 86_400_000,
      });
    },
    onFps: (fps) => {
      const now = performance.now();
      if (now - lastFpsAt < FPS_INTERVAL_MS) return;
      lastFpsAt = now;
      s().setFps(Math.round(fps));
    },
    onError: (error) => {
      // `catalog-failed` is non-fatal (synthetic catalog in use): toast only, loader keeps going.
      if (error.code !== "catalog-failed") s().setLoadingError(error.message);
      s().setEngineError({ code: error.code, message: error.message });
    },
  };
}
