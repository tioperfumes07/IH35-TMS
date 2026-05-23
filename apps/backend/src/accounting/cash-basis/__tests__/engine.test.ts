import { describe, expect, it } from "vitest";
import {
  ACCRUAL_ONLY_SURFACES,
  DEFAULT_BASIS,
  LOCKED_DECISIONS,
  applyCashBasisSuppression,
  computeCashBasisAdjustment,
  type CashBasisEntry,
} from "../engine.js";

type ScenarioRow = {
  scenario: number;
  description: string;
  date: string;
  event_type: string;
  entity: string;
  amount: number;
  linked_invoice: string;
  notes: string;
};

// Verbatim from approved inline Sample Transactions rows.
const SAMPLE_SCENARIO_ROWS: ScenarioRow[] = [
  { scenario: 1, description: "Same-period invoice + payment", date: "2026-01-15", event_type: "Invoice issued", entity: "Customer A", amount: 1000, linked_invoice: "INV-001", notes: "Linehaul revenue" },
  { scenario: 1, description: "Same-period invoice + payment", date: "2026-01-20", event_type: "Payment received", entity: "Customer A", amount: 1000, linked_invoice: "INV-001", notes: "Full payment of INV-001" },
  { scenario: 2, description: "Cross-period invoice (paid next period)", date: "2026-01-25", event_type: "Invoice issued", entity: "Customer B", amount: 2000, linked_invoice: "INV-002", notes: "Linehaul revenue" },
  { scenario: 2, description: "Cross-period invoice (paid next period)", date: "2026-02-05", event_type: "Payment received", entity: "Customer B", amount: 2000, linked_invoice: "INV-002", notes: "Full payment in February" },
  { scenario: 3, description: "Partial payments across periods", date: "2026-01-10", event_type: "Invoice issued", entity: "Customer C", amount: 3000, linked_invoice: "INV-003", notes: "Linehaul revenue" },
  { scenario: 3, description: "Partial payments across periods", date: "2026-01-15", event_type: "Payment received", entity: "Customer C", amount: 1500, linked_invoice: "INV-003", notes: "First partial payment" },
  { scenario: 3, description: "Partial payments across periods", date: "2026-02-10", event_type: "Payment received", entity: "Customer C", amount: 1500, linked_invoice: "INV-003", notes: "Second partial payment" },
  { scenario: 4, description: "Unpaid invoice as of period end", date: "2026-01-20", event_type: "Invoice issued", entity: "Customer D", amount: 4000, linked_invoice: "INV-004", notes: "Linehaul revenue; no payment in January" },
  { scenario: 5, description: "Voided invoice (never paid)", date: "2026-01-05", event_type: "Invoice issued", entity: "Customer E", amount: 5000, linked_invoice: "INV-005", notes: "Original invoice" },
  { scenario: 5, description: "Voided invoice (never paid)", date: "2026-01-20", event_type: "Invoice voided", entity: "Customer E", amount: -5000, linked_invoice: "INV-005", notes: "Reversal — never paid" },
  { scenario: 6, description: "Credit memo applied to invoice", date: "2026-01-10", event_type: "Invoice issued", entity: "Customer F", amount: 6000, linked_invoice: "INV-006", notes: "Linehaul revenue" },
  { scenario: 6, description: "Credit memo applied to invoice", date: "2026-01-25", event_type: "Credit memo issued", entity: "Customer F", amount: -1000, linked_invoice: "INV-006", notes: "Adjustment for damaged freight" },
  { scenario: 6, description: "Credit memo applied to invoice", date: "2026-02-05", event_type: "Payment received", entity: "Customer F", amount: 5000, linked_invoice: "INV-006", notes: "Net payment after credit memo" },
  { scenario: 7, description: "Bill paid in next period", date: "2026-01-30", event_type: "Bill received", entity: "Vendor X (Fuel)", amount: 500, linked_invoice: "BILL-001", notes: "Fuel for January operations" },
  { scenario: 7, description: "Bill paid in next period", date: "2026-02-15", event_type: "Bill payment", entity: "Vendor X (Fuel)", amount: 500, linked_invoice: "BILL-001", notes: "Payment cleared bank Feb 15" },
  { scenario: 8, description: "Factoring advance (OPEN — see Q1)", date: "2026-01-05", event_type: "Invoice issued", entity: "Customer G", amount: 10000, linked_invoice: "INV-008", notes: "Linehaul revenue" },
  { scenario: 8, description: "Factoring advance (OPEN — see Q1)", date: "2026-01-07", event_type: "Factor advance received", entity: "Customer G", amount: 8000, linked_invoice: "INV-008", notes: "80% advance from factor; AR shifts to factor reserve" },
  { scenario: 8, description: "Factoring advance (OPEN — see Q1)", date: "2026-02-20", event_type: "Customer pays factor", entity: "Customer G", amount: 1800, linked_invoice: "INV-008", notes: "Reserve released minus $200 factoring fee" },
];

