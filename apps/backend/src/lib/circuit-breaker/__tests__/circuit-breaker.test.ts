import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreakerOpenError,
  getBreakerState,
  onBreakerTransition,
  resetAllBreakersForTests,
  withCircuitBreaker,
} from "../index.js";

describe("circuit breaker registry", () => {
  beforeEach(async () => {
    await resetAllBreakersForTests();
  });

  afterEach(async () => {
    await resetAllBreakersForTests();
  });

  it("sentry passthrough never opens", async () => {
    let calls = 0;
    await expect(
      withCircuitBreaker("sentry", async () => {
        calls += 1;
        throw new Error("sentry_fail");
      })
    ).rejects.toThrow("sentry_fail");
    expect(calls).toBe(1);
    expect(getBreakerState("sentry")).toBe("closed");
  });

  it("opens QBO breaker after repeated failures and fails fast on 7th call", async () => {
    let calls = 0;
    const failing = () =>
      withCircuitBreaker("qbo", async () => {
        calls += 1;
        throw new Error("QBO HTTP 503");
      });

    let http503Errors = 0;
    let openErrors = 0;
    for (let i = 0; i < 7; i += 1) {
      try {
        await failing();
      } catch (error) {
        if (error instanceof CircuitBreakerOpenError) {
          openErrors += 1;
        } else if (error instanceof Error && error.message.includes("QBO HTTP 503")) {
          http503Errors += 1;
        } else {
          throw error;
        }
      }
    }

    expect(http503Errors).toBeGreaterThanOrEqual(4);
    expect(openErrors).toBeGreaterThanOrEqual(1);
    expect(getBreakerState("qbo")).toBe("open");
    expect(calls).toBeGreaterThanOrEqual(5);
  });

  it("emits observability events on state transitions", async () => {
    const events: string[] = [];
    onBreakerTransition((e) => {
      events.push(`${e.dep}:${e.from}->${e.to}`);
    });

    for (let i = 0; i < 6; i += 1) {
      await expect(
        withCircuitBreaker("qbo", async () => {
          throw new Error("QBO HTTP 503");
        })
      ).rejects.toThrow();
    }

    expect(events.some((e) => e.includes("qbo:") && e.includes("->open"))).toBe(true);
  });

  it("half-open allows a probe after reset timeout", async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 6; i += 1) {
      await expect(
        withCircuitBreaker("qbo", async () => {
          throw new Error("QBO HTTP 503");
        })
      ).rejects.toThrow();
    }

    expect(getBreakerState("qbo")).toBe("open");

    await vi.advanceTimersByTimeAsync(61_000);

    let probeCalls = 0;
    await expect(
      withCircuitBreaker("qbo", async () => {
        probeCalls += 1;
        return "ok";
      })
    ).resolves.toBe("ok");
    expect(probeCalls).toBe(1);

    vi.useRealTimers();
  });
});
