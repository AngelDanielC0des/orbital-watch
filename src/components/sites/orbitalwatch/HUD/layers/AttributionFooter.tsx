"use client";

import React, { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ENVIRONMENTAL_LAYER_IDS, getEnvironmentalMetadata } from "@/lib/layers/catalog";

export function AttributionFooter() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <footer className="border-t border-[var(--rule)] px-4 py-3 text-[12px] text-[var(--ink-dim)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--signal)] min-[860px]:min-h-8"
      >
        <span>Fuentes: NASA GIBS · NASA FIRMS · Open-Meteo/CAMS</span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul id={panelId} className="m-0 mt-1 flex list-none flex-col gap-2 p-0">
          {ENVIRONMENTAL_LAYER_IDS.map((id) => {
            const { attribution } = getEnvironmentalMetadata(id);
            return (
              <li key={id}>
                <p className="m-0">{attribution.full}</p>
                <p className="m-0 mt-0.5">
                  Licencia:{" "}
                  {attribution.licenceUrl ? (
                    <a href={attribution.licenceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {attribution.licence}
                    </a>
                  ) : (
                    attribution.licence
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </footer>
  );
}
