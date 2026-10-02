import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateJe, mockResolveRole } = vi.hoisted(() => ({
  mockCreateJe: vi.fn(),
  mockResolveRole: vi.fn(),
}));
vi.mock("../../accounting/journal-entries.service.js", () => ({ createJournalEntryOnClient: mockCreateJe }));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRole }));

import {
  InterestAccrualError,
  compoundedInterestCents,
  computeInterestAccrualLines,
  decideInterestAccrual,
  periodBounds,
} from "../interest-accrual.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const RUN = "0199a000-0000-7000-8000-000000000001";
const MAKER = "0199a000-0000-7000-8000-0000000000aa";
const CHECKER = "0199a000-0000-7000-8000-0000000000bb";
const INV = "0199a000-0000-7000-8000-0000000000c1";
const CUST = "0199a000-0000-7000-8000-0000000000d1";

function client(rowsFor: (sql: string) => unknown[]) {
  return { query: vi.fn(async (sql: string) => ({ rows: rowsFor(sql), rowCount: 1 })) };
}

beforeEach(() => {
  mockCreateJe.mockReset().mockResolvedValue({ id: "je-1" });
  mockResolveRole.mockReset().mockImplementation(async (_c: unknown, _o: string, role: string) =>
    role === "default_interest_expense" ? "acct-6830" : role === "factor_default_interest_payable" ? "acct-2155" : "acct-other"
  );
});

describe("Faro default interest — contract math", () => {
  it("0.067%/day compounded daily, rounded each day", () => {
    expect(compoundedInterestCents(1_000_000, 0)).toBe(0);
    expect(compoundedInterestCents(1_000_000, 1)).toBe(670);
    // day 2 compounds on 1,000,670: 670.45 -> 670
    expect(compoundedInterestCents(1_000_000, 2)).toBe(1340);
    expect(compoundedInterestCents(1_000_000, 30)).toBeGreaterThan(30 * 670);
  });

  it("period bounds", () => {
    expect(periodBounds("2026-02")).toEqual({ period_start: "2026-02-01", period_end: "2026-02-28" });
    expect(() => periodBounds("2026-13")).toThrow(InterestAccrualError);
  });

  it("lines charge days past 35, net of earlier posted runs; day-35 or fully accrued lines drop out", async () => {
    const c = client(() => [
      { purchase_id: "p1", purchase_line_id: "l1", invoice_id: INV, customer_id: CUST, purchase_date: "2026-08-01", net_cents: "1000000", days_charged: 10, previously_accrued_cents: "0" },
      { purchase_id: "p1", purchase_line_id: "l2", invoice_id: INV, customer_id: CUST, purchase_date: "2026-08-01", net_cents: "1000000", days_charged: 10, previously_accrued_cents: String(compoundedInterestCents(1_000_000, 10)) },
      { purchase_id: "p1", purchase_line_id: "l3", invoice_id: INV, customer_id: CUST, purchase_date: "2026-09-01", net_cents: "1000000", days_charged: 0, previously_accrued_cents: "0" },
    ]);
    const lines = await computeInterestAccrualLines(c, OPCO, "2026-09-30");
    expect(lines.map((l) => l.purchase_line_id)).toEqual(["l1"]);
    expect(lines[0]!.accrual_cents).toBe(compoundedInterestCents(1_000_000, 10));
    expect(c.query.mock.calls[0]![1]).toEqual([OPCO, "2026-09-30", 35]);
  });
});

