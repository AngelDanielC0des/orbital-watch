"use client";
/**
 * Mounts the Three.js engine on a canvas. StrictMode-safe: the dynamic import is cancelled by a
 * mount token, `dispose()` runs in cleanup, and the store is reset so a remount starts clean.
 * Options are read once at mount (held in a ref); changing them later does not remount the engine.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { EngineError, EngineHandle, EngineOptions } from "@/engine/contract";
import { createEngineBridge } from "@/stores/engine-bridge";
import { useEngineStore } from "@/stores/engine-store";

export type UseEngineOptions = Omit<EngineOptions, "canvas" | "events">;

function toEngineError(err: unknown): EngineError {
  if (typeof err === "object" && err !== null && "code" in err && "message" in err) {
    return { code: (err as EngineError).code, message: String((err as EngineError).message), cause: err };
  }
  return { code: "import-failed", message: "No se pudo cargar el motor 3D.", cause: err };
}

export function useEngine(canvasRef: RefObject<HTMLCanvasElement | null>, options: UseEngineOptions = {}): EngineHandle | null {
  const [handle, setHandle] = useState<EngineHandle | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    let engine: EngineHandle | null = null;
    const events = createEngineBridge(useEngineStore);
    const opts = optionsRef.current;

    import("@/engine")
      .then(({ createOrbitalEngine, LAYER_REGISTRY, DEFAULT_LAYERS }) => {
        if (!alive) return;
        engine = createOrbitalEngine({
          ...opts,
          canvas,
          events,
          registry: opts.registry ?? LAYER_REGISTRY,
          layers: opts.layers ?? DEFAULT_LAYERS,
          debug: opts.debug ?? new URLSearchParams(location.search).has("debug"),
        });
        engine.setRenderingPaused(document.visibilityState === "hidden");
        setHandle(engine);
      })
      .catch((err: unknown) => {
        if (alive) events.onError?.(toEngineError(err));
      });

    const onPageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) engine?.dispose();
    };
    const onVisibility = () => engine?.setRenderingPaused(document.visibilityState === "hidden");
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      engine?.dispose();
      engine = null;
      setHandle(null);
      useEngineStore.getState().resetAll();
    };
  }, [canvasRef]);

  return handle;
}
