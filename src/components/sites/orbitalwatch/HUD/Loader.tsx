"use client";

import React from "react";
import { useEngineStore } from "@/stores/engine-store";
import { cn } from "@/lib/utils";

/** Pulsing placeholder block that mimics a HUD element while the engine boots. */
function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute animate-pulse rounded-[8px] border border-[var(--rule)] bg-[var(--panel)]",
        className,
      )}
    />
  );
}

export function Loader() {
  const loading = useEngineStore((s) => s.loading);

  if (loading.isDone) return null;

  const percent = Math.round(Math.min(1, Math.max(0, loading.ratio)) * 100);
  const text = loading.error || loading.text;

  return (
    <div
      id="loader"
      className="fixed inset-0 z-30 grid place-content-center justify-items-center gap-3.5 bg-[var(--void)]"
    >
      {/* Skeleton HUD: masthead, filters, timeline */}
      <SkeletonBlock className="left-[var(--gutter)] top-[var(--gutter)] h-12 w-40" />
      <SkeletonBlock className="right-[var(--gutter)] top-[var(--gutter)] h-10 w-28" />
      <SkeletonBlock className="bottom-[max(var(--gutter),env(safe-area-inset-bottom))] left-[var(--gutter)] right-[var(--gutter)] h-[62px] rounded-xl" />

      <p className="text-[2rem] font-semibold tracking-[-0.02em]">
        OrbitalWatch{" "}
        <span className="font-medium text-[var(--accent)] transition-colors duration-[600ms]">3D</span>
      </p>
      <p
        aria-live="polite"
        className={cn("text-[var(--ink-dim)]", loading.error && "text-[var(--alarm)]")}
      >
        {text}
      </p>
      <div
        role="progressbar"
        aria-label="Carga de OrbitalWatch"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={text}
        className="h-0.5 w-[220px] overflow-hidden bg-[var(--rule)]"
      >
        <span
          className="block h-full w-full origin-left bg-[var(--accent)] transition-transform duration-300"
          style={{ transform: `scaleX(${loading.ratio})` }}
        />
      </div>
    </div>
  );
}
