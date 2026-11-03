import React from "react";
import { ATTRIBUTION, ATTRIBUTION_FOOTER_SHORT } from "@/lib/layers/attribution";

const ENTRIES = [ATTRIBUTION.gibs, ATTRIBUTION.firms, ATTRIBUTION.openMeteo] as const;

const LINK_CLASS =
  "underline-offset-2 hover:text-[var(--ink)] hover:underline focus-visible:text-[var(--ink)] focus-visible:underline focus-visible:outline-1 focus-visible:outline-[var(--signal-glow)]";

export function AttributionFooter() {
  return (
    <footer className="border-t border-[var(--rule)] px-4 py-3 text-[11px] leading-snug text-[var(--ink-dim)]">
      <p className="m-0">{ATTRIBUTION_FOOTER_SHORT}</p>
      <details className="mt-1">
        <summary className="inline-block min-h-6 cursor-pointer hover:text-[var(--ink)] focus-visible:outline-1 focus-visible:outline-[var(--signal-glow)]">
          Créditos y licencias
        </summary>
        <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0">
          {ENTRIES.map((entry) => (
            <li key={entry.short}>
              <p className="m-0 text-[var(--ink)]">{entry.short}</p>
              <p className="m-0 mt-0.5">{entry.full}</p>
              <p className="m-0 mt-0.5">
                Licencia:{" "}
                {entry.licenceUrl ? (
                  <a href={entry.licenceUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                    {entry.licence}
                  </a>
                ) : (
                  entry.licence
                )}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </footer>
  );
}
