/** `Result` helpers and the standard user-facing error messages (Spanish, no status codes). */
import type { LayerError, LayerErrorCode, Result } from "@/types/layers";

export type { Result } from "@/types/layers";

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Default plain-language copy per error class. */
export const LAYER_ERROR_MESSAGES: Readonly<Record<LayerErrorCode, string>> = {
  network: "No hay conexión con la fuente de datos.",
  upstream: "La fuente de datos no respondió correctamente.",
  invalid: "Los datos recibidos no tienen el formato esperado.",
  empty: "Sin datos para este periodo.",
  aborted: "Carga cancelada.",
};

export function layerError(code: LayerErrorCode, detail?: string, message: string = LAYER_ERROR_MESSAGES[code]): LayerError {
  return detail === undefined ? { code, message } : { code, message, detail };
}

/** True for `AbortError` from `fetch`/`AbortSignal` (DOMException or plain Error). */
export function isAbortError(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "name" in cause && (cause as { name: unknown }).name === "AbortError";
}

/** Maps a thrown value from `fetch`/decoding to a `LayerError`. */
export function toLayerError(cause: unknown, fallback: LayerErrorCode = "network"): LayerError {
  if (isAbortError(cause)) return layerError("aborted");
  const detail = cause instanceof Error ? cause.message : String(cause);
  return layerError(fallback, detail);
}
