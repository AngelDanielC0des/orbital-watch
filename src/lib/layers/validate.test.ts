import { describe, expect, it } from "vitest";
import {
  inRange,
  isArrayOf,
  isFiniteNumber,
  isFiniteNumberArray,
  isIsoDate,
  isIsoDateTime,
  isNullableFiniteNumber,
  isRecord,
  isString,
} from "./validate";

describe("basic guards", () => {
  it("isRecord excludes null and arrays", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord("x")).toBe(false);
  });

  it("isFiniteNumber / isString", () => {
    expect(isFiniteNumber(1)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber("1")).toBe(false);
    expect(isString("")).toBe(true);
    expect(isString(1)).toBe(false);
  });
});

describe("isIsoDate", () => {
  it("accepts real dates", () => {
    expect(isIsoDate("2026-10-30")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects impossible dates and wrong formats", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-1")).toBe(false);
    expect(isIsoDate("2026-10-30T00:00:00Z")).toBe(false);
    expect(isIsoDate(20261030)).toBe(false);
  });
});

describe("isIsoDateTime", () => {
  it("accepts dates and date-times with or without zone", () => {
    expect(isIsoDateTime("2026-10-30")).toBe(true);
    expect(isIsoDateTime("2026-10-30T12:00")).toBe(true);
    expect(isIsoDateTime("2026-10-30T12:00:00Z")).toBe(true);
    expect(isIsoDateTime("2026-10-30T12:00:00.123Z")).toBe(true);
    expect(isIsoDateTime("2026-10-30T12:00:00+02:00")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isIsoDateTime("garbage")).toBe(false);
    expect(isIsoDateTime("2026-10-30 12:00")).toBe(false);
    expect(isIsoDateTime("2026-10-30T99:99:99Z")).toBe(false);
    expect(isIsoDateTime(null)).toBe(false);
  });
});

describe("inRange", () => {
  it("is inclusive at both edges", () => {
    expect(inRange(0, 0, 10)).toBe(true);
    expect(inRange(10, 0, 10)).toBe(true);
    expect(inRange(-0.001, 0, 10)).toBe(false);
    expect(inRange(10.001, 0, 10)).toBe(false);
  });

  it("rejects non-finite and non-numbers", () => {
    expect(inRange(NaN, 0, 10)).toBe(false);
    expect(inRange(Infinity, 0, Infinity)).toBe(false);
    expect(inRange("5", 0, 10)).toBe(false);
  });
});

describe("isNullableFiniteNumber", () => {
  it("allows null and finite numbers only", () => {
    expect(isNullableFiniteNumber(null)).toBe(true);
    expect(isNullableFiniteNumber(0)).toBe(true);
    expect(isNullableFiniteNumber(undefined)).toBe(false);
    expect(isNullableFiniteNumber(NaN)).toBe(false);
  });
});

describe("isArrayOf", () => {
  it("checks every item and the max length", () => {
    expect(isArrayOf(["a", "b"], isString)).toBe(true);
    expect(isArrayOf(["a", 1], isString)).toBe(false);
    expect(isArrayOf(["a", "b", "c"], isString, 2)).toBe(false);
    expect(isArrayOf(["a", "b"], isString, 2)).toBe(true);
    expect(isArrayOf("ab", isString)).toBe(false);
    expect(isArrayOf([], isString, 0)).toBe(true);
  });
});

describe("isFiniteNumberArray", () => {
  it("accepts finite arrays within the limit", () => {
    expect(isFiniteNumberArray([1, 2, 3])).toBe(true);
    expect(isFiniteNumberArray([1, 2, 3], 2)).toBe(false);
  });

  it("rejects NaN, Infinity and non-arrays", () => {
    expect(isFiniteNumberArray([1, NaN])).toBe(false);
    expect(isFiniteNumberArray([1, Infinity])).toBe(false);
    expect(isFiniteNumberArray([1, "2"])).toBe(false);
    expect(isFiniteNumberArray(new Float32Array(2))).toBe(false);
  });
});
