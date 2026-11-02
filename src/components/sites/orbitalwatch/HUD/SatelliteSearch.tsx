"use client";
/**
 * Satellite search by name / NORAD id. Low-frequency state → plain `useState` (same shape as PlaceSearch).
 * Typing is debounced (120 ms) and answered synchronously by `handle.findSatellites` (the engine caches a
 * lower-cased index once after the catalog loads); Enter / click → `handle.selectSatellite(index)`.
 * Combobox semantics: ArrowUp/Down move `aria-activedescendant`, Escape clears. Markup reuses the
 * `.place-search` styling with its own ids (#sat-search #sat-q #sat-results).
 */
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent } from "react";
import type { EngineHandle, SatelliteMatch } from "@/engine/contract";
import { useEngineStore } from "@/stores/engine-store";
import { Category, CATEGORY_LABELS } from "@/types/orbital";

const DEBOUNCE_MS = 120;

/** Stacks under `.place-search` (both are `position: fixed` at the same anchor); a margin keeps the media-query `top` intact. */
const STACK_BELOW_PLACE_SEARCH: CSSProperties = { marginTop: 46 };
const ACTIVE_ROW: CSSProperties = { background: "rgb(132 211 225 / 0.1)" };

function swatchClass(category: SatelliteMatch["category"]): string {
  if (category === Category.STARLINK) return "swatch swatch--starlink";
  if (category === Category.DEBRIS || category === Category.ROCKET_BODY) return "swatch swatch--debris";
  return "swatch";
}

export interface SatelliteSearchProps {
  handle: EngineHandle | null;
}

export function SatelliteSearch({ handle }: SatelliteSearchProps) {
  const visible = useEngineStore((s) => s.view === "earth");
  const isSynthetic = useEngineStore((s) => s.isSynthetic);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SatelliteMatch[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => cancelPending, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target instanceof Node ? event.target : null)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (active >= 0) rootRef.current?.querySelector(`#sat-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const clear = () => {
    cancelPending();
    setQuery("");
    setResults([]);
    setActive(-1);
    setOpen(false);
  };

  const choose = (match: SatelliteMatch) => {
    cancelPending();
    setQuery(match.name);
    setResults([]);
    setActive(-1);
    setOpen(false);
    handle?.selectSatellite(match.index);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    setOpen(true);
    cancelPending();
    timer.current = setTimeout(() => {
      timer.current = null;
      setResults(handle ? handle.findSatellites(value) : []);
      setActive(-1);
    }, DEBOUNCE_MS);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        clear();
        break;
      case "ArrowDown":
        if (results.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive((i) => (i + 1) % results.length);
        break;
      case "ArrowUp":
        if (results.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
        break;
      case "Enter": {
        const match = results[active >= 0 ? active : 0];
        if (match) {
          event.preventDefault();
          choose(match);
        }
        break;
      }
    }
  };

  const expanded = open && results.length > 0;

  return (
    <div className="place-search" id="sat-search" ref={rootRef} hidden={!visible} style={STACK_BELOW_PLACE_SEARCH}>
      <label className="visually-hidden" htmlFor="sat-q">
        Buscar un satélite por nombre o NORAD
      </label>
      <input
        id="sat-q"
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls="sat-results"
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `sat-opt-${active}` : undefined}
        placeholder="ISS, 25544…"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      <ul id="sat-results" role="listbox" aria-label="Satélites encontrados" hidden={!expanded}>
        {results.map((match, i) => (
          <li key={match.index} role="presentation">
            <button
              type="button"
              id={`sat-opt-${i}`}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              style={i === active ? ACTIVE_ROW : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(match)}
            >
              <span className={swatchClass(match.category)} aria-hidden="true" />
              <span style={{ marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {match.name}
              </span>
              <span style={{ marginLeft: "auto", paddingLeft: 10, fontSize: 11, opacity: 0.7, whiteSpace: "nowrap" }}>
                {match.noradId} · {CATEGORY_LABELS[match.category]}
                {isSynthetic ? " · demo" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
