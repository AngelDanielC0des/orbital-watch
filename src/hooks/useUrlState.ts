"use client";
/**
 * Shareable URL state (deep links).
 * Read: `readUrlState()` parses `?view&focus&filter&speed&t&sat&night` once (client only).
 * Write: `useUrlState(handle, parsed)` mirrors the low-frequency store into the query via
 * `history.replaceState` (throttled 500 ms, defaults omitted, `t` only while scrubbed).
 */
import { useEffect } from "react";
import type { EngineHandle, EngineInitialState } from "@/engine/contract";
import { ENVIRONMENTAL_LAYER_IDS } from "@/lib/layers/catalog";
import { getLatestPollution } from "@/lib/layers/pollution/pollution.service";
import { parseLayerUrlState, writeLayerParams } from "@/lib/layers/url-state";
import { useEngineStore } from "@/stores/engine-store";
import { useLayersStore } from "@/stores/layers-store";
import type { SatelliteFilter, ViewMode } from "@/types/engine";

export interface ParsedUrlState {
  initial: EngineInitialState;
  focus: string | null;
  sat: string | null;
}

const VIEWS: readonly ViewMode[] = ["earth", "solar", "galaxy"];
const FILTERS: readonly SatelliteFilter[] = ["all", "debris", "starlink", "projected"];
const MANAGED_KEYS = ["view", "focus", "filter", "speed", "t", "sat", "night", "layers", "pollutant", "fires", "pt"] as const;
const WRITE_THROTTLE_MS = 500;
const MAX_ABS_SPEED = 1e7;

const EMPTY: ParsedUrlState = { initial: {}, focus: null, sat: null };

function parseTime(raw: string): number | null {
  const ms = /^\d{1,16}$/.test(raw) ? Number(raw) : Date.parse(raw);
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? ms : null;
}

/** Parses `location.search`; invalid values are ignored silently. Returns empty state on the server. */
export function readUrlState(): ParsedUrlState {
  if (typeof window === "undefined") return EMPTY;
  const q = new URLSearchParams(window.location.search);
  const initial: EngineInitialState = {};

  const view = q.get("view");
  if (view !== null && (VIEWS as readonly string[]).includes(view)) initial.view = view as ViewMode;

  const filter = q.get("filter");
  if (filter !== null && (FILTERS as readonly string[]).includes(filter)) initial.filter = filter as SatelliteFilter;

  const night = q.get("night");
  if (night === "1") initial.nightMode = true;

  const speedRaw = q.get("speed");
  if (speedRaw !== null && speedRaw.trim() !== "") {
    const speed = Number(speedRaw);
    if (Number.isFinite(speed) && speed !== 0 && Math.abs(speed) <= MAX_ABS_SPEED) initial.speed = speed;
  }

  const tRaw = q.get("t");
  if (tRaw !== null) {
    const ms = parseTime(tRaw.trim());
    if (ms !== null) initial.simMs = ms;
  }

  const focusRaw = q.get("focus")?.toLowerCase() ?? null;
  const focus = focusRaw !== null && /^[a-z0-9_-]{1,32}$/.test(focusRaw) ? focusRaw : null;

  const satRaw = q.get("sat");
  const sat = satRaw !== null && /^\d{1,9}$/.test(satRaw) ? satRaw : null;

  return { initial, focus, sat };
}

/** Builds the canonical query string for the current store state (without the leading `?`). */
function buildQuery(base: string, pendingSat: string | null, pendingPt: string | null): string {
  const s = useEngineStore.getState();
  const q = new URLSearchParams(base);
  for (const k of MANAGED_KEYS) q.delete(k);

  if (s.view !== "earth") q.set("view", s.view);
  if (s.view === "solar" && s.focusBody && s.focusBody !== "sun") q.set("focus", s.focusBody);
  if (s.filter !== "all") q.set("filter", s.filter);
  if (s.time.speed !== 1) q.set("speed", String(s.time.speed));
  if (s.nightMode) q.set("night", "1");
  if (!s.time.isLive) q.set("t", new Date(Math.round(s.time.ms / 60000) * 60000).toISOString());

  const sel = s.selectedSatellite;
  if (sel) q.set("sat", String(sel.entry.omm.NORAD_CAT_ID));
  else if (pendingSat) q.set("sat", pendingSat);

  const layersState = useLayersStore.getState();
  const layers = layersState.layers;
  const pick = layersState.selectedPick;
  const pointId = pick && pick.layerId === "pollution" && pick.kind === "point" ? (getLatestPollution()?.dto.points[pick.index]?.id ?? null) : null;
  writeLayerParams(q, {
    // A `pt` from the link stays in the URL until the point card has had the chance to apply it.
    pointId: pointId ?? (pick === null ? pendingPt : null),
    visible: ENVIRONMENTAL_LAYER_IDS.filter((id) => layers[id].visible),
    pollutant: layers.pollution.config.pollutant,
    fireWindow: layers.fires.config.window,
  });

  // Keep `layers=ozone,fires` readable (commas are legal in query values).
  return q.toString().replace(/%2C/gi, ",");
}

