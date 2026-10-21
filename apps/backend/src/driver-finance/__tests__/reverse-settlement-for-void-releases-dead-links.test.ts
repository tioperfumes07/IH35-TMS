// LEAD 443.192 (13:25Z follow-up) — reverseSettlementForVoid (Settlement Creator "Edit = void and repost" and
// POST /settlements/:id/reverse) voided the settlement's lines but left every OPEN driver bill and every unpaid
// reimbursement still pointing at the cancelled settlement (measured on prod: P-0085 1 open bill + 2 reimbursements,
// P-0092 2 reimbursements), so the repost / next settlement could never pick them up. Fail-old: on the pre-fix callee
// no UPDATE of driver_bills or driver_reimbursements is ever issued and the audit names nothing released.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendAudit: vi.fn(),
  glReversal: vi.fn(async () => ({ result: "nothing_to_reverse", settlement_id: "s", run_id: null }) as { result: string; settlement_id: string; run_id: string | null }),
}));

vi.mock("../../accounting/settlement-posting/settlement-bill-payment-posting.service.js", () => ({
  reverseSettlementBillPaymentInClientTx: mocks.glReversal,
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

// LEAD 443.193 — deductions applied to the settlement (the never-posted restore's FOR UPDATE loader).
const DED_PENDING = "77777777-7777-4777-8777-777777777771";
const DED_PENDING_BUCKET = "77777777-7777-4777-8777-777777777772";
const DED_APPLIED = "77777777-7777-4777-8777-777777777773";
const DED_VOIDED = "77777777-7777-4777-8777-777777777774";
const DED_PARTIAL = "77777777-7777-4777-8777-777777777775";
const BUCKET = "88888888-8888-4888-8888-888888888888";
type DedRow = { id: string; deduction_type: string; amount_cents: string; reason: string | null; bucket_id: string | null; source_expense_id: string | null; status: string; is_voided: boolean };
const LINKED_DEDUCTIONS: DedRow[] = [
  { id: DED_PENDING, deduction_type: "admin_fee", amount_cents: "1000", reason: null, bucket_id: null, source_expense_id: null, status: "pending", is_voided: false },
  { id: DED_PENDING_BUCKET, deduction_type: "advance", amount_cents: "5000", reason: null, bucket_id: BUCKET, source_expense_id: null, status: "pending", is_voided: false },
  { id: DED_APPLIED, deduction_type: "fuel", amount_cents: "2500", reason: null, bucket_id: null, source_expense_id: null, status: "applied", is_voided: false },
  { id: DED_VOIDED, deduction_type: "fuel", amount_cents: "700", reason: null, bucket_id: null, source_expense_id: null, status: "pending", is_voided: true },
  { id: DED_PARTIAL, deduction_type: "lease", amount_cents: "9000", reason: null, bucket_id: BUCKET, source_expense_id: null, status: "partial", is_voided: false },
];

function fakeClient(opts: { deductions?: DedRow[]; bucketNetCents?: string } = {}) {
  const calls: Q[] = [];
  const client = {
    query: async <T,>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> => {
      calls.push({ sql, values });
      if (/FROM driver_finance\.driver_settlements/.test(sql) && /FOR UPDATE/.test(sql))
        return { rows: [{ id: SETTLEMENT, status: "closed", locked_at: null, paid_via_bank_txn_id: null }] as T[] };
      if (sql.includes("UPDATE driver_finance.settlement_lines")) return { rows: [{ id: LINE }] as T[] };
      if (sql.includes("UPDATE driver_finance.driver_bills")) return { rows: [{ id: BILL }] as T[] };
      if (/FROM driver_finance\.driver_settlement_deductions/.test(sql) && /FOR UPDATE/.test(sql) && /is_voided/.test(sql))
        return { rows: (opts.deductions ?? []) as T[] };
      if (/FROM driver_finance\.driver_deduction_bucket_events/.test(sql)) return { rows: [{ net_cents: opts.bucketNetCents ?? "0" }] as T[] };
      if (sql.includes("UPDATE driver_finance.driver_deduction_buckets")) return { rows: [{ remaining_balance_cents: 5000 }] as T[] };
      if (sql.includes("UPDATE driver_finance.driver_settlement_deductions")) return { rows: [{ id: values?.[0] }] as T[] };
      if (sql.includes("UPDATE driver_finance.driver_reimbursements")) return { rows: [{ id: REIMB_A }, { id: REIMB_B }] as T[] };
      if (sql.includes("UPDATE driver_finance.driver_settlements") && sql.includes("SET trip_closed_at")) return { rows: [{ id: SETTLEMENT }] as T[] };
      if (sql.includes("UPDATE driver_finance.driver_settlements") && sql.includes("RETURNING voided_at::text"))
        return { rows: [{ voided_at: "2026-10-17T00:00:00Z" }] as T[] };
      return { rows: [] as T[] };
    },
  };
  return { client, calls };
}

describe("reverseSettlementForVoid — releases the dead settlement's open bills + unpaid reimbursements (443.192)", () => {
  beforeEach(() => {
    mocks.appendAudit.mockReset().mockResolvedValue(undefined);
    mocks.glReversal.mockReset().mockResolvedValue({ result: "nothing_to_reverse", settlement_id: SETTLEMENT, run_id: null });
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

  // LEAD 443.193 (Lead 14:05Z (b)) — /reverse with NOTHING to reverse. Fail-old: on the pre-fix callee no
  // driver_settlement_deductions UPDATE is ever issued here, so a pending deduction stays applied_to_settlement_id = the
  // now-cancelled settlement forever (every apply writer selects applied_to_settlement_id IS NULL).
  it("nothing_to_reverse: releases pending deductions to pre-settlement state through the restore engine; never touches collected/voided ones", async () => {
    const { client, calls } = fakeClient({ deductions: LINKED_DEDUCTIONS });
    const res = await reverseSettlementForVoid(client, { operatingCompanyId: OPCO, settlementId: SETTLEMENT, reason: "Edit = void and repost", actor: ACTOR });

    const dedUpdates = calls.filter((c) => c.sql.includes("UPDATE driver_finance.driver_settlement_deductions"));
    expect(dedUpdates.map((c) => c.values?.[0]), "only the plain pending, unvoided deductions are released").toEqual([DED_PENDING, DED_PENDING_BUCKET]);
    for (const u of dedUpdates) {
      expect(u.sql).toMatch(/applied_to_settlement_id = NULL/);
      expect(u.sql).toMatch(/status = 'pending'/);
      expect(u.sql).toMatch(/remaining_balance_cents = amount_cents/);
      expect(u.sql).toMatch(/applied_to_settlement_id = \$3::uuid/);
      expect(u.sql, "a deduction is never voided / forgiven").not.toMatch(/voided_at/);
      expect(u.values?.[2]).toBe(SETTLEMENT);
    }
    // the bucket was never drawn (no application event) -> never credited back
    expect(calls.some((c) => c.sql.includes("UPDATE driver_finance.driver_deduction_buckets"))).toBe(false);

    // release happens BEFORE the header flips to cancelled
    const lastDed = calls.map((c) => c.sql.includes("UPDATE driver_finance.driver_settlement_deductions")).lastIndexOf(true);
    const flipIdx = calls.findIndex((c) => c.sql.includes("UPDATE driver_finance.driver_settlements") && c.sql.includes("status = 'cancelled'"));
    expect(flipIdx).toBeGreaterThan(lastDed);

    expect(res).toMatchObject({ deductionsReleased: [DED_PENDING, DED_PENDING_BUCKET], deductionsRetained: [DED_APPLIED, DED_VOIDED, DED_PARTIAL] });
    const reversed = mocks.appendAudit.mock.calls.find((c) => c[2] === "driver_finance.driver_settlement.reversed");
    expect(reversed![3]).toMatchObject({
      gl_reversal_result: "nothing_to_reverse",
      deductions_released: [DED_PENDING, DED_PENDING_BUCKET],
      deductions_retained: [DED_APPLIED, DED_VOIDED, DED_PARTIAL],
    });
  });

  it("nothing_to_reverse: a bucket application the ledger DID record for this settlement is reversed for exactly that amount", async () => {
    const { client, calls } = fakeClient({ deductions: [LINKED_DEDUCTIONS[1]!], bucketNetCents: "5000" });
    await reverseSettlementForVoid(client, { operatingCompanyId: OPCO, settlementId: SETTLEMENT, reason: "r", actor: ACTOR });
    const bucket = calls.filter((c) => c.sql.includes("UPDATE driver_finance.driver_deduction_buckets"));
    expect(bucket).toHaveLength(1);
    expect(bucket[0]!.values?.slice(0, 2)).toEqual([BUCKET, 5000]);
    expect(calls.some((c) => c.sql.includes("INSERT INTO driver_finance.driver_deduction_bucket_events") && c.values?.[2] === "reversal")).toBe(true);
  });

  it("reversed: the GL reversal engine already restored the deductions — the callee does not run a second restore", async () => {
    mocks.glReversal.mockResolvedValue({ result: "reversed", settlement_id: SETTLEMENT, run_id: "99999999-9999-4999-8999-999999999999" });
    const { client, calls } = fakeClient({ deductions: LINKED_DEDUCTIONS });
    const res = await reverseSettlementForVoid(client, { operatingCompanyId: OPCO, settlementId: SETTLEMENT, reason: "r", actor: ACTOR });
    expect(calls.some((c) => c.sql.includes("UPDATE driver_finance.driver_settlement_deductions"))).toBe(false);
    expect(res).toMatchObject({ deductionsReleased: [], deductionsRetained: [] });
  });
  // LEAD 443.198 — fail-old: Creator "Edit = void and repost" cancelled P-0085 / P-0092 with trip_closed_at still NULL
  // (dead settlement left "trip open + live anchor", guard 3069). The shared cascade now closes the trip before the flip.
  it("closes the load_bookended trip before the header flip and names it in the reversed audit", async () => {
    const { client, calls } = fakeClient();
    await reverseSettlementForVoid(client, { operatingCompanyId: OPCO, settlementId: SETTLEMENT, reason: "Edit = void and repost", actor: ACTOR });
    const tripIdx = calls.findIndex((c) => c.sql.includes("UPDATE driver_finance.driver_settlements") && c.sql.includes("SET trip_closed_at"));
    const flipIdx = calls.findIndex((c) => c.sql.includes("UPDATE driver_finance.driver_settlements") && c.sql.includes("status = 'cancelled'"));
    expect(tripIdx, "the void must close the bookend trip").toBeGreaterThan(-1);
    expect(flipIdx).toBeGreaterThan(tripIdx);
    const reversed = mocks.appendAudit.mock.calls.find((c) => c[2] === "driver_finance.driver_settlement.reversed");
    expect(reversed![3]).toMatchObject({ trip_closed: true });
  });
});
