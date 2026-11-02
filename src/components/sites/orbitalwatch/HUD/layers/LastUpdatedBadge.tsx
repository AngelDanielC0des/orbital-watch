"use client";

import React, { useEffect, useState } from "react";
import {
  FRESHNESS_COLOR,
  FRESHNESS_LABEL,
  formatRelative,
  formatUtcDate,
  freshnessOf,
  timelineMismatch,
} from "@/lib/layers/freshness";
import { FIRE_WINDOW_LABELS } from "@/lib/layers/fires/fires-scale";
import { useEngineStore } from "@/stores/engine-store";
import { useLayersStore } from "@/stores/layers-store";
import type { EnvironmentalLayerId } from "@/types/layers";

interface LastUpdatedBadgeProps {
  id: EnvironmentalLayerId;
}

const TICK_MS = 30_000;

/** Current time, refreshed at most every 30 s while mounted and the document is visible. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), TICK_MS);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return now;
}

export function LastUpdatedBadge({ id }: LastUpdatedBadgeProps) {
  const status = useLayersStore((s) => s.layers[id].status);
  const dataDate = useLayersStore((s) => s.layers[id].dataDate);
  const fetchedAt = useLayersStore((s) => s.layers[id].fetchedAt);
  const isFallback = useLayersStore((s) => s.layers[id].isFallback);
  const firesWindow = useLayersStore((s) => s.layers.fires.config.window);
  const simMs = useEngineStore((s) => s.time.ms);
  const now = useNow();

  if (dataDate === null && status !== "error") return null;

  const freshness = freshnessOf({ status, dataDate, isFallback, isModel: id === "pollution", nowMs: now });
  const withTime = id === "pollution" || id === "fires";
  const dateText = dataDate === null ? null : formatUtcDate(dataDate, withTime);
  const updated = fetchedAt === null ? null : `actualizado ${formatRelative(fetchedAt, now)}`;
  const prefix = id === "fires" ? `Ventana ${FIRE_WINDOW_LABELS[firesWindow]} · ` : "";
  const mismatch = timelineMismatch(simMs, dataDate);

  return (
    <span
      title={updated ?? undefined}
      className="flex flex-col gap-0.5 font-[family-name:var(--font-data)] text-[11.5px] text-[var(--ink-dim)]"
    >
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: FRESHNESS_COLOR[freshness] }}
        />
        <span>{FRESHNESS_LABEL[freshness]}</span>
        {dateText !== null && (
          <span>
            · {prefix}Datos: {dateText}
          </span>
        )}
        {id === "pollution" && <span>· Modelo CAMS</span>}
      </span>
      {updated !== null && <span>{updated}</span>}
      {mismatch && <span style={{ color: "var(--payload)" }}>La capa no sigue la línea temporal</span>}
    </span>
  );
}
