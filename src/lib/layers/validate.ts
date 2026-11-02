/** Tiny runtime guards for upstream payloads (no schema dependency). */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function inRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** `YYYY-MM-DD` that is also a real calendar date. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** ISO date or date-time parseable by `Date.parse`. */
export function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(value) && Number.isFinite(Date.parse(value));
}

/** Finite number, or `null` (Open-Meteo returns `null` for missing values). */
export function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

export function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T, maxLength = Infinity): value is T[] {
  return Array.isArray(value) && value.length <= maxLength && value.every((item) => guard(item));
}

/** Number array of bounded length with every item finite. */
export function isFiniteNumberArray(value: unknown, maxLength = Infinity): value is number[] {
  return Array.isArray(value) && value.length <= maxLength && value.every((item) => isFiniteNumber(item));
}