describe("Faro default interest — maker <> checker", () => {
  const proposed = (by = MAKER) => ({ state: "proposed", proposed_by_user_id: by, period_end: "2026-09-30", total_cents: "1500" });

  it("the proposer cannot approve their own run", async () => {
    const c = client((sql) => (sql.includes("FOR UPDATE") ? [proposed()] : []));
    await expect(
      decideInterestAccrual(c, { operating_company_id: OPCO, run_id: RUN, decision: "approve", actor_user_id: MAKER, actor_role: "Owner" })
    ).rejects.toThrow("interest_accrual_maker_cannot_approve");
    expect(mockCreateJe).not.toHaveBeenCalled();
  });

  it("approve posts one balanced JE: DR 6830 / CR 2155 per invoice, stamped to invoice + customer, dated period end", async () => {
    const c = client((sql) =>
      sql.includes("FOR UPDATE")
        ? [proposed()]
        : sql.includes("FROM accounting.factoring_interest_accrual_run_lines")
          ? [
              { invoice_id: INV, customer_id: CUST, accrual_cents: "1000", invoice_display_id: "INV-1" },
              { invoice_id: INV, customer_id: null, accrual_cents: "500", invoice_display_id: "INV-2" },
            ]
          : []
    );
    const res = await decideInterestAccrual(c, { operating_company_id: OPCO, run_id: RUN, decision: "approve", actor_user_id: CHECKER, actor_role: "Accountant" });
    expect(res).toEqual({ run_id: RUN, state: "posted", journal_entry_id: "je-1" });
    const je = mockCreateJe.mock.calls[0]![1];
    expect(je.entry_date).toBe("2026-09-30");
    expect(je.source).toBe("auto");
    const dr = je.postings.filter((p: { debit_or_credit: string }) => p.debit_or_credit === "debit");
    const cr = je.postings.filter((p: { debit_or_credit: string }) => p.debit_or_credit === "credit");
    expect(dr.every((p: { account_id: string }) => p.account_id === "acct-6830")).toBe(true);
    expect(cr.every((p: { account_id: string }) => p.account_id === "acct-2155")).toBe(true);
    expect(dr.reduce((s: number, p: { amount_cents: number }) => s + p.amount_cents, 0)).toBe(1500);
    expect(cr.reduce((s: number, p: { amount_cents: number }) => s + p.amount_cents, 0)).toBe(1500);
    expect(je.postings[0]).toMatchObject({ source_transaction_type: "invoice", source_transaction_id: INV, entity_type: "customer", entity_uuid: CUST });
    expect(mockResolveRole).not.toHaveBeenCalledWith(expect.anything(), OPCO, "factoring_advance_liability");
    const upd = c.query.mock.calls.find((x) => String(x[0]).includes("SET state = 'posted'"));
    expect(upd![1]).toEqual([RUN, OPCO, CHECKER, null, "je-1"]);
  });

  it("lines that do not tie to the run total refuse to post", async () => {
    const c = client((sql) =>
      sql.includes("FOR UPDATE")
        ? [proposed()]
        : sql.includes("FROM accounting.factoring_interest_accrual_run_lines")
          ? [{ invoice_id: INV, customer_id: CUST, accrual_cents: "1000", invoice_display_id: "INV-1" }]
          : []
    );
    await expect(
      decideInterestAccrual(c, { operating_company_id: OPCO, run_id: RUN, decision: "approve", actor_user_id: CHECKER, actor_role: "Owner" })
    ).rejects.toThrow("interest_accrual_run_lines_do_not_tie");
    expect(mockCreateJe).not.toHaveBeenCalled();
  });

  it("reject posts nothing", async () => {
    const c = client((sql) => (sql.includes("FOR UPDATE") ? [proposed()] : []));
    const res = await decideInterestAccrual(c, { operating_company_id: OPCO, run_id: RUN, decision: "reject", actor_user_id: CHECKER, actor_role: "Owner", note: "wait for Faro statement" });
    expect(res.state).toBe("rejected");
    expect(mockCreateJe).not.toHaveBeenCalled();
  });

  it("a decided run cannot be decided again", async () => {
    const c = client((sql) => (sql.includes("FOR UPDATE") ? [{ ...proposed(), state: "posted" }] : []));
    await expect(
      decideInterestAccrual(c, { operating_company_id: OPCO, run_id: RUN, decision: "approve", actor_user_id: CHECKER, actor_role: "Owner" })
    ).rejects.toThrow("interest_accrual_run_already_decided");
  });
});
