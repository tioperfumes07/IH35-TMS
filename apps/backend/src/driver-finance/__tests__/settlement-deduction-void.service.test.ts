import { describe, expect, it, vi } from "vitest";
import { DeductionVoidError, voidSettlementDeduction } from "../settlement-deduction-void.service.js";

// ACCT-SETL-DEDUCTION-VOID-DESIGN — owner ruling: one route, three branches keyed off status.
// Mock the money-moving primitives (JE posting, account resolution) the same way
// accident-liabilities.service.test.ts does, so these tests exercise this file's OWN branching
// logic, not re-derive account resolution or JE mechanics that are already tested elsewhere.
vi.mock("../../accounting/journal-entries.service.js", () => ({
  createJournalEntryOnClient: vi.fn(async () => ({ id: "je-reversal-1" })),
}));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccountOptional: vi.fn(async (_client: unknown, _opco: string, role: string) =>
    role === "ap_control" ? "ap-account-1" : `${role}-account-1`
  ),
  isCoaRole: vi.fn(() => true),
}));
vi.mock("../../accounting/settlement-posting/settlement-bill-payment-posting.service.js", () => ({
  resolveDriverOwnAccount: vi.fn(async (_client: unknown, _opco: string, _driverId: string, _name: string, kind: string) =>
    `driver-${kind}-account-1`
  ),
}));

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DEDUCTION_ID = "11111111-1111-1111-1111-111111111111";
const DRIVER_ID = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";

function makeClient(row: Record<string, unknown> | null) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (/SELECT id::text, operating_company_id::text, driver_id::text.*FROM driver_finance\.driver_settlement_deductions/s.test(sql)) {
        return { rows: row ? [row] : [] };
      }
      if (/SELECT bucket_type FROM driver_finance\.driver_deduction_buckets/.test(sql)) {
        return { rows: [{ bucket_type: "damage" }] };
      }
      if (/SELECT concat_ws\(' ', first_name, last_name\)/.test(sql)) {
        return { rows: [{ driver_name: "Test Driver", hire_date: null }] };
      }
      return { rows: [] };
    }),
  };
  return { client, calls };
}

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DEDUCTION_ID,
    operating_company_id: OPCO,
    driver_id: DRIVER_ID,
    deduction_type: "damage",
    amount_cents: "10000",
    remaining_balance_cents: "10000",
    status: "pending",
    bucket_id: null,
    voided_at: null,
    ...overrides,
  };
}

