"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useEngineStore } from "@/stores/engine-store";

/** Toggleable layers. Ids match `LAYER_REGISTRY` keys, except `labels` (UI-only). Earth is not toggleable. */
const LAYER_OPTIONS = [
  { id: "satellites", label: "Satélites", engine: true },
  { id: "track", label: "Órbita seguida", engine: true },
  { id: "sky", label: "Estrellas", engine: true },
  { id: "labels", label: "Etiquetas", engine: false },
] as const;

interface LayerPanelProps {
  onToggleLayer?: (layerId: string, visible: boolean) => void;
}

export function LayerPanel({ onToggleLayer }: LayerPanelProps) {
  const [open, setOpen] = useState(false);
  const layersVisible = useEngineStore((s) => s.layersVisible);
  const setLayerVisible = useEngineStore((s) => s.setLayerVisible);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const handleChange = (id: string, engine: boolean, visible: boolean) => {
    setLayerVisible(id, visible);
    if (engine) onToggleLayer?.(id, visible);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="scales__name">Capas</span>
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Capas"
          className="absolute left-0 top-full z-10 max-[860px]:left-auto max-[860px]:right-0 mt-2 flex min-w-44 flex-col gap-1 rounded-[10px] border border-[var(--rule)] bg-[var(--panel)] p-2"
        >
          {LAYER_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-[var(--ink)] hover:bg-white/5"
            >
              <input
                type="checkbox"
                data-layer={opt.id}
                checked={layersVisible[opt.id] !== false}
                onChange={(e) => handleChange(opt.id, opt.engine, e.target.checked)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
