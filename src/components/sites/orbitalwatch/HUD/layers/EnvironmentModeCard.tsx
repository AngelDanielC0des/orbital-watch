"use client";
/**
 * Card of the active data mode (Incendios / Atmósfera), opened from the FilterBar buttons.
 * Compact by default (title, UTC date, atmosphere switch, legend, pollutant/window control) so it never
 * covers the globe centre on phones (bottom-left on phones, bottom-right on desktop so the scale nav stays free); opacity, sources and description live under "Info".
 */
import { Flame, Info, RefreshCw, Wind, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { getEnvironmentalMetadata } from "@/lib/layers/catalog";
import { getLatestFires } from "@/lib/layers/fires/fires.service";
import { FIRES_LEGEND } from "@/lib/layers/fires/fires-scale";
import { FRESHNESS_COLOR, FRESHNESS_LABEL, formatUtcDate, freshnessOf } from "@/lib/layers/freshness";
import { OZONE_LEGEND } from "@/lib/layers/ozone/legend-ozone";
import { AIR_BAND_NAMES } from "@/lib/layers/pick-resolver";
import { POLLUTANT_SCALES, normalizeValue } from "@/lib/layers/pollution/pollutant-scales";
import { fireSummary } from "@/lib/layers/rankings";
import { useEngineStore } from "@/stores/engine-store";
import { layerForMode, useLayersStore } from "@/stores/layers-store";
import type { EngineCommandFacade } from "@/types/engine";
import type { AtmosphereLayerId, EnvironmentalLayerId, LegendSpec } from "@/types/layers";
import { DataSourceBadge } from "./DataSourceBadge";
import { DayNightSelector } from "./DayNightSelector";
import { FireWindowSelector } from "./FireWindowSelector";
import { LastUpdatedBadge } from "./LastUpdatedBadge";
import { LayerEmptyState } from "./LayerEmptyState";
import { LayerErrorCard } from "./LayerErrorCard";
import { LayerLegend } from "./LayerLegend";
import { LayerLoadingState } from "./LayerLoadingState";
import { LayerOpacitySlider } from "./LayerOpacitySlider";
import { ModeRankings } from "./ModeRankings";
import { PollutantSelector } from "./PollutantSelector";

interface EnvironmentModeCardProps {
  /** Immediate engine-only opacity preview (store write is debounced by the slider). */
  onOpacityPreview: (id: EnvironmentalLayerId, value: number) => void;
  /** Engine handle, used by the rankings to fly to a city or region. */
  handle: EngineCommandFacade | null;
}

const REFRESH_COOLDOWN_MS = 60_000;
const ATMOSPHERE_OPTIONS: readonly { id: AtmosphereLayerId; label: string }[] = [
  { id: "pollution", label: "Calidad del aire" },
  { id: "ozone", label: "Ozono" },
];

const HINT_KEY_PREFIX = "ow.mode-hint.";

function readHintDismissed(mode: string): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY_PREFIX + mode) === "1";
  } catch {
    return false;
  }
}

/** One-line explanation of what the points mean, dismissible and remembered per mode. */
function ModeHint({ mode, text }: { mode: "fires" | "atmosphere"; text: string }) {
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && readHintDismissed(mode));
  if (dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(HINT_KEY_PREFIX + mode, "1");
    } catch {
      /* private mode: dismissed for this session only */
    }
  };
  return (
    <div className="flex items-center gap-2 text-[11.5px] leading-snug text-[var(--ink-dim)]">
      <p className="m-0 min-w-0 flex-1 max-[859px]:truncate" title={text}>
        {text}
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="-my-3 shrink-0 rounded-md px-1.5 py-3 text-[11.5px] text-[var(--ink)] underline-offset-2 hover:underline focus-visible:outline-1 focus-visible:outline-[var(--signal-glow)]"
      >
        Entendido
      </button>
    </div>
  );
}

/** Keeps the card above the timeline, whatever its (wrapping) height is. */
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

