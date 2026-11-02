import React from "react";
import { useLayersStore } from "@/stores/layers-store";
import type { EnvironmentalLayerId } from "@/types/layers";

interface LastUpdatedBadgeProps {
  id: EnvironmentalLayerId;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

function formatDataDate(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} UTC`;
}

export function LastUpdatedBadge({ id }: LastUpdatedBadgeProps) {
  const dataDate = useLayersStore((s) => s.layers[id].dataDate);
  if (dataDate === null) return null;
  return (
    <span className="font-[family-name:var(--font-data)] text-[11.5px] text-[var(--ink-dim)]">
      {formatDataDate(dataDate)}
    </span>
  );
}
