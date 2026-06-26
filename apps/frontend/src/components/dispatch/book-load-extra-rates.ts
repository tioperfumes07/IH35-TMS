import type { BookLoadChargeLine } from "./accessorial-editor-lib";

/**
 * W7 (amounts half) — per-stop extra rates must bill the customer.
 *
 * The §A per-stop extra-rate editor writes stops[].extra_rates[] ({ rate_type, amount_cents,
 * description }), but those amounts were NOT summed into the invoice and were DROPPED from the POST
 * payload (the payload type has no stops[].extra_rates). This module is the single source that (a) sums
 * them and (b) converts them into customer `charges` lines — the same path accessorials already take to
 * the invoice/QBO outbox — so they reach the payload without a backend change. Pure + unit-tested (Tier-2).
 */
export type StopExtraRate = { rate_type?: string | null; amount_cents?: number | null; description?: string | null };
export type StopExtraRatesInput = { extra_rates?: readonly StopExtraRate[] | null };

export function sumStopExtraRatesCents(stops: readonly StopExtraRatesInput[] | undefined): number {
  let total = 0;
  for (const stop of stops ?? []) {
    for (const rate of stop?.extra_rates ?? []) {
      total += Math.max(0, Number(rate?.amount_cents ?? 0));
    }
  }
  return total;
}

export function stopExtraRateChargeLines(stops: readonly StopExtraRatesInput[] | undefined): BookLoadChargeLine[] {
  const lines: BookLoadChargeLine[] = [];
  for (const stop of stops ?? []) {
    for (const rate of stop?.extra_rates ?? []) {
      const amount = Math.max(0, Number(rate?.amount_cents ?? 0));
      if (amount <= 0) continue;
      const code = String(rate?.rate_type || "extra_rate").trim().toLowerCase() || "extra_rate";
      lines.push({ code, amount_cents: amount });
    }
  }
  return lines;
}
