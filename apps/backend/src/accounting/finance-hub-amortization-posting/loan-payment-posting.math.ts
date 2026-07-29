// FH-3 loan-payment GL posting — pure helpers (no DB, no side effects).
//
// NO new GL math lives here. The principal/interest split is already computed and PERSISTED by the
// FH-3 amortization engine (finance.loan_amortization_rows, built from loan-wizard/loan-math.ts); this
// file only assembles those stored cents into the 3-leg entry shape, owns the flag key + deterministic
// idempotency key, and refuses a split that does not add up.
//
// Entry shape (docs/specs/finance-hub/AMORTIZATION-DATA-MODEL.md §6):
//   Dr Note/Loan Payable   principal_cents
//   Dr Interest Expense    interest_cents
//   Cr Cash / bank         payment_cents        (= principal + interest, always)

/** Money flag — DEFAULT OFF. With it OFF the loan-payment poster writes ZERO journal entries. */
export const FINANCE_HUB_AMORTIZATION_POST_FLAG_KEY = "FINANCE_HUB_AMORTIZATION_POST_ENABLED";

export type LoanPaymentPostingErrorCode =
  | "LOAN_NOT_FOUND"
  | "LOAN_NOT_POSTABLE"
  | "ACCOUNT_MISSING"
  | "PERIOD_LOCKED"
  | "UNBALANCED_ENTRY"
  // A stored row whose principal + interest != payment cannot be posted: plugging the difference would
  // be inventing GL math. Surfaced for repair/regeneration of the schedule instead.
  | "ROW_SPLIT_MISMATCH";

export class LoanPaymentPostingError extends Error {
  code: LoanPaymentPostingErrorCode;
  details?: Record<string, unknown>;

  constructor(code: LoanPaymentPostingErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "LoanPaymentPostingError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Deterministic per-(loan, payment) idempotency key shared across the entry's legs
 * (uq_jep_company_idempotency_line). Re-running a due-date run never double-posts a payment.
 */
export function buildLoanPaymentIdempotencyKey(
  operatingCompanyId: string,
  loanId: string,
  paymentNumber: number
): string {
  return ["ih35:loan-payment:v1", operatingCompanyId.toLowerCase(), loanId.toLowerCase(), String(paymentNumber)].join(":");
}

export type LoanPaymentAccounts = {
  liabilityAccountId: string;
  interestExpenseAccountId: string | null;
  paymentAccountId: string;
};

export type LoanPaymentSplit = {
  paymentNumber: number;
  principalCents: number;
  interestCents: number;
  paymentCents: number;
};

export type LoanPaymentLine = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
};

/**
 * Assemble the legs for ONE scheduled payment from its stored split.
 *
 * Zero-value legs are omitted rather than posted as 0-cent lines: an interest-free loan books
 * Dr Note Payable / Cr Cash, and an interest-only period books Dr Interest Expense / Cr Cash. The
 * interest-expense account is required only when that period actually charges interest, so a 0%
 * loan is postable without designating one.
 */
export function buildLoanPaymentLines(
  split: LoanPaymentSplit,
  accounts: LoanPaymentAccounts,
  loanName: string
): LoanPaymentLine[] {
  for (const [key, value] of Object.entries({
    principalCents: split.principalCents,
    interestCents: split.interestCents,
    paymentCents: split.paymentCents,
  })) {
    if (!Number.isInteger(value) || value < 0) {
      throw new LoanPaymentPostingError(
        "ROW_SPLIT_MISMATCH",
        `Loan payment ${split.paymentNumber}: ${key} must be a non-negative integer number of cents (got ${value})`,
        { payment_number: split.paymentNumber, [key]: value }
      );
    }
  }
  if (split.principalCents + split.interestCents !== split.paymentCents) {
    throw new LoanPaymentPostingError(
      "ROW_SPLIT_MISMATCH",
      `Loan payment ${split.paymentNumber}: principal ${split.principalCents} + interest ${split.interestCents} != payment ${split.paymentCents} — the stored split does not add up; regenerate the schedule rather than plugging the difference`,
      {
        payment_number: split.paymentNumber,
        principal_cents: split.principalCents,
        interest_cents: split.interestCents,
        payment_cents: split.paymentCents,
      }
    );
  }
  if (split.paymentCents <= 0) {
    throw new LoanPaymentPostingError(
      "ROW_SPLIT_MISMATCH",
      `Loan payment ${split.paymentNumber}: payment_cents must be > 0 to post an entry`,
      { payment_number: split.paymentNumber, payment_cents: split.paymentCents }
    );
  }
  if (split.interestCents > 0 && !accounts.interestExpenseAccountId) {
    throw new LoanPaymentPostingError(
      "ACCOUNT_MISSING",
      `Loan payment ${split.paymentNumber} charges ${split.interestCents} cents of interest but the loan has no gl_interest_expense_account_id`,
      { payment_number: split.paymentNumber, interest_cents: split.interestCents }
    );
  }

  const lines: LoanPaymentLine[] = [];
  if (split.principalCents > 0) {
    lines.push({
      account_id: accounts.liabilityAccountId,
      debit_or_credit: "debit",
      amount_cents: split.principalCents,
      description: `Loan principal ${loanName} payment ${split.paymentNumber}`,
    });
  }
  if (split.interestCents > 0 && accounts.interestExpenseAccountId) {
    lines.push({
      account_id: accounts.interestExpenseAccountId,
      debit_or_credit: "debit",
      amount_cents: split.interestCents,
      description: `Loan interest expense ${loanName} payment ${split.paymentNumber}`,
    });
  }
  lines.push({
    account_id: accounts.paymentAccountId,
    debit_or_credit: "credit",
    amount_cents: split.paymentCents,
    description: `Loan payment ${loanName} payment ${split.paymentNumber}`,
  });
  return lines;
}
