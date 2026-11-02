"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEngineStore } from "@/stores/engine-store";

/** Fallback when the async Clipboard API is unavailable: select a temporary textarea and copy. */
function legacyCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function HUDHeader() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  const copyLink = useCallback(async () => {
    const href = window.location.href;
    let ok = false;
    try {
      await navigator.clipboard.writeText(href);
      ok = true;
    } catch {
      ok = legacyCopy(href);
    }
    if (!ok) return;
    setCopied(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  const fps = useEngineStore((s) => s.fps);
  const visibleCount = useEngineStore((s) => s.visibleCount);
  const catalogSource = useEngineStore((s) => s.catalogSource);
  const view = useEngineStore((s) => s.view);

  const formattedCount = new Intl.NumberFormat("es-ES").format(visibleCount);

  return (
    <header className="masthead">
      <h1 className="brand">
        OrbitalWatch <span>3D</span>
      </h1>
      {view === "earth" ? (
        <p className="status status--earth" role="status" aria-live="polite">
          <span className="num">{formattedCount}</span> objetos en órbita{" "}
          <span className="sep" aria-hidden="true">
            ·
          </span>{" "}
          <span>{catalogSource}</span>
        </p>
      ) : (
        <p className="status status--space" role="status" aria-live="polite">
          {view === "solar"
            ? "Sol, 8 planetas y la Luna · efemérides JPL"
            : "≈ 100 000 millones de estrellas · modelo de la Vía Láctea"}
        </p>
      )}
      <p className="perf" aria-hidden="true">
        <span className="num">{Math.round(fps)}</span> fps
      </p>
      <button
        type="button"
        className="pointer-events-auto mt-2 text-xs text-[var(--ink-dim)] underline-offset-2 hover:text-[var(--ink)] hover:underline focus-visible:underline"
        onClick={() => void copyLink()}
      >
        Copiar enlace
      </button>
      <span className="ml-2 text-xs text-[var(--ink-dim)]" role="status" aria-live="polite">
        {copied ? "Copiado" : ""}
      </span>
    </header>
  );
}
