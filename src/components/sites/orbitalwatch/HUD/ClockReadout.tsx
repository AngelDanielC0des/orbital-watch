"use client";
/**
 * K5 — exemplar of per-frame UI: subscribes to the FrameBus and writes DOM through refs.
 * Zero `setState` at frame rate; React renders this component exactly once per mount.
 * Copy this pattern for satellite readouts (T09), body distance (T10) and label positions (T05b).
 */
import { useEffect, useRef } from "react";
import type { FrameBus } from "@/lib/frame-bus";
import type { FrameSnapshot } from "@/engine/contract";

const utc = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" });

export interface ClockReadoutProps {
  frames: FrameBus<FrameSnapshot> | null;
  className?: string;
}

export function ClockReadout({ frames, className }: ClockReadoutProps) {
  const dateRef = useRef<HTMLTimeElement>(null);
  const relRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!frames) return;
    let lastSecond = -1;
    return frames.subscribe((frame) => {
      const second = Math.floor(frame.simMs / 1000);
      if (second === lastSecond) return; // skip DOM writes when nothing visible changed
      lastSecond = second;
      const date = dateRef.current;
      const rel = relRef.current;
      if (!date || !rel) return;
      date.textContent = utc.format(frame.simMs);
      date.dateTime = new Date(frame.simMs).toISOString();
      const days = frame.offsetMs / 86_400_000;
      rel.textContent = frame.live ? "en vivo" : `${days > 0 ? "+" : "−"}${Math.abs(days).toFixed(1)} d`;
    });
  }, [frames]);

  return (
    <span className={className}>
      <time ref={dateRef} id="clock-date">
        —
      </time>
      <span ref={relRef} id="clock-rel">
        en vivo
      </span>
    </span>
  );
}
