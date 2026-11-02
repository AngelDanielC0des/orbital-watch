import React from "react";
import { AlertTriangle } from "lucide-react";
import { getEnvironmentalMetadata } from "@/lib/layers/catalog";
import type { EnvironmentalLayerId, LayerError } from "@/types/layers";

interface LayerErrorCardProps {
  id: EnvironmentalLayerId;
  error: LayerError;
  onRetry: () => void;
}

export function LayerErrorCard({ id, error, onRetry }: LayerErrorCardProps) {
  const meta = getEnvironmentalMetadata(id);
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-[var(--alarm)] bg-black/20 p-2.5 text-[13px]"
    >
      <p className="m-0 flex items-start gap-2 text-[var(--ink)]">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--alarm)]" aria-hidden="true" />
        <span>{error.message || `No se pudo cargar ${meta.source.name}.`}</span>
      </p>
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
