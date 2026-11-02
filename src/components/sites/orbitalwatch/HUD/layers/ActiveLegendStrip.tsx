"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { getEnvironmentalMetadata } from "@/lib/layers/catalog";
import { FIRE_WINDOW_LABELS, FIRES_LEGEND } from "@/lib/layers/fires/fires-scale";
import { OZONE_LEGEND } from "@/lib/layers/ozone/legend-ozone";
import { POLLUTANT_SCALES } from "@/lib/layers/pollution/pollutant-scales";
import { useEngineStore } from "@/stores/engine-store";
import { useLayersStore } from "@/stores/layers-store";
import type { LegendSpec } from "@/types/layers";
import { LayerLegend } from "./LayerLegend";

const DATE_FMT = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const TIME_FMT = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function formatDate(iso: string | null, withTime: boolean): string | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return withTime ? `${DATE_FMT.format(d)} · ${TIME_FMT.format(d)} UTC` : `${DATE_FMT.format(d)} UTC`;
}

/** Keeps the strip above the timeline, whatever its (wrapping) height is. */
function useTimelineHeight(): number {
  const [height, setHeight] = useState(110);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".timeline");
    if (!el) return;
    const update = () => setHeight(Math.ceil(el.getBoundingClientRect().height));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return height;
}

/** Slim legend card of the most recently enabled layer. */
export function ActiveLegendStrip() {
  const view = useEngineStore((s) => s.view);
  const id = useLayersStore((s) => s.lastEnabled);
  const dismissed = useLayersStore((s) => s.legendDismissed);
  const visible = useLayersStore((s) => (s.lastEnabled ? s.layers[s.lastEnabled].visible : false));
  const status = useLayersStore((s) => (s.lastEnabled ? s.layers[s.lastEnabled].status : "idle"));
  const dataDate = useLayersStore((s) => (s.lastEnabled ? s.layers[s.lastEnabled].dataDate : null));
  const isFallback = useLayersStore((s) => (s.lastEnabled ? s.layers[s.lastEnabled].isFallback : false));
  const pollutant = useLayersStore((s) => s.layers.pollution.config.pollutant);
  const fireWindow = useLayersStore((s) => s.layers.fires.config.window);
  const timelineH = useTimelineHeight();

  if (id === null || !visible || status === "idle" || dismissed || view !== "earth") return null;

  const title = getEnvironmentalMetadata(id).title;
  let legend: LegendSpec = OZONE_LEGEND;
  let categories: readonly string[] | undefined;
  let suffix = "";
  if (id === "fires") {
    legend = FIRES_LEGEND;
    suffix = FIRE_WINDOW_LABELS[fireWindow];
  } else if (id === "pollution") {
    const scale = POLLUTANT_SCALES[pollutant];
    legend = scale.legend;
    categories = scale.categories;
    suffix = scale.shortLabel;
  }
  const date = formatDate(dataDate, id === "pollution");

  return (
    <aside
      data-layers-ui=""
      className="legend-strip fixed left-[var(--gutter)] z-[5] w-[320px] max-w-[calc(100vw-24px)] rounded-[10px] border border-[var(--rule)] bg-[var(--panel)] px-3 py-2 text-[var(--ink)] backdrop-blur-md"
      style={{ bottom: `calc(max(var(--gutter), env(safe-area-inset-bottom)) + ${timelineH}px + 36px)` }}
      aria-label={`Leyenda de ${title}`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        {status === "error" && (
          <span className="size-2 shrink-0 rounded-full bg-[var(--alarm)]" role="img" aria-label="Error al cargar" />
        )}
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
          {title}
          {suffix && <span className="text-[var(--ink-dim)]"> · {suffix}</span>}
        </span>
        {isFallback && (
          <span className="shrink-0 rounded-full border border-[var(--rule)] px-1.5 text-[10.5px] leading-4 text-[var(--ink-dim)]">
            Demo
          </span>
        )}
        {date && (
          <span className="shrink-0 font-[family-name:var(--font-data)] text-[10.5px] text-[var(--ink-dim)]">{date}</span>
        )}
        <button
          type="button"
          aria-label="Ocultar leyenda"
          onClick={() => useLayersStore.getState().dismissLegend()}
          className="-my-2.5 -mr-2 grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md text-[var(--ink-dim)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--signal)]"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {status === "loading" ? (
        <div className="legend-strip__skeleton h-2.5 w-full rounded-full bg-[var(--rule)]" role="status" aria-label="Cargando leyenda" />
      ) : (
        <LayerLegend legend={legend} categories={categories} compact />
      )}
    </aside>
  );
}
