# T19 — Engine error overlay, WebGL fallback, catalog toast
Tier: sonnet5-medium · Wave: 4 · Depends: T07

**Target**: new `src/components/sites/orbitalwatch/HUD/EngineErrorOverlay.tsx`; `OrbitalWatch.tsx` (mount line + wrap the HUD in a React error boundary `src/components/sites/orbitalwatch/HUDErrorBoundary.tsx`, class component, logs and renders the same overlay with code `"boot-failed"`).
**Change**: reads `engineError` from the store. Fatal codes (`webgl-unsupported`, `webgl-context-lost`, `boot-failed`, `import-failed`) → full-screen glass panel over the canvas: title, the message, a short explanation (WebGL 2 required / hardware acceleration), a "Reintentar" button (`location.reload()`) and the static description text already in the `<noscript>` block (reuse it); `role="alertdialog"`, focus moves to the button. `catalog-failed` → dismissible toast bottom-left "Sin conexión con CelesTrak: catálogo sintético" (`role="status"`, auto-hide 8 s, no layout shift). Also hide the loader when a fatal error shows.
**Pattern**: `HUD/BodyPanel.tsx` panel markup for the glass look; `DonateSheet.tsx` for modal focus handling.
**Constraints**: no engine edits; no new deps; low frequency only (store).
**Ownership**: `HUD/EngineErrorOverlay.tsx`, `HUDErrorBoundary.tsx`, `OrbitalWatch.tsx` (mount + boundary wrap only).
**Acceptance**: `npx tsc --noEmit`; `npx eslint src/components/sites/orbitalwatch`; simulate: in devtools run `window.orbitalwatch.renderer.getContext().getExtension("WEBGL_lose_context").loseContext()` (`?debug`) → overlay appears, reload restores; block `celestrak.org` in devtools → toast appears and the app keeps running on the synthetic catalog.
**HINTS**: `EngineErrorCode` in `src/engine/contract.ts`; store field `engineError` and `setEngineError`; bridge mapping in `src/stores/engine-bridge.ts:72-76`.
**Pitfalls**: rendering the overlay on `loading.error` as well (double message: use `engineError` only, the loader keeps its own text); `location.reload` at module top level; error boundary as a function component (must be a class).
