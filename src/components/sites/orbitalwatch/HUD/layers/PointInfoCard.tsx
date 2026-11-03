"use client";
/**
 * Card of the clicked overlay point (air-quality sample, fire, fire cell, ozone column).
 * Same corner-bracket `.panel` look as the satellite panel; bottom sheet on phones.
 * Plain-language Spanish, with the honesty notes the data needs (model estimate, thermal anomaly, demo data).
 */
import { Copy, Crosshair, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Vector3 } from "three";
import type { EngineHandle } from "@/engine/contract";
import { formatRelative, formatUtcDate } from "@/lib/layers/freshness";
import { resolvePick, type FireCellInfo, type FireInfo, type OzoneInfo, type PointInfo, type PollutionInfo } from "@/lib/layers/pick-resolver";
import { getLatestPollution } from "@/lib/layers/pollution/pollution.service";
import { POLLUTANT_SCALES } from "@/lib/layers/pollution/pollutant-scales";
import { parseLayerUrlState } from "@/lib/layers/url-state";
import { latLonToVector } from "@/lib/orbital/place-index";
import { placeAt, type PlaceAt } from "@/lib/orbital/reverse-geocode";
import { useLayersStore } from "@/stores/layers-store";
import type { LayerPick } from "@/types/layers";
import { formatAirValue } from "./PointTooltip";

const FIRE_COLOR = "#ffb020";
const OZONE_TONE_COLOR = { hole: "var(--alarm)", low: "var(--payload)", normal: "var(--signal)", high: "var(--signal)" } as const;
const OZONE_EXPLANATION = {
  hole: "Por debajo de 220 DU se considera agujero de ozono.",
  low: "Entre 220 y 250 DU: capa de ozono más fina de lo habitual.",
  normal: "Entre 250 y 350 DU: valores habituales de la capa de ozono.",
  high: "Por encima de 350 DU: columna de ozono más gruesa de lo habitual.",
} as const;
const COPIED_MS = 1500;

/** Keeps the phone sheet above the timeline, whatever its (wrapping) height is. */
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

function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 text-[11.5px] leading-5" style={{ borderColor: color, color }}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[12.5px]">
      <dt className="text-[var(--ink-dim)]">{label}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[12px] leading-[1.45] text-[var(--ink-dim)]">{children}</p>;
}

function Big({ children }: { children: ReactNode }) {
  return <span className="font-[family-name:var(--font-data)] text-[1.9rem] font-semibold leading-none tracking-[-0.02em]">{children}</span>;
}

function guidelineText(ratio: number, guideline: number, unit: string): string {
  if (ratio <= 1) return "Dentro de la guía de la OMS";
  return `×${ratio.toLocaleString("es-ES", { maximumFractionDigits: 1 })} la guía de la OMS (${guideline.toLocaleString("es-ES")} ${unit})`;
}

