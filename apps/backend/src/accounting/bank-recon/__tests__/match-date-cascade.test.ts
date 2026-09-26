import { describe, expect, it, vi } from "vitest";
import { findCandidates, MATCH_WINDOW_STEPS } from "../match.service.js";

/**
 * ROUND 207 — date cascade: Step 1 (−3/+1) → Step 2 (−7/+2) auto_widened → never past Step 2.
 * Explicit From/To and payee filters bypass the cascade.
 */

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});
vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass }));

const TXN = {
  id: "tx-1",
  bank_account_id: "acct-1",
  operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
  transaction_date: "2026-09-05",
  amount_cents: 1000,
  is_credit: false,
  description: "VENDOR X",
  merchant_name: "Vendor X",
  notes: null,
  review_state: "pending",
};

function expenseRow(id: string, event_date: string) {
  return {
    id,
    amount_cents: 1000,
    event_date,
    memo: id,
    counterparty_id: "v-1",
    counterparty_name: "Vendor X",
    reference: id,
    description: "Expense",
    open_balance_cents: null,
  };
}

/** Track which date windows the expense SQL saw (via bound params). */
function installMocks(opts: { step1Hit?: boolean; step2Hit?: boolean }) {
  mockQuery.mockReset();
  let expenseFetches = 0;
  const windows: Array<{ from: string; to: string }> = [];
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("FROM banking.bank_transactions")) {
      return { rows: [TXN] };
    }
    if (sql.includes("FROM accounting.expenses e")) {
      expenseFetches += 1;
      const from = String(params?.[/* date from index varies */ 0] ?? "");
      // find from/to in params by looking for ISO dates near txn
      const dates = (params ?? []).filter((p) => typeof p === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p)) as string[];
      if (dates.length >= 2) windows.push({ from: dates[0]!, to: dates[1]! });
      else if (dates.length === 1) windows.push({ from: dates[0]!, to: dates[0]! });

      const inStep1 = opts.step1Hit && expenseFetches === 1;
      const inStep2 = opts.step2Hit && (opts.step1Hit ? expenseFetches === 2 : expenseFetches === 1);
      // For cascade: first fetch = step1 window, second = step2
      if (opts.step1Hit && expenseFetches === 1) {
        return { rows: [expenseRow("exp-s1", "2026-09-04")] };
      }
      if (!opts.step1Hit && opts.step2Hit && expenseFetches >= 1) {
        // Return on step2 fetch only — empty on step1
        const isStep1Window =
          dates.includes("2026-09-02") && dates.includes("2026-09-06"); // −3/+1 from 09-05
        if (isStep1Window) return { rows: [] };
        return { rows: [expenseRow("exp-s2", "2026-09-01")] }; // within −7/+2
      }
      if (opts.step1Hit) return { rows: [expenseRow("exp-s1", "2026-09-04")] };
      void inStep1;
      void inStep2;
      return { rows: [] };
    }
    // other ledger sources empty
    return { rows: [] };
  });
  return { getExpenseFetches: () => expenseFetches, getWindows: () => windows };
}

describe("MATCH_WINDOW_STEPS", () => {
  it("pins step1 {3,1} and step2 {7,2}", () => {
    expect(MATCH_WINDOW_STEPS.step1).toEqual({ before: 3, after: 1 });
    expect(MATCH_WINDOW_STEPS.step2).toEqual({ before: 7, after: 2 });
  });
});

describe("findCandidates date cascade (ROUND 207)", () => {
  it("(a) step-1 hit stops — no auto-widen", async () => {
    const { getExpenseFetches } = installMocks({ step1Hit: true });
    const result = await findCandidates({
      operating_company_id: TXN.operating_company_id,
      bank_transaction_id: "tx-1",
    });
    expect(result.window.step).toBe(1);
    expect(result.window.auto_widened).toBe(false);
    expect(result.window.from).toBe("2026-09-02");
    expect(result.window.to).toBe("2026-09-06");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(getExpenseFetches()).toBe(1);
  });

  it("(b) step-1 zero → step-2 with auto_widened", async () => {
    installMocks({ step1Hit: false, step2Hit: true });
    const result = await findCandidates({
      operating_company_id: TXN.operating_company_id,
      bank_transaction_id: "tx-1",
    });
    expect(result.window.step).toBe(2);
    expect(result.window.auto_widened).toBe(true);
    expect(result.window.from).toBe("2026-08-29");
    expect(result.window.to).toBe("2026-09-07");
    expect(result.candidates.some((c) => c.ledger_entry_id === "exp-s2")).toBe(true);
  });

  it("(c) step-2 zero → empty step 2, no third query", async () => {
    const { getExpenseFetches } = installMocks({ step1Hit: false, step2Hit: false });
    const result = await findCandidates({
      operating_company_id: TXN.operating_company_id,
      bank_transaction_id: "tx-1",
    });
    expect(result.window.step).toBe(2);
    expect(result.window.auto_widened).toBe(true);
    expect(result.candidates).toEqual([]);
    expect(getExpenseFetches()).toBe(2); // step1 + step2 only
  });

  it("(d) From/To overrides cascade", async () => {
    const { getExpenseFetches } = installMocks({ step1Hit: true });
    const result = await findCandidates({
      operating_company_id: TXN.operating_company_id,
      bank_transaction_id: "tx-1",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
    });
    expect(result.window.step).toBe("custom");
    expect(result.window.auto_widened).toBe(false);
    expect(result.window.from).toBe("2026-01-01");
    expect(result.window.to).toBe("2026-01-31");
    expect(getExpenseFetches()).toBe(1);
  });

  it("(e) payee filter overrides cascade (uses step-2 bounds)", async () => {
    installMocks({ step1Hit: false, step2Hit: true });
    const result = await findCandidates({
      operating_company_id: TXN.operating_company_id,
      bank_transaction_id: "tx-1",
      payee: "Vendor",
    });
    expect(result.window.step).toBe("custom");
    expect(result.window.auto_widened).toBe(false);
    expect(result.window.from).toBe("2026-08-29");
    expect(result.window.to).toBe("2026-09-07");
  });
});
