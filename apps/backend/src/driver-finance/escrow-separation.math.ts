// BLOCK-02 — pure helpers for the driver-escrow >=90-day post-separation return path.
// No DB, no side effects: unit-tested independently of Postgres, mirroring the FIN-18
// settlement-posting.math.ts convention (pure math kept out of the DB-touching service).

/** Money flag — DEFAULT OFF. With it OFF the return-path service writes ZERO postings. */
export const DRIVER_ESCROW_SEPARATION_RETURN_FLAG_KEY = "DRIVER_ESCROW_SEPARATION_RETURN_ENABLED";

/** The CPA/owner-locked hold period: escrow returns net, >=90 days AFTER separation. */
export const ESCROW_SEPARATION_HOLD_DAYS = 90;

/** YYYY-MM-DD (no time-of-day) -> Date at UTC midnight. Avoids TZ-shift off-by-one on date-only values. */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error(`invalid_date_only: ${value}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** eligible_release_date = separation_date + 90 days (mirrors the migration's GENERATED column). */
export function computeEligibleReleaseDate(separationDate: string | Date): Date {
  const d = parseDateOnly(separationDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ESCROW_SEPARATION_HOLD_DAYS));
}

/** Whole days remaining until eligible (negative/0 = eligible now). */
export function daysUntilEligible(eligibleReleaseDate: string | Date, now: Date = new Date()): number {
  const eligible = parseDateOnly(eligibleReleaseDate);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.ceil((eligible.getTime() - today.getTime()) / 86_400_000);
}

/** True once `now` is on/after the 90-day eligible_release_date. Never true before. */
export function isEligibleForRelease(eligibleReleaseDate: string | Date, now: Date = new Date()): boolean {
  return daysUntilEligible(eligibleReleaseDate, now) <= 0;
}

export type NetEscrowReturn = {
  /** What the escrow account currently holds. */
  balance_cents: number;
  /** Sum of still-unrecovered damage-claim deductions against this driver (pay-first-then-escrow fallback). */
  outstanding_damage_claims_cents: number;
  /** Amount actually released to the driver as cash (Dr escrow-liability / Cr cash). */
  net_release_cents: number;
  /** Amount retained to (eventually) satisfy the outstanding damage claim(s); NOT auto-posted by this build. */
  retained_for_damages_cents: number;
};

/**
 * Net-of-damage-deductions computation for the separation return. Never negative, never exceeds the
 * balance on hand. Pure — the caller supplies both inputs from a single consistent DB read.
 */
export function computeNetEscrowReturn(balanceCents: number, outstandingDamageClaimsCents: number): NetEscrowReturn {
  const balance = Math.max(0, Math.round(balanceCents || 0));
  const outstanding = Math.max(0, Math.round(outstandingDamageClaimsCents || 0));
  const retained = Math.min(outstanding, balance);
  const net = balance - retained;
  return {
    balance_cents: balance,
    outstanding_damage_claims_cents: outstanding,
    net_release_cents: net,
    retained_for_damages_cents: retained,
  };
}
