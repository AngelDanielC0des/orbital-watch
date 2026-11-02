import type { LayerStatus } from "@/types/layers";

/** How current a layer's data is, for the status dot and badges. */
export type Freshness = "fresh" | "aging" | "stale" | "demo" | "error" | "none";

const DAY_MS = 24 * 60 * 60 * 1000;

export const FRESHNESS_COLOR: Record<Freshness, string> = {
  fresh: "var(--signal)",
  aging: "var(--payload)",
  stale: "var(--ink-dim)",
  demo: "var(--ink-dim)",
  none: "var(--ink-dim)",
  error: "var(--alarm)",
};

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: "Reciente",
  aging: "Con retraso",
  stale: "Antigua",
  demo: "Demo",
  error: "Error",
  none: "Sin datos",
};

/** Parses `YYYY-MM-DD` (00:00 UTC) or an ISO time with/without `Z` (assumed UTC). Null if invalid. */
function parseUtcMs(iso: string): number | null {
  const trimmed = iso.trim();
  let text = trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) text = `${trimmed}T00:00:00Z`;
  else if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) text = `${trimmed}Z`;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

export function freshnessOf(input: {
  status: LayerStatus;
  dataDate: string | null;
  isFallback: boolean;
  isModel: boolean;
  nowMs: number;
}): Freshness {
  if (input.status === "error") return "error";
  if (input.isFallback) return "demo";
  if (input.dataDate === null) return "none";
  const dataMs = parseUtcMs(input.dataDate);
  if (dataMs === null) return "none";
  const age = input.nowMs - dataMs;
  if (age <= 2 * DAY_MS) return input.isModel ? "aging" : "fresh";
  if (age <= 7 * DAY_MS) return "aging";
  return "stale";
}

/** Formats a data date in UTC, always suffixed with " UTC". */
export function formatUtcDate(iso: string, withTime = false): string {
  const ms = parseUtcMs(iso);
  if (ms === null) return iso;
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  };
  return `${new Intl.DateTimeFormat("es-ES", options).format(new Date(ms))} UTC`;
}

/** Spanish relative time ("hace 5 minutos") from `fromMs` to `nowMs`. */
export function formatRelative(fromMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (seconds < 60) return "hace unos segundos";
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.floor(hours / 24), "day");
}

/** True when the simulated time is more than 2 days away from the layer's data date. */
export function timelineMismatch(simMs: number, dataDate: string | null): boolean {
  if (dataDate === null) return false;
  const dataMs = parseUtcMs(dataDate);
  if (dataMs === null) return false;
  return Math.abs(simMs - dataMs) > 2 * DAY_MS;
}