export function useUrlState(handle: EngineHandle | null, parsed: ParsedUrlState): void {
  const { focus, sat } = parsed;
  const nightInitial = parsed.initial.nightMode === true;

  useEffect(() => {
    if (!handle) return;
    let alive = true;
    let pendingSat = sat;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastWrite = 0;
    let pendingPt = parseLayerUrlState(window.location.search).pointId;
    let ptTimer: ReturnType<typeof setTimeout> | null = null;

    const write = () => {
      timer = null;
      const s = useEngineStore.getState();
      // Wait until the engine is ready and not mid-transition so defaults never clobber the incoming link.
      if (!alive || !s.loading.isDone || s.isBusy) return;
      lastWrite = Date.now();
      if (pendingPt !== null && !useLayersStore.getState().layers.pollution.visible) pendingPt = null;
      const query = buildQuery(window.location.search, pendingSat, pendingPt);
      const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next !== current) window.history.replaceState(window.history.state, "", next);
    };

    const schedule = () => {
      if (timer !== null) return;
      const wait = Math.max(0, WRITE_THROTTLE_MS - (Date.now() - lastWrite));
      timer = setTimeout(write, wait);
    };

    const trySelectSat = () => {
      if (!pendingSat) return;
      const s = useEngineStore.getState();
      if (!s.loading.isDone) return;
      const match = handle.findSatellites(pendingSat, 1).find((m) => m.noradId === pendingSat);
      if (match) {
        pendingSat = null;
        handle.selectSatellite(match.index);
      } else if (!s.isSynthetic) {
        pendingSat = null; // real catalog loaded and the object is not in it
      }
    };

    // The engine applies initial.nightMode to the shader only; emit the event so store/button/URL agree.
    if (nightInitial && !useEngineStore.getState().nightMode) handle.setNightMode(true);

    // The engine ignores `setView` while a transition runs (`initial.view` already started one), so wait until idle.
    let pendingFocus = focus !== null && parsed.initial.view === "solar" ? focus : null;
    const tryApplyFocus = () => {
      if (pendingFocus === null) return;
      const s = useEngineStore.getState();
      if (!s.loading.isDone || s.isBusy) return;
      const key = pendingFocus;
      pendingFocus = null;
      handle.setView("solar", key).catch(() => undefined);
    };

    const unsubscribe = useEngineStore.subscribe((s, prev) => {
      if (pendingFocus !== null && (s.isBusy !== prev.isBusy || s.loading.isDone !== prev.loading.isDone)) {
        tryApplyFocus();
      }
      if (
        s.loading.isDone !== prev.loading.isDone ||
        s.catalogSource !== prev.catalogSource ||
        s.isSynthetic !== prev.isSynthetic
      ) {
        trySelectSat();
      }
      if (
        s.view !== prev.view ||
        s.focusBody !== prev.focusBody ||
        s.filter !== prev.filter ||
        s.nightMode !== prev.nightMode ||
        s.time.speed !== prev.time.speed ||
        s.time.isLive !== prev.time.isLive ||
        (!s.time.isLive && Math.round(s.time.ms / 60000) !== Math.round(prev.time.ms / 60000)) ||
        s.selectedSatellite !== prev.selectedSatellite ||
        s.isBusy !== prev.isBusy ||
        s.loading.isDone !== prev.loading.isDone
      ) {
        schedule();
      }
    });

    const unsubscribeLayers = useLayersStore.subscribe((s, prev) => {
      if (s.selectedPick !== prev.selectedPick) {
        pendingPt = null;
        schedule();
      }
      if (pendingPt !== null && ptTimer === null && s.layers.pollution.status !== prev.layers.pollution.status && ["ready", "empty", "error"].includes(s.layers.pollution.status)) {
        ptTimer = setTimeout(() => {
          pendingPt = null;
          schedule();
        }, 1500);
      }
      if (s.layers === prev.layers) return;
      for (const id of ENVIRONMENTAL_LAYER_IDS) {
        if (s.layers[id].visible !== prev.layers[id].visible) return schedule();
      }
      if (
        s.layers.pollution.config.pollutant !== prev.layers.pollution.config.pollutant ||
        s.layers.fires.config.window !== prev.layers.fires.config.window
      ) {
        schedule();
      }
    });

    trySelectSat();
    tryApplyFocus();
    schedule();

    return () => {
      alive = false;
      unsubscribe();
      unsubscribeLayers();
      if (timer !== null) clearTimeout(timer);
      if (ptTimer !== null) clearTimeout(ptTimer);
    };
  }, [handle, focus, sat, nightInitial, parsed.initial.view]);
}
