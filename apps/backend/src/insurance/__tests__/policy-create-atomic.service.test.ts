import { membershipAware } from "../../../test-helpers/membership-aware-query.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInsurancePolicyWithBills } from "../policy-create-atomic.service.js";

vi.mock("../../auth/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth/db.js")>();
  return {
    ...actual,
    withCurrentUser: vi.fn(async (_userId: string, fn: (client: unknown) => Promise<unknown>) => {
      let policySeq = 0;
      let unitSeq = 0;
      let txnSeq = 0;
      let billSeq = 0;
      return fn({
        query: membershipAware(vi.fn(async (sql: string) => {
          if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
          if (sql.includes("FROM insurance.type_catalog")) return { rows: [{ id: "type-1" }] };
          if (sql.includes("INSERT INTO insurance.policy")) {
            policySeq += 1;
            return { rows: [{ id: `policy-${policySeq}` }] };
          }
          if (sql.includes("FROM mdata.assets")) return { rows: [{ id: "asset-x" }] };
          if (sql.includes("INSERT INTO insurance.policy_unit")) {
            unitSeq += 1;
            return { rows: [{ id: `unit-${unitSeq}` }] };
          }
          if (sql.includes("FROM mdata.vendors")) {
            return { rows: [{ id: "00000000-0000-4000-8000-0000000000f1", vendor_name: "Test Insurer", is_sample_data: false }] };
          }
          if (sql.includes("FROM banking.bank_accounts")) return { rows: [{ id: "bank-1" }] };
          if (sql.includes("INSERT INTO banking.bank_transactions")) {
            txnSeq += 1;
            return { rows: [{ id: `txn-${txnSeq}` }] };
          }
          if (sql.includes("INSERT INTO accounting.bills")) {
            billSeq += 1;
            return { rows: [{ id: `bill-${billSeq}` }] };
          }
          if (sql.includes("UPDATE accounting.bills")) return { rows: [], rowCount: 1 };
          if (sql.includes("UPDATE banking.bank_transactions")) return { rows: [], rowCount: 1 };
          if (sql.includes("INSERT INTO accounting.bill_unit_allocation")) return { rows: [], rowCount: 1 };
          if (sql.includes("INSERT INTO audit")) return { rows: [], rowCount: 1 };
          return { rows: [], rowCount: 0 };
        })),
      });
    }),
  };
});

vi.mock("../../accounting/outbox-events.js", () => ({
  enqueueAccountingOutbox: vi.fn(async () => {}),
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => {}),
}));

// C6 (GO-23) — createInsurancePolicyWithBills hand-rolled its own accounting.bills INSERT and
// never called the bill-GL poster; every insurance-wizard bill was permanently unposted regardless
// of flag state. Mocked separately (not left to fall through the generic query stub above) so the
// flag-on path gets real coverage, matching this session's own established convention.
const mockIsBillGlPostingEnabled = vi.fn().mockResolvedValue(false);
const mockPostSourceTransactionInClientTx = vi.fn().mockResolvedValue({ journal_entry_id: "je-1" });
vi.mock("../../accounting/bill-gl.service.js", () => ({
  isBillGlPostingEnabled: (...args: unknown[]) => mockIsBillGlPostingEnabled(...args),
}));
vi.mock("../../accounting/posting-engine.service.js", () => ({
  postSourceTransactionInClientTx: (...args: unknown[]) => mockPostSourceTransactionInClientTx(...args),
}));

