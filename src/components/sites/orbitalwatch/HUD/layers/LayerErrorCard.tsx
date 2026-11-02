import React from "react";
import { AlertTriangle } from "lucide-react";
import { useLayersStore } from "@/stores/layers-store";
import type { EnvironmentalLayerId, LayerError } from "@/types/layers";

interface LayerErrorCardProps {
  id: EnvironmentalLayerId;
  error: LayerError;
  onRetry: () => void;
}

const SOURCE_LABELS: Record<EnvironmentalLayerId, string> = {
  ozone: "NASA GIBS (ozono)",
  pollution: "Open-Meteo (calidad del aire)",
  fires: "NASA FIRMS (incendios)",
};

export function LayerErrorCard({ id, error, onRetry }: LayerErrorCardProps) {
  const hasPreviousData = useLayersStore((s) => s.layers[id].fetchedAt !== null);
  const headline =
    error.code === "invalid"
      ? `No se pudo cargar ${SOURCE_LABELS[id]}. Los datos recibidos no son válidos.`
      : `No se pudo cargar ${SOURCE_LABELS[id]}.`;
  const followUp = hasPreviousData
    ? "Mostrando los últimos datos disponibles."
    : "Reintentaremos automáticamente en unos minutos.";

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-[var(--alarm)] bg-black/20 p-2.5 text-[13px]"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--alarm)]" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <p className="m-0 text-[var(--ink)]">{headline}</p>
          <p className="m-0 text-[12px] text-[var(--ink-dim)]">{followUp}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 self-start rounded-md border border-[var(--rule-strong)] px-3 text-[var(--ink)] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal)] min-[860px]:min-h-9"
      >
        Reintentar
      </button>
    </div>
  );
}
