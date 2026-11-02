"use client";

import React, { useEffect, useRef } from "react";
import { useEngineStore } from "@/stores/engine-store";

const FATAL_CODES: readonly string[] = [
  "webgl-unsupported",
  "webgl-context-lost",
  "boot-failed",
  "import-failed",
];
const TOAST_MS = 8000;

const TITLES: Partial<Record<string, string>> = {
  "webgl-unsupported": "WebGL 2 no disponible",
  "webgl-context-lost": "Se perdió el contexto gráfico",
  "boot-failed": "No se pudo iniciar OrbitalWatch",
  "import-failed": "No se pudo cargar el motor 3D",
};

const EXPLANATIONS: Partial<Record<string, string>> = {
  "webgl-unsupported":
    "OrbitalWatch necesita WebGL 2. Activa la aceleración por hardware en tu navegador o prueba con otro dispositivo.",
  "webgl-context-lost":
    "El navegador liberó la GPU. Comprueba que la aceleración por hardware esté activa y vuelve a intentarlo.",
};
const DEFAULT_EXPLANATION =
  "OrbitalWatch necesita WebGL 2 y aceleración por hardware. Recarga la página para volver a intentarlo.";

/** Whether the store currently holds an error that replaces the whole scene. */
export function useIsFatalEngineError(): boolean {
  return useEngineStore((s) => s.engineError !== null && FATAL_CODES.includes(s.engineError.code));
}

function FatalPanel({ code, message }: { code: string; message: string }) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  return (
    <div
      className="donate-layer"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="engine-error-title"
      aria-describedby="engine-error-desc"
    >
      <div className="donate-veil" aria-hidden="true" />
      <div className="donate-sheet panel">
        <p className="panel__kind">Error · {code}</p>
        <h2 id="engine-error-title" className="panel__name">
          {TITLES[code] ?? "Error del motor"}
        </h2>
        <div id="engine-error-desc">
          <p className="donate-lead">{message}</p>
          <p className="donate-lead">{EXPLANATIONS[code] ?? DEFAULT_EXPLANATION}</p>
          <p className="donate-note">
            OrbitalWatch 3D: visor web aeroespacial de satélites y basura espacial en órbita
            terrestre. Propaga objetos mediante modelos SGP4 sobre la Tierra y permite cambiar de
            escala al sistema solar (efemérides JPL) y la Vía Láctea. Filtros: catálogo completo,
            basura espacial, constelación Starlink y lanzamientos previstos. Línea temporal en UTC
            con control de velocidad de simulación.
          </p>
        </div>
        <button
          ref={buttonRef}
          type="button"
          className="donate-pay"
          onClick={() => window.location.reload()}
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}

function CatalogToast() {
  const dismiss = () => useEngineStore.getState().setEngineError(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const { engineError, setEngineError } = useEngineStore.getState();
      if (engineError?.code === "catalog-failed") setEngineError(null);
    }, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      className="pointer-events-auto fixed z-30 flex max-w-[min(420px,calc(100vw-32px))] items-center gap-3 rounded border border-[var(--rule)] bg-[var(--panel)] px-3.5 py-2.5 text-sm text-[var(--ink,#fff)] shadow-lg"
      style={{ left: "var(--gutter, 16px)", bottom: "calc(var(--timeline-h, 110px) + 24px)" }}
    >
      <span>Sin conexión con CelesTrak: catálogo sintético</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar aviso"
        className="shrink-0 opacity-70 hover:opacity-100"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor">
          <path d="M3 3l10 10M13 3L3 13" />
        </svg>
      </button>
    </div>
  );
}

interface EngineErrorOverlayProps {
  /** Overrides the store (used by the HUD error boundary). */
  error?: { code: string; message: string };
}

export function EngineErrorOverlay({ error }: EngineErrorOverlayProps) {
  const storeError = useEngineStore((s) => s.engineError);
  const current = error ?? storeError;
  if (!current) return null;
  if (FATAL_CODES.includes(current.code)) {
    return <FatalPanel code={current.code} message={current.message} />;
  }
  if (current.code === "catalog-failed") return <CatalogToast key="catalog" />;
  return null;
}
