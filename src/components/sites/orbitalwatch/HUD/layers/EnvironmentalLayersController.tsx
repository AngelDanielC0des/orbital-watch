"use client";

import { useState } from "react";
import type { EngineHandle } from "@/engine/contract";
import { useEnvironmentalLayers, type LayerFlagsMap } from "@/hooks/useEnvironmentalLayers";
import { flagsFor, type LayerUrlState } from "@/lib/layers/url-state";

interface EnvironmentalLayersControllerProps {
  handle: EngineHandle | null;
  urlState: LayerUrlState;
}

/** Null-rendering binder between the layers store, the data providers and the engine (timer ticks re-render only this). */
export function EnvironmentalLayersController({ handle, urlState }: EnvironmentalLayersControllerProps) {
  // Dev flags are read once from the URL; stable identities keep the data effects from re-running.
  const [flags] = useState<LayerFlagsMap>(() => ({
    ozone: flagsFor("ozone", urlState),
    pollution: flagsFor("pollution", urlState),
    fires: flagsFor("fires", urlState),
  }));
  useEnvironmentalLayers(handle, flags);
  return null;
}
