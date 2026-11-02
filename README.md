# OrbitalWatch

Real-time 3D satellite tracker: Earth, solar system and galaxy views with a HUD UI.

OrbitalWatch propagates satellite orbits in the browser and renders them on an interactive Three.js scene, with a HUD overlay for selection, telemetry and view switching.

## Stack

- **Next.js 16** — App Router, React 19, TypeScript (strict)
- **Three.js** (`three`, `@types/three`) — WebGL scenes
- **satellite.js** — SGP4 orbit propagation
- **zustand** — client state
- **shadcn/ui** (Base UI) + **Tailwind CSS v4** — HUD controls and styling
- **GSAP** — UI transitions

## Getting started

Requirements: Node.js 24+.

```bash
npm install
npm run dev      # start the dev server on http://localhost:3000
```

Other scripts:

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run test       # vitest (frame bus, engine bridge, label projector)
npm run check      # lint + typecheck + test + build
npm run start      # serve the production build
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you need.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_NAME` | No | Site name shown in the UI (default `OrbitalWatch`). |
| `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` | No | Donation payment link. When empty, the donate button is disabled. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | No | Contact email. When empty, the email row is hidden. |

## Architecture

The engine (`src/engine/`) owns the canvas, the Three.js scene and the simulation clock, and knows nothing about React. The React HUD (`src/components/sites/orbitalwatch/`) talks to it through a typed handle (commands) and two data channels: low-frequency events into a zustand store, and a 60 Hz `FrameBus` consumed only by ref-based components. See [`docs/plan/PLAN.md`](docs/plan/PLAN.md) for the architecture and [`docs/STATUS.md`](docs/STATUS.md) for the current project state and remaining work.

## License

Licence: TBD (placeholder). Add a `LICENSE` file and update this section before distributing.