function PollutionBody({ info }: { info: PollutionInfo }) {
  const a = info.active;
  const guideline = POLLUTANT_SCALES[a.pollutant].guideline;
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Big>{a.value === null ? "—" : a.value.toLocaleString("es-ES", { maximumFractionDigits: a.value < 10 ? 1 : 0 })}</Big>
        <span className="text-[13px] text-[var(--ink-dim)]">{a.value === null ? a.label : `${a.unit} · ${a.label}`}</span>
        {a.category !== null && <Chip color={a.category.color}>{a.category.label}</Chip>}
      </div>
      {a.guidelineRatio !== null && guideline ? <p className="m-0 text-[12.5px]">{guidelineText(a.guidelineRatio, guideline, a.unit)}</p> : null}
      <dl className="m-0 border-t border-[var(--rule)] pt-1.5">
        {info.readings.map((r) => (
          <div key={r.pollutant} className="grid grid-cols-[1fr_auto_5.5rem] items-baseline gap-2 py-0.5 text-[12px]">
            <dt className={r.pollutant === a.pollutant ? "text-[var(--ink)]" : "text-[var(--ink-dim)]"}>{r.label}</dt>
            <dd className="m-0 text-right font-[family-name:var(--font-data)]">{r.value === null ? "—" : formatAirValue(r)}</dd>
            <dd className="m-0 truncate text-right" style={{ color: r.category?.color ?? "var(--ink-dim)" }}>
              {r.category?.label ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
      <Row label="Hora del modelo">{formatUtcDate(info.time, true)}</Row>
      <Note>Estimación del modelo CAMS, no una medición de estación.</Note>
    </>
  );
}

function FireBody({ info, now }: { info: FireInfo; now: number }) {
  const when = info.acquiredAt !== null ? Date.parse(info.acquiredAt) : NaN;
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Big>{Math.round(info.frp).toLocaleString("es-ES")}</Big>
        <span className="text-[13px] text-[var(--ink-dim)]">MW</span>
        <Chip color={FIRE_COLOR}>{info.intensity.label}</Chip>
      </div>
      <dl className="m-0 border-t border-[var(--rule)] pt-1.5">
        <Row label="Detectado">
          {info.acquiredAt !== null && Number.isFinite(when) ? `${formatUtcDate(info.acquiredAt, true)} · ${formatRelative(when, now)}` : "—"}
        </Row>
        <Row label="Satélite">{info.satellite ?? "—"}</Row>
        <Row label="Día/Noche">{info.day === null ? "—" : info.day ? "Día" : "Noche"}</Row>
        <Row label="Confianza">{info.confidence ?? "—"}</Row>
        <Row label="Coordenadas">
          <span className="font-[family-name:var(--font-data)]">
            {info.lat.toFixed(4)}, {info.lon.toFixed(4)}
          </span>
        </Row>
      </dl>
      <Note>Anomalía térmica detectada por satélite: puede ser un incendio forestal, una quema agrícola o una fuente industrial.</Note>
    </>
  );
}

function FireCellBody({ info }: { info: FireCellInfo }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[1.25rem] font-semibold leading-tight">
          {info.saturated ? "100 o más detecciones" : `≈ ${info.detections.toLocaleString("es-ES")} detecciones`}
        </span>
        <span className="text-[12.5px] text-[var(--ink-dim)]">en la celda de 0,5°</span>
      </div>
      <p className="m-0 text-[12.5px]">Potencia máx. ≈ {Math.round(info.maxFrp).toLocaleString("es-ES")} MW</p>
      <Note>Acércate para ver los focos individuales.</Note>
    </>
  );
}

function OzoneBody({ info }: { info: OzoneInfo }) {
  if (info.du === null || info.tone === null) {
    return <Note>No hay medición del satélite en este punto (hueco entre pasadas o noche polar).</Note>;
  }
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Big>{info.du}</Big>
        <span className="text-[13px] text-[var(--ink-dim)]">DU</span>
        <Chip color={OZONE_TONE_COLOR[info.tone]}>{info.label ?? ""}</Chip>
      </div>
      <p className="m-0 text-[12.5px]">{OZONE_EXPLANATION[info.tone]}</p>
      <dl className="m-0 border-t border-[var(--rule)] pt-1.5">
        {info.date !== null && <Row label="Fecha">{formatUtcDate(info.date)}</Row>}
        {info.product !== null && <Row label="Producto">{OZONE_PRODUCT_LABEL[info.product] ?? info.product}</Row>}
      </dl>
    </>
  );
}

interface Heading {
  title: string;
  subtitle: string;
  source: string;
  fallback: boolean;
}

