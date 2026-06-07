import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn().mockResolvedValue(undefined),
}));

import { appendCrudAudit } from "../../audit/crud-audit.js";
import { createSettlementDeduction } from "../deductions.service.js";

function makeMockClient(insertedRow: Record<string, unknown> = {}) {
  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      _values?: unknown[]
    ): Promise<{ rows: T[]; rowCount: number }> {
      if (sql.includes("INSERT INTO driver_finance.driver_settlement_deductions")) {
        return {
          rows: [
            {
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
              ...insertedRow,
            },
          ] as T[],
          rowCount: 1,
        };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
}

describe("createSettlementDeduction", () => {
  beforeEach(() => {
    vi.mocked(appendCrudAudit).mockClear();
  });

  it("happy path — inserts deduction and returns row with correct fields", async () => {
    const client = makeMockClient();

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
    expect(result.reason).toBe("Backing incident — trailer door damage");
    expect(result.applied_to_settlement_id).toBeNull();
    expect(result.source_pending_id).toBeNull();

    expect(appendCrudAudit).toHaveBeenCalledOnce();
    expect(vi.mocked(appendCrudAudit).mock.calls[0]?.[2]).toBe("driver_finance.deduction.created");
  });

  it("happy path — passes sourceReferenceId as source_pending_id", async () => {
    const refId = "ref00000-0000-0000-0000-000000000099";
    const client = makeMockClient({ source_pending_id: refId });

    const result = await createSettlementDeduction(client, {
      driverId: "dr000000-0000-0000-0000-000000000001",
      operatingCompanyId: "oc000000-0000-0000-0000-000000000001",
      amountCents: 5000,
      reason: "Cash advance repayment installment",
      sourceType: "cash_advance_repayment",
      sourceReferenceId: refId,
      createdByUserId: "usr00000-0000-0000-0000-000000000001",
    });

    expect(result.source_pending_id).toBe(refId);
  });

  it("invalid input — throws when amountCents is zero", async () => {
    const client = makeMockClient();

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
    const client = makeMockClient();

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
