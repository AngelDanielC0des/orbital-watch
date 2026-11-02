import React from "react";

interface LayerLoadingStateProps {
  label: string;
}

export function LayerLoadingState({ label }: LayerLoadingStateProps) {
  return (
    <div role="status" className="flex flex-col gap-1.5">
      <div className="h-0.5 w-full overflow-hidden rounded-full bg-[var(--rule)]">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--signal)] motion-reduce:animate-none" />
      </div>
      <span className="text-[12px] text-[var(--ink-dim)]">{label}</span>
    </div>
  );
}
