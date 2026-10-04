import { describe, expect, it, vi } from "vitest";

// ROUND 394 RULING 1 — an advance is a receivable on the driver's OWN 1245 sub-account. Creation must
// refuse a driver with no bound own sub-account BEFORE any row is written, so no advance can exist that
// the posting engine cannot debit to that driver.

const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }));
vi.mock("../display-id.js", () => ({ nextCashAdvanceDisplayId: vi.fn(async () => "CA-1") }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn() }));
vi.mock("../../driver-finance/driver-advance-account-resolver.js", () => {
  class DriverAdvanceAccountError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
    }
  }
  return { resolveDriverAdvanceSubAccount: mockResolve, DriverAdvanceAccountError };
});

const { createDriverCashAdvanceCore } = await import("../cash-advance-create.js");
const { DriverAdvanceAccountError } = await import("../../driver-finance/driver-advance-account-resolver.js");

const ACTOR = "22222222-2222-4222-8222-222222222222";
const OPCO = "11111111-1111-4111-8111-111111111111";

function makeClient() {
  const captured: { liabilityType: unknown; linkedBillId: unknown } = { liabilityType: null, linkedBillId: undefined };
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ ok: false }] };
      if (sql.includes("FROM mdata.drivers")) return { rows: [{ id: params[0], status: "active" }] };
      if (sql.includes("FROM banking.bank_accounts")) return { rows: [{ id: params[0] }] };
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
  // B8 (GO-23 wave 2) — a wire disbursement with no payment account and no instrument reference
  // is now a refused orphan (cash-advance-create.ts); every fixture in this file represents a
  // real, resolvable advance, not the defect the new check exists to catch.
  from_bank_account_id: "bank-1",
  recipient_info: { recipient_type: "driver" as const, bank_reference: "WIRE-REF-0001" },
  repayment_schedule: { weekly_installment_amount: 50, total_periods: 10, cadence: "weekly" as const },
};

describe("createDriverCashAdvanceCore — the driver's own Cash-Advance sub-account (ROUND 394)", () => {
  it("refuses an unbound driver with a named 409 and writes nothing", async () => {
    mockResolve.mockReset();
    mockResolve.mockRejectedValue(new DriverAdvanceAccountError("DRIVER_ADVANCE_ACCOUNT_MISSING", "no own sub-account"));
    const { client } = makeClient();
    const res = await createDriverCashAdvanceCore(client, ACTOR, OPCO, baseBody);
    expect(res).toMatchObject({ ok: false, code: 409, error: "driver_advance_account_missing" });
    const writes = client.query.mock.calls.filter(([sql]) => /INSERT INTO|UPDATE /.test(String(sql)));
    expect(writes).toHaveLength(0);
  });

  it("resolves the advance driver's own sub-account for this company, then books the advance", async () => {
    mockResolve.mockReset();
    mockResolve.mockResolvedValue("driver-own-advance-sub");
    const { client, captured } = makeClient();
    const res = await createDriverCashAdvanceCore(client, ACTOR, OPCO, baseBody);
    expect(res.ok).toBe(true);
    expect(mockResolve).toHaveBeenCalledWith(client, OPCO, "d1");
    expect(captured.liabilityType).toBe("advance");
  });
});
