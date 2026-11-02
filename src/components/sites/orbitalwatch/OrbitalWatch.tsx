"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEngine } from "@/hooks/useEngine";
import { readUrlState, useUrlState } from "@/hooks/useUrlState";
import { useEngineStore } from "@/stores/engine-store";
import { useLayersStore } from "@/stores/layers-store";
import { parseLayerUrlState } from "@/lib/layers/url-state";
import { EnvironmentalLayersController } from "./HUD/layers/EnvironmentalLayersController";
import { HUDHeader } from "./HUD/HUDHeader";
import { ViewControls } from "./HUD/ViewControls";
import { FilterBar } from "./HUD/FilterBar";
import { SatellitePanel } from "./HUD/SatellitePanel";
import { BodyPanel } from "./HUD/BodyPanel";
import { Timeline } from "./HUD/Timeline";
import { Loader } from "./HUD/Loader";
import { Hint } from "./HUD/Hint";
import { EngineErrorOverlay, useIsFatalEngineError } from "./HUD/EngineErrorOverlay";
import { HUDErrorBoundary } from "./HUDErrorBoundary";
import { PlaceSearch } from "./HUD/PlaceSearch";
import { SatelliteSearch } from "./HUD/SatelliteSearch";
import { LabelOverlay } from "./HUD/LabelOverlay";
import { DonateSheet } from "./DonateSheet";
import { STRIPE_PAYMENT_LINK } from "@/engine/config";
import type { ViewMode } from "@/types/engine";

const VIEW_CLASSES = ["view-earth", "view-solar", "view-galaxy"] as const;

const VIEW_HINTS: Record<ViewMode, string> = {
  earth: "Arrastra para rotar · rueda o pellizco para zoom · toca un objeto para seguir su órbita",
  solar: "Toca un planeta para viajar a él · aleja el zoom para ver la Vía Láctea",
  galaxy: "Arrastra para orbitar la galaxia · toca «Sol» para volver al sistema solar",
};

/** True when a keyboard event targets a control that handles keys itself. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, button, a[href], [role='button']") !== null
  );
}

/**
 * OrbitalWatch 3D Main Shell
 *
 * Architecture:
 * - Domain-Driven Design (DDD) & Hexagonal Architecture:
 *   React strictly manages DOM, accessible UI overlays and declarative user state.
 *   Three.js/WebGL manages the Canvas, shaders, and GPU orbital calculations.
 * - Communication is decoupled via useEngine (EngineHandle commands + engine-bridge → Zustand + FrameBus).
 * - Open/Closed Principle: Ready for future plugin layers (Ozone, Pollution, Space Weather).
 */
