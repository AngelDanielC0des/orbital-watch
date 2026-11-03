import React from "react";
import { getEnvironmentalMetadata } from "@/lib/layers/catalog";
import { useLayersStore } from "@/stores/layers-store";
import type { EnvironmentalLayerId } from "@/types/layers";

interface DataSourceBadgeProps {
  id: EnvironmentalLayerId;
}

export function DataSourceBadge({ id }: DataSourceBadgeProps) {
  const meta = getEnvironmentalMetadata(id);
  const isFallback = useLayersStore((s) => s.layers[id].isFallback);
  const source = useLayersStore((s) => s.layers[id].source);
  const detail = source ?? meta.source.product;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ink-dim)]">
      <a
        href={meta.source.url}
        target="_blank"
        rel="noopener noreferrer"
        title={meta.attribution.short}
        className="underline-offset-2 hover:text-[var(--ink)] hover:underline focus-visible:text-[var(--ink)] focus-visible:underline focus-visible:outline-1 focus-visible:outline-[var(--signal-glow)]"
      >
        {meta.source.name} · {detail}
      </a>
      {isFallback && (
        <span className="rounded border border-[var(--rule-strong)] px-1 text-[10px] uppercase tracking-wide">Demo</span>
      )}
    </span>
  );
}
