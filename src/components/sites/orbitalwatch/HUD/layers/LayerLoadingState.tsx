import React from "react";

interface LayerLoadingStateProps {
  label: string;
}

export function LayerLoadingState({ label }: LayerLoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="h-0.5 w-full overflow-hidden rounded-full bg-[var(--rule)]">
        <div className="h-full w-full rounded-full bg-[var(--signal)] motion-safe:animate-pulse motion-reduce:opacity-60" />
      </div>
      <span className="text-[12px] text-[var(--ink-dim)]">{label}</span>
    </div>
  );
}
