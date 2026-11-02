"use client";

import React, { useId } from "react";
import { POLLUTANTS, POLLUTANT_SCALES } from "@/lib/layers/pollution/pollutant-scales";
import { useLayersStore } from "@/stores/layers-store";
import type { Pollutant } from "@/types/layers";

interface PollutantSelectorProps {
  disabled?: boolean;
}

function isPollutant(value: string): value is Pollutant {
  return (POLLUTANTS as readonly string[]).includes(value);
}

export function PollutantSelector({ disabled = false }: PollutantSelectorProps) {
  const labelId = useId();
  const pollutant = useLayersStore((s) => s.layers.pollution.config.pollutant);
  const select = (p: Pollutant) => useLayersStore.getState().setConfig("pollution", { pollutant: p });

  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-[12px] text-[var(--ink-dim)]">
        Contaminante
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1 max-[480px]:hidden">
        {POLLUTANTS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pollutant === p}
            disabled={disabled}
            onClick={() => select(p)}
            className={`min-h-8 rounded-md border px-2 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--signal)] disabled:opacity-40 ${
              pollutant === p
                ? "border-transparent bg-[var(--signal)] text-[var(--signal-ink)]"
                : "border-[var(--rule)] text-[var(--ink-dim)] hover:text-[var(--ink)]"
            }`}
          >
            {POLLUTANT_SCALES[p].shortLabel}
          </button>
        ))}
      </div>
      <select
        aria-labelledby={labelId}
        value={pollutant}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (isPollutant(v)) select(v);
        }}
        className="min-h-11 rounded-md border border-[var(--rule)] bg-[var(--panel-solid)] px-2 text-[var(--ink)] min-[481px]:hidden"
      >
        {POLLUTANTS.map((p) => (
          <option key={p} value={p}>
            {POLLUTANT_SCALES[p].shortLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
