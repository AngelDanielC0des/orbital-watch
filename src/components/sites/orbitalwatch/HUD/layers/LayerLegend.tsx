import React from "react";
import type { LegendSpec } from "@/types/layers";

interface LayerLegendProps {
  legend: LegendSpec;
  compact?: boolean;
}

function buildGradient(legend: LegendSpec): string {
  const stops = legend.stops;
  if (legend.categorical && stops.length > 0) {
    const n = stops.length;
    const parts = stops.map((s, i) => `${s.color} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`);
    return `linear-gradient(to right, ${parts.join(", ")})`;
  }
  const parts = stops.map((s) => `${s.color} ${(s.at * 100).toFixed(2)}%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

function tickShift(at: number): string {
  if (at <= 0.02) return "translateX(0)";
  if (at >= 0.98) return "translateX(-100%)";
  return "translateX(-50%)";
}

/** CSS gradient bar built from the same stops the LUT uses, with numeric tick labels. */
export function LayerLegend({ legend, compact = false }: LayerLegendProps) {
  return (
    <figure className="m-0 flex flex-col gap-1" aria-label={`Leyenda: ${legend.title} (${legend.unit})`}>
      {!compact && (
        <figcaption className="text-[12px] text-[var(--ink-dim)]">
          {legend.title} · {legend.unit}
        </figcaption>
      )}
      <div
        className={`${compact ? "h-1.5" : "h-2.5"} w-full rounded-full border border-[var(--rule)]`}
        style={{ background: buildGradient(legend) }}
        role="img"
        aria-label={legend.ticks.map((t) => t.label).join(", ")}
      />
      <div className="relative h-4 font-[family-name:var(--font-data)] text-[11px] text-[var(--ink)]" aria-hidden="true">
        {legend.ticks.map((t) => (
          <span
            key={`${t.at}-${t.label}`}
            className="absolute top-0 whitespace-nowrap"
            style={{ left: `${t.at * 100}%`, transform: tickShift(t.at) }}
          >
            {t.label}
          </span>
        ))}
      </div>
      {!compact &&
        legend.notes?.map((note) => (
          <p key={note} className="m-0 text-[12px] text-[var(--ink-dim)]">
            {note}
          </p>
        ))}
    </figure>
  );
}
