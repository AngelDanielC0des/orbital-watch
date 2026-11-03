"use client";
/** Collapsible ranking of the active mode: worst cities (air quality) or regions with most fires. */
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Vector3 } from "three";
import { getLatestFires } from "@/lib/layers/fires/fires.service";
import { POLLUTANT_SCALES } from "@/lib/layers/pollution/pollutant-scales";
import { getLatestPollution } from "@/lib/layers/pollution/pollution.service";
import { topFireRegions, worstCities, type FireRegionRank } from "@/lib/layers/rankings";
import { latLonToVector } from "@/lib/orbital/place-index";
import { placeAt } from "@/lib/orbital/reverse-geocode";
import { useLayersStore } from "@/stores/layers-store";
import type { EngineCommandFacade } from "@/types/engine";
import type { EnvironmentalLayerId } from "@/types/layers";

interface ModeRankingsProps {
  mode: "fires" | "atmosphere";
  handle: EngineCommandFacade | null;
}

const rowClass =
  "flex min-h-11 w-full items-center gap-2 rounded-md px-1.5 text-left text-[12px] text-[var(--ink)] hover:bg-[var(--signal-soft)] focus-visible:outline-1 focus-visible:outline-[var(--signal-glow)] min-[860px]:min-h-8";

async function countryName(lat: number, lon: number): Promise<string | null> {
  return (await placeAt(lat, lon)).country;
}

function focusPoint(handle: EngineCommandFacade | null, layerId: EnvironmentalLayerId, name: string, index: number, lat: number, lon: number): void {
  void handle?.flyToPlace({ name, center: latLonToVector(lat, lon, 1, new Vector3()), distance: 2.6 });
  handle?.selectLayerPoint?.(layerId, index);
  useLayersStore.getState().setSelectedPick({ layerId, kind: "point", index, lat, lon, x: NaN, y: NaN });
}

export function ModeRankings({ mode, handle }: ModeRankingsProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const atmosphereLayer = useLayersStore((s) => s.atmosphereLayer);
  if (mode === "atmosphere" && atmosphereLayer !== "pollution") return null;
  const title = mode === "fires" ? "Regiones con más focos" : "Peores ciudades";
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-1 text-[12px] text-[var(--ink-dim)] hover:text-[var(--ink)] focus-visible:outline-1 focus-visible:outline-[var(--signal-glow)] min-[860px]:min-h-7"
      >
        <span className="flex-1 text-left">{open ? title : "Ver ranking"}</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id={listId} hidden={!open}>
        {open && (mode === "fires" ? <FireList handle={handle} /> : <CityList handle={handle} />)}
      </div>
    </section>
  );
}

function CityList({ handle }: { handle: EngineCommandFacade | null }) {
  const status = useLayersStore((s) => s.layers.pollution.status);
  const pollutant = useLayersStore((s) => s.layers.pollution.config.pollutant);
  const scale = POLLUTANT_SCALES[pollutant];
  const rows = useMemo(() => {
    if (status !== "ready") return [];
    const latest = getLatestPollution();
    return latest ? worstCities(latest.dto, pollutant, 5) : [];
  }, [status, pollutant]);
  return (
    <>
      <p className="m-0 px-1.5 pb-1 text-[11px] text-[var(--ink-dim)]">Peores ciudades · {scale.shortLabel}</p>
      {rows.length === 0 ? (
        <p className="m-0 px-1.5 text-[12px] text-[var(--ink-dim)]">Sin datos de ciudades.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className={rowClass} onClick={() => focusPoint(handle, "pollution", r.name, r.index, r.lat, r.lon)}>
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.category?.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="shrink-0 font-[family-name:var(--font-data)] text-[11px]" title={r.category?.label}>
                  {Math.round(r.value).toLocaleString("es-ES")} {scale.unit}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FireList({ handle }: { handle: EngineCommandFacade | null }) {
  const status = useLayersStore((s) => s.layers.fires.status);
  const fireWindow = useLayersStore((s) => s.layers.fires.config.window);
  const dayNight = useLayersStore((s) => s.layers.fires.config.dayNight);
  const key = `${status}|${fireWindow}|${dayNight}`;
  const [result, setResult] = useState<{ key: string; rows: FireRegionRank[] } | null>(null);

  useEffect(() => {
    if (status !== "ready") return;
    const latest = getLatestFires();
    if (!latest) return;
    let cancelled = false;
    void topFireRegions(latest.payload, 5, countryName)
      .catch((): FireRegionRank[] => [])
      .then((rows) => {
        if (!cancelled) setResult({ key, rows });
      });
    return () => {
      cancelled = true;
    };
  }, [key, status]);

  const rows = result?.key === key ? result.rows : null;
  if (rows === null || status === "loading") return <p className="m-0 px-1.5 text-[12px] text-[var(--ink-dim)]">Calculando…</p>;
  if (rows.length === 0) return <p className="m-0 px-1.5 text-[12px] text-[var(--ink-dim)]">Sin regiones que mostrar.</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((r) => (
        <li key={r.name}>
          <button type="button" className={rowClass} onClick={() => focusPoint(handle, "fires", r.name, r.index, r.lat, r.lon)}>
            <span className="size-2 shrink-0 rounded-full bg-[var(--accent,var(--signal))]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="shrink-0 font-[family-name:var(--font-data)] text-[11px]">
              {r.count.toLocaleString("es-ES")} focos · máx. {Math.round(r.maxFrp).toLocaleString("es-ES")} MW
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
