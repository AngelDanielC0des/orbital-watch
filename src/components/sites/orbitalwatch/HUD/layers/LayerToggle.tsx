import React from "react";

interface LayerToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name (the visible title lives next to the switch). */
  label: string;
  disabled?: boolean;
  /** Orbit rows pass their layer id (`data-layer`). */
  layerId?: string;
}

/** `<button role="switch">` with a 44 px hit area around a 40x22 px track. */
export function LayerToggle({ checked, onChange, label, disabled = false, layerId }: LayerToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-layer={layerId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--signal)] disabled:opacity-40"
    >
      <span
        className={`relative block h-[22px] w-10 rounded-full border transition-colors motion-reduce:transition-none ${
          checked ? "border-transparent bg-[var(--signal)]" : "border-[var(--rule-strong)] bg-white/5"
        }`}
      >
        <span
          className={`absolute left-[2px] top-[2px] block size-4 rounded-full transition-transform motion-reduce:transition-none ${
            checked ? "translate-x-[18px] bg-[var(--signal-ink)]" : "translate-x-0 bg-[var(--ink-dim)]"
          }`}
        />
      </span>
    </button>
  );
}
