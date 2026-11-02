"use client";

import React, { useEffect, useId, useState } from "react";
import { Flame, Info, RefreshCw, Wind, CircleDashed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getEnvironmentalMetadata } from "@/lib/layers/catalog";
import { FIRES_LEGEND } from "@/lib/layers/fires/fires-scale";
import { OZONE_LEGEND } from "@/lib/layers/ozone/legend-ozone";
import { POLLUTANT_SCALES } from "@/lib/layers/pollution/pollutant-scales";
import { useEngineStore } from "@/stores/engine-store";
import { useLayersStore } from "@/stores/layers-store";
import type { EnvironmentalLayerId, LegendSpec } from "@/types/layers";
import { FireWindowSelector } from "./FireWindowSelector";
import { DataSourceBadge } from "./DataSourceBadge";
import { LastUpdatedBadge } from "./LastUpdatedBadge";
import { LayerEmptyState } from "./LayerEmptyState";
import { LayerErrorCard } from "./LayerErrorCard";
import { LayerLegend } from "./LayerLegend";
import { LayerLoadingState } from "./LayerLoadingState";
import { LayerOpacitySlider } from "./LayerOpacitySlider";
import { LayerToggle } from "./LayerToggle";
import { PollutantSelector } from "./PollutantSelector";

interface LayerRowProps {
  id: EnvironmentalLayerId;
  disabled: boolean;
  onOpacityPreview: (id: EnvironmentalLayerId, value: number) => void;
}

const ICONS: Record<EnvironmentalLayerId, LucideIcon> = {
  ozone: CircleDashed,
  pollution: Wind,
  fires: Flame,
};

const DAY_MS = 86_400_000;
const REFRESH_COOLDOWN_MS = 60_000;

type Tone = "fresh" | "stale" | "demo" | "error" | "none";

const TONE_COLOR: Record<Tone, string> = {
  fresh: "var(--signal)",
  stale: "var(--payload)",
  demo: "var(--ink-dim)",
  error: "var(--alarm)",
  none: "var(--ink-dim)",
};

const TONE_TEXT: Record<Tone, string> = {
  fresh: "Datos recientes",
  stale: "Datos con retraso",
  demo: "Demostración",
  error: "Error",
  none: "Sin datos",
};

export function LayerRow({ id, disabled, onOpacityPreview }: LayerRowProps) {
  const meta = getEnvironmentalMetadata(id);
  const Icon = ICONS[id];
  const infoId = useId();
  const visible = useLayersStore((s) => s.layers[id].visible);
  const status = useLayersStore((s) => s.layers[id].status);
  const error = useLayersStore((s) => s.layers[id].error);
  const dataDate = useLayersStore((s) => s.layers[id].dataDate);
  const fetchedAt = useLayersStore((s) => s.layers[id].fetchedAt);
  const isFallback = useLayersStore((s) => s.layers[id].isFallback);
  const pollutant = useLayersStore((s) => s.layers.pollution.config.pollutant);
  const scrubbed = useEngineStore((s) => Math.abs(s.time.daysOffset) > 2);
  const [infoOpen, setInfoOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const loading = status === "loading";
  const cooling = fetchedAt !== null && now - fetchedAt < REFRESH_COOLDOWN_MS;

  let tone: Tone = "none";
  if (status === "error") tone = "error";
  else if (isFallback) tone = "demo";
  else if (dataDate !== null) {
    const ms = Date.parse(dataDate);
    const age = Number.isFinite(ms) ? now - ms : Infinity;
    tone = id === "pollution" || age > 2 * DAY_MS ? "stale" : "fresh";
  }

  const legend: LegendSpec =
    id === "ozone" ? OZONE_LEGEND : id === "fires" ? FIRES_LEGEND : POLLUTANT_SCALES[pollutant].legend;

  const setVisible = (v: boolean) => useLayersStore.getState().setVisible(id, v);
  const retry = () => useLayersStore.getState().requestRefresh(id);

  return (
    <li className={`flex flex-col gap-2 border-b border-[var(--rule)] px-4 py-2.5 last:border-b-0 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: TONE_COLOR[tone] }}
          aria-hidden="true"
        />
        <Icon className="size-4 shrink-0 text-[var(--ink-dim)]" aria-hidden="true" />
        <span className={`min-w-0 flex-1 text-[14px] font-medium ${visible ? "text-[var(--ink)]" : "text-[var(--ink-dim)]"}`}>
          {meta.title}
        </span>
        <LayerToggle checked={visible} onChange={setVisible} label={meta.title} disabled={disabled} layerId={id} />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-4">
        <DataSourceBadge id={id} />
        <LastUpdatedBadge id={id} />
        <span className="text-[11.5px]" style={{ color: TONE_COLOR[tone] }}>
          {TONE_TEXT[tone]}
        </span>
        <span className="ml-auto flex items-center">
          <button
            type="button"
            aria-label={`Actualizar ${meta.title}`}
            title={cooling && fetchedAt !== null ? `Actualizado hace ${Math.max(1, Math.round((now - fetchedAt) / 1000))} s` : undefined}
            disabled={disabled || loading || cooling}
            onClick={retry}
            className="grid min-h-11 min-w-11 place-items-center rounded-md text-[var(--ink-dim)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--signal)] disabled:opacity-40 min-[860px]:min-h-8 min-[860px]:min-w-8"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Información de ${meta.title}`}
            aria-expanded={infoOpen}
            aria-controls={infoId}
            disabled={disabled}
            onClick={() => setInfoOpen((v) => !v)}
            className="grid min-h-11 min-w-11 place-items-center rounded-md text-[var(--ink-dim)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--signal)] disabled:opacity-40 min-[860px]:min-h-8 min-[860px]:min-w-8"
          >
            <Info className="size-4" aria-hidden="true" />
          </button>
        </span>
      </div>

      {visible && (
        <div className="flex flex-col gap-2 pl-4">
          {loading && <LayerLoadingState label="Cargando…" />}
          {status === "error" && error !== null && <LayerErrorCard id={id} error={error} onRetry={retry} />}
          {status === "empty" && <LayerEmptyState id={id} />}
          <LayerOpacitySlider id={id} disabled={disabled || loading} onOpacityPreview={onOpacityPreview} />
          {id === "pollution" && <PollutantSelector disabled={disabled || loading} />}
          {id === "fires" && <FireWindowSelector disabled={disabled || loading} />}
        </div>
      )}

      {infoOpen && (
        <div id={infoId} className="flex flex-col gap-2 pl-4 text-[12.5px] text-[var(--ink-dim)]">
          <p className="m-0">{meta.description}</p>
          <LayerLegend legend={legend} />
          <p className="m-0">{meta.latencyNote}</p>
          {isFallback && <p className="m-0">Instantánea de demostración.</p>}
          {scrubbed && <p className="m-0 text-[var(--payload)]">La capa no sigue la línea temporal</p>}
        </div>
      )}
    </li>
  );
}
