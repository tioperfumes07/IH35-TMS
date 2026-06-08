import { describe, expect, it, vi } from "vitest";
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
        query: vi.fn(async (sql: string) => {
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
          if (sql.includes("FROM mdata.vendors")) return { rows: [{ id: "vendor-1" }] };
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
        }),
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

describe("createInsurancePolicyWithBills", () => {
  const baseInput = {
    operatingCompanyId: "00000000-0000-0000-0000-000000000001",
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
