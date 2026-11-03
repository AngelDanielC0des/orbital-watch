"use client";

import { useId } from "react";
import { useLayersStore } from "@/stores/layers-store";
import type { FiresLayerConfig } from "@/types/layers";

type DayNight = FiresLayerConfig["dayNight"];

const OPTIONS: readonly { id: DayNight; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "day", label: "Día" },
  { id: "night", label: "Noche" },
];

export function DayNightSelector({ disabled = false }: { disabled?: boolean }) {
  const labelId = useId();
  const current = useLayersStore((s) => s.layers.fires.config.dayNight);
  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-[12px] text-[var(--ink-dim)]">
        Momento de la detección
      </span>
      <div role="group" aria-labelledby={labelId} className="flex gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={current === o.id}
            disabled={disabled}
            onClick={() => useLayersStore.getState().setConfig("fires", { dayNight: o.id })}
            className={`min-h-11 flex-1 rounded-md border px-2 text-[12px] focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--signal-glow)] disabled:opacity-40 min-[860px]:min-h-8 ${
              current === o.id
                ? "border-[var(--accent)] bg-[var(--signal-soft)] text-[var(--ink)] shadow-[0_0_14px_-2px_var(--signal-glow)]"
                : "border-[var(--rule)] text-[var(--ink-dim)] hover:text-[var(--ink)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
