import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyRelayDateRangeParams,
  fetchAllRelayFuelTransactions,
  filterRelayFuelTransactionsByDateRange,
  parseRelayFuelTransactionRow,
  relayApiBase,
  relayApiKey,
  relayMoneyField,
  relayTransactionCalendarDate,
  relayWindowSpanDays,
  retryAfterMsFromRelayError,
  RelayApiError,
  RelayRowRejectedError,
  type RelayFuelTransaction,
} from "./relay-client.js";

/** Both required totals present — the minimum money a row must carry to be accepted. */
const TOTALS = { total_amount_paid: "10.00", total_retail_price: "10.00" };

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
      ...TOTALS,
    });
    expect(parsed?.transaction_id).toBe("txn-1");
    expect(parsed?.created_at).toBe("2026-07-01T12:00:00Z");
  });

  it("accepts API-style id + numeric id (CSV/API parity)", () => {
    const parsed = parseRelayFuelTransactionRow({
      id: 12345,
      created_at: "2026-07-01T12:00:00Z",
      ...TOTALS,
    });
    expect(parsed?.transaction_id).toBe("12345");
  });

  it("accepts createdAt camelCase", () => {
    const parsed = parseRelayFuelTransactionRow({
      id: "abc",
      createdAt: "2026-07-01T12:00:00Z",
      ...TOTALS,
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

describe("retryAfterMsFromRelayError — honor Relay Retry-After on 429", () => {
  it("returns null for non-429 errors", () => {
    expect(retryAfterMsFromRelayError(new RelayApiError("relay_http_500", 500, {}, true))).toBeNull();
    expect(retryAfterMsFromRelayError(new Error("nope"))).toBeNull();
  });

  it("parses Retry-After seconds from the enriched error body", () => {
    const err = new RelayApiError("relay_http_429", 429, { retry_after: "3" }, true);
    expect(retryAfterMsFromRelayError(err)).toBe(3000);
  });

  it("caps Retry-After at 120s", () => {
    const err = new RelayApiError("relay_http_429", 429, { retry_after: "999" }, true);
    expect(retryAfterMsFromRelayError(err)).toBe(120_000);
  });
});

describe("applyRelayDateRangeParams — Mike-confirmed dtstart/dtend (2026-07-16)", () => {
  it("sets dtstart and dtend from YYYY-MM-DD", () => {
    const url = applyRelayDateRangeParams(
      new URL("https://app.relaypayments.com/api/fuel/transactions/"),
      "2026-03-01",
      "2026-07-16"
    );
    expect(url.searchParams.get("dtstart")).toBe("2026-03-01");
    expect(url.searchParams.get("dtend")).toBe("2026-07-16");
    expect(url.searchParams.has("start_date")).toBe(false);
    expect(url.searchParams.has("end_date")).toBe(false);
  });

  it("strips wrong start_date/end_date if present", () => {
    const url = new URL("https://app.relaypayments.com/api/fuel/transactions/?start_date=x&end_date=y");
    applyRelayDateRangeParams(url, "2026-07-01", "2026-07-02");
    expect(url.searchParams.has("start_date")).toBe(false);
    expect(url.searchParams.has("end_date")).toBe(false);
    expect(url.searchParams.get("dtstart")).toBe("2026-07-01");
  });
});

describe("parseRelayFuelTransactionRow — cash_advance dollar string (Mike Bruno)", () => {
  it("coerces cash_advance '0.00' to false", () => {
    const parsed = parseRelayFuelTransactionRow({
      transaction_id: "txn_1",
      created_at: "2026-07-16T05:42:29Z",
      total_amount_paid: "61.86",
      total_retail_price: "61.86",
      cash_advance: "0.00",
    });
    expect(parsed?.cash_advance).toBe(false);
  });

  it("coerces a positive cash-advance dollar amount to true", () => {
    const parsed = parseRelayFuelTransactionRow({
      transaction_id: "txn_2",
      created_at: "2026-07-16T05:42:29Z",
      total_amount_paid: "25.00",
      total_retail_price: "0.00",
      cash_advance: "25.00",
    });
    expect(parsed?.cash_advance).toBe(true);
  });
});

// Money: ONE accepted shape — a plain decimal dollar string. Relay has not confirmed dollars vs integer cents for
// the API, so a JSON number (either reading) and any string Number() would have bent are refused by field + type.
describe("relayMoneyField — one accepted money shape", () => {
  it("returns a dollar string unchanged (the cents conversion downstream is untouched)", () => {
    for (const v of ["182.44", "0.00", "0", "3.899", "-12.50"]) expect(relayMoneyField(v, "f", "t", true)).toBe(v);
  });

  it("treats absent as null when optional and rejects it when required", () => {
    expect(relayMoneyField(undefined, "f", "t", false)).toBeNull();
    expect(relayMoneyField(null, "f", "t", false)).toBeNull();
    expect(relayMoneyField("", "f", "t", false)).toBeNull();
    expect(() => relayMoneyField(undefined, "total_amount_paid", "t", true)).toThrow(/money_field_missing:total_amount_paid/);
  });

  it("refuses a JSON number, naming the field and the received type", () => {
    expect(() => relayMoneyField(182.44, "total_amount_paid", "t1", true)).toThrow(
      /money_field_unexpected_type:total_amount_paid .*received number 182\.44/
    );
    expect(() => relayMoneyField(18244, "total_amount_paid", "t1", true)).toThrow(RelayRowRejectedError);
  });

  it("refuses strings Number() would have coerced, and non-scalars", () => {
    for (const v of ["$1.00", "1,234.00", "1e3", " 12.00", ".5", "0x10", "NaN", "Infinity", "+1.00", "abc"]) {
      expect(() => relayMoneyField(v, "f", "t", false), v).toThrow(/money_field_unexpected_type:f .*received string/);
    }
    expect(() => relayMoneyField(true, "f", "t", false)).toThrow(/received boolean/);
    expect(() => relayMoneyField({ amount: "1.00" }, "f", "t", false)).toThrow(/received object/);
    expect(() => relayMoneyField(["1.00"], "f", "t", false)).toThrow(/received array/);
  });
});

describe("parseRelayFuelTransactionRow — money fields are validated, never coerced", () => {
  const base = { transaction_id: "txn-m", created_at: "2026-07-16T05:42:29Z", ...TOTALS };

  it("keeps accepted dollar strings exactly as sent", () => {
    const parsed = parseRelayFuelTransactionRow({
      ...base,
      total_amount_saved: "1.25",
      fuel_items: [{ retail_price_per_unit: "3.899", total_retail_price: "182.44", fee: { type: "x", amount: "2.00" } }],
    });
    expect(parsed?.total_amount_paid).toBe("10.00");
    expect(parsed?.total_amount_saved).toBe("1.25");
    expect(parsed?.fuel_items[0].retail_price_per_unit).toBe("3.899");
    expect(parsed?.fuel_items[0].fee?.amount).toBe("2.00");
  });

  it('rejects a missing total instead of storing $0.00 (the old ?? "0")', () => {
    expect(() =>
      parseRelayFuelTransactionRow({ transaction_id: "t", created_at: "2026-07-16T00:00:00Z", total_retail_price: "1.00" })
    ).toThrow(/money_field_missing:total_amount_paid/);
  });

  it("rejects a numeric total (dollars-or-cents unconfirmed)", () => {
    try {
      parseRelayFuelTransactionRow({ ...base, total_amount_paid: 61.86 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RelayRowRejectedError);
      expect((error as RelayRowRejectedError).transactionId).toBe("txn-m");
      expect((error as RelayRowRejectedError).field).toBe("total_amount_paid");
    }
  });

  it("rejects a bad line-item money field by its indexed name (it used to become null silently)", () => {
    expect(() =>
      parseRelayFuelTransactionRow({ ...base, fuel_items: [{ total_retail_price: "1.00" }, { retail_price_per_unit: 3.899 }] })
    ).toThrow(/fuel_items\[1\]\.retail_price_per_unit/);
    expect(() => parseRelayFuelTransactionRow({ ...base, fuel_items: [{ fee: { amount: "$2" } }] })).toThrow(
      /fuel_items\[0\]\.fee\.amount/
    );
  });

  it("rejects a numeric or non-dollar cash_advance; boolean and dollar strings still map", () => {
    expect(parseRelayFuelTransactionRow({ ...base, cash_advance: true })?.cash_advance).toBe(true);
    expect(parseRelayFuelTransactionRow({ ...base, cash_advance: "0.00" })?.cash_advance).toBe(false);
    expect(() => parseRelayFuelTransactionRow({ ...base, cash_advance: 25 })).toThrow(/money_field_unexpected_type:cash_advance/);
    expect(() => parseRelayFuelTransactionRow({ ...base, cash_advance: "yes" })).toThrow(/money_field_unexpected_type:cash_advance/);
  });
});

// Relay: "You can filter by date range by using the dtstart and dtend" + a "10 second limit on pulling
// transactions". One call never asks for unfiltered history or for more than RELAY_MAX_SINGLE_CALL_SPAN_DAYS.
describe("fetchAllRelayFuelTransactions — bounded, dated calls only", () => {
  const saved = { ...process.env };
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(process.env)) if (k.startsWith("RELAY_")) delete process.env[k];
    Object.assign(process.env, saved);
  });

  it("relayWindowSpanDays counts inclusive days and refuses bad ranges", () => {
    expect(relayWindowSpanDays("2026-03-01", "2026-03-01")).toBe(1);
    expect(relayWindowSpanDays("2026-03-01", "2026-03-07")).toBe(7);
    expect(relayWindowSpanDays("2026-03-07", "2026-03-01")).toBeNull();
    expect(relayWindowSpanDays(null, "2026-03-01")).toBeNull();
    expect(relayWindowSpanDays("2026-3-1", "2026-03-01")).toBeNull();
  });

  it("refuses an unfiltered pull before any HTTP call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.RELAY_API_KEY_TEST = "k";
    await expect(
      fetchAllRelayFuelTransactions("TEST", { startDate: undefined as unknown as string, endDate: undefined as unknown as string })
    ).rejects.toThrow(/relay_unbounded_pull_refused/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a single call wider than 31 days (history must be windowed)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.RELAY_API_KEY_TEST = "k";
    await expect(fetchAllRelayFuelTransactions("TEST", { startDate: "2024-10-01", endDate: "2026-10-01" })).rejects.toThrow(
      /relay_window_too_wide/
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends dtstart/dtend, paces the call, and reports refused rows instead of storing them", async () => {
    process.env.NODE_ENV = "test";
    process.env.RELAY_API_BASE = "https://relay.example.test/api/fuel/transactions/";
    process.env.RELAY_API_KEY_TEST = "k";
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string) => {
        urls.push(String(url));
        return new Response(
          JSON.stringify([
            { transaction_id: "good", created_at: "2026-03-02T10:00:00Z", ...TOTALS },
            { transaction_id: "bad", created_at: "2026-03-02T11:00:00Z", total_amount_paid: 10, total_retail_price: "10.00" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    const pacer = { beforeCall: vi.fn(async () => {}), afterCall: vi.fn() };
    const { rows, meta } = await fetchAllRelayFuelTransactions("TEST", { startDate: "2026-03-01", endDate: "2026-03-07", pacer });
    expect(urls).toHaveLength(1);
    const sent = new URL(urls[0]);
    expect(sent.searchParams.get("dtstart")).toBe("2026-03-01");
    expect(sent.searchParams.get("dtend")).toBe("2026-03-07");
    expect(pacer.beforeCall).toHaveBeenCalledTimes(1);
    expect(pacer.afterCall).toHaveBeenCalledTimes(1);
    expect(rows.map((r) => r.transaction_id)).toEqual(["good"]);
    expect(meta.rejected).toEqual([expect.objectContaining({ transaction_id: "bad", field: "total_amount_paid" })]);
  });
});
