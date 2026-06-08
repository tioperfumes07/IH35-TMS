import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

import { appendCrudAudit } from "../../audit/crud-audit.js";
import { createSettlementDeduction } from "../deductions.service.js";

const BASE_ROW = {
  id: "ded00000-0000-0000-0000-000000000001",
  operating_company_id: "oc000000-0000-0000-0000-000000000001",
  driver_id: "dr000000-0000-0000-0000-000000000001",
  deduction_type: "damage",
  amount_cents: 15000,
  reason: "Backing incident — trailer door damage",
  applied_to_settlement_id: null,
  created_by_user_id: "usr00000-0000-0000-0000-000000000001",
  source_pending_id: null,
  created_at: "2026-06-07T12:00:00.000Z",
};

function makeMockClient(opts: { existingRow?: Record<string, unknown> | null; insertedRow?: Record<string, unknown> } = {}) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const client = {
    async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
      calls.push({ sql, values });
      if (sql.includes("SELECT") && sql.includes("FROM driver_finance.driver_settlement_deductions")) {
        const row = opts.existingRow;
        return { rows: (row ? [row] : []) as T[], rowCount: row ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO driver_finance.driver_settlement_deductions")) {
        return { rows: [{ ...BASE_ROW, ...opts.insertedRow }] as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
  return { client, calls };
}

describe("createSettlementDeduction", () => {
  beforeEach(() => {
    vi.mocked(appendCrudAudit).mockClear();
  });

  it("happy path — inserts deduction and returns row with correct fields", async () => {
    const { client, calls } = makeMockClient();

    const result = await createSettlementDeduction(client, {
      driverId: "dr000000-0000-0000-0000-000000000001",
      operatingCompanyId: "oc000000-0000-0000-0000-000000000001",
      amountCents: 15000,
      reason: "Backing incident — trailer door damage",
      sourceType: "damage",
      createdByUserId: "usr00000-0000-0000-0000-000000000001",
    });

    expect(result.id).toBe("ded00000-0000-0000-0000-000000000001");
    expect(result.deduction_type).toBe("damage");
    expect(result.amount_cents).toBe(15000);
    expect(result.applied_to_settlement_id).toBeNull();
    // No sourcePendingId → no pre-check SELECT, straight to INSERT.
    expect(calls.some((c) => c.sql.includes("INSERT INTO driver_finance.driver_settlement_deductions"))).toBe(true);
    expect(calls.some((c) => c.sql.includes("SELECT") && c.sql.includes("FROM driver_finance.driver_settlement_deductions"))).toBe(false);
    expect(appendCrudAudit).toHaveBeenCalledOnce();
    expect(vi.mocked(appendCrudAudit).mock.calls[0]?.[2]).toBe("driver_finance.deduction.created");
  });

  it("dedupe — returns existing row without re-inserting when source_pending_id already charged", async () => {
    const pendingId = "pen00000-0000-0000-0000-000000000099";
    const { client, calls } = makeMockClient({
      existingRow: { ...BASE_ROW, id: "ded00000-0000-0000-0000-0000000000EE", source_pending_id: pendingId },
    });

    const result = await createSettlementDeduction(client, {
      driverId: "dr000000-0000-0000-0000-000000000001",
      operatingCompanyId: "oc000000-0000-0000-0000-000000000001",
      amountCents: 50000,
      reason: "Escrow load abandonment",
      sourceType: "other",
      sourcePendingId: pendingId,
      createdByUserId: "usr00000-0000-0000-0000-000000000001",
    });

    expect(result.id).toBe("ded00000-0000-0000-0000-0000000000EE");
    expect(result.source_pending_id).toBe(pendingId);
    // Pre-check ran; INSERT did NOT (no double-charge).
    expect(calls.some((c) => c.sql.includes("SELECT") && c.sql.includes("FROM driver_finance.driver_settlement_deductions"))).toBe(true);
    expect(calls.some((c) => c.sql.includes("INSERT INTO driver_finance.driver_settlement_deductions"))).toBe(false);
    // No audit for a deduped no-op create.
    expect(appendCrudAudit).not.toHaveBeenCalled();
  });

  it("invalid input — throws when amountCents is zero", async () => {
    const { client } = makeMockClient();

    await expect(
      createSettlementDeduction(client, {
        driverId: "dr000000-0000-0000-0000-000000000001",
        operatingCompanyId: "oc000000-0000-0000-0000-000000000001",
        amountCents: 0,
        reason: "some reason",
        sourceType: "other",
        createdByUserId: "usr00000-0000-0000-0000-000000000001",
      })
    ).rejects.toThrow("E_INVALID_INPUT: amountCents must be a positive integer");
  });

  it("invalid input — throws when driverId is blank", async () => {
    const { client } = makeMockClient();

    await expect(
      createSettlementDeduction(client, {
        driverId: "   ",
        operatingCompanyId: "oc000000-0000-0000-0000-000000000001",
        amountCents: 1000,
        reason: "fuel advance",
        sourceType: "fuel",
        createdByUserId: "usr00000-0000-0000-0000-000000000001",
      })
    ).rejects.toThrow("E_INVALID_INPUT: driverId is required");
  });
});
