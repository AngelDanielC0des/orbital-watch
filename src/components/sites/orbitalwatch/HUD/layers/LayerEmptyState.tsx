import React from "react";
import { useLayersStore } from "@/stores/layers-store";
import type { EnvironmentalLayerId } from "@/types/layers";

interface LayerEmptyStateProps {
  id: EnvironmentalLayerId;
}

export function LayerEmptyState({ id }: LayerEmptyStateProps) {
  const fireWindow = useLayersStore((s) => s.layers.fires.config.window);

  let hint: string;
  if (id === "fires") {
    hint = fireWindow === "7d" ? "No hay detecciones recientes." : "Prueba la ventana de 48 h o 7 días.";
    if (fireWindow === "48h") hint = "Prueba la ventana de 7 días.";
  } else if (id === "ozone") {
    hint = "El satélite aún no ha publicado la imagen de este día.";
  } else {
    hint = "El modelo no devolvió valores para este contaminante.";
  }

  return (
    <div role="status" className="flex flex-col gap-0.5 text-[13px]">
      <p className="m-0 text-[var(--ink-dim)]">Sin datos para este periodo.</p>
      <p className="m-0 text-[12px] text-[var(--ink-dim)]">{hint}</p>
    </div>
  );
}
