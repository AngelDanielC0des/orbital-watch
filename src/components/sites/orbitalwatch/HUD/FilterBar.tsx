"use client";

import React from "react";
import { Flame, Wind } from "lucide-react";
import { useEngineStore } from "@/stores/engine-store";
import { useLayersStore } from "@/stores/layers-store";
import type { SatelliteFilter } from "@/types/engine";
import type { EnvMode } from "@/types/layers";

interface FilterBarProps {
  onFilterChange?: (filter: SatelliteFilter) => void;
  onToggleNight?: (active: boolean) => void;
}

export function FilterBar({ onFilterChange, onToggleNight }: FilterBarProps) {
  const engineFilter = useEngineStore((s) => s.filter);
  const mode = useLayersStore((s) => s.mode);
  // Satellite filters read as selected only in the orbital mode; the data modes are exclusive with them.
  const currentFilter: SatelliteFilter | null = mode === "orbit" ? engineFilter : null;
  const nightMode = useEngineStore((s) => s.nightMode);

  const handleFilter = (filter: SatelliteFilter) => {
    useLayersStore.getState().setMode("orbit");
    onFilterChange?.(filter);
  };

  const handleMode = (next: EnvMode) => {
    useLayersStore.getState().setMode(mode === next ? "orbit" : next);
  };

  const handleNight = () => {
    onToggleNight?.(!nightMode);
  };

  return (
    <nav className="filters" aria-label="Filtros de visualización">
      <div className="segmented" role="group" aria-label="Capa de objetos">
        <button
          type="button"
          data-filter="all"
          aria-pressed={currentFilter === "all"}
          onClick={() => handleFilter("all")}
        >
          Todo
        </button>
        <button
          type="button"
          data-filter="debris"
          aria-pressed={currentFilter === "debris"}
          onClick={() => handleFilter("debris")}
        >
          <i className="swatch swatch--debris" aria-hidden="true" />
          Basura<span className="opt"> espacial</span>
        </button>
        <button
          type="button"
          data-filter="starlink"
          aria-pressed={currentFilter === "starlink"}
          onClick={() => handleFilter("starlink")}
        >
          <i className="swatch swatch--starlink" aria-hidden="true" />
          Starlink
        </button>
        <button
          type="button"
          data-filter="projected"
          aria-pressed={currentFilter === "projected"}
          onClick={() => handleFilter("projected")}
        >
          <i className="swatch swatch--projected" aria-hidden="true" />
          Previstos
        </button>
      </div>
      <div className="segmented" role="group" aria-label="Datos de la Tierra">
        <button
          type="button"
          data-mode="fires"
          aria-pressed={mode === "fires"}
          title="Incendios activos detectados por satélite (NASA FIRMS)"
          onClick={() => handleMode("fires")}
        >
          <Flame className="size-3.5" aria-hidden="true" />
          Incendios
        </button>
        <button
          type="button"
          data-mode="atmosphere"
          aria-pressed={mode === "atmosphere"}
          title="Calidad del aire (CAMS) y capa de ozono (NASA GIBS)"
          onClick={() => handleMode("atmosphere")}
        >
          <Wind className="size-3.5" aria-hidden="true" />
          Atmósfera
        </button>
      </div>
      <button
        type="button"
        id="toggle-night"
        className="toggle"
        aria-pressed={nightMode}
        aria-label="Modo nocturno"
        onClick={handleNight}
      >
        <svg className="toggle__icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" />
        </svg>
        <span className="toggle__label">Modo nocturno</span>
      </button>
    </nav>
  );
}