export function OrbitalWatch() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDonateOpen, setIsDonateOpen] = useState(false);

  // Parsed once on the client; the server render ignores it (engine mounts in an effect, markup is unaffected).
  const [urlState] = useState(readUrlState);
  const [layerUrl] = useState(() => parseLayerUrlState(typeof window === "undefined" ? "" : window.location.search));
  const handle = useEngine(canvasRef, { initial: urlState.initial });
  useUrlState(handle, urlState);
  useEffect(() => {
    useLayersStore.getState().hydrate({ visible: layerUrl.visible, config: layerUrl.config });
  }, [layerUrl]);
  const onTimelineInset = useCallback((px: number) => handle?.setTimelineInset(px), [handle]);
  const view = useEngineStore((s) => s.view);
  const filter = useEngineStore((s) => s.filter);
  const isBusy = useEngineStore((s) => s.isBusy);
  const isFatalError = useIsFatalEngineError();

  // React is the single writer of body classes (ADR-5).
  useEffect(() => {
    const { classList } = document.body;
    for (const c of VIEW_CLASSES) classList.toggle(c, c === `view-${view}`);
    useEngineStore.getState().setHint(VIEW_HINTS[view]);
    return () => classList.remove(...VIEW_CLASSES);
  }, [view]);

  useEffect(() => {
    document.body.classList.toggle("is-alarm", filter === "debris");
    return () => document.body.classList.remove("is-alarm");
  }, [filter]);

  // Global keyboard shortcuts (registered once per handle, always cleaned up).
  useEffect(() => {
    if (!handle) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isInteractiveTarget(e.target)) return;
      const state = useEngineStore.getState();
      switch (e.key) {
        case " ":
          e.preventDefault();
          handle.togglePlay();
          break;
        case "Escape":
          if (state.view === "earth") handle.deselectSatellite();
          else if (state.view === "solar" && state.focusBody !== "sun" && !state.isBusy) {
            void handle.setView("solar");
          }
          break;
        case "1":
        case "2":
        case "3": {
          const next: ViewMode = e.key === "1" ? "earth" : e.key === "2" ? "solar" : "galaxy";
          if (!state.isBusy && state.view !== next) void handle.setView(next);
          break;
        }
        case "n":
        case "N":
          handle.setNightMode(!state.nightMode);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handle]);

  // Touching the canvas dismisses the navigation hint (engine dismissHint is a no-op).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onPointerDown = () => {
      useEngineStore.getState().dismissHint();
      handle?.dismissHint();
    };
    canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => canvas.removeEventListener("pointerdown", onPointerDown);
  }, [handle]);

  return (
    <>
      {/* 3D WebGL Canvas Viewport */}
      <canvas
        id="scene"
        ref={canvasRef}
        aria-label="Vista 3D interactiva de la Tierra y los objetos en órbita"
      />

      {/* Accessible noscript fallback */}
      <noscript>
        <article>
          <h1>OrbitalWatch 3D</h1>
          <p>
            Visor web aeroespacial de satélites y basura espacial en órbita terrestre.
            Propaga objetos mediante modelos SGP4 sobre la Tierra y permite cambiar de escala
            al sistema solar (efemérides JPL) y la Vía Láctea.
          </p>
          <p>
            Filtros: catálogo completo, basura espacial, constelación Starlink y lanzamientos previstos.
            Línea temporal en UTC con control de velocidad de simulación.
          </p>
        </article>
      </noscript>

      <HUDErrorBoundary>
      {/* HUD Header */}
      <HUDHeader />

      {/* Geographic Search Overlay */}
      <PlaceSearch visible={view === "earth"} onSelect={(p) => void handle?.flyToPlace(p)} />

      <SatelliteSearch handle={handle} />

      {/* Scale & View Selector */}
      <ViewControls
        onSelectView={(v) => void handle?.setView(v)}
        onToggleLayer={(id, v) => handle?.toggleLayer(id, v)}
        onOpacityPreview={(id, v) => handle?.setLayerOpacity?.(id, v)}
      />

      <EnvironmentalLayersController handle={handle} urlState={layerUrl} />

      {/* 3D Screen Projected Labels Target */}
      <LabelOverlay frames={handle?.frames ?? null} defs={[]} onPick={(k) => void handle?.pickLabel(k)} />

      {/* Orbital Filters & Night Mode */}
      <FilterBar
        onFilterChange={(f) => handle?.setFilter(f)}
        onToggleNight={(on) => handle?.setNightMode(on)}
      />

      {/* Contribution Button */}
      <button
        type="button"
        id="donate-open"
        className="toggle toggle--donate"
        aria-label="Contribuir"
        aria-expanded={isDonateOpen}
        aria-controls="donate-layer"
        onClick={() => setIsDonateOpen(true)}
      >
        <svg className="toggle__icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2.6v10.8M2.6 8h10.8" fill="none" />
        </svg>
        <span className="toggle__label">Contribuir</span>
      </button>

      {/* Decoupled Donate Sheet Modal */}
      <DonateSheet
        isOpen={isDonateOpen}
        onClose={() => setIsDonateOpen(false)}
        stripePaymentLink={STRIPE_PAYMENT_LINK}
      />

      {/* Selected Satellite Telemetry Panel */}
      <SatellitePanel frames={handle?.frames ?? null} onClose={() => handle?.deselectSatellite()} />

      {/* Celestial Body Info Panel */}
      <BodyPanel frames={handle?.frames ?? null} onClose={() => void handle?.setView("solar")} />

      {/* Simulation Timeline & Scrubbing */}
      <Timeline
        frames={handle?.frames ?? null}
        onTogglePlay={() => handle?.togglePlay()}
        onSetSpeed={(speed) => handle?.setSpeed(speed)}
        onScrub={(days) => handle?.scrubDays(days)}
        onSeekNow={() => handle?.seekNow()}
        onTimelineInset={onTimelineInset}
      />

      {/* Navigation Hint */}
      <Hint />

      {/* View Transition Warp Effect */}
      <div id="warp" className={`warp${isBusy ? " is-on" : ""}`} aria-hidden="true" />

      {/* Initial Asset Loading Progress */}
      </HUDErrorBoundary>

      {/* Fatal engine errors replace the loader; catalog failures show a toast */}
      {!isFatalError && <Loader />}
      <EngineErrorOverlay />
    </>
  );
}
