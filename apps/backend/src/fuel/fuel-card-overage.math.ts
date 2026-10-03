/**
 * BANK-DOM-06 — fuel-card OVERAGE math (pure; no I/O; no GL math).
 *
 * An "overage" is the portion of a fleet-card purchase the COMPANY paid but the DRIVER owes back.
 * It is ENTIRELY owner-designated: the only inputs are the two knobs on the owner's
 * `fuel.fuel_card_overage_policies` row. No policy row -> no limit -> zero overage -> strict no-op.
 * Nothing here infers a limit, a percentage, or a "reasonable" cap.
 *
 * Three recoverable shapes, matching real fleet-card practice (Comdata / EFS / WEX over-limit
 * chargeback, and the McLeod "non-fuel purchase charged to driver" pattern):
 *   1) NON-FUEL purchase on the fuel card (fuel_type='other' — merchandise, food, personal items).
 *      Recoverable IN FULL when the policy opts in. No part of it is a company fuel cost. (A repair or a
 *      manager-authorized purchase is exempted by the reviewer on the event, not here.)
 *   2) OVER THE GALLON LIMIT (ROUND 355 R-2) — evaluated FIRST whenever the row carries gallons. The limit is
 *      the unit's own tank (fuel_tank_capacity_gallons; for reefer fuel, the trailer's reefer tank), else the
 *      policy's per_swipe_gallon_limit (fallback, 150). overage = (gallons − limit) × unit price. A tank cap
 *      is physical: gallons beyond what the tank holds did not go into this truck, at any pump price.
 *   3) OVER THE DOLLAR LIMIT — LAST fallback, only for a row with no gallon quantity.
 *
 * The three are mutually exclusive by construction: a non-fuel purchase is already fully recovered, and a
 * row with gallons is judged on gallons only (never gallons + dollars — that would recover more than the
 * driver was charged).
 */

/** The owner's active policy for a company (or the per-driver override). */
export type FuelCardOveragePolicy = {
  /** Spend above this on ONE card transaction is recoverable. null = the owner set no dollar limit. */
  per_transaction_limit_cents: number | null;
  /** When true a non-fuel (fuel_type='other') card purchase is recoverable in full. */
  recover_non_fuel_purchases: boolean;
  /** FALLBACK gallon cap per swipe when the unit has no recorded tank (owner A3: 150). */
  per_swipe_gallon_limit?: number | null;
};

/** Where a gallon limit came from — persisted on the event so the arithmetic is reviewable. */
export type GallonLimitSource = "unit_tank" | "reefer_tank" | "policy_per_swipe";

export type FuelOverageInput = {
  /** The full amount the company was charged for this card transaction, in integer cents. */
  total_cents: number;
  /** Canonical fuel.fuel_transactions.fuel_type. */
  fuel_type: string;
  /** The owner's active policy, or null when none is designated. */
  policy: FuelCardOveragePolicy | null;
  /** Gallons on this card row (fuel.fuel_transactions.gallons); null/0 = no gallon quantity. */
  gallons?: number | null;
  /** Pump price in DOLLARS per gallon (fuel.fuel_transactions.price_per_gallon); derived from total/gallons when absent. */
  price_per_gallon?: number | null;
  /** The tank this fuel went into: the unit's tank, or for reefer fuel the trailer's reefer tank. null = not recorded. */
  tank_capacity_gallons?: number | null;
  tank_source?: "unit_tank" | "reefer_tank";
};

export type FuelOverageResult = {
  /** Integer cents recoverable from the driver. 0 means "no overage" — the caller must not write. */
  overage_cents: number;
  /** Why this amount was derived — persisted on the deduction reason for auditability. */
  rule: "none" | "non_fuel_purchase" | "over_gallon_limit" | "over_transaction_limit";
  /** Present when rule = over_gallon_limit: the inputs the amount was derived from. */
  gallons?: number;
  gallon_limit?: number;
  gallon_limit_source?: GallonLimitSource;
  unit_price_cents?: number;
};

const NO_OVERAGE: FuelOverageResult = { overage_cents: 0, rule: "none" };

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== undefined && Number.isFinite(n) && n > 0 ? n : null;
};

/** The gallon limit for this row: the tank it went into, else the policy fallback, else none. */
export function resolveGallonLimit(
  input: Pick<FuelOverageInput, "tank_capacity_gallons" | "tank_source" | "policy">
): { limit: number; source: GallonLimitSource } | null {
  const tank = positive(input.tank_capacity_gallons);
  if (tank !== null) return { limit: tank, source: input.tank_source ?? "unit_tank" };
  const fallback = positive(input.policy?.per_swipe_gallon_limit);
  if (fallback !== null) return { limit: fallback, source: "policy_per_swipe" };
  return null;
}

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

  // 2) Gallons FIRST: a row that carries gallons is judged on gallons only.
  const gallons = positive(input.gallons);
  if (gallons !== null) {
    const gl = resolveGallonLimit(input);
    if (!gl || gallons <= gl.limit) return NO_OVERAGE;
    const unitPriceCents = positive(input.price_per_gallon) !== null
      ? Number(input.price_per_gallon) * 100
      : totalCents / gallons;
    // Never recover more than the purchase.
    const overage = Math.min(totalCents, Math.round((gallons - gl.limit) * unitPriceCents));
    if (overage <= 0) return NO_OVERAGE;
    return {
      overage_cents: overage,
      rule: "over_gallon_limit",
      gallons,
      gallon_limit: gl.limit,
      gallon_limit_source: gl.source,
      unit_price_cents: Math.round(unitPriceCents * 10000) / 10000,
    };
  }

  // 3) LAST fallback — no gallon quantity on the row: the owner's per-transaction dollar limit.
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
  if (result.rule === "over_gallon_limit") {
    const where =
      result.gallon_limit_source === "unit_tank" ? "the unit's tank capacity"
      : result.gallon_limit_source === "reefer_tank" ? "the reefer tank capacity"
      : "the per-swipe gallon limit";
    const price = `$${((result.unit_price_cents ?? 0) / 100).toFixed(3)}`;
    return (
      `Fuel-card overage: ${result.gallons} gal exceeded ${where} of ${result.gallon_limit} gal by ` +
      `${Number(((result.gallons ?? 0) - (result.gallon_limit ?? 0)).toFixed(3))} gal at ${price}/gal = ` +
      `${dollars(result.overage_cents)} (recovered from driver settlement)`
    );
  }
  const limitCents = Math.round(Number(policy.per_transaction_limit_cents ?? 0));
  return (
    `Fuel-card overage: purchase ${dollars(totalCents)} exceeded the ${dollars(limitCents)} ` +
    `per-transaction limit by ${dollars(result.overage_cents)} (recovered from driver settlement)`
  );
}
