/**
 * FH-4 Finance Calculator — PURE modeling (no DB, no writes, never posts).
 * Reuses FH-2 loan-math. Computes per-scenario: monthly payment, total interest, payoff date, and a
 * short amortization preview; supports comparing multiple rate/term scenarios side by side.
 */
import { z } from "zod";
import { buildAmortizationSchedule, type AmortizationRow } from "../loan-wizard/loan-math.js";

const intCents = z.number().int();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const calculatorInputSchema = z.object({
  operating_company_id: z.string().uuid(), // used only for flag scoping; nothing is written
  price_cents: intCents.positive(),
  down_payment_cents: intCents.nonnegative().default(0),
  first_payment_date: isoDate,
  scenarios: z
    .array(z.object({ annual_rate_pct: z.number().min(0).max(100), term_months: z.number().int().positive().max(600) }))
    .min(1)
    .max(4),
});
export type CalculatorInput = z.infer<typeof calculatorInputSchema>;

export type CalculatorScenario = {
  annual_rate_pct: number;
  term_months: number;
  financed_principal_cents: number;
  monthly_payment_cents: number;
  total_payments_cents: number;
  total_interest_cents: number;
  payoff_date: string;
  number_of_payments: number;
  amortization_preview: AmortizationRow[]; // first 12 rows
};

export class CalculatorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculatorValidationError";
  }
}

export function computeCalculator(input: CalculatorInput): { financed_principal_cents: number; scenarios: CalculatorScenario[] } {
  const financed = input.price_cents - input.down_payment_cents;
  if (financed <= 0) {
    throw new CalculatorValidationError(`Down payment (${input.down_payment_cents}¢) must be less than price (${input.price_cents}¢).`);
  }
  const scenarios = input.scenarios.map((s) => {
    const rows = buildAmortizationSchedule({
      principalCents: financed,
      annualRatePct: s.annual_rate_pct,
      termMonths: s.term_months,
      firstPaymentDate: input.first_payment_date,
    });
    const totalPayments = rows.reduce((a, r) => a + r.payment_cents, 0);
    const totalInterest = rows.reduce((a, r) => a + r.interest_cents, 0);
    return {
      annual_rate_pct: s.annual_rate_pct,
      term_months: s.term_months,
      financed_principal_cents: financed,
      monthly_payment_cents: rows[0]?.payment_cents ?? 0,
      total_payments_cents: totalPayments,
      total_interest_cents: totalInterest,
      payoff_date: rows[rows.length - 1]?.date ?? input.first_payment_date,
      number_of_payments: rows.length,
      amortization_preview: rows.slice(0, 12),
    };
  });
  return { financed_principal_cents: financed, scenarios };
}
