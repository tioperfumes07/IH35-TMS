import { afterEach, describe, expect, it } from "vitest";
import {
  filterRelayFuelTransactionsByDateRange,
  parseRelayFuelTransactionRow,
  relayApiBase,
  relayApiKey,
  relayTransactionCalendarDate,
  RelayApiError,
  type RelayFuelTransaction,
} from "./relay-client.js";

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

describe("parseRelayFuelTransactionRow — id aliases (API vs CSV)", () => {
  it("accepts transaction_id + created_at (confirmed shape)", () => {
    const parsed = parseRelayFuelTransactionRow({
      transaction_id: "txn-1",
      created_at: "2026-07-01T12:00:00Z",
      total_amount_paid: "10.00",
    });
    expect(parsed?.transaction_id).toBe("txn-1");
    expect(parsed?.created_at).toBe("2026-07-01T12:00:00Z");
  });

  it("accepts API-style id + numeric id (CSV/API parity)", () => {
    const parsed = parseRelayFuelTransactionRow({
      id: 12345,
      created_at: "2026-07-01T12:00:00Z",
      total_amount_paid: "10.00",
    });
    expect(parsed?.transaction_id).toBe("12345");
  });

  it("accepts createdAt camelCase", () => {
    const parsed = parseRelayFuelTransactionRow({
      id: "abc",
      createdAt: "2026-07-01T12:00:00Z",
    });
    expect(parsed?.transaction_id).toBe("abc");
    expect(parsed?.created_at).toBe("2026-07-01T12:00:00Z");
  });

  it("returns null when identity/timestamp missing (no fabricated rows)", () => {
    expect(parseRelayFuelTransactionRow({ total_amount_paid: "1" })).toBeNull();
  });
});

describe("filterRelayFuelTransactionsByDateRange — client-side Relay date slice", () => {
  const sample = (created_at: string, id = "txn-1"): RelayFuelTransaction => ({
    transaction_id: id,
    created_at,
    relay_fuel_code: null,
    total_amount_paid: "1",
    total_retail_price: "1",
    total_amount_saved: null,
    is_direct_bill: null,
    currency_code: "USD",
    cash_advance: null,
    fuel_code_type: null,
    linked_org: null,
    driver: null,
    merchant: null,
    location: null,
    prompts: [],
    fuel_items: [],
    fees: [],
    products: [],
  });

  it("keeps rows whose created_at calendar day falls in the inclusive window", () => {
    const rows = [
      sample("2026-03-01T12:00:00Z", "a"),
      sample("2026-03-03T23:59:59Z", "b"),
      sample("2026-03-04T00:00:00Z", "c"),
      sample("2026-02-28T12:00:00Z", "d"),
    ];
    expect(filterRelayFuelTransactionsByDateRange(rows, "2026-03-01", "2026-03-03").map((r) => r.transaction_id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("extracts UTC calendar dates from Relay timestamps", () => {
    expect(relayTransactionCalendarDate("2026-07-16T05:42:29Z")).toBe("2026-07-16");
  });
});
