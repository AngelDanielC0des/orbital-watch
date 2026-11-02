/** Client helper: GET one `/api/orbital/*` route and validate its envelope. Never throws. */
import type { ApiEnvelope, ApiMeta, LayerError, Result } from "@/types/layers";
import { err, layerError, ok, toLayerError } from "./result";
import { isRecord, isString } from "./validate";

export interface EnvelopeValue<T> {
  data: T;
  meta: ApiMeta;
}

function isApiMeta(value: unknown): value is ApiMeta {
  return (
    isRecord(value) &&
    isString(value.source) &&
    (value.dataDate === null || isString(value.dataDate)) &&
    isString(value.fetchedAt) &&
    typeof value.fallback === "boolean"
  );
}

/** Appends the dev flags understood by the routes (`mock=error|snapshot`). */
export function withFlags(path: string, flags: { mockError: boolean; forceSnapshot: boolean }): string {
  if (!flags.mockError && !flags.forceSnapshot) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}mock=${flags.mockError ? "error" : "snapshot"}`;
}

export async function fetchEnvelope<T>(
  url: string,
  signal: AbortSignal,
  guard: (data: unknown) => data is T,
): Promise<Result<EnvelopeValue<T>, LayerError>> {
  let body: unknown;
  try {
    const response = await fetch(url, { signal, headers: { accept: "application/json" } });
    body = await response.json().catch(() => null);
    if (!response.ok && !(isRecord(body) && body.ok === false)) {
      return err(layerError("upstream", `HTTP ${response.status} ${url}`));
    }
  } catch (cause) {
    return err(toLayerError(cause));
  }
  if (!isRecord(body) || typeof body.ok !== "boolean" || !isApiMeta(body.meta)) return err(layerError("invalid", `bad envelope ${url}`));
  const envelope = body as ApiEnvelope<unknown>;
  if (!envelope.ok) {
    const code = envelope.error?.code ?? "upstream";
    return err(layerError(code === "aborted" ? "upstream" : code, envelope.error?.message));
  }
  if (!guard(envelope.data)) return err(layerError("invalid", `bad data ${url}`));
  return ok({ data: envelope.data, meta: envelope.meta });
}
