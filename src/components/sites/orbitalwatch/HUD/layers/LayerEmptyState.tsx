import React from "react";
import type { EnvironmentalLayerId } from "@/types/layers";

interface LayerEmptyStateProps {
  id: EnvironmentalLayerId;
}

const HINTS: Record<EnvironmentalLayerId, string> = {
  ozone: "Prueba de nuevo más tarde.",
  pollution: "Prueba con otro contaminante.",
  fires: "Prueba 48 h.",
};

export function LayerEmptyState({ id }: LayerEmptyStateProps) {
  return (
    <p className="m-0 text-[13px] text-[var(--ink-dim)]" role="status">
      Sin datos para este periodo. {HINTS[id]}
    </p>
  );
}