function paymentDateFor(invoice: string) {
  const payment = SAMPLE_SCENARIO_ROWS.find((row) => row.linked_invoice === invoice && row.event_type === "Payment received");
  return payment?.date ?? null;
}

function buildScenarioEntries(scenario: number): CashBasisEntry[] {
  const rows = SAMPLE_SCENARIO_ROWS.filter((row) => row.scenario === scenario);
  const entries: CashBasisEntry[] = [];
  for (const row of rows) {
    const id = `${row.scenario}-${row.date}-${row.event_type}`;
    if (row.event_type === "Invoice issued" || row.event_type === "Invoice voided") {
      entries.push({
        entry_id: `${id}-ar`,
        account_code: "1100",
        account_name: "Accounts Receivable",
        account_type: "Asset",
        amount_cents: row.amount * 100,
        source_type: "ar_control",
        event_date: row.date,
      });
      const settleDate = paymentDateFor(row.linked_invoice);
      const sign = row.event_type === "Invoice voided" ? -1 : 1;
      if (scenario === 3 && sign > 0) {
        entries.push({
          entry_id: `${id}-rev-p1`,
          account_code: "4000",
          account_name: "Transportation Revenue",
          account_type: "Income",
          amount_cents: 1500 * 100,
          source_type: "invoice_revenue",
          settlement_date: "2026-01-15",
        });
        entries.push({
          entry_id: `${id}-rev-p2`,
          account_code: "4000",
          account_name: "Transportation Revenue",
          account_type: "Income",
          amount_cents: 1500 * 100,
          source_type: "invoice_revenue",
          settlement_date: "2026-02-10",
        });
      } else {
        entries.push({
          entry_id: `${id}-rev`,
          account_code: "4000",
          account_name: "Transportation Revenue",
          account_type: "Income",
          amount_cents: sign * Math.abs(row.amount * 100),
          source_type: "invoice_revenue",
          settlement_date: settleDate,
        });
      }
      continue;
    }
    if (row.event_type === "Payment received") {
      entries.push({
        entry_id: `${id}-cash`,
        account_code: "1000",
        account_name: "Cash",
        account_type: "Asset",
        amount_cents: row.amount * 100,
        source_type: "cash_event",
        event_date: row.date,
      });
      entries.push({
        entry_id: `${id}-ar-clear`,
        account_code: "1100",
        account_name: "Accounts Receivable",
        account_type: "Asset",
        amount_cents: -row.amount * 100,
        source_type: "ar_control",
        event_date: row.date,
      });
      continue;
    }
    if (row.event_type === "Credit memo issued") {
      entries.push({
        entry_id: `${id}-refund`,
        account_code: "4000",
        account_name: "Transportation Revenue",
        account_type: "Income",
        amount_cents: row.amount * 100,
        source_type: "refund",
        event_date: row.date,
      });
      continue;
    }
    if (row.event_type === "Bill received") {
      entries.push({
        entry_id: `${id}-ap`,
        account_code: "2000",
        account_name: "Accounts Payable",
        account_type: "Liability",
        amount_cents: row.amount * 100,
        source_type: "ap_control",
        event_date: row.date,
      });
      entries.push({
        entry_id: `${id}-expense`,
        account_code: "5100",
        account_name: "Fuel Expense",
        account_type: "Expense",
        amount_cents: row.amount * 100,
        source_type: "bill_expense",
        settlement_date: "2026-02-15",
      });
      continue;
    }
    if (row.event_type === "Bill payment") {
      entries.push({
        entry_id: `${id}-ap-clear`,
        account_code: "2000",
        account_name: "Accounts Payable",
        account_type: "Liability",
        amount_cents: -row.amount * 100,
        source_type: "ap_control",
      });
      entries.push({
        entry_id: `${id}-cash`,
        account_code: "1000",
        account_name: "Cash",
        account_type: "Asset",
        amount_cents: -row.amount * 100,
        source_type: "cash_event",
      });
      continue;
    }
    if (row.event_type === "Factor advance received") {
      entries.push({
        entry_id: `${id}-factor`,
        account_code: "2200",
        account_name: "Factoring Clearing",
        account_type: "Income",
        amount_cents: row.amount * 100,
        source_type: "factoring_advance",
      });
    }
  }
  return entries;
}

