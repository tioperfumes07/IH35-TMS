export type DecisionId =
  | "Q1"
  | "Q2"
  | "Q3"
  | "Q4"
  | "Q5"
  | "Q6"
  | "Q7"
  | "Q8"
  | "Q9"
  | "Q10"
  | "Q11"
  | "Q12"
  | "VQ1"
  | "VQ2"
  | "VQ3"
  | "VQ4"
  | "VQ5"
  | "VQ6"
  | "VQ7"
  | "VQ8"
  | "VQ9"
  | "INVQ9";

export const LOCKED_DECISIONS: Record<DecisionId, string> = {
  Q1: "Factoring cash policy uses Option A.",
  Q2: "Balance Sheet cash mode uses a single Cash Basis Adjustment line under equity.",
  Q3: "Trial Balance cash mode keeps AR/AP rows present with zero balances.",
  Q4: "AR/AP aging endpoints remain accrual only.",
  Q5: "Driver settlements recognize on bank settlement date in cash mode.",
  Q6: "Refunds are represented as separate expense lines, not negative revenue.",
  Q7: "Basis defaults to accrual (frontend default, no per-user memory).",
  Q8: "IFTA remains accrual only.",
  Q9: "Closed periods lock cash-basis numbers via snapshot.",
  Q10: "Direct journal entries pass through both accrual and cash.",
  Q11: "Tenant-scoped report payloads are transformed deterministically.",
  Q12: "Foundation only; frontend toggle exposure follows in later cuts.",
  VQ1: "Validation: factoring behavior follows approved open decision.",
  VQ2: "Validation: cash adjustment line appears under equity.",
  VQ3: "Validation: AR/AP rows are shown as zero in TB cash mode.",
  VQ4: "Validation: AR/AP aging remains accrual regardless of basis input.",
  VQ5: "Validation: driver settlements use bank settlement date.",
  VQ6: "Validation: refunds use separate expense presentation.",
  VQ7: "Validation: default basis is accrual.",
  VQ8: "Validation: IFTA remains accrual only.",
  VQ9: "Validation: closed period cash snapshots are reused.",
  INVQ9: "Inventory/driver settlement policy tracks Bill + BillPayment (1099).",
};

export const DEFAULT_BASIS = "accrual" as const;
export const ACCRUAL_ONLY_SURFACES = ["cash-flow", "ar-aging", "ap-aging", "ifta"] as const;

export type CashBasisEntry = {
  entry_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  account_subtype?: string | null;
  amount_cents: number;
  source_type:
    | "ar_control"
    | "ap_control"
    | "direct_je"
    | "refund"
    | "driver_settlement"
    | "factoring_advance"
    | "invoice_revenue"
    | "bill_expense"
    | "cash_event"
    | "other";
  event_date?: string | null;
  settlement_date?: string | null;
  metadata?: Record<string, unknown>;
};

export type CashBasisOptions = {
  as_of_date: string;
  ar_control_matcher?: (entry: CashBasisEntry) => boolean;
  ap_control_matcher?: (entry: CashBasisEntry) => boolean;
};

export type BalanceSheetLike = {
  assets: { total: number };
  liabilities: { total: number };
  equity: { total: number };
};

function isOnOrBefore(dateLike: string | null | undefined, asOfDate: string) {
  if (!dateLike) return false;
  return String(dateLike).slice(0, 10) <= asOfDate;
}

function defaultArMatcher(entry: CashBasisEntry) {
  const name = `${entry.account_code} ${entry.account_name}`.toLowerCase();
  return entry.account_type === "Asset" && (name.includes("accounts receivable") || name.includes("a/r"));
}

function defaultApMatcher(entry: CashBasisEntry) {
  const name = `${entry.account_code} ${entry.account_name}`.toLowerCase();
  return entry.account_type === "Liability" && (name.includes("accounts payable") || name.includes("a/p"));
}

export function applyCashBasisSuppression(entries: CashBasisEntry[], opts: CashBasisOptions): CashBasisEntry[] {
  const arMatcher = opts.ar_control_matcher ?? defaultArMatcher;
  const apMatcher = opts.ap_control_matcher ?? defaultApMatcher;
  const out: CashBasisEntry[] = [];
  let refundExpenseCents = 0;

  for (const entry of entries) {
    // @decision Q10
    if (entry.source_type === "direct_je") {
      out.push({ ...entry });
      continue;
    }

    // @decision Q3
    if (entry.source_type === "ar_control" || arMatcher(entry)) {
      out.push({ ...entry, amount_cents: 0 });
      continue;
    }

    // @decision Q3
    if (entry.source_type === "ap_control" || apMatcher(entry)) {
      out.push({ ...entry, amount_cents: 0 });
      continue;
    }

    // @decision Q6
    if (entry.source_type === "refund") {
      refundExpenseCents += Math.abs(entry.amount_cents);
      out.push({ ...entry, amount_cents: 0 });
      continue;
    }

    // @decision Q5
    if (entry.source_type === "driver_settlement") {
      const recognized = isOnOrBefore(entry.settlement_date, opts.as_of_date);
      out.push({ ...entry, amount_cents: recognized ? entry.amount_cents : 0 });
      continue;
    }

    // @decision Q1
    if (entry.source_type === "factoring_advance") {
      out.push({
        ...entry,
        account_type: "Liability",
        account_name: "Factoring Reserve Liability",
      });
      continue;
    }

    // @decision VQ5
    if (entry.source_type === "invoice_revenue" || entry.source_type === "bill_expense") {
      const recognized = isOnOrBefore(entry.settlement_date, opts.as_of_date);
      out.push({ ...entry, amount_cents: recognized ? entry.amount_cents : 0 });
      continue;
    }

    out.push({ ...entry });
  }

  // @decision VQ6
  if (refundExpenseCents > 0) {
    out.push({
      entry_id: "cash-basis-refunds",
      account_code: "REFUND",
      account_name: "Refunds and Returns",
      account_type: "Expense",
      amount_cents: refundExpenseCents,
      source_type: "refund",
      event_date: opts.as_of_date,
      settlement_date: opts.as_of_date,
      metadata: { synthesized: true, decision: "Q6" },
    });
  }

  return out;
}

export function computeCashBasisAdjustment(balanceSheet: BalanceSheetLike) {
  // @decision Q2
  const liabilitiesAndEquity = balanceSheet.liabilities.total + balanceSheet.equity.total;
  const delta = balanceSheet.assets.total - liabilitiesAndEquity;
  return {
    account_code: "CASH_BASIS_ADJ",
    account_name: "Cash Basis Adjustment",
    account_type: "Equity",
    amount: delta,
  };
}
