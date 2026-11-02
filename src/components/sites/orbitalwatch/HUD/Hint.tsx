"use client";

import React from "react";
import { useEngineStore } from "@/stores/engine-store";

export function Hint() {
  const hint = useEngineStore((s) => s.hint);
  const isHintDismissed = useEngineStore((s) => s.isHintDismissed);

  return (
    <p id="hint" className={`hint ${isHintDismissed ? "is-gone" : ""}`}>
      {hint}
      <span className="sep" aria-hidden="true">
        {" "}
        ·{" "}
      </span>
      <span>Espacio: pausa · 1/2/3: escala · N: noche</span>
    </p>
  );
}
