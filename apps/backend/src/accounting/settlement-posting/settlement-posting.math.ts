// FIN-18 — pure helpers for the settlement + deduction GL posting engine.
// No DB, no side effects: unit-tested independently of Postgres so the floor/consent invariants
// are provable in every environment (not only the CI real-Postgres path).

/** Money flag — DEFAULT OFF. With it OFF the FIN-18 poster writes ZERO journal entries. */
export const SETTLEMENT_GL_POSTING_FLAG_KEY = "SETTLEMENT_GL_POSTING_ENABLED";

/** Owner-locked default: the driver must retain >= 10% of the GROSS settlement. */
export const DEFAULT_NET_PAY_FLOOR_PCT = 0.1;

/** numeric(14,2) dollars (string|number) -> integer cents. NaN-safe. */
export function dollarsToCents(dollars: number | string | null | undefined): number {
  const n = Number(dollars ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Clamp a configured floor pct into [0,1]; fall back to the 10% default when ABSENT/invalid. */
export function normalizeFloorPct(floorPct: number | string | null | undefined): number {
  // null/undefined/empty => "not set" => default (Number(null) would coerce to 0 — a different meaning).
  if (floorPct === null || floorPct === undefined || (typeof floorPct === "string" && floorPct.trim() === "")) {
    return DEFAULT_NET_PAY_FLOOR_PCT;
  }
  const pct = Number(floorPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 1) return DEFAULT_NET_PAY_FLOOR_PCT;
  return pct;
}

/**
 * The floor amount (cents) the driver must retain. Uses Math.ceil so a fractional cent always rounds
 * UP in the driver's favor (a stricter floor — never lets net dip a sub-cent below the legal minimum).
 */
export function netPayFloorCents(grossCents: number, floorPct: number | string | null | undefined): number {
  return Math.ceil(grossCents * normalizeFloorPct(floorPct));
}

/**
 * The APPLICABLE floor (cents). For 1099 (default today) this is the policy %-of-gross floor.
 * For W-2, the STRICTER of the policy floor and the FLSA minimum-wage floor applies (structure now;
 * with no FLSA inputs it degrades to the policy floor — the default 10% behavior).
 */
export function applicableFloorCents(args: {
  grossCents: number;
  floorPct: number | string | null | undefined;
  workerClass?: "1099" | "w2" | string | null;
  flsaFloorCents?: number | null;
}): number {
  const policyFloor = netPayFloorCents(args.grossCents, args.floorPct);
  if (args.workerClass === "w2" && typeof args.flsaFloorCents === "number" && args.flsaFloorCents > 0) {
    return Math.max(policyFloor, args.flsaFloorCents); // stricter of the two
  }
  return policyFloor;
}

/**
 * True when applying `totalDeductionCents` against `grossCents` would drop pay-after-deductions
 * below the floor. The engine BLOCKS (never silently applies/caps/spreads) when this returns true.
 */
export function breachesNetPayFloor(
  grossCents: number,
  totalDeductionCents: number,
  floorPct: number | string | null | undefined
): boolean {
  return grossCents - totalDeductionCents < netPayFloorCents(grossCents, floorPct);
}

/** Bucket-type -> catalogs.account_role_bindings role_key for the deduction's recovery account. */
export function bucketRecoveryRoleKey(bucketType: string): string {
  return `${bucketType.trim().toLowerCase()}_recovery`;
}

export type BalancedLine = { debit_or_credit: "debit" | "credit"; amount_cents: number };

/** Balance-or-fail: total debits must equal total credits and be > 0. Mirrors createJournalEntry's guard. */
export function assertBalanced(lines: BalancedLine[]): void {
  const debits = lines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + Number(l.amount_cents || 0), 0);
  const credits = lines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + Number(l.amount_cents || 0), 0);
  if (debits <= 0 || credits <= 0 || debits !== credits) {
    throw new SettlementPostingError(
      "UNBALANCED_ENTRY",
      `Settlement posting must be balanced (debits=${debits}, credits=${credits})`
    );
  }
}

/** Deterministic idempotency key shared across an entry's lines (uq_jep_company_idempotency_line). */
export function buildSettlementIdempotencyKey(
  operatingCompanyId: string,
  settlementId: string,
  purpose: "initial_post" | "reversal"
): string {
  return ["ih35:settlement-gl:v1", operatingCompanyId.toLowerCase(), settlementId.toLowerCase(), purpose].join(":");
}

export type SettlementPostingErrorCode =
  | "SETTLEMENT_NOT_FOUND"
  | "SETTLEMENT_NOT_POSTABLE"
  | "CONSENT_MISSING"
  | "NET_PAY_FLOOR_BREACH"
  | "ACCOUNT_ROLE_BINDING_MISSING"
  | "SETTLEMENT_TOTALS_INCONSISTENT"
  | "UNBALANCED_ENTRY";

export class SettlementPostingError extends Error {
  code: SettlementPostingErrorCode;
  details?: Record<string, unknown>;

  constructor(code: SettlementPostingErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SettlementPostingError";
    this.code = code;
    this.details = details;
  }
}
