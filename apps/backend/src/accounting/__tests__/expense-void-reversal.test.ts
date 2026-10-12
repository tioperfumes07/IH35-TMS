/**
 * ACCT-F4431310 — the expense void never swallows a reversal error: when the document has a live fuel_event entry and the
 * canonical reverser refuses, the error propagates (the void transaction rolls back, the document stays live). On the old
 * code the void caught SOURCE_NOT_FOUND from an 'expense'-only reversal and went on to stamp the document void.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../void.service.js", () => ({
  postVoidReversal: vi.fn(async () => {
    throw new Error("period_locked: reversal refused");
  }),
}));
vi.mock("../posting-engine.service.js", () => ({
  reversePostedSourceTransactionInClientTx: vi.fn(async () => ({ journal_entry_id: "rev-expense" })),
}));
vi.mock("../fuel-posting/poster.service.js", () => ({
  findPostedFuelReceipt: vi.fn(async () => ({ journal_entry_id: "je-fuel" })),
}));

import { reverseExpenseDocumentInClientTx, resolveExpenseDocumentLivePostings } from "../expense-void-reversal.js";

function fakeClient(opts: { expenseLive: boolean; fuelSources: string[] }) {
  return {
    query: vi.fn(async (sql: string) => {
      if (/source_transaction_type = 'expense'/.test(sql)) return { rows: [{ live: opts.expenseLive }] };
      if (/SELECT journal_entry_id::text AS je/.test(sql)) return { rows: [{ je: "je-fuel" }] };
      if (/source_transaction_type = 'fuel_event'/.test(sql)) return { rows: opts.fuelSources.map((id) => ({ id })) };
      if (/transaction_date::text AS d/.test(sql)) return { rows: [{ d: "2026-10-12" }] };
      return { rows: [] };
    }),
  };
}

describe("expense void reversal (ACCT-F4431310)", () => {
  it("a fuel receipt document with no 'expense' lines is still live through its fuel_event entry", async () => {
    const live = await resolveExpenseDocumentLivePostings(fakeClient({ expenseLive: false, fuelSources: ["fill-1"] }), "co", "exp-1");
    expect(live).toEqual({ expense_source_live: false, fuel_event_sources: ["fill-1"] });
  });

  it("a refused fuel reversal propagates — the void is refused, never stamped over a live entry", async () => {
    await expect(
      reverseExpenseDocumentInClientTx(fakeClient({ expenseLive: false, fuelSources: ["fill-1"] }), {
        operatingCompanyId: "co", expenseId: "exp-1", actorUserId: "u", currentBusinessDate: "2026-10-12", memo: "m", expenseReverser: "source",
      })
    ).rejects.toThrow(/period_locked/);
  });

  it("nothing live -> null reversal, no reverser called (an unposted document is a status change)", async () => {
    const r = await reverseExpenseDocumentInClientTx(fakeClient({ expenseLive: false, fuelSources: [] }), {
      operatingCompanyId: "co", expenseId: "exp-1", actorUserId: "u", currentBusinessDate: "2026-10-12", memo: "m", expenseReverser: "source",
    });
    expect(r).toEqual({ reversal_journal_entry_id: null, reversed: [] });
  });

  it("own 'expense' lines go through the caller's expense reverser", async () => {
    const r = await reverseExpenseDocumentInClientTx(fakeClient({ expenseLive: true, fuelSources: [] }), {
      operatingCompanyId: "co", expenseId: "exp-1", actorUserId: "u", currentBusinessDate: "2026-10-12", memo: "m", expenseReverser: "source",
    });
    expect(r.reversal_journal_entry_id).toBe("rev-expense");
  });
});
