/**
 * Deep-link state of the environmental layers (`?layers=ozone,fires&pollutant=no2&fires=48h`).
 * Pure functions: parsing is allow-listed and silent about invalid values; writing never emits
 * dev flags (`mockError`, `mock=snapshot`), which are read-only inputs.
 */
import type { EnvironmentalLayerId, FireWindow, Pollutant, ProviderFlags } from "@/types/layers";
import { ENVIRONMENTAL_LAYER_IDS, isEnvironmentalLayerId } from "./catalog";
import { FIRE_WINDOWS } from "./fires/fires-scale";
import { POLLUTANTS } from "./pollution/pollutant-scales";

export const DEFAULT_POLLUTANT: Pollutant = "pm2_5";
export const DEFAULT_FIRE_WINDOW: FireWindow = "24h";

export interface LayerUrlState {
  /** Visible environmental layers in catalog order, deduplicated. */
  visible: EnvironmentalLayerId[];
  config: { pollution?: { pollutant: Pollutant }; fires?: { window: FireWindow } };
  /** Layer whose provider must fail (`?mockError=<id>`), if any. */
  mockErrorLayer: EnvironmentalLayerId | null;
  /** `?mock=snapshot`. */
  forceSnapshot: boolean;
  /** Selected pollution point (`?pt=city-madrid`), allow-listed; null when absent or invalid. */
  pointId: string | null;
}

const POINT_ID_RE = /^(city|grid)-[a-z0-9-]{1,48}$/;

/** True for ids safe to put in / read from the `pt` parameter. */
export function isPointId(value: string): boolean {
  return POINT_ID_RE.test(value);
}

function isPollutant(value: string): value is Pollutant {
  return (POLLUTANTS as readonly string[]).includes(value);
}

function isFireWindow(value: string): value is FireWindow {
  return (FIRE_WINDOWS as readonly string[]).includes(value);
}

/** Parses `location.search` (with or without the leading `?`). */
export function parseLayerUrlState(search: string): LayerUrlState {
  const q = new URLSearchParams(search);
  const requested = new Set<string>();
  for (const part of (q.get("layers") ?? "").split(",")) {
    const id = part.trim().toLowerCase();
    if (isEnvironmentalLayerId(id)) requested.add(id);
  }
  const visible = ENVIRONMENTAL_LAYER_IDS.filter((id) => requested.has(id));

  const config: LayerUrlState["config"] = {};
  const pollutant = q.get("pollutant");
  if (pollutant !== null && isPollutant(pollutant)) config.pollution = { pollutant };
  const fireWin = q.get("fires");
  if (fireWin !== null && isFireWindow(fireWin)) config.fires = { window: fireWin };

  const mockError = q.get("mockError");
  const pt = q.get("pt");
  return {
    visible,
    config,
    mockErrorLayer: mockError !== null && isEnvironmentalLayerId(mockError) ? mockError : null,
    forceSnapshot: q.get("mock") === "snapshot",
    pointId: pt !== null && isPointId(pt) ? pt : null,
  };
}

/** Provider flags of one layer derived from the URL state. */
export function flagsFor(id: EnvironmentalLayerId, state: LayerUrlState): ProviderFlags {
  return { mockError: state.mockErrorLayer === id, forceSnapshot: state.forceSnapshot };
}

/** Sets or deletes `layers`, `pollutant`, `fires` and `pt`; defaults are omitted. */
export function writeLayerParams(
  q: URLSearchParams,
  s: { visible: readonly EnvironmentalLayerId[]; pollutant: Pollutant; fireWindow: FireWindow; pointId?: string | null },
): void {
  const ordered = ENVIRONMENTAL_LAYER_IDS.filter((id) => s.visible.includes(id));
  if (ordered.length > 0) q.set("layers", ordered.join(","));
  else q.delete("layers");
  if (s.pollutant !== DEFAULT_POLLUTANT) q.set("pollutant", s.pollutant);
  else q.delete("pollutant");
  if (s.fireWindow !== DEFAULT_FIRE_WINDOW) q.set("fires", s.fireWindow);
  else q.delete("fires");
  if (s.pointId && isPointId(s.pointId)) q.set("pt", s.pointId);
  else q.delete("pt");
}
