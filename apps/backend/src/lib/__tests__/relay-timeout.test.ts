import { afterEach, describe, expect, it } from "vitest";
import { relayApiTimeoutMs, relayBreakerTimeoutMs, RELAY_BREAKER_SLACK_MS } from "../relay-timeout.js";
import { BREAKER_CONFIGS } from "../circuit-breaker/registry.js";

// GUARD 2026-07-16: the relay circuit breaker must always allow MORE time than the fetch AbortController,
// or the breaker fires first and the full-history Relay pull can never complete (deploy eba6220 regression).
describe("relay timeout hierarchy", () => {
  const saved = process.env.RELAY_API_TIMEOUT_MS;
  afterEach(() => {
    if (saved === undefined) delete process.env.RELAY_API_TIMEOUT_MS;
    else process.env.RELAY_API_TIMEOUT_MS = saved;
  });

  it("defaults the fetch timeout to 120s when env is unset", () => {
    delete process.env.RELAY_API_TIMEOUT_MS;
    expect(relayApiTimeoutMs()).toBe(120_000);
  });

  it("breaker timeout is strictly greater than the fetch timeout by the slack", () => {
    delete process.env.RELAY_API_TIMEOUT_MS;
    expect(relayBreakerTimeoutMs()).toBe(relayApiTimeoutMs() + RELAY_BREAKER_SLACK_MS);
    expect(relayBreakerTimeoutMs()).toBeGreaterThan(relayApiTimeoutMs());
  });

  it("honors a custom RELAY_API_TIMEOUT_MS while preserving the hierarchy", () => {
    process.env.RELAY_API_TIMEOUT_MS = "45000";
    expect(relayApiTimeoutMs()).toBe(45_000);
    expect(relayBreakerTimeoutMs()).toBe(45_000 + RELAY_BREAKER_SLACK_MS);
    expect(relayBreakerTimeoutMs()).toBeGreaterThan(relayApiTimeoutMs());
  });

  it("the registered relay breaker config uses the derived breaker timeout (never the 30s default)", () => {
    expect(BREAKER_CONFIGS.relay.timeout).toBe(relayBreakerTimeoutMs());
    expect(BREAKER_CONFIGS.relay.timeout).toBeGreaterThan(relayApiTimeoutMs());
    expect(BREAKER_CONFIGS.relay.timeout).not.toBe(30_000);
  });
});
