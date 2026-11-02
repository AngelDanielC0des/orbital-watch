"use client";

import React from "react";
import { useEngineStore } from "@/stores/engine-store";
import type { ViewMode } from "@/types/engine";
import { LayersDrawer } from "./layers/LayersDrawer";

interface ViewControlsProps {
  onSelectView?: (view: ViewMode) => void;
  /** Forwarded to the engine (`handle.toggleLayer`). */
  onToggleLayer?: (layerId: string, visible: boolean) => void;
  /** Engine-only opacity preview while a slider is dragged. */
}

export function ViewControls({ onSelectView, onToggleLayer }: ViewControlsProps) {
  const currentView = useEngineStore((s) => s.view);
  const isBusy = useEngineStore((s) => s.isBusy);

  const handleView = (view: ViewMode) => {
    if (isBusy || currentView === view) return;
    onSelectView?.(view);
  };

  return (
    <nav className="scales" aria-label="Escala de la vista">
      <button
        type="button"
        data-view="earth"
        aria-pressed={currentView === "earth"}
        onClick={() => handleView("earth")}
      >
        <span className="scales__name">Tierra</span>
        <span className="scales__size num">12 742 km</span>
      </button>
      <button
        type="button"
        data-view="solar"
        aria-pressed={currentView === "solar"}
        onClick={() => handleView("solar")}
      >
        <span className="scales__name">Sistema solar</span>
        <span className="scales__size num">60 UA</span>
      </button>
      <button
        type="button"
        data-view="galaxy"
        aria-pressed={currentView === "galaxy"}
        onClick={() => handleView("galaxy")}
      >
        <span className="scales__name">Vía Láctea</span>
        <span className="scales__size num">100 000 a. l.</span>
      </button>
      <LayersDrawer onToggleLayer={onToggleLayer} />
    </nav>
  );
}
