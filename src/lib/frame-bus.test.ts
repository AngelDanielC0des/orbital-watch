import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrameBus } from "./frame-bus";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFrameBus", () => {
  it("delivers the last frame immediately to a new subscriber", () => {
    const bus = createFrameBus<number>();
    bus.publish(1);
    bus.publish(2);

    const received: number[] = [];
    bus.subscribe((frame) => received.push(frame));

    expect(received).toEqual([2]);
    expect(bus.last).toBe(2);
  });

  it("does not replay anything when nothing was published yet", () => {
    const bus = createFrameBus<number>();
    const listener = vi.fn();
    bus.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    expect(bus.last).toBeNull();
  });

  it("fans out each publish to every subscriber", () => {
    const bus = createFrameBus<string>();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);

    bus.publish("frame-1");

    expect(a).toHaveBeenCalledWith("frame-1");
    expect(b).toHaveBeenCalledWith("frame-1");
  });

  it("isolates a throwing listener so the others still run", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bus = createFrameBus<number>();
    const healthy = vi.fn();
    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe(healthy);

    expect(() => bus.publish(7)).not.toThrow();
    expect(healthy).toHaveBeenCalledWith(7);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("stops delivering to a listener after its unsubscribe function runs", () => {
    const bus = createFrameBus<number>();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    unsubscribe();
    bus.publish(3);

    expect(listener).not.toHaveBeenCalled();
  });

  it("clear drops all listeners and the last frame", () => {
    const bus = createFrameBus<number>();
    const listener = vi.fn();
    bus.subscribe(listener);
    bus.publish(1);
    listener.mockClear();

    bus.clear();
    expect(bus.last).toBeNull();
    bus.publish(2);

    expect(listener).not.toHaveBeenCalled();
    expect(bus.last).toBe(2);
  });
});
