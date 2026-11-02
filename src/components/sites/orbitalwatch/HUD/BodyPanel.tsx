"use client";

import React, { useEffect, useRef, useState } from "react";
import { PanelToggle, isPhoneViewport } from "./PanelToggle";
import { useEngineStore } from "@/stores/engine-store";
import type { FrameBus } from "@/lib/frame-bus";
import type { FrameSnapshot } from "@/engine/contract";
import type { BodyDef } from "@/types/orbital";

const numberFormat = (digits: number): Intl.NumberFormat =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmt0 = numberFormat(0);
const fmt1 = numberFormat(1);
const fmt2 = numberFormat(2);
const AU_KM = 149597870.7;
const LIGHT_KM_PER_S = 299792.458;

interface FormattedValue {
  value: string;
  unit: string;
}

function formatDistance(km: number): FormattedValue {
  return km < 1e6
    ? { value: fmt0.format(km), unit: "km" }
    : km < 0.1 * AU_KM
      ? { value: fmt2.format(km / 1e6), unit: "M km" }
      : { value: fmt2.format(km / AU_KM), unit: "UA" };
}

function formatLightTime(km: number): FormattedValue {
  const seconds = km / LIGHT_KM_PER_S;
  if (seconds < 60) return { value: fmt2.format(seconds), unit: "s" };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { value: `${minutes} min ${Math.round(seconds - minutes * 60)}`, unit: "s" };
  const hours = Math.floor(minutes / 60);
  return { value: `${hours} h ${minutes - hours * 60}`, unit: "min" };
}

function formatDay(dayHours: number | undefined, key: string): string {
  if (key === "moon") return "27,3 días (síncrono)";
  if (key === "venus") return "243 días (retrógrado)";
  const abs = Math.abs(dayHours ?? NaN);
  const retro = dayHours !== undefined && dayHours < 0 ? " (retrógrado)" : "";
  if (abs < 48) {
    const h = Math.floor(abs);
    return `${h} h ${Math.round((abs - h) * 60)} min${retro}`;
  }
  return `${fmt1.format(abs / 24)} días${retro}`;
}

function formatYear(yearDays: number | undefined): string {
  return yearDays
    ? yearDays < 1e3
      ? `${fmt0.format(yearDays)} días`
      : `${fmt1.format(yearDays / 365.25)} años`
    : "—";
}

export interface BodyPanelProps {
  /** Per-frame bus used to update the Earth distance / light time imperatively. */
  frames?: FrameBus<FrameSnapshot> | null;
  onClose?: () => void;
}

export function BodyPanel({ frames = null, onClose }: BodyPanelProps) {
  const selectedBody = useEngineStore((s) => s.selectedBody);
  if (!selectedBody) return null;
  // Keyed by body so refs, caches and focus restart cleanly when switching bodies.
  return <BodyPanelContent key={selectedBody.key} def={selectedBody} frames={frames} onClose={onClose} />;
}

interface BodyPanelContentProps {
  def: BodyDef;
  frames: FrameBus<FrameSnapshot> | null;
  onClose?: () => void;
}

function BodyPanelContent({ def, frames, onClose }: BodyPanelContentProps) {
  const [collapsed, setCollapsed] = useState(isPhoneViewport);
  const closeRef = useRef<HTMLButtonElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const distUnitRef = useRef<HTMLElement>(null);
  const lightRef = useRef<HTMLSpanElement>(null);
  const lightUnitRef = useRef<HTMLElement>(null);

  // Focus management: move focus to close on open, restore on close (unmount).
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  // K5: per-frame distance written through refs; only touches the DOM when the text changes.
  useEffect(() => {
    if (!frames) return;
    let lastText = "";
    return frames.subscribe((frame) => {
      const km = frame.bodyDistanceKm;
      if (!Number.isFinite(km)) return;
      const dist = formatDistance(km);
      const text = dist.value + dist.unit;
      if (text === lastText) return;
      lastText = text;
      const light = formatLightTime(km);
      if (distRef.current) distRef.current.textContent = dist.value;
      if (distUnitRef.current) distUnitRef.current.textContent = dist.unit;
      if (lightRef.current) lightRef.current.textContent = light.value;
      if (lightUnitRef.current) lightUnitRef.current.textContent = light.unit;
    });
  }, [frames]);

  return (
    <aside
      id="body-panel"
      className="panel panel--body group"
      data-collapsed={collapsed}
      role="dialog"
      aria-labelledby="body-name"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose?.();
        }
      }}
    >
      <div className="panel__head">
        <p id="body-kind" className="panel__kind">
          {def.kind}
        </p>
        <h2 id="body-name" className="panel__name" aria-live="polite">
          {def.name}
        </h2>
        <PanelToggle collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} controls="body-details" />
        <button
          ref={closeRef}
          type="button"
          id="body-close"
          className="panel__close"
          aria-label="Volver a la vista general"
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>

      <dl id="body-details" className="readout group-data-[collapsed=true]:max-[480px]:!hidden">
        <div className="readout__hero">
          <dt>Distancia a la Tierra</dt>
          <dd>
            <span ref={distRef} id="dist" className="num">
              —
            </span>
            <small ref={distUnitRef} id="dist-unit" />
          </dd>
        </div>
        <div className="readout__hero">
          <dt>La luz tarda</dt>
          <dd>
            <span ref={lightRef} id="light" className="num">
              —
            </span>
            <small ref={lightUnitRef} id="light-unit" />
          </dd>
        </div>
        <div>
          <dt>Diámetro</dt>
          <dd className="num">{fmt0.format(def.radiusKm * 2)} km</dd>
        </div>
        <div>
          <dt>Rotación</dt>
          <dd>{def.key === "earth" ? "23 h 56 min" : formatDay(def.dayHours, def.key)}</dd>
        </div>
        <div>
          <dt>Órbita</dt>
          <dd>{def.key === "moon" ? "27,3 días alrededor de la Tierra" : formatYear(def.yearDays)}</dd>
        </div>
        <div>
          <dt>Gravedad</dt>
          <dd>{def.facts.gravity}</dd>
        </div>
        <div>
          <dt>Temperatura</dt>
          <dd>{def.facts.temperature}</dd>
        </div>
        <div>
          <dt>{def.key === "sun" ? "Planetas" : "Lunas"}</dt>
          <dd className="num">{def.facts.moons}</dd>
        </div>
      </dl>

      <p className="panel__foot group-data-[collapsed=true]:max-[480px]:!hidden">
        Posiciones reales por efemérides JPL. En pantalla las distancias al Sol están comprimidas para que el
        sistema quepa; los tamaños son reales.
      </p>
    </aside>
  );
}
