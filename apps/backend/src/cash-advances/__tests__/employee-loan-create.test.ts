import { describe, expect, it, vi } from "vitest";

// B3: createEmployeeLoanCore (type='loan' fallback) is additive over createDriverCashAdvanceCore.

vi.mock("../display-id.js", () => ({ nextCashAdvanceDisplayId: vi.fn(async () => "CA-1") }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn() }));

const { createDriverCashAdvanceCore, createEmployeeLoanCore } = await import("../cash-advance-create.js");

const ACTOR = "22222222-2222-4222-8222-222222222222";
const OPCO = "11111111-1111-4111-8111-111111111111";

function makeClient() {
  const captured: { liabilityType: unknown; linkedBillId: unknown } = { liabilityType: null, linkedBillId: undefined };
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ ok: false }] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [{ id: params[0], status: "active" }] };
      if (sql.includes("INSERT INTO driver_finance.driver_liabilities")) {
        captured.liabilityType = params[2];
        return { rows: [{ id: "liab-1" }] };
      }
      if (sql.includes("INSERT INTO driver_finance.deduction_schedule")) return { rows: [] };
      if (sql.includes("INSERT INTO driver_finance.driver_advances")) {
        captured.linkedBillId = params[9];
        return { rows: [{ id: "adv-1" }] };
      }
      if (sql.includes("views.cash_advances_with_context")) return { rows: [{ id: "adv-1" }] };
      return { rows: [] };
    }),
  };
  return { client, captured };
}

const baseBody = {
  driver_id: "d1",
  amount: 500,
  purpose: "other" as const,
  disbursement_method: "wire" as const,
  recipient_info: { recipient_type: "driver" as const },
  repayment_schedule: { weekly_installment_amount: 50, total_periods: 10, cadence: "weekly" as const },
};

describe("createDriverCashAdvanceCore (existing behavior unchanged)", () => {
  it("books driver_liabilities.type = 'advance' when no liability_type is provided", async () => {
    const { client, captured } = makeClient();
    const res = await createDriverCashAdvanceCore(client, ACTOR, OPCO, baseBody);
    expect(res.ok).toBe(true);
    expect(captured.liabilityType).toBe("advance");
  });
});

describe("createEmployeeLoanCore (B3 no-trip/no-bill fallback)", () => {
  it("books driver_liabilities.type = 'loan' with no linked bill", async () => {
    const { client, captured } = makeClient();
    const res = await createEmployeeLoanCore(client, ACTOR, OPCO, baseBody);
    expect(res.ok).toBe(true);
    expect(captured.liabilityType).toBe("loan");
    expect(captured.linkedBillId).toBe(null);
  });
});
