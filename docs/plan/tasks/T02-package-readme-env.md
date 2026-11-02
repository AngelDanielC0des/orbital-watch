# T02 — package.json metadata, README, `.env.example`
Tier: haiku · Wave: 1 · Depends: —

**Target**: `package.json` (name/description/keywords/repository), `README.md` (replace template), new `.env.example`.
**Change**: `name: "orbitalwatch"`, description "Real-time 3D satellite tracker: Earth, solar system and galaxy views with a HUD UI (Next.js + Three.js)", keywords `[satellites, three.js, nextjs, webgl, space, hud]`, `repository` → leave the key out if unknown (Needs user input). README (English, ≤80 lines): what it is, stack, `npm run dev` / `npm run check`, env vars table, architecture summary linking `docs/plan/PLAN.md`, licence placeholder. `.env.example`: `NEXT_PUBLIC_STRIPE_PAYMENT_LINK=`, `NEXT_PUBLIC_CONTACT_EMAIL=`, `NEXT_PUBLIC_SITE_NAME=OrbitalWatch`, one comment each.
**Pattern**: none.
**Constraints**: do not touch `src/`, `docs/`, `scripts` or `dependencies` in `package.json`.
**Ownership**: `package.json` (metadata keys only), `README.md`, `.env.example`.
**Acceptance**: `node -e "require('./package.json')"` exits 0; `rg -n "ai-website-clone-template|star-history|comparison.png" package.json README.md` → 0 hits.
**HINTS**: current metadata at `package.json:2-5`; template README references deleted images under `docs/assets/`.
**Pitfalls**: inventing a Stripe link or email (leave blank); changing `"build": "next build --webpack"`; editing `package-lock.json`.
