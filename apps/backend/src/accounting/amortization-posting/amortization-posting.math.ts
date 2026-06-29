// FIN-21 — pure helpers for the prepaid-amortization + fixed-asset-depreciation GL posting engine.
// No DB, no side effects: unit-tested independently of Postgres. NO new GL math here — the schedule
// computations are REUSED (prepaid rows are pre-persisted by prepaid-expenses.routes.ts;
// depreciation rows are computed by fixed-assets.math.ts). This file only owns the flag key, the
// deterministic idempotency keys, the balance assertion, and the error type.

/** Money flag — DEFAULT OFF. With it OFF the FIN-21 poster writes ZERO journal entries. */
export const AMORTIZATION_GL_POSTING_FLAG_KEY = "AMORTIZATION_GL_POSTING_ENABLED";

export type BalancedLine = { debit_or_credit: "debit" | "credit"; amount_cents: number };

/** Balance-or-fail: total debits must equal total credits and be > 0. Mirrors createJournalEntry's guard. */
export function assertBalanced(lines: BalancedLine[]): void {
  const debits = lines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + Number(l.amount_cents || 0), 0);
  const credits = lines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + Number(l.amount_cents || 0), 0);
  if (debits <= 0 || credits <= 0 || debits !== credits) {
    throw new AmortizationPostingError(
      "UNBALANCED_ENTRY",
      `Amortization posting must be balanced (debits=${debits}, credits=${credits})`
    );
  }
}

/**
 * Deterministic per-(asset, period) idempotency key shared across an entry's two lines
 * (uq_jep_company_idempotency_line). Re-running a period-run never double-posts.
 */
export function buildPrepaidAmortizationIdempotencyKey(
  operatingCompanyId: string,
  assetId: string,
  periodNumber: number
): string {
  return ["ih35:prepaid-amort:v1", operatingCompanyId.toLowerCase(), assetId.toLowerCase(), String(periodNumber)].join(":");
}

export function buildDepreciationIdempotencyKey(
  operatingCompanyId: string,
  assetId: string,
  periodNumber: number
): string {
  return ["ih35:depreciation:v1", operatingCompanyId.toLowerCase(), assetId.toLowerCase(), String(periodNumber)].join(":");
}

export type AmortizationPostingErrorCode =
  | "ASSET_NOT_FOUND"
  | "ASSET_NOT_POSTABLE"
  | "ACCOUNT_MISSING"
  | "PERIOD_LOCKED"
  | "UNBALANCED_ENTRY"
  // The reused (display-only) depreciation schedule re-depreciates the full base and does NOT net out
  // prior_accumulated_depr_cents, so posting a mid-life takeover asset would double-count prior
  // depreciation. Fail loud rather than mis-post (no new GL math — surfaced for owner decision).
  | "PRIOR_ACCUM_UNSUPPORTED";

export class AmortizationPostingError extends Error {
  code: AmortizationPostingErrorCode;
  details?: Record<string, unknown>;

  constructor(code: AmortizationPostingErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AmortizationPostingError";
    this.code = code;
    this.details = details;
  }
}
