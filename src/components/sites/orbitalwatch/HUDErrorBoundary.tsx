"use client";

import React from "react";
import { useEngineStore } from "@/stores/engine-store";

interface HUDErrorBoundaryProps {
  children: React.ReactNode;
}

interface HUDErrorBoundaryState {
  failed: boolean;
}

/**
 * Catches render errors in the HUD. It reports a `boot-failed` engine error to the
 * store, which `EngineErrorOverlay` (mounted outside the boundary) renders.
 */
export class HUDErrorBoundary extends React.Component<HUDErrorBoundaryProps, HUDErrorBoundaryState> {
  state: HUDErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): HUDErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[OrbitalWatch] HUD render failed", error, info.componentStack);
    useEngineStore.getState().setEngineError({
      code: "boot-failed",
      message: error.message || "Error inesperado en la interfaz.",
    });
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