function sumByType(entries: CashBasisEntry[], accountType: string) {
  return entries.filter((entry) => entry.account_type === accountType).reduce((sum, entry) => sum + entry.amount_cents, 0);
}

describe("cash-basis engine decision registry", () => {
  it("contains all locked decisions (Q1-Q12, VQ1-VQ9, INVQ9)", () => {
    const expected = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11", "Q12", "VQ1", "VQ2", "VQ3", "VQ4", "VQ5", "VQ6", "VQ7", "VQ8", "VQ9", "INVQ9"];
    for (const decision of expected) {
      expect(LOCKED_DECISIONS[decision as keyof typeof LOCKED_DECISIONS]).toBeTruthy();
    }
  });

  it("uses accrual default and keeps accrual-only surfaces explicit", () => {
    expect(DEFAULT_BASIS).toBe("accrual");
    expect(ACCRUAL_ONLY_SURFACES).toEqual(expect.arrayContaining(["cash-flow", "ar-aging", "ap-aging", "ifta"]));
  });
});

describe("cash-basis engine core rules", () => {
  it("suppresses AR/AP control balances to zero in cash mode", () => {
    const transformed = applyCashBasisSuppression(
      [
        { entry_id: "ar", account_code: "1100", account_name: "Accounts Receivable", account_type: "Asset", amount_cents: 12_000, source_type: "ar_control" },
        { entry_id: "ap", account_code: "2000", account_name: "Accounts Payable", account_type: "Liability", amount_cents: 5_000, source_type: "ap_control" },
      ],
      { as_of_date: "2026-01-31" },
    );
    expect(transformed.map((entry) => entry.amount_cents)).toEqual([0, 0]);
  });

  it("passes direct journal entries through unchanged", () => {
    const transformed = applyCashBasisSuppression(
      [{ entry_id: "je-1", account_code: "6800", account_name: "Misc Expense", account_type: "Expense", amount_cents: 3210, source_type: "direct_je" }],
      { as_of_date: "2026-01-31" },
    );
    expect(transformed[0].amount_cents).toBe(3210);
  });

  it("recognizes driver settlements on bank settlement date", () => {
    const transformed = applyCashBasisSuppression(
      [
        {
          entry_id: "drv",
          account_code: "6100",
          account_name: "Driver Settlements",
          account_type: "Expense",
          amount_cents: 50_000,
          source_type: "driver_settlement",
          settlement_date: "2026-02-02",
        },
      ],
      { as_of_date: "2026-01-31" },
    );
    expect(transformed[0].amount_cents).toBe(0);
  });

  it("maps refunds into a separate expense line", () => {
    const transformed = applyCashBasisSuppression(
      [{ entry_id: "refund", account_code: "4000", account_name: "Transportation Revenue", account_type: "Income", amount_cents: -10_000, source_type: "refund" }],
      { as_of_date: "2026-01-31" },
    );
    expect(transformed.some((entry) => entry.account_name === "Refunds and Returns" && entry.account_type === "Expense")).toBe(true);
  });

  it("reclassifies factoring advances under Option A", () => {
    const transformed = applyCashBasisSuppression(
      [{ entry_id: "fac", account_code: "2200", account_name: "Factoring Clearing", account_type: "Income", amount_cents: 800_000, source_type: "factoring_advance" }],
      { as_of_date: "2026-01-31" },
    );
    expect(transformed[0].account_type).toBe("Liability");
    expect(transformed[0].account_name).toBe("Factoring Reserve Liability");
  });

  it("computes a single equity cash-basis adjustment line", () => {
    const line = computeCashBasisAdjustment({
      assets: { total: 1_000_000 },
      liabilities: { total: 250_000 },
      equity: { total: 700_000 },
    });
    expect(line.account_name).toBe("Cash Basis Adjustment");
    expect(line.amount).toBe(50_000);
  });
});

