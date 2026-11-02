/** Bundled snapshot fallback for pollution and fires (manifest in `public/`, produced offline). */

const DATA_PREFIX = "/sites/orbitalwatch/data/";
const MANIFEST_PATH = `${DATA_PREFIX}snapshots.json`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Loads the snapshot of `kind` from `origin`. Returns `null` on any failure (missing manifest,
 * unexpected shape, HTTP error); the caller validates `data` with its own guard.
 */
export async function loadSnapshot(kind: "pollution" | "fires", origin: string): Promise<{ data: unknown; date: string } | null> {
  try {
    const manifestRes = await fetch(new URL(MANIFEST_PATH, origin), { cache: "force-cache" });
    if (!manifestRes.ok) return null;
    const manifest: unknown = await manifestRes.json();
    if (!isRecord(manifest)) return null;
    const entry = manifest[kind];
    if (!isRecord(entry)) return null;
    const { date, path } = entry;
    if (typeof date !== "string" || typeof path !== "string") return null;
    if (!path.startsWith(DATA_PREFIX) || !path.endsWith(".json") || path.includes("..")) return null;
    const fileRes = await fetch(new URL(path, origin), { cache: "force-cache" });
    if (!fileRes.ok) return null;
    return { data: await fileRes.json(), date };
  } catch {
    return null;
  }
}
