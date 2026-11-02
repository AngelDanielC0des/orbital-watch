import { describe, expect, it } from "vitest";
import { err, isAbortError, LAYER_ERROR_MESSAGES, layerError, ok, toLayerError } from "./result";

describe("ok / err", () => {
  it("builds the success shape", () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 });
  });

  it("builds the failure shape", () => {
    expect(err("boom")).toEqual({ ok: false, error: "boom" });
  });
});

describe("layerError", () => {
  it("omits detail when not given and uses the default message", () => {
    const e = layerError("empty");
    expect(e).toEqual({ code: "empty", message: LAYER_ERROR_MESSAGES.empty });
    expect("detail" in e).toBe(false);
  });

  it("includes detail and allows a custom message", () => {
    expect(layerError("invalid", "x")).toEqual({ code: "invalid", message: LAYER_ERROR_MESSAGES.invalid, detail: "x" });
    expect(layerError("network", "d", "custom")).toEqual({ code: "network", message: "custom", detail: "d" });
  });
});

describe("isAbortError", () => {
  it("detects DOMException and plain objects named AbortError", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
  });

  it("rejects other values", () => {
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError({ name: "Other" })).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

describe("toLayerError", () => {
  it("maps aborts to aborted without detail", () => {
    expect(toLayerError(new DOMException("x", "AbortError"))).toEqual(layerError("aborted"));
  });

  it("maps Error to the default network code with detail", () => {
    expect(toLayerError(new Error("offline"))).toEqual(layerError("network", "offline"));
  });

  it("uses the given fallback code and stringifies non-errors", () => {
    expect(toLayerError(new Error("bad"), "invalid")).toEqual(layerError("invalid", "bad"));
    expect(toLayerError(42, "upstream")).toEqual(layerError("upstream", "42"));
  });
});
