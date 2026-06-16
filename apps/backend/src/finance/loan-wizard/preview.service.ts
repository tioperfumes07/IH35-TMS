/**
 * FH-2 Loan Wizard — preview assembly (PURE: no DB, no writes).
 * Takes wizard inputs and returns the full preview-first draft set that the feature would
 * eventually create: loan record, fixed asset(s) + depreciation schedule, down-payment,
 * amortization schedule, and a BALANCED opening JE. Nothing is posted; the route gates it.
 */
import { z } from "zod";
import {
  buildAmortizationSchedule,
  buildDepreciationSchedule,
  buildOpeningJournalEntry,
  classifyLoanType,
  type AmortizationRow,
  type DepreciationRow,
  type JournalLine,
  type LoanType,
} from "./loan-math.js";

const intCents = z.number().int();
const nonNegCents = intCents.nonnegative();
const posCents = intCents.positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const loanWizardPreviewInputSchema = z.object({
  operating_company_id: z.string().uuid(),
  purchase_price_cents: posCents,
  down_payment_cents: nonNegCents.default(0),
  funding_account_id: z.string().uuid().nullable().optional(),
  loan_amount_cents: nonNegCents,
  annual_rate_pct: z.number().min(0).max(100),
  term_months: z.number().int().positive().max(600),
  first_payment_date: isoDate,
  lender: z.string().trim().min(1).max(200),
  assets: z
    .array(z.object({ name: z.string().trim().min(1).max(200), vin_serial: z.string().trim().max(64).optional() }))
    .min(1),
  useful_life_months: z.number().int().positive().max(600).default(60),
  salvage_value_cents: nonNegCents.default(0),
  depreciation_start_date: isoDate.optional(),
});

export type LoanWizardPreviewInput = z.infer<typeof loanWizardPreviewInputSchema>;

export type LoanWizardPreview = {
  balanced: boolean;
  loan_record: {
    loan_type: LoanType;
    principal_cents: number;
    annual_rate_pct: number;
    term_months: number;
    first_payment_date: string;
    lender: string;
  };
  fixed_asset: {
    assets: Array<{ name: string; vin_serial?: string }>;
    capitalized_cost_cents: number;
    depreciation_method: "straight_line";
    useful_life_months: number;
    salvage_value_cents: number;
    depreciation_start_date: string;
  };
  down_payment: { amount_cents: number; funding_account_id: string | null };
  amortization_schedule: AmortizationRow[];
  depreciation_schedule: DepreciationRow[];
  opening_journal_entry: { lines: JournalLine[]; debit_total_cents: number; credit_total_cents: number };
  summary: {
    monthly_payment_cents: number;
    total_payments_cents: number;
    total_interest_cents: number;
    number_of_payments: number;
  };
};

export class LoanWizardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoanWizardValidationError";
  }
}

/** Build the full preview. Throws LoanWizardValidationError on a non-balancing opening JE. */
export function buildLoanWizardPreview(input: LoanWizardPreviewInput): LoanWizardPreview {
  const capitalizedCost = input.purchase_price_cents;
  const loanType = classifyLoanType(input.term_months);
  const depStart = input.depreciation_start_date ?? input.first_payment_date;

  // Opening JE MUST balance (Dr asset == Cr loan + Cr down). Fail hard, surfaced as 422.
  let opening: { lines: JournalLine[]; balanced: true };
  try {
    opening = buildOpeningJournalEntry({
      capitalizedCostCents: capitalizedCost,
      loanAmountCents: input.loan_amount_cents,
      downPaymentCents: input.down_payment_cents,
      cashAccountId: input.funding_account_id ?? null,
      loanType,
    });
  } catch (e) {
    throw new LoanWizardValidationError(
      `Inputs do not balance: capitalized cost ${capitalizedCost}¢ must equal loan ${input.loan_amount_cents}¢ + down payment ${input.down_payment_cents}¢.`
    );
  }

  const amortization = input.loan_amount_cents > 0
    ? buildAmortizationSchedule({
        principalCents: input.loan_amount_cents,
        annualRatePct: input.annual_rate_pct,
        termMonths: input.term_months,
        firstPaymentDate: input.first_payment_date,
      })
    : [];

  const depreciation = buildDepreciationSchedule({
    capitalizedCostCents: capitalizedCost,
    salvageValueCents: input.salvage_value_cents,
    usefulLifeMonths: input.useful_life_months,
    startDate: depStart,
  });

  const totalPayments = amortization.reduce((a, r) => a + r.payment_cents, 0);
  const totalInterest = amortization.reduce((a, r) => a + r.interest_cents, 0);
  const debitTotal = opening.lines.filter((l) => l.debit_or_credit === "debit").reduce((a, l) => a + l.amount_cents, 0);
  const creditTotal = opening.lines.filter((l) => l.debit_or_credit === "credit").reduce((a, l) => a + l.amount_cents, 0);

  return {
    balanced: debitTotal === creditTotal,
    loan_record: {
      loan_type: loanType,
      principal_cents: input.loan_amount_cents,
      annual_rate_pct: input.annual_rate_pct,
      term_months: input.term_months,
      first_payment_date: input.first_payment_date,
      lender: input.lender,
    },
    fixed_asset: {
      assets: input.assets,
      capitalized_cost_cents: capitalizedCost,
      depreciation_method: "straight_line",
      useful_life_months: input.useful_life_months,
      salvage_value_cents: input.salvage_value_cents,
      depreciation_start_date: depStart,
    },
    down_payment: { amount_cents: input.down_payment_cents, funding_account_id: input.funding_account_id ?? null },
    amortization_schedule: amortization,
    depreciation_schedule: depreciation,
    opening_journal_entry: { lines: opening.lines, debit_total_cents: debitTotal, credit_total_cents: creditTotal },
    summary: {
      monthly_payment_cents: amortization[0]?.payment_cents ?? 0,
      total_payments_cents: totalPayments,
      total_interest_cents: totalInterest,
      number_of_payments: amortization.length,
    },
  };
}
