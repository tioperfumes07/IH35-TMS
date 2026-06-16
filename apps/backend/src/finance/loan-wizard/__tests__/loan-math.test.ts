import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildAmortizationSchedule,
  buildDepreciationSchedule,
  buildOpeningJournalEntry,
  classifyLoanType,
} from "../loan-math.js";
import { buildLoanWizardPreview, LoanWizardValidationError } from "../preview.service.js";

describe("FH-2 loan-math (pure, no DB)", () => {
  it("classifies loan type by term length", () => {
    expect(classifyLoanType(12)).toBe("loan_payable");
    expect(classifyLoanType(13)).toBe("note_payable");
    expect(classifyLoanType(60)).toBe("note_payable");
    expect(() => classifyLoanType(0)).toThrow();
  });

  it("addMonths clamps end-of-month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-06-15", 3)).toBe("2026-09-15");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("amortizes a level-payment loan; principal sums to the loan and ends at zero", () => {
    const rows = buildAmortizationSchedule({
      principalCents: 1_000_000, // $10,000
      annualRatePct: 6,
      termMonths: 12,
      firstPaymentDate: "2026-07-01",
    });
    expect(rows).toHaveLength(12);
    expect(rows[0].payment_cents).toBe(86066); // ~$860.66/mo
    expect(rows[rows.length - 1].balance_cents).toBe(0);
    const principalSum = rows.reduce((a, r) => a + r.principal_cents, 0);
    expect(principalSum).toBe(1_000_000); // principal repaid exactly equals the loan
    const paymentSum = rows.reduce((a, r) => a + r.payment_cents, 0);
    const interestSum = rows.reduce((a, r) => a + r.interest_cents, 0);
    expect(paymentSum).toBe(principalSum + interestSum); // payments = principal + interest
    expect(interestSum).toBeGreaterThan(0);
  });

  it("handles 0% interest: equal principal, no interest, ends at zero", () => {
    const rows = buildAmortizationSchedule({ principalCents: 120_000, annualRatePct: 0, termMonths: 6, firstPaymentDate: "2026-07-01" });
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.interest_cents === 0)).toBe(true);
    expect(rows.reduce((a, r) => a + r.principal_cents, 0)).toBe(120_000);
    expect(rows[rows.length - 1].balance_cents).toBe(0);
  });

  it("depreciates straight-line; accumulates to depreciable base, book value ends at salvage", () => {
    const rows = buildDepreciationSchedule({ capitalizedCostCents: 600_000, salvageValueCents: 0, usefulLifeMonths: 60, startDate: "2026-07-01" });
    expect(rows).toHaveLength(60);
    expect(rows[0].depreciation_cents).toBe(10_000); // $100/mo
    expect(rows[rows.length - 1].book_value_cents).toBe(0);
    expect(rows.reduce((a, r) => a + r.depreciation_cents, 0)).toBe(600_000);
  });

  it("opening JE balances (Dr asset = Cr loan + Cr cash)", () => {
    const je = buildOpeningJournalEntry({
      capitalizedCostCents: 5_000_000,
      loanAmountCents: 4_000_000,
      downPaymentCents: 1_000_000,
      loanType: "note_payable",
    });
    const dr = je.lines.filter((l) => l.debit_or_credit === "debit").reduce((a, l) => a + l.amount_cents, 0);
    const cr = je.lines.filter((l) => l.debit_or_credit === "credit").reduce((a, l) => a + l.amount_cents, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(5_000_000);
  });

  it("opening JE FAILS HARD when it does not balance", () => {
    expect(() =>
      buildOpeningJournalEntry({ capitalizedCostCents: 5_000_000, loanAmountCents: 4_000_000, downPaymentCents: 500_000, loanType: "note_payable" })
    ).toThrow(/does not balance/);
  });
});

describe("FH-2 preview assembly (pure, no DB, no posting)", () => {
  const base = {
    operating_company_id: "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
    purchase_price_cents: 5_000_000,
    down_payment_cents: 1_000_000,
    funding_account_id: null,
    loan_amount_cents: 4_000_000,
    annual_rate_pct: 6,
    term_months: 60,
    first_payment_date: "2026-07-01",
    lender: "Commercial Credit Group",
    assets: [{ name: "Peterbilt 579", vin_serial: "1XPBD49X5ND782394" }],
    useful_life_months: 60,
    salvage_value_cents: 0,
  };

  it("returns a balanced preview: SUM(debits) === SUM(credits) on the opening JE", () => {
    const preview = buildLoanWizardPreview(base);
    expect(preview.balanced).toBe(true);
    expect(preview.opening_journal_entry.debit_total_cents).toBe(preview.opening_journal_entry.credit_total_cents);
    expect(preview.opening_journal_entry.debit_total_cents).toBe(5_000_000);
    expect(preview.loan_record.loan_type).toBe("note_payable");
    expect(preview.amortization_schedule).toHaveLength(60);
    expect(preview.depreciation_schedule).toHaveLength(60);
    expect(preview.amortization_schedule.at(-1)?.balance_cents).toBe(0);
  });

  it("throws LoanWizardValidationError when inputs do not balance", () => {
    expect(() => buildLoanWizardPreview({ ...base, down_payment_cents: 500_000 })).toThrow(LoanWizardValidationError);
  });
});
