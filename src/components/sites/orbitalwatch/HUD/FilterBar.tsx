"use client";

import React from "react";
import { useEngineStore } from "@/stores/engine-store";
import type { SatelliteFilter } from "@/types/engine";

interface FilterBarProps {
  onFilterChange?: (filter: SatelliteFilter) => void;
  onToggleNight?: (active: boolean) => void;
}

export function FilterBar({ onFilterChange, onToggleNight }: FilterBarProps) {
  const currentFilter = useEngineStore((s) => s.filter);
  const nightMode = useEngineStore((s) => s.nightMode);

  const handleFilter = (filter: SatelliteFilter) => {
    onFilterChange?.(filter);
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
