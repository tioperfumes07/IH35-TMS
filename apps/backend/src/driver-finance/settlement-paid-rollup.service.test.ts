import { describe, expect, it, vi } from "vitest";

vi.mock("../auth/db.js", () => ({ withCurrentUser: vi.fn() }));
vi.mock("../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));

import { decideSettlementPaidTransition, rollupSettlementPaidStatusInClientTx, type SettlementNetPaidRow } from "./settlement-paid-rollup.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

function row(over: Partial<SettlementNetPaidRow>): SettlementNetPaidRow {
  return {
    settlement_id: "11111111-1111-1111-1111-111111111111",
    display_id: "P-0117",
    payment_state: "unpaid",
    net_cents: "32951",
    bill_count: "1",
    open_cents: "0",
    dead_bills: "0",
    cash_cents: "32951",
    last_payment_date: "2026-10-22",
    bill_payment_ids: ["bp-1"],
    last_method: "ach",
    last_reference: "REF",
    fully_paid: true,
    paid_by_rollup: false,
    ...over,
  };
}

function fakeClient(rows: SettlementNetPaidRow[]) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    calls,
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("WITH scope AS")) return { rows };
      if (sql.includes("UPDATE driver_finance.driver_settlements")) return { rows: [{ id: rows[0]?.settlement_id }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }),
  };
}

describe("ACCT-F11081 settlement paid rollup", () => {
  it("marks paid only when real cash fully pays net, from a state with no disbursement on record", () => {
    expect(decideSettlementPaidTransition({ payment_state: "unpaid", fully_paid: true, paid_by_rollup: false })).toBe("mark_paid");
    expect(decideSettlementPaidTransition({ payment_state: null, fully_paid: true, paid_by_rollup: false })).toBe("mark_paid");
    expect(decideSettlementPaidTransition({ payment_state: "sent_to_bank", fully_paid: true, paid_by_rollup: false })).toBe("none");
    expect(decideSettlementPaidTransition({ payment_state: "manual_paid", fully_paid: true, paid_by_rollup: false })).toBe("none");
    expect(decideSettlementPaidTransition({ payment_state: "unpaid", fully_paid: false, paid_by_rollup: false })).toBe("none");
  });

  it("reopens only what it marked itself — never a human Mark Paid", () => {
    expect(decideSettlementPaidTransition({ payment_state: "manual_paid", fully_paid: false, paid_by_rollup: true })).toBe("reopen");
    expect(decideSettlementPaidTransition({ payment_state: "manual_paid", fully_paid: false, paid_by_rollup: false })).toBe("none");
  });

  it("writes the paid state, an event carrying the payment ids, and nothing when no payment document exists", async () => {
    const paid = fakeClient([row({})]);
    const res = await rollupSettlementPaidStatusInClientTx(paid, OPCO, { billIds: ["b-1"] }, "u-1");
    expect(res.marked_paid).toEqual(["11111111-1111-1111-1111-111111111111"]);
    const ev = paid.calls.find((c) => c.sql.includes("INSERT INTO driver_finance.settlement_payment_events"));
    expect(JSON.parse(String(ev?.values?.[2]))).toMatchObject({ source: "bill_payment", bill_payment_ids: ["bp-1"], cash_cents: 32951 });

    const unpaid = fakeClient([row({ fully_paid: false, cash_cents: "0", open_cents: "32951", bill_payment_ids: null })]);
    const res2 = await rollupSettlementPaidStatusInClientTx(unpaid, OPCO, {}, "u-1");
    expect(res2.marked_paid).toEqual([]);
    expect(unpaid.calls.some((c) => c.sql.includes("UPDATE driver_finance.driver_settlements"))).toBe(false);
  });

  it("passes NULL scope arrays for an all-settlement repair", async () => {
    const c = fakeClient([]);
    await rollupSettlementPaidStatusInClientTx(c, OPCO, {}, "u-1");
    expect(c.calls[0]?.values).toEqual([OPCO, null, null]);
  });
});
