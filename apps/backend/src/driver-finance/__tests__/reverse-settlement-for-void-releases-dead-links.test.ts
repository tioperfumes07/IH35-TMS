// LEAD 443.192 (13:25Z follow-up) — reverseSettlementForVoid (Settlement Creator "Edit = void and repost" and
// POST /settlements/:id/reverse) voided the settlement's lines but left every OPEN driver bill and every unpaid
// reimbursement still pointing at the cancelled settlement (measured on prod: P-0085 1 open bill + 2 reimbursements,
// P-0092 2 reimbursements), so the repost / next settlement could never pick them up. Fail-old: on the pre-fix callee
// no UPDATE of driver_bills or driver_reimbursements is ever issued and the audit names nothing released.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ appendAudit: vi.fn() }));

vi.mock("../../accounting/settlement-posting/settlement-bill-payment-posting.service.js", () => ({
  reverseSettlementBillPaymentInClientTx: vi.fn(async () => ({ result: "nothing_to_reverse", settlement_id: "s", run_id: null })),
}));
vi.mock("../../accounting/void.service.js", () => ({
  unmatchBankTransactionById: vi.fn(async () => false),
  releaseBankLinesNamingDocument: vi.fn(async () => 0),
}));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mocks.appendAudit }));

import { reverseSettlementForVoid } from "../void-document-callees.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SETTLEMENT = "11111111-1111-4111-8111-111111111111";
const ACTOR = { userId: "33333333-3333-3333-3333-333333333333" };
const LINE = "44444444-4444-4444-8444-444444444444";
const BILL = "55555555-5555-4555-8555-555555555555";
const REIMB_A = "66666666-6666-4666-8666-666666666661";
const REIMB_B = "66666666-6666-4666-8666-666666666662";

type Q = { sql: string; values?: unknown[] };

function fakeClient() {
  const calls: Q[] = [];
  const client = {
    query: async <T,>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> => {
      calls.push({ sql, values });
      if (/FROM driver_finance\.driver_settlements/.test(sql) && /FOR UPDATE/.test(sql))
        return { rows: [{ id: SETTLEMENT, status: "closed", locked_at: null, paid_via_bank_txn_id: null }] as T[] };
      if (sql.includes("UPDATE driver_finance.settlement_lines")) return { rows: [{ id: LINE }] as T[] };
      if (sql.includes("UPDATE driver_finance.driver_bills")) return { rows: [{ id: BILL }] as T[] };
      if (sql.includes("UPDATE driver_finance.driver_reimbursements")) return { rows: [{ id: REIMB_A }, { id: REIMB_B }] as T[] };
      if (sql.includes("UPDATE driver_finance.driver_settlements") && sql.includes("RETURNING id::text, updated_at::text"))
        return { rows: [{ id: SETTLEMENT, updated_at: "2026-10-17T00:00:00Z" }] as T[] };
      return { rows: [] as T[] };
    },
  };
  return { client, calls };
}

describe("reverseSettlementForVoid — releases the dead settlement's open bills + unpaid reimbursements (443.192)", () => {
  beforeEach(() => {
    mocks.appendAudit.mockReset().mockResolvedValue(undefined);
  });

  it("voids lines once, releases open bills and unpaid reimbursements, and names them in the reversed audit", async () => {
    const { client, calls } = fakeClient();
    const res = await reverseSettlementForVoid(client, { operatingCompanyId: OPCO, settlementId: SETTLEMENT, reason: "Edit = void and repost", actor: ACTOR });

    // lines are voided exactly once (the inline UPDATE was replaced by the shared cascade — never applied twice)
    expect(calls.filter((c) => c.sql.includes("UPDATE driver_finance.settlement_lines")).length).toBe(1);

    const bills = calls.find((c) => c.sql.includes("UPDATE driver_finance.driver_bills"));
    expect(bills, "open driver bills must be released from the cancelled settlement").toBeDefined();
    expect(bills!.sql).toMatch(/settled_in_settlement_id = NULL/);
    expect(bills!.sql).toMatch(/status = 'open'/);

    const reimb = calls.find((c) => c.sql.includes("UPDATE driver_finance.driver_reimbursements"));
    expect(reimb, "unpaid reimbursements must be released from the cancelled settlement").toBeDefined();
    expect(reimb!.sql).toMatch(/applied_to_settlement_id = NULL/);
    expect(reimb!.sql).toMatch(/settlement_line_id = NULL/);
    expect(reimb!.sql).toMatch(/r\.paid_at IS NULL/);

    // deductions are NOT raw-voided on this path (owner-ruled deduction engine only)
    expect(calls.some((c) => c.sql.includes("UPDATE driver_finance.driver_settlement_deductions"))).toBe(false);

    // the release happens BEFORE the header flips to cancelled
    const reimbIdx = calls.findIndex((c) => c.sql.includes("UPDATE driver_finance.driver_reimbursements"));
    const flipIdx = calls.findIndex((c) => c.sql.includes("UPDATE driver_finance.driver_settlements") && c.sql.includes("status = 'cancelled'"));
    expect(flipIdx).toBeGreaterThan(reimbIdx);

    expect(res).toMatchObject({ settlementLinesVoided: [LINE], driverBillsReleased: [BILL], reimbursementsReleased: [REIMB_A, REIMB_B] });
    const reversed = mocks.appendAudit.mock.calls.find((c) => c[2] === "driver_finance.driver_settlement.reversed");
    expect(reversed).toBeDefined();
    expect(reversed![3]).toMatchObject({
      settlement_lines_voided: [LINE],
      driver_bills_released: [BILL],
      reimbursements_released: [REIMB_A, REIMB_B],
    });
  });
});
