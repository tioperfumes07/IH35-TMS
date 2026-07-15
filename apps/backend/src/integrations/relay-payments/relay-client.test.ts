import { afterEach, describe, expect, it } from "vitest";
import { relayApiBase, relayApiKey, RelayApiError } from "./relay-client.js";

// Per-entity Relay key resolution: RELAY_API_KEY_<CODE> takes precedence, RELAY_API_KEY is the fallback,
// and a missing key resolves to null (caller throws relay_not_configured — never borrows another entity's key).
describe("relayApiKey — per-entity resolution", () => {
  const saved = { ...process.env };
  afterEach(() => {
    // restore env between cases (delete the keys we may have set, then reapply the snapshot)
    for (const k of Object.keys(process.env)) if (k.startsWith("RELAY_API_KEY")) delete process.env[k];
    Object.assign(process.env, saved);
  });

  function clearKeys() {
    for (const k of Object.keys(process.env)) if (k.startsWith("RELAY_API_KEY")) delete process.env[k];
  }

  it("prefers the entity-scoped key over the global key", () => {
    clearKeys();
    process.env.RELAY_API_KEY = "global";
    process.env.RELAY_API_KEY_TRANSP = "transp-key";
    expect(relayApiKey("TRANSP")).toBe("transp-key");
    expect(relayApiKey("USMCA")).toBeNull(); // entity-scoped + no USMCA key → null, NEVER the global key
  });

  it("uses the global key ONLY on the legacy no-entityCode path — never for a scoped entity", () => {
    clearKeys();
    process.env.RELAY_API_KEY = "global";
    // entity-scoped call whose scoped key is unset => null (no cross-entity borrow of the global key)
    expect(relayApiKey("USMCA")).toBeNull();
    // legacy single-entity path (no entityCode) => the bare global key is legitimate
    expect(relayApiKey(null)).toBe("global");
    expect(relayApiKey(undefined)).toBe("global");
  });

  it("normalizes the code (case + non-alphanumerics) to the env-var suffix", () => {
    clearKeys();
    process.env.RELAY_API_KEY_TRANSP = "transp-key";
    expect(relayApiKey("transp")).toBe("transp-key");
    expect(relayApiKey(" Transp ")).toBe("transp-key");
  });

  it("returns null when neither a scoped nor a global key is set (no silent cross-entity borrow)", () => {
    clearKeys();
    expect(relayApiKey("TRANSP")).toBeNull();
    expect(relayApiKey(null)).toBeNull();
  });
});

// FAIL-LOUD: a missing RELAY_API_BASE in production must THROW, never silently fall back to staging (that
// silent fallback cost hours of "auth works but 0 rows" debugging on 2026-07-15).
describe("relayApiBase — fail-loud in production", () => {
  const saved = { ...process.env };
  afterEach(() => {
    delete process.env.RELAY_API_BASE;
    delete process.env.NODE_ENV;
    Object.assign(process.env, saved);
  });

  it("throws in production when RELAY_API_BASE is unset (no staging fallback)", () => {
    delete process.env.RELAY_API_BASE;
    process.env.NODE_ENV = "production";
    expect(() => relayApiBase()).toThrow(RelayApiError);
    expect(() => relayApiBase()).toThrow(/relay_api_base_missing/);
  });

  it("falls back to the staging default OUTSIDE production", () => {
    delete process.env.RELAY_API_BASE;
    process.env.NODE_ENV = "test";
    expect(relayApiBase()).toContain("staging.relaypayments.com");
  });

  it("uses the configured base (trailing slash normalized) when set", () => {
    process.env.NODE_ENV = "production";
    process.env.RELAY_API_BASE = "https://app.relaypayments.com/api/fuel/transactions";
    expect(relayApiBase()).toBe("https://app.relaypayments.com/api/fuel/transactions/");
  });
});
