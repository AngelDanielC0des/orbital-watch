"use client";

import React, { useId } from "react";
import { FIRE_WINDOWS, FIRE_WINDOW_LABELS } from "@/lib/layers/fires/fires-scale";
import { useLayersStore } from "@/stores/layers-store";
import type { FireWindow } from "@/types/layers";

interface FireWindowSelectorProps {
  disabled?: boolean;
}

const SHORT: Record<FireWindow, string> = { "24h": "24 h", "48h": "48 h", "7d": "7 d" };

export function FireWindowSelector({ disabled = false }: FireWindowSelectorProps) {
  const labelId = useId();
  const current = useLayersStore((s) => s.layers.fires.config.window);
  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-[12px] text-[var(--ink-dim)]">
        Ventana
      </span>
      <div role="group" aria-labelledby={labelId} className="flex gap-1">
        {FIRE_WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={current === w}
            aria-label={FIRE_WINDOW_LABELS[w]}
            disabled={disabled}
            onClick={() => useLayersStore.getState().setConfig("fires", { window: w })}
            className={`min-h-11 flex-1 rounded-md border px-2 text-[12px] focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--signal-glow)] disabled:opacity-40 min-[860px]:min-h-8 ${
              current === w
                ? "border-[var(--accent)] bg-[var(--signal-soft)] text-[var(--ink)] shadow-[0_0_14px_-2px_var(--signal-glow)]"
                : "border-[var(--rule)] text-[var(--ink-dim)] hover:text-[var(--ink)]"
            }`}
          >
            {SHORT[w]}
          </button>
        ))}
      </div>
    </div>
  );
}
