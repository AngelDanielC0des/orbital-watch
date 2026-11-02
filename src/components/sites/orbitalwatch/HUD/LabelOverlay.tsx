"use client";
/**
 * Projected body labels. React renders one `<button class="label" data-key>` per def exactly once;
 * every frame the FrameBus callback writes `transform`/`opacity`/`hidden` straight on those DOM nodes
 * (K5 pattern, zero setState). Markup/classes mirror the legacy `SpaceUi.addLabels` so the CSS is unchanged.
 */
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useEngineStore } from "@/stores/engine-store";
import type { FrameBus } from "@/lib/frame-bus";
import type { FrameSnapshot } from "@/engine/contract";
import { BODY_DEFS } from "@/engine/render/bodies";
import { EARTH_LABELS, galaxyLabels, solarLabels, type LabelDef } from "@/engine/label-projector";

export interface LabelOverlayProps {
  frames: FrameBus<FrameSnapshot> | null;
  /** Label definitions for all groups; when empty the overlay builds the default set itself. */
  defs: ReadonlyArray<LabelDef>;
  onPick: (key: string) => void;
}

/** Galaxy label names (static content of the galaxy renderer; the snapshot only carries keys). */
const GALAXY_NAMES = [
  { key: "gal-sun", name: "Sol · estás aquí" },
  { key: "gal-center", name: "Sagitario A*" },
  { key: "gal-perseus", name: "Brazo de Perseo" },
  { key: "gal-sagittarius", name: "Brazo de Sagitario" },
  { key: "gal-scutum", name: "Brazo de Escudo-Centauro" },
  { key: "gal-norma", name: "Brazo de Norma" },
  { key: "gal-lmc", name: "Gran Nube de Magallanes" },
  { key: "gal-smc", name: "Pequeña Nube de Magallanes" },
  { key: "gal-m31", name: "Andrómeda · 2,5 M años luz" },
] as const;

const GALAXY_KINDS: Readonly<Record<string, string>> = {
  "gal-sun": "here",
  "gal-center": "region",
  "gal-perseus": "arm",
  "gal-sagittarius": "arm",
  "gal-scutum": "arm",
  "gal-norma": "arm",
  "gal-lmc": "galaxy",
  "gal-smc": "galaxy",
  "gal-m31": "galaxy",
};

function defaultDefs(): LabelDef[] {
  return [...EARTH_LABELS, ...solarLabels(Object.values(BODY_DEFS).map((def) => ({ key: def.key, def }))), ...galaxyLabels(GALAXY_NAMES)];
}

function kindOf(def: LabelDef): string {
  return GALAXY_KINDS[def.key] ?? "body";
}

interface NodeState {
  el: HTMLElement;
  seen: number;
  shown: boolean;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export function LabelOverlay({ frames, defs, onPick }: LabelOverlayProps) {
  const labelsVisible = useEngineStore((s) => s.layersVisible.labels !== false);
  const nodes = useRef(new Map<string, HTMLElement>());
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  const resolved = useMemo<readonly LabelDef[]>(() => (defs.length > 0 ? defs : defaultDefs()), [defs]);

  useEffect(() => {
    if (!frames) return;
    const states = new Map<string, NodeState>();
    for (const [key, el] of nodes.current)
      states.set(key, { el, seen: -1, shown: !el.hidden, x: NaN, y: NaN, scale: NaN, opacity: NaN });
    let tick = 0;
    const unsubscribe = frames.subscribe((frame) => {
      tick++;
      const rows = frame.labels;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const state = states.get(row.key);
        if (!state) continue;
        if (!row.visible) continue;
        state.seen = tick;
        if (!state.shown) {
          state.el.hidden = false;
          state.shown = true;
        }
        if (state.x !== row.x || state.y !== row.y || state.scale !== row.scale) {
          state.x = row.x;
          state.y = row.y;
          state.scale = row.scale;
          state.el.style.transform =
            row.scale === 1 ? `translate3d(${row.x}px,${row.y}px,0)` : `translate3d(${row.x}px,${row.y}px,0) scale(${row.scale})`;
        }
        if (state.opacity !== row.opacity) {
          state.opacity = row.opacity;
          state.el.style.opacity = String(row.opacity);
        }
      }
      for (const state of states.values()) {
        if (state.shown && (state.seen !== tick)) {
          state.el.hidden = true;
          state.shown = false;
        }
      }
    });
    return () => {
      unsubscribe();
      for (const state of states.values()) {
        state.el.hidden = true;
        state.shown = false;
      }
    };
  }, [frames, resolved]);

  return (
    <div id="labels" className="labels" hidden={!labelsVisible}>
      {resolved.map((def) => (
        <button
          key={def.key}
          ref={(el) => {
            if (el) nodes.current.set(def.key, el);
            else nodes.current.delete(def.key);
          }}
          type="button"
          className={`label label--${kindOf(def)}`}
          data-key={def.key}
          hidden
          style={def.color ? ({ "--dot": def.color } as CSSProperties) : undefined}
          aria-label={`Ir a ${def.name}`}
          onClick={() => pickRef.current(def.key)}
        >
          <i aria-hidden="true" />
          <span>{def.name}</span>
        </button>
      ))}
    </div>
  );
}
