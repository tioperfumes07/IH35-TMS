/**
 * ROUND 443.31 (Lead ruling, owner order "engine must be correct") — a historical settlement is booked at the rate the
 * driver was actually paid on the signed settlement, not today's rate card.
 *
 * MEASURED (5769 preview, 2026-10-11): bookLoad prices driver pay from driver_finance.driver_pay_rates (the newest open
 * card). Angel's card is 48¢ from 2026-08-07; signed settlement 5769 paid 45¢ on both loads, so the post refused
 * pay_mismatch (606.67 vs 568.76). The rate card is NOT edited. When the signed rate differs from what the card would
 * pay, the load is booked through the EXISTING GO-21 B5 reason-carrying override (driver_pay_rate_per_mile +
 * driver_pay_rate_override_reason, audited by bookLoad), reason "Signed settlement <no>: driver paid <rate>/mi". When
 * the card already pays the signed rate, nothing is overridden.
 */
type Card = { basis_type: string; rate_per_mile_cents: number | null; rate_empty_per_mile_cents: number | null } | null;
type Load = { line_haul_rate_cents?: number | null; empty_rate_cents?: number | null; empty_miles?: number | null };

export type SignedRateOverride = { driver_pay_rate_per_mile: number; driver_pay_rate_override_reason: string } | null;

/** The override bookLoad needs so the load pays what the signed settlement paid, or null when the card already does. */
export function signedRateOverride(settlementNo: string, load: Load, card: Card): SignedRateOverride {
  const signed = Number(load.line_haul_rate_cents ?? Number.NaN);
  if (!Number.isFinite(signed) || signed <= 0) return null;
  const signedEmpty = load.empty_rate_cents != null && Number(load.empty_rate_cents) > 0 ? Number(load.empty_rate_cents) : signed;
  const hasEmpty = Number(load.empty_miles ?? 0) > 0;
  const cardLoaded = card && card.basis_type === "per_mile_pay" ? Number(card.rate_per_mile_cents ?? Number.NaN) : Number.NaN;
  const cardEmpty = card && card.rate_empty_per_mile_cents != null ? Number(card.rate_empty_per_mile_cents) : cardLoaded;
  const cardPaysSigned = cardLoaded === signed && (!hasEmpty || cardEmpty === signedEmpty);
  if (cardPaysSigned) return null;
  const rateDollars = signed / 100;
  const no = settlementNo.trim() || "(new)";
  return {
    driver_pay_rate_per_mile: rateDollars,
    driver_pay_rate_override_reason: `Signed settlement ${no}: driver paid $${rateDollars.toFixed(2)}/mi`,
  };
}
