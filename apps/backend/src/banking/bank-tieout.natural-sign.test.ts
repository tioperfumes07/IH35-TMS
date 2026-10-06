import { describe, expect, it } from "vitest";
import { computeTieouts } from "./bank-tieout.service.js";

// ROUND 433: a credit card's feed balance is the amount OWED (positive); its ledger account is a Liability, held raw
// as debit − credit (negative). Compared raw, a card that ties exactly reported twice its balance as drift.
function client(opts: { feed: number; rawGl: number; normal: "debit" | "credit"; feedOnly?: number; glOnly?: number }) {
  return {
    query: async (sql: string) => {
      if (/FROM banking\.bank_accounts/.test(sql) && !/bank_transactions/.test(sql))
        return { rows: [{ id: "ba-1", ledger_account_id: "gl-1", current_balance_cents: String(opts.feed), last_synced_at: new Date().toISOString(), drift_tolerance_cents: "0", label: "Amex" }] };
      if (/fn_account_balances_as_of/.test(sql)) return { rows: [{ account_id: "gl-1", closing_balance_cents: String(opts.rawGl), normal_balance: opts.normal }] };
      if (/bt\.is_credit/.test(sql)) return { rows: [{ c: String(opts.feedOnly ?? 0), n: "0" }] };
      if (/p\.debit_or_credit/.test(sql)) return { rows: [{ c: String(opts.glOnly ?? 0), n: "0" }] };
      return { rows: [] };
    },
  };
}

describe("bank tie-out compares in the account's natural sign", () => {
  it("a card owing $700 ties to a Liability holding -$700 raw", async () => {
    const [t] = await computeTieouts(client({ feed: 70_000, rawGl: -70_000, normal: "credit" }) as never, "oc", "2026-10-06");
    expect(t.gl_balance_cents).toBe(70_000);
    expect(t.status).toBe("tied");
  });
  it("a checking account is unchanged (debit-normal)", async () => {
    const [t] = await computeTieouts(client({ feed: 1_413_275, rawGl: 1_413_275, normal: "debit" }) as never, "oc", "2026-10-06");
    expect(t.gl_balance_cents).toBe(1_413_275);
    expect(t.status).toBe("tied");
  });
  it("a card charge on the feed not yet in the GL explains the gap in natural terms", async () => {
    // $50 charge (money out, is_credit=false -> feed-only raw -5,000) raises the owed balance by $50.
    const [t] = await computeTieouts(client({ feed: 75_000, rawGl: -70_000, normal: "credit", feedOnly: -5_000 }) as never, "oc", "2026-10-06");
    expect(t.diff_cents).toBe(5_000);
    expect(t.status).toBe("explained");
  });
});
