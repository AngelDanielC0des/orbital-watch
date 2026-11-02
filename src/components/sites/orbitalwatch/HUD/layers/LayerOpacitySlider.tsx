"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLayersStore } from "@/stores/layers-store";
import type { EnvironmentalLayerId } from "@/types/layers";

interface LayerOpacitySliderProps {
  id: EnvironmentalLayerId;
  disabled?: boolean;
  /** Immediate engine-only preview (0-1). */
  onOpacityPreview: (id: EnvironmentalLayerId, value: number) => void;
}

const COMMIT_DELAY_MS = 150;

/** Native range input: engine preview on every input event, store write debounced and flushed. */
export function LayerOpacitySlider({ id, disabled = false, onOpacityPreview }: LayerOpacitySliderProps) {
  const inputId = useId();
  const stored = useLayersStore((s) => s.layers[id].opacity);
  const [local, setLocal] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null) {
      useLayersStore.getState().setOpacity(id, pending.current / 100);
      pending.current = null;
    }
  }, [id]);

  useEffect(() => flush, [flush]);

  const commit = () => {
    flush();
    setLocal(null);
  };

  const percent = local ?? Math.round(stored * 100);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={inputId} className="text-[12px] text-[var(--ink-dim)]">
        Opacidad
      </label>
      <input
        id={inputId}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        disabled={disabled}
        aria-valuetext={`${percent} %`}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          setLocal(v);
          pending.current = v;
          onOpacityPreview(id, v / 100);
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(commit, COMMIT_DELAY_MS);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="h-11 min-w-0 flex-1 cursor-pointer accent-[var(--signal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal)] disabled:cursor-not-allowed disabled:opacity-40"
      />
      <output
        htmlFor={inputId}
        className="w-10 text-right font-[family-name:var(--font-data)] text-[12px] text-[var(--ink)]"
      >
        {percent} %
      </output>
    </div>
  );
}
