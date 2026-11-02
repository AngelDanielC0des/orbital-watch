"use client";

import React, { useEffect, useRef, useState } from "react";
import { PanelToggle, isPhoneViewport } from "./PanelToggle";
import { useEngineStore } from "@/stores/engine-store";
import { CATEGORY_LABELS } from "@/types/orbital";
import type { FrameBus } from "@/lib/frame-bus";
import type { FrameSnapshot } from "@/engine/contract";

const fixed0 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fixed1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fixed2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fixed3 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const launchDateFormat = new Intl.DateTimeFormat("es-ES", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

export interface SatellitePanelProps {
  /** Per-frame bus; live readouts are written to the DOM through refs (K5 pattern). */
  frames: FrameBus<FrameSnapshot> | null;
  /** Wired to `handle.deselectSatellite()`. */
  onClose?: () => void;
}

export function SatellitePanel({ frames, onClose }: SatellitePanelProps) {
  const selected = useEngineStore((s) => s.selectedSatellite);
  const isOpen = selected !== null;
  const [collapsed, setCollapsed] = useState(isPhoneViewport);

  const altRef = useRef<HTMLSpanElement>(null);
  const velRef = useRef<HTMLSpanElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lonRef = useRef<HTMLSpanElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Live readouts: subscribe only while a satellite is selected.
  useEffect(() => {
    if (!frames || !isOpen) return;
    return frames.subscribe((frame) => {
      const r = frame.readout;
      const alt = altRef.current;
      const vel = velRef.current;
      const lat = latRef.current;
      const lon = lonRef.current;
      if (!alt || !vel || !lat || !lon) return;
      alt.textContent = r ? fixed0.format(r.altitudeKm) : "—";
      vel.textContent = r ? fixed3.format(r.speedKmS) : "—";
      lat.textContent = r ? fixed2.format(r.latDeg) : "—";
      lon.textContent = r ? fixed2.format(r.lonDeg) : "—";
    });
  }, [frames, isOpen]);

  // Focus management + Escape while open.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous && previous.isConnected) previous.focus();
    };
  }, [isOpen]);

  if (!selected) return null;

  const { entry, synthetic } = selected;
  const { omm, elements } = entry;

  return (
    <aside id="panel" className="panel group" data-collapsed={collapsed} role="dialog" aria-labelledby="panel-name">
      <div className="panel__head">
        <p id="panel-kind" className="panel__kind">
          {CATEGORY_LABELS[entry.category]}
          {entry.projected ? " · lanzamiento previsto" : ""}
        </p>
        <h2 id="panel-name" className="panel__name">
          {omm.OBJECT_NAME}
        </h2>
        <p className="panel__ids">
          NORAD <span className="num">{omm.NORAD_CAT_ID}</span>{" "}
          <span className="sep" aria-hidden="true">
            ·
          </span>{" "}
          COSPAR <span className="num">{omm.OBJECT_ID || "—"}</span>
        </p>
        <PanelToggle collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} controls="panel-details" />
        <button
          ref={closeRef}
          type="button"
          id="panel-close"
          className="panel__close"
          aria-label="Dejar de seguir el objeto"
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>

      <dl id="panel-details" className="readout group-data-[collapsed=true]:max-[480px]:!hidden">
        <div className="readout__hero">
          <dt>Altitud</dt>
          <dd>
            <span ref={altRef} id="panel-alt" className="num">
              —
            </span>
            <small>km</small>
          </dd>
        </div>
        <div className="readout__hero">
          <dt>Velocidad</dt>
          <dd>
            <span ref={velRef} id="panel-vel" className="num">
              —
            </span>
            <small>km/s</small>
          </dd>
        </div>
        <div>
          <dt>País / operador</dt>
          <dd>{entry.country || "—"}</dd>
        </div>
        <div>
          <dt>Lanzamiento</dt>
          <dd className="num">{entry.launchMs > 0 ? launchDateFormat.format(entry.launchMs) : "—"}</dd>
        </div>
        <div>
          <dt>Inclinación</dt>
          <dd>
            <span className="num">{fixed2.format((elements.i * 180) / Math.PI)}</span>°
          </dd>
        </div>
        <div>
          <dt>Periodo</dt>
          <dd>
            <span className="num">{fixed1.format(elements.periodMin)}</span> min
          </dd>
        </div>
        <div>
          <dt>Perigeo</dt>
          <dd>
            <span className="num">{fixed0.format(elements.perigeeKm)}</span> km
          </dd>
        </div>
        <div>
          <dt>Apogeo</dt>
          <dd>
            <span className="num">{fixed0.format(elements.apogeeKm)}</span> km
          </dd>
        </div>
        <div>
          <dt>Latitud</dt>
          <dd>
            <span ref={latRef} id="panel-lat" className="num">
              —
            </span>
            °
          </dd>
        </div>
        <div>
          <dt>Longitud</dt>
          <dd>
            <span ref={lonRef} id="panel-lon" className="num">
              —
            </span>
            °
          </dd>
        </div>
      </dl>

      <p className="panel__foot group-data-[collapsed=true]:max-[480px]:!hidden">
        Propagación SGP4 sobre elementos de época{" "}
        <span className="num">
          {formatUtc(elements.epochMs).slice(0, 16)} UTC{synthetic ? " (sintética)" : ""}
        </span>
      </p>
    </aside>
  );
}
