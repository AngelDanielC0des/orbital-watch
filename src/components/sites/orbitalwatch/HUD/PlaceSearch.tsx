"use client";
/**
 * Country / US-state search. Low-frequency state → plain `useState` (no store). The place index is
 * fetched once (module-level cache in `place-index.ts`) on first focus/typing; selecting a result
 * hands the full `Place` to `onSelect` (the shell forwards it to `handle.flyToPlace`, which also
 * highlights it). Markup keeps ids #place-search #place-q #place-results (CSS contract).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { Vector3 } from "three";
import { loadPlaceIndex, type Place, type PlaceIndex } from "@/lib/orbital/place-index";

export interface PlaceSearchProps {
  /** Hidden unless the earth view is active (store `view === "earth"`). */
  visible: boolean;
  onSelect: (place: { name: string; center: Vector3; distance: number }) => void;
}

export function PlaceSearch({ visible, onSelect }: PlaceSearchProps) {
  const [index, setIndex] = useState<PlaceIndex | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const ensureIndex = useCallback(() => {
    loadPlaceIndex()
      .then((loaded) => {
        if (alive.current) setIndex(loaded);
      })
      .catch((error: unknown) => console.warn("[Places]", error));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target instanceof Node ? event.target : null)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const results = useMemo(() => (index ? index.search(query) : []), [index, query]);

  const select = (place: Place) => {
    setQuery(place.name);
    setOpen(false);
    onSelect(place);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
    setOpen(true);
    if (!index) ensureIndex();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (event.key === "Enter" && results[0]) {
      event.preventDefault();
      select(results[0]);
    }
  };

  return (
    <div className="place-search" id="place-search" ref={rootRef} hidden={!visible}>
      <label className="visually-hidden" htmlFor="place-q">
        Search a country or state
      </label>
      <input
        id="place-q"
        ref={inputRef}
        type="search"
        placeholder="España, California…"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onFocus={ensureIndex}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      <ul id="place-results" hidden={!open || results.length === 0}>
        {results.map((place) => (
          <li key={place.key}>
            <button type="button" data-kind={place.kind} onClick={() => select(place)}>
              {place.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
