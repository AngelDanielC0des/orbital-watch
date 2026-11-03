"use client";
/**
 * Hover chip for the environmental overlays: one line near the cursor, purely visual
 * (`aria-hidden`; the point card opened by a click is the accessible path).
 */
import { useMemo } from "react";
import { resolvePick, type AirReading, type PointInfo } from "@/lib/layers/pick-resolver";
import { useLayersStore } from "@/stores/layers-store";

const FIRE_DOT = "#ffb020";
const OZONE_DOT: Record<"hole" | "low" | "normal" | "high", string> = {
  hole: "var(--alarm)",
  low: "var(--payload)",
  normal: "var(--signal)",
  high: "var(--signal)",
};
const OFFSET = 14;

/** Value with its unit ("30 µg/m³"), "sin dato" when the model has no value. */
export function formatAirValue(r: AirReading): string {
  if (r.value === null) return "sin dato";
  const digits = r.value < 10 && r.unit !== "" ? 1 : 0;
  const text = r.value.toLocaleString("es-ES", { maximumFractionDigits: digits });
  return r.unit ? `${text} ${r.unit}` : text;
}

function line(info: PointInfo): { text: string; dot: string | null } {
  switch (info.kind) {
    case "pollution": {
      const head = info.isGrid ? `Rejilla ${info.name.replace(/^Rejilla\s*/i, "")}` : info.name;
      const a = info.active;
      const value = a.value === null ? "sin dato" : formatAirValue(a);
      const cat = a.category ? ` · ${a.category.label}` : "";
      return { text: `${head} · ${a.label} ${value}${cat}`, dot: a.category?.color ?? null };
    }
    case "fire":
      return { text: `Foco · ${Math.round(info.frp).toLocaleString("es-ES")} MW · ${info.intensity.label}`, dot: FIRE_DOT };
    case "fireCell":
      return {
        text: info.saturated ? "100 o más detecciones en esta zona" : `≈ ${info.detections.toLocaleString("es-ES")} detecciones en esta zona`,
        dot: FIRE_DOT,
      };
    case "ozone":
      return info.du === null || info.tone === null
        ? { text: "Ozono · sin valor aquí", dot: null }
        : { text: `${info.du} DU · ${info.label ?? ""}`, dot: OZONE_DOT[info.tone] };
  }
}

function isTouchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

export function PointTooltip() {
  const pick = useLayersStore((s) => s.hoveredPick);
  const selectedLayer = useLayersStore((s) => s.selectedPick?.layerId ?? null);
  const selectedKind = useLayersStore((s) => s.selectedPick?.kind ?? null);
  const selectedIndex = useLayersStore((s) => s.selectedPick?.index ?? null);
  const info = useMemo(() => (pick ? resolvePick(pick) : null), [pick]);

  if (!pick || !info || isTouchDevice()) return null;
  if (pick.kind !== "surface" && pick.layerId === selectedLayer && pick.kind === selectedKind && pick.index === selectedIndex) return null;
  if (!Number.isFinite(pick.x) || !Number.isFinite(pick.y)) return null;

  const { text, dot } = line(info);
  const flipX = pick.x > window.innerWidth * 0.6;
  const flipY = pick.y > window.innerHeight - 70;
  const maxWidth = Math.max(120, Math.min(360, (flipX ? pick.x : window.innerWidth - pick.x) - 2 * OFFSET));

  return (
    <div
      data-layers-ui=""
      role="tooltip"
      aria-hidden="true"
      className="pointer-events-none fixed z-[7] flex items-center gap-1.5 rounded-[6px] border border-[var(--rule)] bg-[var(--panel-strong)] px-2 py-1 text-[12px] leading-4 text-[var(--ink)] backdrop-blur-[10px]"
      style={{
        maxWidth,
        ...(flipX ? { right: window.innerWidth - pick.x + OFFSET } : { left: pick.x + OFFSET }),
        ...(flipY ? { bottom: window.innerHeight - pick.y + OFFSET } : { top: pick.y + OFFSET }),
      }}
    >
      {dot !== null && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      <span className="truncate">{text}</span>
    </div>
  );
}
