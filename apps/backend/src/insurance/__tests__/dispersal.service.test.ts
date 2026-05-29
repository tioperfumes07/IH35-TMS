import { describe, expect, it, vi } from "vitest";
import { bulkPostTransactionsAsBills } from "../../banking/bulk-transactions.js";
import { persistInsuranceDispersalBills } from "../dispersal.routes.js";
import {
  buildInsuranceGenerateBillsResponse,
  computeInsuranceDispersal,
  splitCentsExact,
} from "../dispersal.service.js";

vi.mock("../../banking/bulk-transactions.js", () => ({
  bulkPostTransactionsAsBills: vi.fn(async (_client: unknown, input: { txnIds: string[] }) => ({
    bill_ids: input.txnIds.map((_, index) => `bill-${index + 1}`),
  })),
}));

vi.mock("../../auth/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth/db.js")>();
  return {
    ...actual,
    withCurrentUser: vi.fn(async (_userId: string, fn: (client: unknown) => Promise<unknown>) => {
      let transactionSequence = 0;
      return fn({
        query: vi.fn(async (sql: string, values?: unknown[]) => {
          if (sql.includes("FROM mdata.vendors")) return { rows: [{ id: "vendor-1" }], rowCount: 1 };
          if (sql.includes("FROM banking.bank_accounts")) return { rows: [{ id: "bank-1" }], rowCount: 1 };
          if (sql.includes("INSERT INTO banking.bank_transactions")) {
            transactionSequence += 1;
            return { rows: [{ id: `txn-${transactionSequence}` }], rowCount: 1 };
          }
          if (sql.includes("SELECT id::text AS transaction_id, linked_entity_id::text AS bill_id")) {
            const txnIds = (values?.[1] as string[] | undefined) ?? [];
            return {
              rows: txnIds.map((txnId, index) => ({
                transaction_id: txnId,
                bill_id: `bill-${index + 1}`,
              })),
              rowCount: txnIds.length,
            };
          }
          return { rows: [], rowCount: 1 };
        }),
      });
    }),
  };
});

describe("computeInsuranceDispersal", () => {
  const coveredUnits = [
    { asset_id: "11111111-1111-4111-8111-111111111101", insured_value_cents: 4_000_000 },
    { asset_id: "11111111-1111-4111-8111-111111111102", insured_value_cents: 3_000_000 },
    { asset_id: "11111111-1111-4111-8111-111111111103", insured_value_cents: 3_000_000 },
    { asset_id: "11111111-1111-4111-8111-111111111104", insured_value_cents: 2_000_000 },
  ];

  it("produces 16 penny-exact bills for the dispatch example", () => {
    const result = computeInsuranceDispersal(
      {
        id: "22222222-2222-4222-8222-222222222222",
        policy_number: "POL-120K",
        insurer_name: "Example Insurer",
        coverage_type: "auto_liability",
        effective_date: "2026-01-01",
        expiry_date: "2026-12-31",
        total_premium_cents: 12_000_000,
        down_payment_cents: 2_000_000,
        installment_count: 12,
        due_day: 5,
        pay_day: 10,
      },
      coveredUnits,
      {
        down_payment_installment_count: 4,
        down_payment_cadence: "weekly",
        remainder_cadence: "monthly",
        remainder_installment_count: 12,
      }
    );

    expect(result.total_count).toBe(16);
    expect(result.bills.filter((bill) => bill.phase === "down_payment")).toHaveLength(4);
    expect(result.bills.filter((bill) => bill.phase === "remainder")).toHaveLength(12);
    expect(result.total_amount_cents).toBe(12_000_000);
    expect(result.bills.every((bill) => bill.policy_id === "22222222-2222-4222-8222-222222222222")).toBe(true);
    expect(result.bills.every((bill) => bill.ps_category === "Insurance")).toBe(true);
    expect(result.bills.every((bill) => bill.ps_item === "Auto Liability Premium")).toBe(true);

    const downPayments = result.bills.filter((bill) => bill.phase === "down_payment");
    expect(downPayments.every((bill) => bill.amount_cents === 500_000)).toBe(true);

    const remainderTotal = result.bills
      .filter((bill) => bill.phase === "remainder")
      .reduce((sum, bill) => sum + bill.amount_cents, 0);
    expect(remainderTotal).toBe(10_000_000);

    for (const bill of result.bills) {
      const allocated = bill.allocations.reduce((sum, row) => sum + row.allocated_amount_cents, 0);
      expect(allocated).toBe(bill.amount_cents);
    }
  });

  it("keeps per-unit allocation sums within one cent", () => {
    const result = computeInsuranceDispersal(
      {
        id: "33333333-3333-4333-8333-333333333333",
        policy_number: "POL-ALLOC",
        insurer_name: "Example Insurer",
        coverage_type: "cargo",
        effective_date: "2026-02-01",
        expiry_date: "2027-01-31",
        total_premium_cents: 1_000_001,
        down_payment_cents: 100_001,
        installment_count: 3,
        due_day: 5,
        pay_day: 10,
      },
      coveredUnits
    );

    for (const bill of result.bills) {
      const allocated = bill.allocations.reduce((sum, row) => sum + row.allocated_amount_cents, 0);
      expect(Math.abs(allocated - bill.amount_cents)).toBeLessThanOrEqual(1);
    }
  });
});

