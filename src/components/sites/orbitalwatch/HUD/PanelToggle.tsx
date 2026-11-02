"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface PanelToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  controls: string;
}

/** Collapse/expand handle for the bottom sheets; only rendered visible at ≤480 px. */
export function PanelToggle({ collapsed, onToggle, controls }: PanelToggleProps) {
  return (
    <button
      type="button"
      className="absolute -top-1 right-9 grid size-11 place-items-center rounded-lg text-[var(--ink-dim)] hover:text-[var(--ink)] min-[481px]:hidden"
      aria-expanded={!collapsed}
      aria-controls={controls}
      aria-label={collapsed ? "Mostrar detalles" : "Ocultar detalles"}
      onClick={onToggle}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className={cn(
          "size-3.5 fill-none stroke-current stroke-[1.6] transition-transform duration-300",
          collapsed ? "rotate-0" : "rotate-180",
        )}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 10l5-5 5 5" />
      </svg>
    </button>
  );
}

/** Initial collapsed state: collapsed on phones so the globe centre stays visible. */
export function isPhoneViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 480px)").matches;
}