function headingOf(info: PointInfo): Heading {
  switch (info.kind) {
    case "pollution":
      return {
        title: info.name,
        subtitle: info.isGrid ? "Punto de rejilla del modelo" : "Ciudad",
        source: "Open-Meteo · CAMS (CC BY 4.0)",
        fallback: info.isFallback,
      };
    case "fire":
      return { title: "Foco de calor", subtitle: "Detección satelital", source: "NASA FIRMS · VIIRS 375 m", fallback: info.isFallback };
    case "fireCell":
      return { title: "Zona con focos", subtitle: "Detecciones agrupadas", source: "NASA FIRMS · VIIRS 375 m", fallback: info.isFallback };
    case "ozone":
      return { title: "Columna de ozono", subtitle: "Ozono total sobre este punto", source: "NASA GIBS · OMI / OMPS", fallback: false };
  }
}

function placeText(place: PlaceAt | null): string {
  if (place === null) return "";
  return [place.state, place.country].filter((p): p is string => p !== null).join(", ");
}

/** Human labels of the GIBS ozone products (raw ids stay in the data). */
const OZONE_PRODUCT_LABEL: Readonly<Record<string, string>> = {
  OMI_TOMS: "OMI (Aura) · TOMS",
  OMI_DOAS: "OMI (Aura) · DOAS",
  OMPS: "OMPS (Suomi NPP)",
  snapshot: "OMI (Aura) · instantánea",
};

