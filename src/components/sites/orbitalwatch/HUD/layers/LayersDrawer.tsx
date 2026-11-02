"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Layers, X } from "lucide-react";
import { ENVIRONMENTAL_LAYER_IDS, LAYER_CATALOG, ORBIT_LAYER_IDS } from "@/lib/layers/catalog";
import { useEngineStore } from "@/stores/engine-store";
import { useLayersStore } from "@/stores/layers-store";
import type { EnvironmentalLayerId } from "@/types/layers";
import { AttributionFooter } from "./AttributionFooter";
import { LayerRow } from "./LayerRow";
import { LayerToggle } from "./LayerToggle";

interface LayersDrawerProps {
  /** Forwarded to the engine (`handle.toggleLayer`) for orbit layers. */
  onToggleLayer?: (layerId: string, visible: boolean) => void;
  onOpacityPreview?: (id: EnvironmentalLayerId, value: number) => void;
}

const DESKTOP_MIN_PX = 860;
const HALF = 0.45;
const FULL = 0.85;
const CLOSE_BELOW = 0.25;
const CLICK_SLOP_PX = 4;

type Snap = "half" | "full";

interface DragState {
  startY: number;
  startHeight: number;
  moved: boolean;
}

function OrbitRow({ id, onToggleLayer }: { id: (typeof ORBIT_LAYER_IDS)[number]; onToggleLayer?: LayersDrawerProps["onToggleLayer"] }) {
  const meta = LAYER_CATALOG[id];
  const checked = useEngineStore((s) => s.layersVisible[id] !== false);
  const setLayerVisible = useEngineStore((s) => s.setLayerVisible);
  return (
    <li className="flex items-center justify-between gap-2 px-4">
      <span className="text-[14px] text-[var(--ink)]">{meta.title}</span>
      <LayerToggle
        checked={checked}
        label={meta.title}
        layerId={id}
        onChange={(v) => {
          setLayerVisible(id, v);
          if (meta.engine) onToggleLayer?.(id, v);
        }}
      />
    </li>
  );
}

const NOOP_PREVIEW = () => undefined;

export function LayersDrawer({ onToggleLayer, onOpacityPreview = NOOP_PREVIEW }: LayersDrawerProps) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<Snap>("half");
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const headerRef = useRef<HTMLElement>(null);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const view = useEngineStore((s) => s.view);
  const activeCount = useLayersStore((s) => ENVIRONMENTAL_LAYER_IDS.filter((id) => s.layers[id].visible).length);
  const earth = view === "earth";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (window.innerWidth < DESKTOP_MIN_PX) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (open && window.innerWidth < DESKTOP_MIN_PX) headerRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setSnap("half");
    triggerRef.current?.focus();
  };

  const onHandleDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startHeight: panel.getBoundingClientRect().height, moved: false };
  };

  const onHandleMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = drag.startY - e.clientY;
    if (!drag.moved && Math.abs(delta) < CLICK_SLOP_PX) return;
    drag.moved = true;
    setDragHeight(Math.min(window.innerHeight * FULL, Math.max(0, drag.startHeight + delta)));
  };

  const onHandleUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!drag?.moved) return;
    suppressClickRef.current = true;
    const ratio = Math.min(window.innerHeight * FULL, Math.max(0, drag.startHeight + drag.startY - e.clientY)) / window.innerHeight;
    setDragHeight(null);
    if (ratio < CLOSE_BELOW) {
      close();
      return;
    }
    setSnap(Math.abs(ratio - HALF) <= Math.abs(ratio - FULL) ? "half" : "full");
  };

  const onHandleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSnap((v) => (v === "half" ? "full" : "half"));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setSnap("half");
          setOpen((v) => !v);
        }}
      >
        <span className="scales__name">{activeCount > 0 ? `Capas · ${activeCount}` : "Capas"}</span>
      </button>
      {open &&
        createPortal(
          <>
            {snap === "full" && <div className="layers-sheet__backdrop" aria-hidden="true" onClick={close} />}
          <div
            id={panelId}
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label="Capas"
            data-layers-sheet={snap}
            data-dragging={dragHeight !== null ? "true" : undefined}
            style={dragHeight !== null && window.innerWidth < DESKTOP_MIN_PX ? { height: dragHeight } : undefined}
            className="layers-sheet fixed bottom-[calc(max(var(--gutter),env(safe-area-inset-bottom))+80px)] right-[var(--gutter)] top-[calc(var(--gutter)+64px)] z-[6] flex w-80 flex-col rounded-[10px] border border-[var(--rule)] bg-[var(--panel)] text-[var(--ink)] backdrop-blur-md max-[859px]:inset-x-0 max-[859px]:bottom-0 max-[859px]:top-auto max-[859px]:w-auto max-[859px]:rounded-b-none max-[859px]:rounded-t-2xl"
          >
            <button
              type="button"
              aria-label="Cambiar tamaño del panel"
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              onClick={onHandleClick}
              className="hidden h-11 w-full shrink-0 cursor-grab touch-none items-center justify-center focus-visible:outline-2 focus-visible:outline-[var(--signal)] max-[859px]:flex"
            >
              <span className="h-1 w-10 rounded-full bg-[var(--rule-strong)]" aria-hidden="true" />
            </button>
            <header
              ref={headerRef}
              tabIndex={-1}
              className="flex items-center justify-between border-b border-[var(--rule)] bg-[var(--panel)] px-4 py-1.5 outline-none">
              <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold">
                <Layers className="size-4 text-[var(--signal)]" aria-hidden="true" />
                Capas
              </h2>
              <button
                type="button"
                aria-label="Cerrar capas"
                onClick={close}
                className="grid min-h-11 min-w-11 place-items-center rounded-md text-[var(--ink-dim)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--signal)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <section aria-labelledby={`${panelId}-orbit`} className="py-2">
                <h3 id={`${panelId}-orbit`} className="m-0 px-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-dim)]">
                  Órbita
                </h3>
                <ul className="m-0 flex list-none flex-col p-0">
                  {ORBIT_LAYER_IDS.map((id) => (
                    <OrbitRow key={id} id={id} onToggleLayer={onToggleLayer} />
                  ))}
                </ul>
              </section>
              <section
                role="group"
                aria-labelledby={`${panelId}-env`}
                aria-disabled={!earth}
                className="border-t border-[var(--rule)] py-2"
              >
                <h3 id={`${panelId}-env`} className="m-0 px-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-dim)]">
                  Atmósfera y superficie
                </h3>
                {!earth && <p className="m-0 px-4 pb-2 text-[12.5px] text-[var(--ink-dim)]">Disponible en la vista Tierra</p>}
                <ul className="m-0 flex list-none flex-col p-0">
                  {ENVIRONMENTAL_LAYER_IDS.map((id) => (
                    <LayerRow key={id} id={id} disabled={!earth} onOpacityPreview={onOpacityPreview} />
                  ))}
                </ul>
              </section>
            </div>
            <AttributionFooter />
          </div>
          </>,
          document.body,
        )}
    </>
  );
}
