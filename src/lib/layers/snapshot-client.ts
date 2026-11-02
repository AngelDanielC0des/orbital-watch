/** Client helper: loads the bundled demo snapshot of a layer (manifest + file in `public/`). Never throws. */
import type { LayerError, Result } from "@/types/layers";
import { err, layerError, ok, toLayerError } from "./result";
import { isRecord, isString } from "./validate";

const DATA_PREFIX = "/sites/orbitalwatch/data/";
const MANIFEST_PATH = `${DATA_PREFIX}snapshots.json`;

function isSafePath(path: string): boolean {
  return path.startsWith(DATA_PREFIX) && path.endsWith(".json") && !path.includes("..");
}

async function getJson(url: string, signal: AbortSignal): Promise<Result<unknown, LayerError>> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return err(layerError("upstream", `HTTP ${response.status} ${url}`));
    return ok(await response.json());
  } catch (cause) {
    return err(toLayerError(cause));
  }
}

/**
 * Fetches the snapshot of `kind` and validates its content with `guard`.
 * Resolves `aborted` when `signal` aborts and `invalid` for a malformed manifest or payload.
 */
export async function fetchSnapshot<T>(
  kind: "pollution" | "fires",
  signal: AbortSignal,
  guard: (v: unknown) => v is T,
): Promise<Result<{ data: T; date: string }, LayerError>> {
  const manifest = await getJson(MANIFEST_PATH, signal);
  if (!manifest.ok) return manifest;
  const entry = isRecord(manifest.value) ? manifest.value[kind] : undefined;
  if (!isRecord(entry) || !isString(entry.date) || !isString(entry.path) || !isSafePath(entry.path)) {
    return err(layerError("invalid", `bad snapshot manifest entry ${kind}`));
  }
  const file = await getJson(entry.path, signal);
  if (!file.ok) return file;
  if (!guard(file.value)) return err(layerError("invalid", `bad snapshot data ${kind}`));
  return ok({ data: file.value, date: entry.date });
}