export function PointInfoCard({ handle }: { handle: EngineHandle | null }) {
  const pick = useLayersStore((s) => s.selectedPick);
  // Config + data lifecycle subscriptions: re-resolve when the data behind the pick changes.
  const pollutant = useLayersStore((s) => s.layers.pollution.config.pollutant);
  const fireWindow = useLayersStore((s) => s.layers.fires.config.window);
  const dayNight = useLayersStore((s) => s.layers.fires.config.dayNight);
  const pollutionFetched = useLayersStore((s) => s.layers.pollution.fetchedAt);
  const firesFetched = useLayersStore((s) => s.layers.fires.fetchedAt);
  const pollutionStatus = useLayersStore((s) => s.layers.pollution.status);
  const firesStatus = useLayersStore((s) => s.layers.fires.status);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const appliedPt = useRef(false);
  const timelineH = useTimelineHeight();
  const [now] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [placeState, setPlaceState] = useState<{ key: string; place: PlaceAt | null } | null>(null);

  const info = useMemo(() => {
    void [pollutant, fireWindow, dayNight, pollutionFetched, firesFetched];
    return pick ? resolvePick(pick) : null;
  }, [pick, pollutant, fireWindow, dayNight, pollutionFetched, firesFetched]);

  const close = useCallback(() => {
    useLayersStore.getState().setSelectedPick(null);
    handle?.clearLayerPick?.();
  }, [handle]);

  // Data changed underneath and the pick no longer resolves: close (not while a reload is in flight).
  useEffect(() => {
    if (pick === null || info !== null) return;
    if (pollutionStatus === "loading" || firesStatus === "loading") return;
    // A deep-linked pick is applied right after "ready"; it always resolves by then.
    close();
  }, [pick, info, pollutionStatus, firesStatus, close]);

  // Focus: into the card on open, back to the canvas on close.
  const open = info !== null;
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    return () => document.querySelector<HTMLCanvasElement>("canvas")?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Place name (async, cached per 0.5° cell).
  const lat = pick?.lat ?? NaN;
  const lon = pick?.lon ?? NaN;
  const placeKey = `${lat},${lon}`;
  useEffect(() => {
    if (!open || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    let alive = true;
    placeAt(lat, lon).then(
      (place) => {
        if (alive) setPlaceState({ key: placeKey, place });
      },
      () => {
        if (alive) setPlaceState({ key: placeKey, place: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [open, lat, lon, placeKey]);

  // Deep link `?pt=<id>`: select once when the pollution layer is ready.
  useEffect(() => {
    if (appliedPt.current || !handle || pollutionStatus !== "ready") return;
    const id = parseLayerUrlState(window.location.search).pointId;
    const latest = getLatestPollution();
    if (id === null || !latest) {
      if (id === null) appliedPt.current = true;
      return;
    }
    appliedPt.current = true;
    const index = latest.dto.points.findIndex((p) => p.id === id);
    if (index < 0) return;
    const point = latest.dto.points[index];
    handle.selectLayerPoint?.("pollution", index);
    useLayersStore.getState().setSelectedPick({ layerId: "pollution", kind: "point", index, lat: point.lat, lon: point.lon, x: NaN, y: NaN });
  }, [handle, pollutionStatus]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  if (!pick || !info) return null;

  const heading = headingOf(info);
  const loadingPlace = placeState === null || placeState.key !== placeKey;
  const placeLine = loadingPlace ? "…" : placeText(placeState.place);

  const center = (target: LayerPick) => {
    if (!handle) return;
    const name = placeLine !== "" && placeLine !== "…" ? `${heading.title}, ${placeLine}` : heading.title;
    const reselect = () => {
      if (target.kind === "point") handle.selectLayerPoint?.(target.layerId, target.index);
    };
    handle
      .flyToPlace({ name, center: latLonToVector(target.lat, target.lon, 1, new Vector3()), distance: 2.6 })
      .then(reselect, () => undefined);
    reselect();
  };

  const copyLink = () => {
    const url = new URL(window.location.href);
    if (info.kind === "pollution") url.searchParams.set("pt", info.id);
    navigator.clipboard.writeText(url.toString().replace(/%2C/gi, ",")).then(
      () => setCopied(true),
      () => undefined,
    );
  };

  const actionBtn =
    "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--rule)] px-2.5 text-[12.5px] text-[var(--ink)] hover:border-[var(--rule-strong)] hover:bg-[var(--hover-tint)] focus-visible:outline-1 focus-visible:outline-[var(--signal-glow)] disabled:opacity-40";
  const sheetStyle: CSSProperties & Record<"--pc-bottom", string> = {
    "--pc-bottom": `calc(max(var(--gutter), env(safe-area-inset-bottom)) + ${timelineH}px + 10px)`,
  };

  return (
    <aside
      data-layers-ui=""
      data-point-card=""
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="panel point-card flex flex-col gap-2.5 text-[var(--ink)]"
      style={sheetStyle}
    >
      <div className="relative pr-9">
        <div className="text-[12.5px] text-[var(--accent,var(--signal))]">{heading.subtitle}</div>
        <h2 id={titleId} className="m-0 mt-0.5 text-[1.25rem] font-semibold leading-[1.15] tracking-[-0.02em] text-balance">
          {heading.title}
        </h2>
        {placeLine !== "" && <div className="mt-1 text-[12.5px] text-[var(--ink-dim)]">{placeLine}</div>}
        <button ref={closeRef} type="button" aria-label="Cerrar" onClick={close} className="panel__close">
          <X aria-hidden="true" />
        </button>
      </div>

      {info.kind === "pollution" && <PollutionBody info={info} />}
      {info.kind === "fire" && <FireBody info={info} now={now} />}
      {info.kind === "fireCell" && <FireCellBody info={info} />}
      {info.kind === "ozone" && <OzoneBody info={info} />}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={actionBtn} onClick={() => center(pick)} disabled={!handle}>
          <Crosshair className="size-3.5" aria-hidden="true" />
          Centrar
        </button>
        {info.kind === "pollution" && (
          <button type="button" className={actionBtn} onClick={copyLink}>
            <Copy className="size-3.5" aria-hidden="true" />
            <span aria-live="polite">{copied ? "Copiado" : "Copiar enlace"}</span>
          </button>
        )}
        {heading.fallback && (
          <span className="rounded-full border border-[var(--rule)] px-1.5 font-[family-name:var(--font-ui)] text-[10.5px] leading-4 text-[var(--ink-dim)]">Demo</span>
        )}
      </div>
      <div className="text-[11.5px] text-[var(--ink-dim)]">{heading.source}</div>
    </aside>
  );
}
