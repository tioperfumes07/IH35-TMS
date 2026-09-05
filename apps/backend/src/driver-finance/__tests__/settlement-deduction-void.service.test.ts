import { describe, expect, it, vi } from "vitest";
import { DeductionVoidError, voidSettlementDeduction } from "../settlement-deduction-void.service.js";

// ACCT-SETL-DEDUCTION-VOID-DESIGN — OWNER RULING 2026-09-05 19:44Z: one route, three branches keyed
// off status, NONE of which forgive/refund/write off the debt. journal-entries.service is mocked
// only to prove NO branch (including APPLIED, since the owner's ruling) ever calls it.
vi.mock("../../accounting/journal-entries.service.js", () => ({
  createJournalEntryOnClient: vi.fn(async () => ({ id: "je-reversal-1" })),
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

  describe("APPLIED branch — fully collected — RECORD-ONLY void, never a refund (owner ruling 2026-09-05 19:44Z)", () => {
    it("voids the row with no reversing JE and no money movement; the collected amount is retained, not refunded", async () => {
      const { client, calls } = makeClient(baseRow({ status: "applied", amount_cents: "10000", remaining_balance_cents: "0", bucket_id: "bucket-1" }));
      const result = await voidSettlementDeduction(client, {
        operating_company_id: OPCO,
        deduction_id: DEDUCTION_ID,
        reason: "damage claim was withdrawn after collection",
        actor_user_id: ACTOR,
      });
      expect(result.outcome).toBe("voided_applied_retained");
      expect(result.collected_cents).toBe(10000);
      expect(result.reversed_cents).toBe(0);
      expect(result.journal_entry_id).toBeNull();

      const { createJournalEntryOnClient } = await import("../../accounting/journal-entries.service.js");
      expect(createJournalEntryOnClient).not.toHaveBeenCalled();

      const update = calls.find((c) => c.sql.includes("UPDATE driver_finance.driver_settlement_deductions"));
      expect(update, "expected an UPDATE").toBeTruthy();
      expect(update!.sql).not.toMatch(/void_reversal_entry_id/);
      expect(update!.sql).toMatch(/voided_at\s*=\s*now\(\)/);
      expect(String(update!.values[1])).toContain("$100.00 already collected, retained (never refunded)");
      expect(update!.values).toEqual([DEDUCTION_ID, expect.stringContaining("already collected, retained"), ACTOR]);
    });

    it("never calls the JE/account-resolution primitives regardless of deduction_type", async () => {
      const { client } = makeClient(baseRow({ status: "applied", deduction_type: "cash_advance", amount_cents: "5000", remaining_balance_cents: "0" }));
      const result = await voidSettlementDeduction(client, {
        operating_company_id: OPCO,
        deduction_id: DEDUCTION_ID,
        reason: "advance repayment dispute withdrawn",
        actor_user_id: ACTOR,
      });
      expect(result.outcome).toBe("voided_applied_retained");
      expect(result.reversed_cents).toBe(0);
      const { createJournalEntryOnClient } = await import("../../accounting/journal-entries.service.js");
      expect(createJournalEntryOnClient).not.toHaveBeenCalled();
    });

    it("throws deduction_zero_amount rather than void a zero-amount applied row", async () => {
      const { client } = makeClient(baseRow({ status: "applied", amount_cents: "0", remaining_balance_cents: "0" }));
      await expect(
        voidSettlementDeduction(client, { operating_company_id: OPCO, deduction_id: DEDUCTION_ID, reason: "test", actor_user_id: ACTOR })
      ).rejects.toMatchObject({ code: "deduction_zero_amount" });
    });
  });

  it("fails closed on an unrecognized status (e.g. 'deferred') rather than guessing a treatment", async () => {
    const { client } = makeClient(baseRow({ status: "deferred" }));
    await expect(
      voidSettlementDeduction(client, { operating_company_id: OPCO, deduction_id: DEDUCTION_ID, reason: "test", actor_user_id: ACTOR })
    ).rejects.toMatchObject({ code: "deduction_status_not_voidable" });
  });
});
