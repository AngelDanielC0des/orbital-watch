# T12 — Brand and payments through `NEXT_PUBLIC_*`
Tier: sonnet5-medium · Wave: 4 · Depends: T01, T02

**Target**: `src/engine/config.ts` (`STRIPE_PAYMENT_LINK`, `CONTACT_EMAIL`, add `SITE_NAME`), `src/components/sites/orbitalwatch/DonateSheet.tsx` (166 l), `src/app/layout.tsx` metadata (title/description from `SITE_NAME`), `src/app/orbitalwatch/page.tsx` metadata if present.
**Change**: `STRIPE_PAYMENT_LINK = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? ""` (no fallback URL), `CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? ""`, `SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "OrbitalWatch"`. `DonateSheet`: when the link is empty render the pay button `disabled` with `aria-disabled` and title "Payment link not configured"; `if (process.env.NODE_ENV !== "production") console.warn("[OrbitalWatch] NEXT_PUBLIC_STRIPE_PAYMENT_LINK is not set")` once (module-level guard inside a `useEffect`). Hide the email row when empty. Do not invent values.
**Pattern**: existing `DonateSheet.tsx` markup; Tailwind only for new classes.
**Constraints**: `NEXT_PUBLIC_*` must be read as static `process.env.NEXT_PUBLIC_X` expressions (Next inlines them; no dynamic key access). Do not touch `src/engine/create-engine.ts`.
**Ownership**: `src/engine/config.ts`, `DonateSheet.tsx`, `src/app/layout.tsx`, `src/app/orbitalwatch/page.tsx`.
**Acceptance**: `npx tsc --noEmit`; `npx eslint src/engine/config.ts src/components/sites/orbitalwatch/DonateSheet.tsx src/app`; `rg -n "buy.stripe.com|contact@orbitalwatch" src` → 0 hits; with no `.env.local` the donate button is disabled and the dev console shows the warning once.
**HINTS**: `.env.example` from T02 lists the three variables; `docs/plan/PLAN.md` §6 "Needs user input".
**Pitfalls**: `process.env[name]` dynamic access (undefined in the browser); warning on every render; leaving the test Stripe URL as fallback.
