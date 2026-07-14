import { afterEach, describe, expect, it } from "vitest";
import { relayApiKey } from "./relay-client.js";

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
    expect(relayApiKey("USMCA")).toBe("global"); // no USMCA-scoped key → falls back
  });

  it("falls back to the global key when no scoped key is set", () => {
    clearKeys();
    process.env.RELAY_API_KEY = "global";
    expect(relayApiKey("USMCA")).toBe("global");
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
