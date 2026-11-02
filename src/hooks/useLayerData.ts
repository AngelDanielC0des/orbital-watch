"use client";
/**
 * Data lifecycle of ONE environmental layer: idle → loading → ready | empty | error.
 * Runs only while the layer is visible and an engine handle exists. Owns the AbortController and
 * the refresh/backoff timer of the current load; both die in the effect cleanup (StrictMode-safe).
 * Data goes to the engine via `setLayerData`; the store only receives status changes (never per frame).
 */
import { useEffect, useRef, useState } from "react";
import type { EngineHandle } from "@/engine/contract";
import { getEnvironmentalMetadata } from "@/lib/layers/catalog";
import { closeImage, configKey } from "@/lib/layers/payload";
import { PROVIDERS } from "@/lib/layers/providers";
import { useLayersStore } from "@/stores/layers-store";
import type { DataProvider, EnvironmentalLayerId, LayerConfigMap, LayerDataPayload, LayerPayloadMap, ProviderFlags } from "@/types/layers";

/** Retry delays after consecutive failures (1 → 2 → 4 min, then stays at 4). */
export const BACKOFF_MS = [60_000, 120_000, 240_000] as const;

interface Pushed {
  handle: EngineHandle;
  key: string;
  nonce: number;
  at: number;
}

function providerFor<K extends EnvironmentalLayerId>(id: K): DataProvider<LayerConfigMap[K], LayerPayloadMap[K]> | undefined {
  return PROVIDERS[id];
}

/** Returns a row stuck in "loading" (load cancelled by toggling off / unmount) to its previous settled status. */
function settleCancelled(id: EnvironmentalLayerId): void {
  const s = useLayersStore.getState();
  const layer = s.layers[id];
  if (layer.status !== "loading") return;
  if (layer.fetchedAt !== null && layer.dataDate !== null && layer.source !== null) {
    s.setReady(id, { dataDate: layer.dataDate, fetchedAt: layer.fetchedAt, isFallback: layer.isFallback, source: layer.source });
  } else {
    useLayersStore.setState((st) => ({ layers: { ...st.layers, [id]: { ...st.layers[id], status: "idle" } } }));
  }
}

export function useLayerData<K extends EnvironmentalLayerId>(id: K, handle: EngineHandle | null, flags: ProviderFlags): void {
  const visible = useLayersStore((s) => s.layers[id].visible);
  const config = useLayersStore((s) => s.layers[id].config as LayerConfigMap[K]);
  const nonce = useLayersStore((s) => s.refreshNonce[id]);
  /** Bumped by the refresh/backoff timer to re-run the effect. */
  const [tick, setTick] = useState(0);
  const pushed = useRef<Pushed | null>(null);
  const failures = useRef(0);
  const warned = useRef(false);

  useEffect(() => {
    const provider = providerFor(id);
    if (!handle || !visible || !provider) return;
    const refreshMs = getEnvironmentalMetadata(id).refreshIntervalMs;
    const key = configKey(config);
    const controller = new AbortController();
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dueWhileHidden = false;

    // Timers never start network work in a hidden tab: they mark the reload as due and wait for visibility.
    const fire = () => {
      timer = null;
      if (document.visibilityState === "hidden") dueWhileHidden = true;
      else setTick((t) => t + 1);
    };
    const schedule = (ms: number) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(fire, Math.max(1_000, ms));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && dueWhileHidden) {
        dueWhileHidden = false;
        setTick((t) => t + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const last = pushed.current?.handle === handle ? pushed.current : null;
    const age = last ? Date.now() - last.at : Infinity;
    if (last && last.key === key && last.nonce === nonce && age < refreshMs) {
      // Toggled back on with current data already in the engine: no request, just re-arm the refresh.
      schedule(refreshMs - age);
    } else {
      const force = last !== null && last.nonce !== nonce;
      useLayersStore.getState().setLoading(id);
      void provider.load(config, { signal: controller.signal, tier: handle.tier, flags, force }).then((result) => {
        if (!alive) {
          if (result.ok) closeImage(result.value.payload);
          return;
        }
        const s = useLayersStore.getState();
        if (result.ok) {
          failures.current = 0;
          const { payload, empty, dataDate, fetchedAt, isFallback, source } = result.value;
          const meta = { dataDate, fetchedAt, isFallback, source };
          if (empty) {
            closeImage(payload);
            handle.clearLayerData?.(id);
            s.setEmpty(id, meta);
          } else {
            pushToEngine(handle, id, payload);
            s.setReady(id, meta);
          }
          pushed.current = { handle, key, nonce, at: fetchedAt };
          schedule(refreshMs);
          return;
        }
        if (result.error.code === "aborted") return;
        if (!warned.current) {
          warned.current = true;
          console.warn(`[OrbitalWatch] Capa "${id}": ${result.error.detail ?? result.error.message}`);
        }
        // Keep the last good data in the engine; retry with backoff.
        s.setError(id, result.error);
        schedule(BACKOFF_MS[Math.min(failures.current, BACKOFF_MS.length - 1)]);
        failures.current += 1;
      });
    }

    return () => {
      alive = false;
      controller.abort();
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      settleCancelled(id);
    };
  }, [id, handle, visible, config, nonce, tick, flags]);
}

function pushToEngine(handle: EngineHandle, id: EnvironmentalLayerId, payload: LayerDataPayload): void {
  if (handle.setLayerData) handle.setLayerData(id, payload);
  else closeImage(payload);
}