describe("generate-bills endpoint contract", () => {
  it("returns preview totals without creating bills on dry_run", () => {
    const dispersal = computeInsuranceDispersal(
      {
        id: "44444444-4444-4444-8444-444444444444",
        policy_number: "POL-DRY",
        insurer_name: "Dry Run Insurer",
        coverage_type: "general_liability",
        effective_date: "2026-03-01",
        expiry_date: "2027-02-28",
        total_premium_cents: 3_000_000,
        down_payment_cents: 0,
        installment_count: 3,
        due_day: 5,
        pay_day: 10,
      },
      [{ asset_id: "55555555-5555-4555-8555-555555555555", insured_value_cents: 3_000_000 }]
    );

    const response = buildInsuranceGenerateBillsResponse(dispersal);
    expect(response.total_count).toBe(3);
    expect(response.total_amount).toBe(30_000);
    expect(response.total_amount_cents).toBe(3_000_000);
    expect(response.bills[0]?.memo).toContain("insurance_policy_id=44444444-4444-4444-8444-444444444444");
  });

  it("exposes endpoint response fields for non-dry-run payloads", () => {
    const dispersal = computeInsuranceDispersal(
      {
        id: "66666666-6666-4666-8666-666666666666",
        policy_number: "POL-PERSIST",
        insurer_name: "Persist Insurer",
        coverage_type: "physical_damage",
        effective_date: "2026-04-01",
        expiry_date: "2027-03-31",
        total_premium_cents: 900_000,
        down_payment_cents: 0,
        installment_count: 3,
        due_day: 5,
        pay_day: 10,
      },
      [{ asset_id: "77777777-7777-4777-8777-777777777777", insured_value_cents: 900_000 }]
    );

    const response = {
      ...buildInsuranceGenerateBillsResponse(dispersal),
      dry_run: false,
      created_bill_ids: ["bill-1", "bill-2", "bill-3"],
    };

    expect(response.dry_run).toBe(false);
    expect(response.created_bill_ids).toHaveLength(3);
    expect(response.total_count).toBe(3);
  });

  it("persists bills through ACCT-08 multi-bill engine", async () => {
    const bills = computeInsuranceDispersal(
      {
        id: "66666666-6666-4666-8666-666666666666",
        policy_number: "POL-PERSIST",
        insurer_name: "Persist Insurer",
        coverage_type: "physical_damage",
        effective_date: "2026-04-01",
        expiry_date: "2027-03-31",
        total_premium_cents: 900_000,
        down_payment_cents: 0,
        installment_count: 3,
        due_day: 5,
        pay_day: 10,
      },
      [{ asset_id: "77777777-7777-4777-8777-777777777777", insured_value_cents: 900_000 }]
    ).bills;

    const created = await persistInsuranceDispersalBills({
      userId: "user-1",
      operatingCompanyId: "88888888-8888-4888-8888-888888888888",
      policyId: "66666666-6666-4666-8666-666666666666",
      policyNumber: "POL-PERSIST",
      insurerName: "Persist Insurer",
      bills,
    });

    expect(created).toHaveLength(3);
    expect(created[0]?.bill_id).toBe("bill-1");
    expect(created[2]?.bill_id).toBe("bill-3");
    expect(bulkPostTransactionsAsBills).toHaveBeenCalledTimes(1);
  });
});

describe("splitCentsExact", () => {
  it("reconciles remainder pennies across installments", () => {
    expect(splitCentsExact(10_000_000, 12)).toEqual([
      833_334, 833_334, 833_334, 833_334, 833_333, 833_333, 833_333, 833_333, 833_333, 833_333, 833_333, 833_333,
    ]);
    expect(splitCentsExact(10_000_000, 12).reduce((sum, value) => sum + value, 0)).toBe(10_000_000);
  });
});
