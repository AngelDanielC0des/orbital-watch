import { describe, expect, it } from "vitest";
import {
  FRESHNESS_COLOR,
  FRESHNESS_LABEL,
  formatRelative,
  formatUtcDate,
  freshnessOf,
  timelineMismatch,
} from "./freshness";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const base = { status: "ready" as const, dataDate: "2026-11-01", isFallback: false, isModel: false, nowMs: NOW };

describe("freshnessOf", () => {
  it("prioritises error, then demo, then none", () => {
    expect(freshnessOf({ ...base, status: "error", isFallback: true })).toBe("error");
    expect(freshnessOf({ ...base, isFallback: true })).toBe("demo");
    expect(freshnessOf({ ...base, dataDate: null })).toBe("none");
    expect(freshnessOf({ ...base, dataDate: "basura" })).toBe("none");
  });
  it("classifies by age", () => {
    expect(freshnessOf(base)).toBe("fresh");
    expect(freshnessOf({ ...base, dataDate: "2026-11-02" })).toBe("fresh");
    expect(freshnessOf({ ...base, dataDate: "2026-10-30" })).toBe("aging");
    expect(freshnessOf({ ...base, dataDate: "2026-10-27" })).toBe("aging");
    expect(freshnessOf({ ...base, dataDate: "2026-10-20" })).toBe("stale");
  });
  it("never reports a model as fresh", () => {
    expect(freshnessOf({ ...base, isModel: true })).toBe("aging");
    expect(freshnessOf({ ...base, isModel: true, dataDate: "2026-10-01" })).toBe("stale");
  });
  it("accepts ISO times", () => {
    expect(freshnessOf({ ...base, dataDate: "2026-11-02T06:00Z" })).toBe("fresh");
    expect(freshnessOf({ ...base, dataDate: "2026-11-02T06:00:00" })).toBe("fresh");
  });
});

describe("tokens", () => {
  it("covers every state", () => {
    expect(FRESHNESS_COLOR.error).toBe("var(--alarm)");
    expect(FRESHNESS_LABEL.none).toBe("Sin datos");
  });
});

describe("formatUtcDate", () => {
  it("formats a plain date in UTC", () => {
    const text = formatUtcDate("2026-11-02");
    expect(text).toContain("2");
    expect(text).toContain("2026");
    expect(text).toContain("nov");
    expect(text.endsWith("UTC")).toBe(true);
  });
  it("does not shift the day for ISO times", () => {
    const text = formatUtcDate("2026-11-02T23:30Z", true);
    expect(text).toContain("nov");
    expect(text).toContain("23");
    expect(text).toContain("30");
    expect(text).toContain("UTC");
  });
  it("falls back to the raw string when invalid", () => {
    expect(formatUtcDate("nope")).toBe("nope");
  });
});

describe("formatRelative", () => {
  it("handles each unit", () => {
    expect(formatRelative(NOW - 10_000, NOW)).toBe("hace unos segundos");
    expect(formatRelative(NOW - 5 * 60_000, NOW)).toContain("5");
    expect(formatRelative(NOW - 3 * 3_600_000, NOW)).toContain("3");
    expect(formatRelative(NOW - 3 * DAY, NOW)).toContain("3");
  });
});

describe("timelineMismatch", () => {
  it("compares against a 2 day tolerance", () => {
    expect(timelineMismatch(NOW, "2026-11-01")).toBe(false);
    expect(timelineMismatch(NOW, "2026-10-20")).toBe(true);
    expect(timelineMismatch(NOW + 10 * DAY, "2026-11-01")).toBe(true);
    expect(timelineMismatch(NOW, null)).toBe(false);
  });
});
