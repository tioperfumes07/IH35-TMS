/**
 * FH-2 Loan Wizard — pure loan/asset math (NO database, NO writes).
 * Deterministic compute used to build a preview-first draft set. All amounts are integer cents.
 * Nothing here posts; the route layer gates the whole feature behind FINANCE_HUB_LOAN_WIZARD_ENABLED.
 */

export type LoanType = "note_payable" | "loan_payable";

export type AmortizationRow = {
  period: number; // 1-based
  date: string; // YYYY-MM-DD
  payment_cents: number;
  principal_cents: number;
  interest_cents: number;
  balance_cents: number; // remaining principal after this payment
};

export type DepreciationRow = {
  period: number;
  date: string;
  depreciation_cents: number;
  accumulated_cents: number;
  book_value_cents: number;
};

export type JournalLine = {
  account_role: string; // role/label (no DB ids resolved in preview math)
  account_id: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
};

/** Term > 12 months → long-term Note Payable; otherwise current Loan Payable. */
export function classifyLoanType(termMonths: number): LoanType {
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error("termMonths must be a positive integer");
  }
  return termMonths > 12 ? "note_payable" : "loan_payable";
}

/** Add `months` to a YYYY-MM-DD date, clamping day to end-of-month. */
export function addMonths(isoDate: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new Error(`invalid date: ${isoDate}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const total = (y * 12 + (mo - 1)) + months;
  const ny = Math.floor(total / 12);
  const nmo = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nmo, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${String(ny).padStart(4, "0")}-${String(nmo).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/**
 * Standard fixed-payment amortization. Works in integer cents; the final period absorbs
 * rounding so the ending balance is exactly 0. annualRatePct is e.g. 6.5 for 6.5%/yr.
 */
export function buildAmortizationSchedule(input: {
  principalCents: number;
  annualRatePct: number;
  termMonths: number;
  firstPaymentDate: string;
}): AmortizationRow[] {
  const { principalCents, annualRatePct, termMonths, firstPaymentDate } = input;
  if (!Number.isInteger(principalCents) || principalCents <= 0) throw new Error("principalCents must be a positive integer");
  if (annualRatePct < 0) throw new Error("annualRatePct must be >= 0");
  if (!Number.isInteger(termMonths) || termMonths <= 0) throw new Error("termMonths must be a positive integer");

  const monthlyRate = annualRatePct / 100 / 12;
  // level payment (dollars) → cents, rounded
  let paymentCents: number;
  if (monthlyRate === 0) {
    paymentCents = Math.round(principalCents / termMonths);
  } else {
    const p = principalCents;
    const factor = monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths));
    paymentCents = Math.round(p * factor);
  }

  const rows: AmortizationRow[] = [];
  let balance = principalCents;
  for (let period = 1; period <= termMonths; period++) {
    const interest = monthlyRate === 0 ? 0 : Math.round(balance * monthlyRate);
    let principalPortion = paymentCents - interest;
    let payment = paymentCents;
    if (period === termMonths || principalPortion >= balance) {
      // final (or rounding-overrun) period: pay off the remaining balance exactly
      principalPortion = balance;
      payment = principalPortion + interest;
    }
    balance -= principalPortion;
    rows.push({
      period,
      date: addMonths(firstPaymentDate, period - 1),
      payment_cents: payment,
      principal_cents: principalPortion,
      interest_cents: interest,
      balance_cents: balance,
    });
    if (balance <= 0) break;
  }
  return rows;
}

/** Straight-line depreciation; final period absorbs rounding so book value ends at salvage. */
export function buildDepreciationSchedule(input: {
  capitalizedCostCents: number;
  salvageValueCents: number;
  usefulLifeMonths: number;
  startDate: string;
}): DepreciationRow[] {
  const { capitalizedCostCents, salvageValueCents, usefulLifeMonths, startDate } = input;
  if (!Number.isInteger(capitalizedCostCents) || capitalizedCostCents < 0) throw new Error("capitalizedCostCents must be >= 0");
  if (!Number.isInteger(salvageValueCents) || salvageValueCents < 0) throw new Error("salvageValueCents must be >= 0");
  if (salvageValueCents > capitalizedCostCents) throw new Error("salvage cannot exceed capitalized cost");
  if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths <= 0) throw new Error("usefulLifeMonths must be a positive integer");

  const depreciable = capitalizedCostCents - salvageValueCents;
  const monthly = Math.round(depreciable / usefulLifeMonths);
  const rows: DepreciationRow[] = [];
  let accumulated = 0;
  for (let period = 1; period <= usefulLifeMonths; period++) {
    let dep = monthly;
    if (period === usefulLifeMonths || accumulated + dep > depreciable) {
      dep = depreciable - accumulated; // final period absorbs rounding
    }
    accumulated += dep;
    rows.push({
      period,
      date: addMonths(startDate, period - 1),
      depreciation_cents: dep,
      accumulated_cents: accumulated,
      book_value_cents: capitalizedCostCents - accumulated,
    });
  }
  return rows;
}

/**
 * Opening journal entry for a financed asset purchase:
 *   Dr Fixed Asset (capitalized cost)
 *   Cr Note/Loan Payable (loan amount)
 *   Cr Cash/Bank (down payment)
 * MUST balance (capitalized cost === loan + down) or this throws — fail hard, never post unbalanced.
 */
export function buildOpeningJournalEntry(input: {
  capitalizedCostCents: number;
  loanAmountCents: number;
  downPaymentCents: number;
  assetAccountId?: string | null;
  liabilityAccountId?: string | null;
  cashAccountId?: string | null;
  loanType: LoanType;
}): { lines: JournalLine[]; balanced: true } {
  const { capitalizedCostCents, loanAmountCents, downPaymentCents, loanType } = input;
  for (const [k, v] of Object.entries({ capitalizedCostCents, loanAmountCents, downPaymentCents })) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${k} must be a non-negative integer (cents)`);
  }
  const credits = loanAmountCents + downPaymentCents;
  if (capitalizedCostCents !== credits) {
    throw new Error(
      `opening JE does not balance: Dr asset ${capitalizedCostCents} != Cr loan ${loanAmountCents} + Cr cash ${downPaymentCents} (${credits})`
    );
  }
  const lines: JournalLine[] = [
    {
      account_role: "fixed_asset",
      account_id: input.assetAccountId ?? null,
      debit_or_credit: "debit",
      amount_cents: capitalizedCostCents,
      description: "Capitalized asset cost",
    },
    {
      account_role: loanType,
      account_id: input.liabilityAccountId ?? null,
      debit_or_credit: "credit",
      amount_cents: loanAmountCents,
      description: loanType === "note_payable" ? "Note payable (financed)" : "Loan payable (financed)",
    },
  ];
  if (downPaymentCents > 0) {
    lines.push({
      account_role: "cash",
      account_id: input.cashAccountId ?? null,
      debit_or_credit: "credit",
      amount_cents: downPaymentCents,
      description: "Down payment from funding account",
    });
  }
  const dr = lines.filter((l) => l.debit_or_credit === "debit").reduce((a, l) => a + l.amount_cents, 0);
  const cr = lines.filter((l) => l.debit_or_credit === "credit").reduce((a, l) => a + l.amount_cents, 0);
  if (dr !== cr) throw new Error(`opening JE imbalance after assembly: dr ${dr} != cr ${cr}`);
  return { lines, balanced: true };
}
