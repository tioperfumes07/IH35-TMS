/**
 * RELAY-F442 — Relay's total_amount_paid is FUEL ONLY (sum of discounted fuel_items).
 * The sender_fee lives in fees[] (and often again on fuel_items[].fee). Wallet drawdown
 * and GL credit = fuel paid + fee; the fee posts as its own "Fuel Card Fee" expense line.
 *
 * Never hardcode $2.00 — read the feed. Prefer top-level fees[] when present (authoritative);
 * otherwise sum line fee_amount_cents. Never add both (same fee is duplicated on the sample
 * txn_4ypX8FQCRzHr5n).
 */
import { relayMoneyField } from "./relay-client.js";

export type RelayFeeLike = { type?: string | null; amount?: string | null } | null | undefined;

function asFeeObject(value: unknown): { type: string | null; amount: unknown } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    type: typeof row.type === "string" ? row.type : null,
    amount: row.amount,
  };
}

/** Sum fees[] dollar strings to cents. Throws RelayRowRejectedError on a present malformed amount. */
export function sumRelayFeesArrayCents(
  fees: unknown[] | null | undefined,
  transactionId: string,
): number {
  let total = 0;
  for (let i = 0; i < (fees?.length ?? 0); i += 1) {
    const fee = asFeeObject(fees![i]);
    if (!fee) continue;
    const dollars = relayMoneyField(fee.amount, `fees[${i}].amount`, transactionId, false);
    if (dollars === null) continue;
    const cents = Math.round(Number(dollars) * 100);
    if (!Number.isFinite(cents) || cents < 0) continue;
    total += cents;
  }
  return total;
}

/**
 * Wallet / GL fee cents for one fill: fees[] when it carries money, else sum of line fee cents.
 * Line fees already stored as integer cents (ingest converted once at the edge).
 */
export function relayFillFeeCents(input: {
  transaction_id: string;
  fees?: unknown[] | null;
  line_fee_amount_cents?: Array<number | null | undefined> | null;
}): number {
  const fromArray = sumRelayFeesArrayCents(input.fees, input.transaction_id);
  if (fromArray > 0) return fromArray;
  let fromLines = 0;
  for (const c of input.line_fee_amount_cents ?? []) {
    const n = Math.round(Number(c ?? 0));
    if (Number.isFinite(n) && n > 0) fromLines += n;
  }
  return fromLines;
}

/** Consumption the wallet must show: fuel paid + fee (owner: ties at the wallet, not the bank line). */
export function relayWalletDrawdownCents(totalAmountPaidCents: number, feeCents: number): number {
  const paid = Math.round(Number(totalAmountPaidCents));
  const fee = Math.round(Number(feeCents));
  if (!Number.isFinite(paid) || paid < 0) throw new Error("relay_wallet_drawdown: total_amount_paid_cents invalid");
  if (!Number.isFinite(fee) || fee < 0) throw new Error("relay_wallet_drawdown: fee_cents invalid");
  return paid + fee;
}
