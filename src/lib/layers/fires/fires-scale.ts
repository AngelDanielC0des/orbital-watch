/** Fire layer constants: heat colour ramp, legend, hotspot caps per quality tier and window labels. */
import type { ColorStop, FireWindow, LegendSpec } from "@/types/layers";

/** Hotspots at or above this FRP (MW) are drawn as intense markers. */
export const HOTSPOT_STRONG_MW = 100;

/** Heat ramp: dark red, red, orange, yellow, near-white. */
export const FIRE_HEAT_STOPS: readonly ColorStop[] = [
  { at: 0, color: "#3a0400" },
  { at: 0.25, color: "#8b0a00" },
  { at: 0.5, color: "#e8380d" },
  { at: 0.75, color: "#ff9a1f" },
  { at: 1, color: "#fff3b0" },
];

/** Legend of the fires layer (log density scale). */
export const FIRES_LEGEND: LegendSpec = {
  title: "Densidad de focos",
  unit: "escala log",
  stops: FIRE_HEAT_STOPS,
  ticks: [
    { at: 0, label: "1" },
    { at: 0.5, label: "10" },
    { at: 1, label: "100+" },
  ],
  notes: ["● foco intenso (> 100 MW)"],
};

/** Maximum hotspot markers drawn per quality tier. */
export const HOTSPOT_CAP = { hi: 2000, lo: 800 } as const;

/** Selectable rolling windows. */
export const FIRE_WINDOWS: readonly FireWindow[] = ["24h", "48h", "7d"];

/** Spanish labels of the rolling windows. */
export const FIRE_WINDOW_LABELS: Record<FireWindow, string> = {
  "24h": "últimas 24 h",
  "48h": "últimas 48 h",
  "7d": "últimos 7 días",
};
