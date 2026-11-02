import { OZONE_HOLE_DU, OZONE_LEGEND, OZONE_RANGE_DU } from "@/lib/layers/ozone/legend-ozone";
import type { LegendSpec } from "@/types/layers";

interface LayerLegendProps {
  legend: LegendSpec;
  compact?: boolean;
  /** Category names for categorical scales (`POLLUTANT_SCALES[p].categories`). */
  categories?: readonly string[];
}

function buildGradient(legend: LegendSpec): string {
  const stops = legend.stops;
  if (legend.categorical && stops.length > 0) {
    const n = stops.length;
    const parts = stops.map((s, i) => `${s.color} ${((i / n) * 100).toFixed(2)}% ${(((i + 1) / n) * 100).toFixed(2)}%`);
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

function describe(legend: LegendSpec, categories: readonly string[] | undefined): string {
  if (legend.categorical && categories && categories.length > 0) {
    return `Escala por categorías (${legend.unit}): ${categories.join(", ")}`;
  }
  const first = legend.ticks[0]?.label;
  const last = legend.ticks[legend.ticks.length - 1]?.label;
  if (first === undefined || last === undefined) return `Escala en ${legend.unit}`;
  return `Escala de ${first} a ${last} ${legend.unit}`;
}

/** CSS gradient bar built from the same stops the LUT uses, with numeric tick labels. */
export function LayerLegend({ legend, compact = false, categories }: LayerLegendProps) {
  const isOzone = legend === OZONE_LEGEND;
  const holeAt = (OZONE_HOLE_DU - OZONE_RANGE_DU[0]) / (OZONE_RANGE_DU[1] - OZONE_RANGE_DU[0]);
  const names = legend.categorical && categories && categories.length > 0 ? categories : null;

  return (
    <figure
      className={`m-0 flex min-w-0 flex-col ${compact ? "gap-0.5" : "gap-1.5"}`}
      aria-label={`Leyenda: ${legend.title} (${legend.unit})`}
    >
      {!compact && (
        <figcaption className="flex flex-wrap items-baseline gap-x-1.5 text-[12px]">
          <span className="font-medium text-[var(--ink)]">{legend.title}</span>
          <span className="text-[var(--ink-dim)]">{legend.unit}</span>
        </figcaption>
      )}
      <div className="relative">
        <div
          className="h-2.5 w-full rounded-full border border-[var(--rule)]"
          style={{ background: buildGradient(legend) }}
          role="img"
          aria-label={describe(legend, categories)}
        />
        {isOzone && (
          <span
            className="pointer-events-none absolute -top-0.5 bottom-[-2px] w-px bg-[var(--ink)]"
            style={{ left: `${holeAt * 100}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      {names ? (
        <ul className="m-0 flex list-none gap-0.5 p-0 text-[10.5px] leading-tight text-[var(--ink)]">
          {names.map((name, i) => (
            <li key={name} className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
              <span
                className="h-2 w-full rounded-sm border border-[var(--rule)]"
                style={{ backgroundColor: legend.stops[Math.min(i, legend.stops.length - 1)]?.color }}
                aria-hidden="true"
              />
              <span className="[overflow-wrap:anywhere]">{name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div
          className="relative h-4 font-[family-name:var(--font-data)] text-[11px] text-[var(--ink)]"
          aria-hidden="true"
        >
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
      )}
      {isOzone && !compact && (
        <div className="relative h-3 text-[10.5px] text-[var(--ink-dim)]" aria-hidden="true">
          <span className="absolute top-0 whitespace-nowrap" style={{ left: `${holeAt * 100}%`, transform: "translateX(-50%)" }}>
            agujero
          </span>
        </div>
      )}
      {!compact &&
        legend.notes?.map((note) => (
          <p key={note} className="m-0 text-[11.5px] text-[var(--ink-dim)]">
            {note}
          </p>
        ))}
    </figure>
  );
}
