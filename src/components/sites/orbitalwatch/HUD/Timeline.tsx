"use client";

import React, { useEffect, useRef } from "react";
import type { FrameBus } from "@/lib/frame-bus";
import type { FrameSnapshot } from "@/engine/contract";
import { useEngineStore } from "@/stores/engine-store";

interface SpeedOption {
  value: number;
  label: string;
  className?: string;
}

const SPEEDS: readonly SpeedOption[] = [
  { value: 1, label: "×1" },
  { value: 60, label: "×60" },
  { value: 600, label: "×600" },
  { value: 3600, label: "1 h/s" },
  { value: 86400, label: "1 día/s" },
  { value: 2592000, label: "30 d/s", className: "speed-space" },
] as const;

const MIN_DAYS = -730;
const MAX_DAYS = 1825;
const NOW_PERCENT = (-MIN_DAYS / (MAX_DAYS - MIN_DAYS)) * 100;
const MS_PER_DAY = 86_400_000;

// Cached once: `Intl` formatters are expensive to construct.
const utc = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" });

function formatOffset(offsetMs: number): string {
  const days = offsetMs / MS_PER_DAY;
  return `${days > 0 ? "+" : "−"}${Math.abs(days).toFixed(1)} d`;
}

interface TimelineProps {
  /** Per-frame bus from the engine handle; drives the clock text and the scrubber thumb imperatively. */
  frames: FrameBus<FrameSnapshot> | null;
  onTogglePlay?: () => void;
  onSetSpeed?: (speed: number) => void;
  onScrub?: (days: number) => void;
  onSeekNow?: () => void;
  /** ADR-7: reports the timeline height (px) so the engine can inset the camera framing. */
  onTimelineInset?: (px: number) => void;
}

export function Timeline({ frames, onTogglePlay, onSetSpeed, onScrub, onSeekNow, onTimelineInset }: TimelineProps) {
  // Select primitives only: the whole `time` object changes every tick.
  const playing = useEngineStore((s) => s.time.playing);
  const speed = useEngineStore((s) => s.time.speed);

  const rootRef = useRef<HTMLElement>(null);
  const scrubberRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLTimeElement>(null);
  const relRef = useRef<HTMLSpanElement>(null);
  const startRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  // The engine exposes no drag signal (`FrameSnapshot.scrubbing` is never raised by `scrubDays`),
  // so the component tracks the drag itself and never fights the user's thumb.
  const draggingRef = useRef(false);

  // Per-frame clock + thumb (K5 pattern): no setState, DOM writes only when visible output changed.
  useEffect(() => {
    if (!frames) return;
    let lastSecond = -1;
    let lastRel = "";
    let lastDays = Number.NaN;
    let lastYears = "";
    return frames.subscribe((frame) => {
      const second = Math.floor(frame.simMs / 1000);
      const date = dateRef.current;
      const rel = relRef.current;
      const scrubber = scrubberRef.current;
      if (!date || !rel) return;

      const relText = frame.live ? "en vivo" : formatOffset(frame.offsetMs);
      const days = Math.round(frame.offsetMs / MS_PER_DAY);
      const secondChanged = second !== lastSecond;
      if (secondChanged) {
        lastSecond = second;
        date.textContent = utc.format(frame.simMs);
        date.dateTime = new Date(frame.simMs).toISOString();
      }
      if (relText !== lastRel) {
        lastRel = relText;
        rel.textContent = relText;
      }
      if (scrubber && !frame.scrubbing && !draggingRef.current && days !== lastDays) {
        lastDays = days;
        scrubber.value = String(days);
      }
      if (secondChanged && scrubber) {
        scrubber.setAttribute("aria-valuetext", `${date.textContent ?? ""} UTC, ${relText}`);
      }

      // Year marks only change across year boundaries: cheap check, written rarely.
      if (secondChanged) {
        const base = frame.simMs - frame.offsetMs;
        const years = `${new Date(base + MIN_DAYS * MS_PER_DAY).getUTCFullYear()}-${new Date(base + MAX_DAYS * MS_PER_DAY).getUTCFullYear()}`;
        if (years !== lastYears) {
          lastYears = years;
          const [from, to] = years.split("-");
          if (startRef.current) startRef.current.textContent = from;
          if (endRef.current) endRef.current.textContent = to;
        }
      }
    });
  }, [frames]);

  // ADR-7: report the timeline height to the engine; observe resize and clean up.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onTimelineInset) return;
    const report = () => onTimelineInset(root.getBoundingClientRect().height);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(root);
    return () => observer.disconnect();
  }, [onTimelineInset]);

  const handleScrubInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onScrub?.(Number(e.target.value));
  };

  return (
    <footer ref={rootRef} className="timeline" aria-label="Línea de tiempo">
      <button
        type="button"
        id="play"
        className="play"
        aria-label={playing ? "Pausar" : "Reanudar"}
        data-playing={playing}
        onClick={onTogglePlay}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {playing ? (
            <path className="icon-pause" d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" />
          ) : (
            <path className="icon-play" d="M5 3l8 5-8 5z" />
          )}
        </svg>
      </button>

      <div className="segmented segmented--speed" role="group" aria-label="Velocidad de simulación">
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            type="button"
            data-speed={s.value}
            aria-pressed={speed === s.value}
            className={s.className}
            onClick={() => onSetSpeed?.(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="scrub">
        <label htmlFor="scrubber" className="visually-hidden">
          Desplazamiento temporal en días
        </label>
        <input
          id="scrubber"
          ref={scrubberRef}
          type="range"
          min={MIN_DAYS}
          max={MAX_DAYS}
          step={1}
          defaultValue={0}
          onPointerDown={() => {
            draggingRef.current = true;
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
          onChange={handleScrubInput}
          onBlur={() => {
            draggingRef.current = false;
          }}
        />
        <div className="scrub__marks" aria-hidden="true">
          <span ref={startRef} />
          <span className="scrub__now" style={{ left: `${NOW_PERCENT}%` }}>
            hoy
          </span>
          <span ref={endRef} />
        </div>
      </div>

      <div className="clock">
        <span className="clock__date">
          <time ref={dateRef} id="clock-date" className="num">
            —
          </time>
          <span className="clock__zone"> UTC</span>
        </span>
        <span ref={relRef} id="clock-rel" className="clock__rel">
          en vivo
        </span>
      </div>

      <button type="button" id="now" className="now" onClick={onSeekNow}>
        Ahora
      </button>
    </footer>
  );
}