describe("voidSettlementDeduction — ACCT-SETL-DEDUCTION-VOID-DESIGN", () => {
  it("throws deduction_not_found when the row doesn't exist", async () => {
    const { client } = makeClient(null);
    await expect(
      voidSettlementDeduction(client, { operating_company_id: OPCO, deduction_id: DEDUCTION_ID, reason: "test", actor_user_id: ACTOR })
    ).rejects.toThrow(DeductionVoidError);
  });

  it("throws deduction_already_voided when voided_at is already set", async () => {
    const { client } = makeClient(baseRow({ voided_at: "2026-01-01T00:00:00Z" }));
    await expect(
      voidSettlementDeduction(client, { operating_company_id: OPCO, deduction_id: DEDUCTION_ID, reason: "test", actor_user_id: ACTOR })
    ).rejects.toMatchObject({ code: "deduction_already_voided" });
  });

  it("requires a non-empty reason", async () => {
    const { client } = makeClient(baseRow());
    await expect(
      voidSettlementDeduction(client, { operating_company_id: OPCO, deduction_id: DEDUCTION_ID, reason: "   ", actor_user_id: ACTOR })
    ).rejects.toMatchObject({ code: "void_reason_required" });
  });

  describe("PENDING branch — nothing collected, void outright, no money moved", () => {
    it("stamps the void register and zeroes remaining_balance_cents, no JE", async () => {
      const { client, calls } = makeClient(baseRow({ status: "pending", remaining_balance_cents: "10000" }));
      const result = await voidSettlementDeduction(client, {
        operating_company_id: OPCO,
        deduction_id: DEDUCTION_ID,
        reason: "created by mistake",
        actor_user_id: ACTOR,
      });
      expect(result.outcome).toBe("voided_pending");
      expect(result.collected_cents).toBe(0);
      expect(result.reversed_cents).toBe(0);
      expect(result.journal_entry_id).toBeNull();

      const update = calls.find((c) => c.sql.includes("UPDATE driver_finance.driver_settlement_deductions"));
      expect(update, "expected an UPDATE").toBeTruthy();
      expect(update!.sql).toMatch(/remaining_balance_cents\s*=\s*0/);
      expect(update!.sql).toMatch(/voided_at\s*=\s*now\(\)/);
      expect(update!.sql).toMatch(/void_reason\s*=\s*\$2/);
      expect(update!.sql).toMatch(/voided_by_user_id\s*=\s*\$3::uuid/);
      expect(update!.values).toEqual([DEDUCTION_ID, "created by mistake", ACTOR]);

      const { createJournalEntryOnClient } = await import("../../accounting/journal-entries.service.js");
      expect(createJournalEntryOnClient).not.toHaveBeenCalled();
    });
  });

  describe("PARTIAL branch — some collected, void only the uncollected remainder", () => {
    it("zeroes remaining_balance_cents (stops future collection) but records the collected amount in void_reason, no JE, no touch to the collected portion", async () => {
      // amount_cents=10000, remaining=4000 -> 6000 already collected.
      const { client, calls } = makeClient(baseRow({ status: "partial", amount_cents: "10000", remaining_balance_cents: "4000" }));
      const result = await voidSettlementDeduction(client, {
        operating_company_id: OPCO,
        deduction_id: DEDUCTION_ID,
        reason: "driver disputes remaining schedule",
        actor_user_id: ACTOR,
      });
      expect(result.outcome).toBe("voided_partial_remainder");
      expect(result.collected_cents).toBe(6000);
      expect(result.reversed_cents).toBe(0);
      expect(result.journal_entry_id).toBeNull();

      const update = calls.find((c) => c.sql.includes("UPDATE driver_finance.driver_settlement_deductions"));
      expect(update!.sql).toMatch(/remaining_balance_cents\s*=\s*0/);
      expect(String(update!.values[1])).toContain("$60.00 already collected retained");

      const { createJournalEntryOnClient } = await import("../../accounting/journal-entries.service.js");
      expect(createJournalEntryOnClient).not.toHaveBeenCalled();
    });
  });

  describe("APPLIED branch — fully collected, NOT a void, a reversing JE that credits the driver back", () => {
    it("posts a balanced 2-line JE (debit the deduction's own account, credit ap_control) and records void_reversal_entry_id", async () => {
      const { client, calls } = makeClient(baseRow({ status: "applied", amount_cents: "10000", remaining_balance_cents: "0", bucket_id: "bucket-1" }));
      const result = await voidSettlementDeduction(client, {
        operating_company_id: OPCO,
        deduction_id: DEDUCTION_ID,
        reason: "damage claim was withdrawn after collection",
        actor_user_id: ACTOR,
      });
      expect(result.outcome).toBe("reversed_applied");
      expect(result.collected_cents).toBe(10000);
      expect(result.reversed_cents).toBe(10000);
      expect(result.journal_entry_id).toBe("je-reversal-1");

      const { createJournalEntryOnClient } = await import("../../accounting/journal-entries.service.js");
      expect(createJournalEntryOnClient).toHaveBeenCalledTimes(1);
      const [, jeInput] = vi.mocked(createJournalEntryOnClient).mock.calls[0]!;
      expect(jeInput.postings).toHaveLength(2);
      const debit = jeInput.postings.find((p: { debit_or_credit: string }) => p.debit_or_credit === "debit");
      const credit = jeInput.postings.find((p: { debit_or_credit: string }) => p.debit_or_credit === "credit");
      expect(debit).toMatchObject({ amount_cents: 10000, account_id: "damage_recovery-account-1" });
      expect(credit).toMatchObject({ amount_cents: 10000, account_id: "ap-account-1" });

      const update = calls.find((c) => c.sql.includes("UPDATE driver_finance.driver_settlement_deductions"));
      expect(update!.sql).toMatch(/void_reversal_entry_id\s*=\s*\$4::uuid/);
      expect(update!.values).toEqual([DEDUCTION_ID, "damage claim was withdrawn after collection", ACTOR, "je-reversal-1"]);
    });

    it("routes an advance-type deduction to the driver's OWN advance account, not the shared recovery account", async () => {
      const { client } = makeClient(baseRow({ status: "applied", deduction_type: "cash_advance", amount_cents: "5000", remaining_balance_cents: "0" }));
      const result = await voidSettlementDeduction(client, {
        operating_company_id: OPCO,
        deduction_id: DEDUCTION_ID,
        reason: "advance repayment reversed",
        actor_user_id: ACTOR,
      });
      expect(result.outcome).toBe("reversed_applied");
      const { createJournalEntryOnClient } = await import("../../accounting/journal-entries.service.js");
      const [, jeInput] = vi.mocked(createJournalEntryOnClient).mock.calls.at(-1)!;
      const debit = jeInput.postings.find((p: { debit_or_credit: string }) => p.debit_or_credit === "debit");
      expect(debit).toMatchObject({ account_id: "driver-advance-account-1" });
    });
  });

  it("fails closed on an unrecognized status (e.g. 'deferred') rather than guessing a treatment", async () => {
    const { client } = makeClient(baseRow({ status: "deferred" }));
    await expect(
      voidSettlementDeduction(client, { operating_company_id: OPCO, deduction_id: DEDUCTION_ID, reason: "test", actor_user_id: ACTOR })
    ).rejects.toMatchObject({ code: "deduction_status_not_voidable" });
  });
});
