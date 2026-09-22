import { describe, expect, it, vi } from "vitest";

// VOID-DOCUMENT-CALLEES (Round 35.3): reverseSettlementForVoid must refuse exactly where
// POST /settlements/:id/reverse already refuses (paid/locked/not_found/already_cancelled) BEFORE
// ever calling the GL reversal engine, and reverseDeductionForVoid must never surface a
// reversalJournalEntryId for an already-collected ('applied') deduction — the owner's
// "why would I forgive the debt" ruling, proved here rather than assumed.
vi.mock("../../accounting/settlement-posting/settlement-bill-payment-posting.service.js", () => ({
  reverseSettlementBillPaymentInClientTx: vi.fn(async () => ({ result: "reversed", settlement_id: "s-1", run_id: null })),
}));
vi.mock("../../accounting/void.service.js", () => ({
  unmatchBankTransactionById: vi.fn(async () => false),
}));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

import {
  reverseSettlementForVoid,
  reverseDeductionForVoid,
  SettlementVoidBlockedError,
} from "../void-document-callees.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SETTLEMENT_ID = "11111111-1111-1111-1111-111111111111";
const DEDUCTION_ID = "22222222-2222-2222-2222-222222222222";
const ACTOR = { userId: "33333333-3333-3333-3333-333333333333" };

function makeSettlementClient(row: Record<string, unknown> | null) {
  return {
    query: vi.fn(async (sql: string) => {
      if (/FROM driver_finance\.driver_settlements/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rows: row ? [row] : [] };
      }
      if (/UPDATE driver_finance\.driver_settlements/.test(sql) && /RETURNING id::text, updated_at::text/.test(sql)) {
        return { rows: [{ id: SETTLEMENT_ID, updated_at: "2026-09-23T00:00:00Z" }] };
      }
      return { rows: [] };
    }),
  };
}

describe("reverseSettlementForVoid — VOID-DOCUMENT-CALLEES", () => {
  it("throws settlement_not_found when the row doesn't exist", async () => {
    const client = makeSettlementClient(null);
    await expect(
      reverseSettlementForVoid(client, { operatingCompanyId: OPCO, settlementId: SETTLEMENT_ID, reason: "test", actor: ACTOR })
    ).rejects.toThrow(SettlementVoidBlockedError);
  });

  it("throws settlement_reverse_blocked_paid for a paid settlement, never reaching the GL engine", async () => {
    const client = makeSettlementClient({ id: SETTLEMENT_ID, status: "paid", locked_at: null, paid_via_bank_txn_id: null });
    await expect(
      reverseSettlementForVoid(client, { operatingCompanyId: OPCO, settlementId: SETTLEMENT_ID, reason: "test", actor: ACTOR })
    ).rejects.toMatchObject({ code: "settlement_reverse_blocked_paid" });
  });

  it("throws settlement_reverse_blocked_locked for a locked settlement", async () => {
    const client = makeSettlementClient({ id: SETTLEMENT_ID, status: "open", locked_at: "2026-09-01T00:00:00Z", paid_via_bank_txn_id: null });
    await expect(
      reverseSettlementForVoid(client, { operatingCompanyId: OPCO, settlementId: SETTLEMENT_ID, reason: "test", actor: ACTOR })
    ).rejects.toMatchObject({ code: "settlement_reverse_blocked_locked" });
  });

  it("throws settlement_already_cancelled when already cancelled", async () => {
    const client = makeSettlementClient({ id: SETTLEMENT_ID, status: "cancelled", locked_at: null, paid_via_bank_txn_id: null });
    await expect(
      reverseSettlementForVoid(client, { operatingCompanyId: OPCO, settlementId: SETTLEMENT_ID, reason: "test", actor: ACTOR })
    ).rejects.toMatchObject({ code: "settlement_already_cancelled" });
  });

  it("succeeds for an open, unlocked, unpaid settlement and returns a voidedAt", async () => {
    const client = makeSettlementClient({ id: SETTLEMENT_ID, status: "open", locked_at: null, paid_via_bank_txn_id: null });
    const result = await reverseSettlementForVoid(client, {
      operatingCompanyId: OPCO,
      settlementId: SETTLEMENT_ID,
      reason: "test reversal",
      actor: ACTOR,
    });
    expect(result.voidedAt).toBe("2026-09-23T00:00:00Z");
    expect(result.glReversalResult).toBe("reversed");
  });
});

describe("reverseDeductionForVoid — VOID-DOCUMENT-CALLEES", () => {
  function makeDeductionClient(row: Record<string, unknown>) {
    return {
      query: vi.fn(async (sql: string) => {
        if (/SELECT id::text, operating_company_id::text, driver_id::text.*FROM driver_finance\.driver_settlement_deductions/s.test(sql)) {
          return { rows: [row] };
        }
        if (/SELECT voided_at::text FROM driver_finance\.driver_settlement_deductions/.test(sql)) {
          return { rows: [{ voided_at: "2026-09-23T00:00:00Z" }] };
        }
        return { rows: [] };
      }),
    };
  }

  it("NEVER returns a reversalJournalEntryId for an already-collected (applied) deduction — owner ruling 2026-09-05", async () => {
    const client = makeDeductionClient({
      id: DEDUCTION_ID,
      operating_company_id: OPCO,
      driver_id: "44444444-4444-4444-4444-444444444444",
      deduction_type: "damage",
      amount_cents: "10000",
      remaining_balance_cents: "0",
      status: "applied",
      bucket_id: null,
      voided_at: null,
    });
    const result = await reverseDeductionForVoid(client, {
      operatingCompanyId: OPCO,
      deductionId: DEDUCTION_ID,
      reason: "test",
      actor: ACTOR,
    });
    expect(result.reversalJournalEntryId).toBeNull();
    expect(result.outcome).toBe("voided_applied_retained");
  });

  it("voids a pending deduction with no reversal JE either (nothing was ever collected)", async () => {
    const client = makeDeductionClient({
      id: DEDUCTION_ID,
      operating_company_id: OPCO,
      driver_id: "44444444-4444-4444-4444-444444444444",
      deduction_type: "damage",
      amount_cents: "10000",
      remaining_balance_cents: "10000",
      status: "pending",
      bucket_id: null,
      voided_at: null,
    });
    const result = await reverseDeductionForVoid(client, {
      operatingCompanyId: OPCO,
      deductionId: DEDUCTION_ID,
      reason: "test",
      actor: ACTOR,
    });
    expect(result.reversalJournalEntryId).toBeNull();
    expect(result.outcome).toBe("voided_pending");
  });
});