describe("createInsurancePolicyWithBills", () => {
  const baseInput = {
    operatingCompanyId: "00000000-0000-0000-0000-000000000001",
    vendorId: "00000000-0000-4000-8000-0000000000f1",
    userId: "00000000-0000-0000-0000-000000000002",
    insurerName: "Test Insurer",
    policyNumber: "POL-001",
    coverageType: "auto_liability" as const,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    totalPremiumCents: 120000 * 100,
    downPaymentCents: 0,
    termMonths: 12,
    allocationMethod: "equal_split" as const,
    unitIds: ["00000000-0000-4000-8000-000000000aa1", "00000000-0000-4000-8000-000000000aa2", "00000000-0000-4000-8000-000000000aa3"],
  };

  it("returns policyId, unitCount, billCount matching term_months", async () => {
    const result = await createInsurancePolicyWithBills(baseInput);
    expect(result.policyId).toMatch(/^policy-/);
    expect(result.unitCount).toBe(3);
    expect(result.billCount).toBe(12);
  });

  it("creates N bills where N = term_months (6 months)", async () => {
    const result = await createInsurancePolicyWithBills({ ...baseInput, termMonths: 6 });
    expect(result.billCount).toBe(6);
  });

  it("uses equal_split allocation (default)", async () => {
    const result = await createInsurancePolicyWithBills(baseInput);
    expect(result.totalAmountCents).toBeGreaterThan(0);
  });

  it("accepts pro_rata allocation method", async () => {
    const result = await createInsurancePolicyWithBills({ ...baseInput, allocationMethod: "pro_rata" });
    expect(result.billCount).toBe(12);
  });

  it("accepts weighted allocation method", async () => {
    const result = await createInsurancePolicyWithBills({
      ...baseInput,
      allocationMethod: "weighted",
      manualPcts: { "unit-a": 40, "unit-b": 35, "unit-c": 25 },
    });
    expect(result.billCount).toBe(12);
  });
});

describe("createInsurancePolicyWithBills — C6 bill GL poster", () => {
  beforeEach(() => {
    mockIsBillGlPostingEnabled.mockClear();
    mockPostSourceTransactionInClientTx.mockClear();
  });

  const baseInput = {
    operatingCompanyId: "00000000-0000-0000-0000-000000000001",
    vendorId: "00000000-0000-4000-8000-0000000000f1",
    userId: "00000000-0000-0000-0000-000000000002",
    insurerName: "Test Insurer",
    policyNumber: "POL-001",
    coverageType: "auto_liability" as const,
    effectiveDate: "2026-01-01",
    expiryDate: "2026-12-31",
    totalPremiumCents: 120000 * 100,
    downPaymentCents: 0,
    termMonths: 2,
    allocationMethod: "equal_split" as const,
    unitIds: ["00000000-0000-4000-8000-000000000aa1"],
  };

  it("never calls the poster when BILL_GL_POSTING_ENABLED is off (default)", async () => {
    mockIsBillGlPostingEnabled.mockResolvedValue(false);
    await createInsurancePolicyWithBills(baseInput);
    expect(mockIsBillGlPostingEnabled).toHaveBeenCalledTimes(2); // one per bill (termMonths=2)
    expect(mockPostSourceTransactionInClientTx).not.toHaveBeenCalled();
  });

  it("posts each bill via postSourceTransactionInClientTx (source_transaction_type='bill') when the flag is on", async () => {
    mockIsBillGlPostingEnabled.mockResolvedValue(true);
    const result = await createInsurancePolicyWithBills(baseInput);
    expect(mockPostSourceTransactionInClientTx).toHaveBeenCalledTimes(2);
    expect(mockPostSourceTransactionInClientTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operating_company_id: baseInput.operatingCompanyId,
        source_transaction_type: "bill",
        source_transaction_id: expect.stringMatching(/^bill-/),
      }),
      { userId: baseInput.userId }
    );
    expect(result.billCount).toBe(2);
  });

  it("a poster failure for one bill does not abort policy creation or the remaining bills", async () => {
    mockIsBillGlPostingEnabled.mockResolvedValue(true);
    mockPostSourceTransactionInClientTx.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ journal_entry_id: "je-2" });
    const result = await createInsurancePolicyWithBills(baseInput);
    expect(result.billCount).toBe(2);
    expect(mockPostSourceTransactionInClientTx).toHaveBeenCalledTimes(2);
  });
});
