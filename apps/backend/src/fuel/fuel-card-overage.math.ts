/**
 * BANK-DOM-06 — fuel-card OVERAGE math (pure; no I/O; no GL math).
 *
 * An "overage" is the portion of a fleet-card purchase the COMPANY paid but the DRIVER owes back.
 * It is ENTIRELY owner-designated: the only inputs are the two knobs on the owner's
 * `fuel.fuel_card_overage_policies` row. No policy row -> no limit -> zero overage -> strict no-op.
 * Nothing here infers a limit, a percentage, or a "reasonable" cap.
 *
 * Two recoverable shapes, matching real fleet-card practice (Comdata / EFS / WEX over-limit
 * chargeback, and the McLeod "non-fuel purchase charged to driver" pattern):
 *   1) NON-FUEL purchase on the fuel card (fuel_type='other' — merchandise, food, personal items).
 *      Recoverable IN FULL when the policy opts in. No part of it is a company fuel cost.
 *   2) OVER-LIMIT spend: the amount above the per-transaction dollar limit on a single purchase.
 *
 * The two are mutually exclusive by construction: a non-fuel purchase is already fully recovered, so
 * the limit rule cannot also apply to it (that would recover more than the driver was charged).
 */

/** The owner's active policy for a company (or the per-driver override). */
export type FuelCardOveragePolicy = {
  /** Spend above this on ONE card transaction is recoverable. null = the owner set no dollar limit. */
  per_transaction_limit_cents: number | null;
  /** When true a non-fuel (fuel_type='other') card purchase is recoverable in full. */
  recover_non_fuel_purchases: boolean;
};

export type FuelOverageInput = {
  /** The full amount the company was charged for this card transaction, in integer cents. */
  total_cents: number;
  /** Canonical fuel.fuel_transactions.fuel_type. */
  fuel_type: string;
  /** The owner's active policy, or null when none is designated. */
  policy: FuelCardOveragePolicy | null;
};

export type FuelOverageResult = {
  /** Integer cents recoverable from the driver. 0 means "no overage" — the caller must not write. */
  overage_cents: number;
  /** Why this amount was derived — persisted on the deduction reason for auditability. */
  rule: "none" | "non_fuel_purchase" | "over_transaction_limit";
};

const NO_OVERAGE: FuelOverageResult = { overage_cents: 0, rule: "none" };

/**
 * Derive the recoverable overage for a single fuel-card transaction.
 * Returns 0 for every ambiguous, non-positive, or unpoliced input — this NEVER guesses a charge
 * against a driver, because a wrong overage is money taken from a person's paycheck.
 */
export function computeFuelCardOverageCents(input: FuelOverageInput): FuelOverageResult {
  const policy = input.policy;
  if (!policy) return NO_OVERAGE;

  const totalCents = Math.round(Number(input.total_cents ?? 0));
  if (!Number.isFinite(totalCents) || totalCents <= 0) return NO_OVERAGE;

  const fuelType = String(input.fuel_type ?? "").trim().toLowerCase();

  // 1) Non-fuel purchase on the fleet card — recoverable in full when the owner opted in.
  if (policy.recover_non_fuel_purchases && fuelType === "other") {
    return { overage_cents: totalCents, rule: "non_fuel_purchase" };
  }

  // 2) Over the owner's per-transaction dollar limit — only the excess is recoverable.
  const limit = policy.per_transaction_limit_cents;
  if (limit !== null && limit !== undefined) {
    const limitCents = Math.round(Number(limit));
    if (Number.isFinite(limitCents) && limitCents > 0 && totalCents > limitCents) {
      return { overage_cents: totalCents - limitCents, rule: "over_transaction_limit" };
    }
  }

  return NO_OVERAGE;
}

/** Human-readable, audit-grade deduction reason. Always names the rule and the policy input. */
export function buildOverageReason(
  result: FuelOverageResult,
  policy: FuelCardOveragePolicy,
  totalCents: number
): string {
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  if (result.rule === "non_fuel_purchase") {
    return `Fuel-card non-fuel purchase of ${dollars(totalCents)} recovered from driver per company fuel-card policy`;
  }
  const limitCents = Math.round(Number(policy.per_transaction_limit_cents ?? 0));
  return (
    `Fuel-card overage: purchase ${dollars(totalCents)} exceeded the ${dollars(limitCents)} ` +
    `per-transaction limit by ${dollars(result.overage_cents)} (recovered from driver settlement)`
  );
}
