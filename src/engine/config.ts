/**
 * Asset locations for the OrbitalWatch application.
 *
 * Assets are served locally from `public/sites/orbitalwatch/`.
 */
export const ASSET_BASE = "/sites/orbitalwatch/";

export const assetUrl = (path: string): string => `${ASSET_BASE}${path.replace(/^\/+/, "")}`;

/**
 * Public runtime configuration. `NEXT_PUBLIC_*` values must be read as static
 * `process.env.NEXT_PUBLIC_X` expressions so Next.js can inline them.
 * Empty string means "not configured" (no fallback values).
 */
export const STRIPE_PAYMENT_LINK = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? "";

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "OrbitalWatch";

export type QualityTier = "lo" | "hi";