/** Re-render clock for the refresh cooldown; ticks only while mounted. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function EnvironmentModeCard({ onOpacityPreview, handle }: EnvironmentModeCardProps) {
  const view = useEngineStore((s) => s.view);
  const mode = useLayersStore((s) => s.mode);
  const atmosphereLayer = useLayersStore((s) => s.atmosphereLayer);
  const id = layerForMode(mode, atmosphereLayer);

  if (id === null || view !== "earth") return null;
  return <ModeCardBody id={id} mode={mode === "fires" ? "fires" : "atmosphere"} onOpacityPreview={onOpacityPreview} handle={handle} />;
}

function ModeCardBody({ id, mode, onOpacityPreview, handle }: { id: EnvironmentalLayerId; mode: "fires" | "atmosphere" } & EnvironmentModeCardProps) {
  const meta = getEnvironmentalMetadata(id);
  const status = useLayersStore((s) => s.layers[id].status);
  const error = useLayersStore((s) => s.layers[id].error);
  const dataDate = useLayersStore((s) => s.layers[id].dataDate);
  const fetchedAt = useLayersStore((s) => s.layers[id].fetchedAt);
  const isFallback = useLayersStore((s) => s.layers[id].isFallback);
  const pollutant = useLayersStore((s) => s.layers.pollution.config.pollutant);
  const timelineH = useTimelineHeight();
  const now = useNow(15_000);
  const infoId = useId();
  const [infoOpen, setInfoOpen] = useState(false);

  const loading = status === "loading";
  const cooling = fetchedAt !== null && now - fetchedAt < REFRESH_COOLDOWN_MS;
  const tone = freshnessOf({ status, dataDate, isFallback, isModel: id === "pollution", nowMs: now });
  const store = useLayersStore.getState;

  let legend: LegendSpec = OZONE_LEGEND;
  let categories: readonly string[] | undefined;
  if (id === "fires") legend = FIRES_LEGEND;
  else if (id === "pollution") {
    legend = POLLUTANT_SCALES[pollutant].legend;
    categories = POLLUTANT_SCALES[pollutant].categories ?? (POLLUTANT_SCALES[pollutant].unit === "µg/m³" ? AIR_BAND_NAMES : undefined);
  }
  const marker = useMemo(() => {
    if (id !== "pollution") return undefined;
    const guideline = POLLUTANT_SCALES[pollutant].guideline;
    return guideline === undefined ? undefined : { at: normalizeValue(pollutant, guideline), label: "OMS" };
  }, [id, pollutant]);
  let summary: string | null = null;
  if (id === "fires" && status === "ready") {
    const latest = getLatestFires();
    if (latest) {
      const f = fireSummary(latest.dto);
      const sources = f.sources.length > 0 ? ` · ${f.sources.join(" + ")}` : "";
      summary = `${f.total.toLocaleString("es-ES")} detecciones${sources} · ${f.windowLabel}`;
    }
  }
  const hint =
    mode === "fires"
      ? "Cada punto es una anomalía térmica detectada por satélite; su tamaño indica la potencia."
      : id === "ozone"
        ? "Columna total de ozono medida por satélite. Pulsa el globo para ver el valor."
        : "Cada punto es la estimación del modelo CAMS para una ciudad (●) o un punto de rejilla (○). El color indica la calidad del aire.";
  const Icon = mode === "fires" ? Flame : Wind;
  const title = mode === "fires" ? "Incendios activos" : id === "ozone" ? "Atmósfera · ozono" : "Atmósfera · calidad del aire";
  const iconButton =
    "grid min-h-11 min-w-11 shrink-0 place-items-center rounded-md text-[var(--ink-dim)] hover:text-[var(--ink)] focus-visible:outline-1 focus-visible:outline-[var(--signal-glow)] disabled:opacity-40 min-[860px]:min-h-8 min-[860px]:min-w-8";

  return (
    <aside
      data-layers-ui=""
      className="legend-strip fixed left-[var(--gutter)] z-[5] min-[860px]:left-auto min-[860px]:right-[var(--gutter)] flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-2 rounded-[8px] border border-[var(--rule)] bg-[var(--panel-strong)] px-3 py-2 text-[var(--ink)] backdrop-blur-[14px] backdrop-saturate-[1.3] shadow-[inset_0_1px_0_rgba(120,170,255,.08)]"
      style={{ bottom: `calc(max(var(--gutter), env(safe-area-inset-bottom)) + ${timelineH}px + 36px)` }}
      aria-label={mode === "fires" ? "Modo incendios" : "Modo atmósfera"}
    >
      <div className="-my-1 flex items-center gap-1.5">
        <Icon className="size-4 shrink-0 text-[var(--accent,var(--signal))]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</span>
        <button
          type="button"
          aria-label={`Actualizar ${meta.title}`}
          title={cooling ? "Actualizado hace menos de un minuto" : undefined}
          disabled={loading || cooling}
          onClick={() => store().requestRefresh(id)}
          className={iconButton}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Información y ajustes de ${meta.title}`}
          aria-expanded={infoOpen}
          aria-controls={infoId}
          onClick={() => setInfoOpen((v) => !v)}
          className={iconButton}
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Salir del modo y volver a los satélites" onClick={() => store().setMode("orbit")} className={iconButton}>
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 font-[family-name:var(--font-data)] text-[11px] text-[var(--ink-dim)]">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: FRESHNESS_COLOR[tone] }} aria-hidden="true" />
        <span>{FRESHNESS_LABEL[tone]}</span>
        {dataDate !== null && <span>· Datos: {formatUtcDate(dataDate, id !== "ozone")}</span>}
        {isFallback && (
          <span className="rounded-full border border-[var(--rule)] px-1.5 font-[family-name:var(--font-ui)] text-[10.5px] leading-4">Demo</span>
        )}
      </div>

      <ModeHint key={mode} mode={mode} text={hint} />

      {mode === "atmosphere" && (
        <div className="flex gap-0.5 rounded-lg border border-[var(--rule)] p-0.5" role="group" aria-label="Capa de atmósfera">
          {ATMOSPHERE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={id === option.id}
              onClick={() => store().setAtmosphereLayer(option.id)}
              className="min-h-8 flex-1 rounded-md px-2 text-[12.5px] max-[859px]:min-h-9 font-medium text-[var(--ink-dim)] hover:text-[var(--ink)] focus-visible:outline-1 focus-visible:outline-[var(--signal-glow)] aria-pressed:bg-[var(--signal-soft)] aria-pressed:text-[var(--ink)] aria-pressed:shadow-[0_0_0_1px_var(--accent),0_0_14px_-2px_var(--signal-glow)]"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {loading && <LayerLoadingState label="Cargando…" />}
      {status === "error" && error !== null && <LayerErrorCard id={id} error={error} onRetry={() => store().requestRefresh(id)} />}
      {status === "empty" && <LayerEmptyState id={id} />}
      {summary !== null && !loading && (
        <p className="m-0 truncate font-[family-name:var(--font-data)] text-[11px] text-[var(--ink-dim)]" title={summary}>
          {summary}
        </p>
      )}
      {!loading && status !== "empty" && (
        <LayerLegend legend={legend} categories={categories} marker={marker} pointKey={id === "pollution"} compact />
      )}

      {/* Phones: the selector lives under Info so the card never reaches the globe centre. */}
      <div className="max-[859px]:hidden">
        {id === "pollution" && <PollutantSelector disabled={loading} />}
        {id === "fires" && (
          <div className="flex flex-col gap-2">
            <FireWindowSelector disabled={loading} />
            <DayNightSelector disabled={loading} />
          </div>
        )}
      </div>

      <div className="max-[859px]:hidden">{id !== "ozone" && <ModeRankings mode={mode} handle={handle} />}</div>

      {infoOpen && (
        <div id={infoId} className="flex flex-col gap-2 border-t border-[var(--rule)] pt-2 text-[12px] text-[var(--ink-dim)]">
          <div className="min-[860px]:hidden">
            {id === "pollution" && <PollutantSelector disabled={loading} />}
            {id === "fires" && (
              <div className="flex flex-col gap-2">
                <FireWindowSelector disabled={loading} />
                <DayNightSelector disabled={loading} />
              </div>
            )}
          </div>
          <div className="min-[860px]:hidden">{id !== "ozone" && <ModeRankings mode={mode} handle={handle} />}</div>
          <LayerOpacitySlider id={id} disabled={loading} onOpacityPreview={onOpacityPreview} />
          <div className="flex flex-col gap-1">
            <DataSourceBadge id={id} />
            <LastUpdatedBadge id={id} />
          </div>
          <p className="m-0">{meta.description}</p>
          <p className="m-0">{meta.latencyNote}</p>
          <p className="m-0">{meta.attribution.short} · {meta.attribution.licence}</p>
        </div>
      )}
    </aside>
  );
}