describe("cash-basis engine sample transaction scenarios", () => {
  it("Scenario 1: same-period invoice and payment recognizes revenue in January cash basis", () => {
    const transformed = applyCashBasisSuppression(buildScenarioEntries(1), { as_of_date: "2026-01-31" });
    expect(sumByType(transformed, "Income")).toBe(1000 * 100);
  });

  it("Scenario 2: cross-period invoice suppresses unpaid January revenue", () => {
    const transformed = applyCashBasisSuppression(buildScenarioEntries(2), { as_of_date: "2026-01-31" });
    expect(sumByType(transformed, "Income")).toBe(0);
  });

  it("Scenario 3: partial settlement recognizes January-paid portion only", () => {
    const transformed = applyCashBasisSuppression(buildScenarioEntries(3), { as_of_date: "2026-01-31" });
    expect(sumByType(transformed, "Income")).toBe(1500 * 100);
  });

  it("Scenario 4: unpaid invoice remains unrecognized in January cash basis", () => {
    const transformed = applyCashBasisSuppression(buildScenarioEntries(4), { as_of_date: "2026-01-31" });
    expect(sumByType(transformed, "Income")).toBe(0);
  });

  it("Scenario 5: voided invoice nets to zero", () => {
    const transformed = applyCashBasisSuppression(buildScenarioEntries(5), { as_of_date: "2026-01-31" });
    expect(sumByType(transformed, "Income")).toBe(0);
  });

  it("Scenario 6: credit memo creates separate refund expense line", () => {
    const transformed = applyCashBasisSuppression(buildScenarioEntries(6), { as_of_date: "2026-01-31" });
    expect(sumByType(transformed, "Income")).toBe(0);
    const refunds = transformed.find((entry) => entry.account_name === "Refunds and Returns");
    expect(refunds?.amount_cents).toBe(1000 * 100);
  });

  it("Scenario 7: bill paid next period suppresses January cash expense", () => {
    const transformed = applyCashBasisSuppression(buildScenarioEntries(7), { as_of_date: "2026-01-31" });
    expect(sumByType(transformed, "Expense")).toBe(0);
  });

  it("Scenario 8: factoring advance is treated as liability (Option A)", () => {
    const transformed = applyCashBasisSuppression(buildScenarioEntries(8), { as_of_date: "2026-01-31" });
    const liabilityTotal = sumByType(transformed, "Liability");
    expect(liabilityTotal).toBe(8000 * 100);
  });
});
