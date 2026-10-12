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

/**
 * LEAD 443.123 — THE one paid rule. RELAY-F442 says total_amount_paid is FUEL ONLY. The CSV importer before
 * relay-csv-paid-excludes-fee stored Relay's CSV "total" (fuel + fee) as paid, with the fee only in top-level fees[]
 * (no per-line fee). Such a legacy row is recognised ONLY when paid equals the product lines plus the recorded fee to
 * the cent; then fuel = the product lines and the fee stays the recorded fee. Every other shape keeps the stored paid
 * (any other difference is the poster's relay_fill_lines_do_not_foot refusal — never a plug, never a tolerance).
 * Every wallet / bank-match / roll-forward / poster amount comes from this function (or its SQL twin below).
 */
export function relayFuelPaidCents(input: {
  transaction_id: string;
  stored_paid_cents: number;
  product_lines_cents: number | null | undefined;
  fees?: unknown[] | null;
  line_fee_amount_cents?: Array<number | null | undefined> | null;
  ingest_source?: string | null;
}): { fuel_paid_cents: number; fee_cents: number; wallet_cents: number; legacy_paid_includes_fee: boolean } {
  const stored = Math.round(Number(input.stored_paid_cents));
  const fee = relayFillFeeCents({ transaction_id: input.transaction_id, fees: input.fees, line_fee_amount_cents: input.line_fee_amount_cents });
  const product = input.product_lines_cents == null ? null : Math.round(Number(input.product_lines_cents));
  const lineFees = (input.line_fee_amount_cents ?? []).reduce<number>((t, c) => t + Math.max(0, Math.round(Number(c ?? 0)) || 0), 0);
  const legacy =
    input.ingest_source === "csv_import" && lineFees === 0 && fee > 0 && product != null && product > 0 && stored === product + fee;
  const fuel = legacy ? (product as number) : stored;
  return { fuel_paid_cents: fuel, fee_cents: fee, wallet_cents: relayWalletDrawdownCents(fuel, fee), legacy_paid_includes_fee: legacy };
}

/**
 * SQL twin of relayFuelPaidCents for a relay_fuel_transactions row aliased `alias`: the wallet drawdown in cents.
 * fees[] is the fee source here (as the Match drawer always read it); a legacy CSV row (paid = lines + fees[] exactly,
 * no line fee) draws down its stored paid, every other row draws down paid + fees[].
 */
export function relayFuelWalletAmountSql(alias: string): string {
  const fees = `COALESCE((
      SELECT ROUND(SUM((f->>'amount')::numeric * 100))::bigint
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${alias}.fees) = 'array' THEN ${alias}.fees ELSE '[]'::jsonb END) f
       WHERE (f->>'amount') ~ '^[0-9]+(\\.[0-9]+)?$'
    ), 0)`;
  const product = `COALESCE((SELECT SUM(l.total_discounted_price_cents)::bigint FROM integrations.relay_fuel_transaction_lines l
       WHERE l.relay_fuel_transaction_id = ${alias}.id AND l.voided_at IS NULL), 0)`;
  const lineFee = `COALESCE((SELECT SUM(l.fee_amount_cents)::bigint FROM integrations.relay_fuel_transaction_lines l
       WHERE l.relay_fuel_transaction_id = ${alias}.id AND l.voided_at IS NULL), 0)`;
  const paid = `ABS(COALESCE(${alias}.total_amount_paid_cents, 0))`;
  return `(CASE WHEN ${alias}.ingest_source = 'csv_import' AND ${lineFee} = 0 AND ${fees} > 0 AND ${product} > 0
                 AND ${paid} = ${product} + ${fees}
            THEN ${paid} ELSE ${paid} + ${fees} END)`;
}
