/**
 * ROUND 443.29 c (owner 2026-10-10 7:15 PM CT; Lead order): the Relay wallet ROLL-FORWARD the owner can open —
 * deposits − fills − fees = balance, by day, every number a list of the documents behind it.
 *
 *   + deposits        settled wallet deposits, the AMOUNT that reached the wallet (Relay's 3.25% deposit fee is charged to
 *                     the funding card, not the wallet — shown beside it, never subtracted from the wallet)
 *   − fuel fills      Relay fills that are not lumper, Relay's paid amount
 *   − fill fees       Relay's reported per-fill fee (relayFillFeeCents — the ONE fee rule the poster and ingest use)
 *   − lumper          a lumper code (fuel_code_type 'One-time lumper'): its amount + its fee
 *   = balance         running, from zero, in Relay's own day (America/Chicago)
 * Canceled deposits move nothing. Voided / inactive rows move nothing. Read-only.
 */
import type { DbClient } from "./db-client.type.js";
import { relayFillFeeCents } from "./relay-sender-fee-cents.js";

export type RollForwardDoc = { id: string; ref: string; cents: number };
export type RollForwardDay = {
  day: string;
  deposits_cents: number;
  deposit_fees_cents: number;
  fills_cents: number;
  fill_fees_cents: number;
  lumper_cents: number;
  balance_cents: number;
  deposits: RollForwardDoc[];
  fills: RollForwardDoc[];
  lumper: RollForwardDoc[];
};
export type RollForward = {
  totals: { deposits_cents: number; deposit_fees_cents: number; fills_cents: number; fill_fees_cents: number; lumper_cents: number; balance_cents: number };
  days: RollForwardDay[];
};

const cents = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export type FillRow = { id: string; transaction_id: string; day: string; paid_cents: number; fees: unknown[] | null; line_fee_cents: Array<number | null>; is_lumper: boolean };
export type DepositRow = { id: string; deposit_id: string; day: string; amount_cents: number; fee_cents: number };

/** Pure: the roll-forward from fills and settled deposits. */
export function buildRollForward(fills: FillRow[], deposits: DepositRow[]): RollForward {
  const days = new Map<string, RollForwardDay>();
  const day = (d: string) => {
    let x = days.get(d);
    if (!x) {
      x = { day: d, deposits_cents: 0, deposit_fees_cents: 0, fills_cents: 0, fill_fees_cents: 0, lumper_cents: 0, balance_cents: 0, deposits: [], fills: [], lumper: [] };
      days.set(d, x);
    }
    return x;
  };
  for (const dep of deposits) {
    const x = day(dep.day);
    x.deposits_cents += dep.amount_cents;
    x.deposit_fees_cents += dep.fee_cents;
    x.deposits.push({ id: dep.id, ref: dep.deposit_id, cents: dep.amount_cents });
  }
  for (const f of fills) {
    const x = day(f.day);
    const fee = relayFillFeeCents({ transaction_id: f.transaction_id, fees: f.fees, line_fee_amount_cents: f.line_fee_cents });
    if (f.is_lumper) {
      x.lumper_cents += f.paid_cents + fee;
      x.lumper.push({ id: f.id, ref: f.transaction_id, cents: f.paid_cents + fee });
    } else {
      x.fills_cents += f.paid_cents;
      x.fill_fees_cents += fee;
      x.fills.push({ id: f.id, ref: f.transaction_id, cents: f.paid_cents + fee });
    }
  }
  const ordered = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  let bal = 0;
  const totals = { deposits_cents: 0, deposit_fees_cents: 0, fills_cents: 0, fill_fees_cents: 0, lumper_cents: 0, balance_cents: 0 };
  for (const x of ordered) {
    bal += x.deposits_cents - x.fills_cents - x.fill_fees_cents - x.lumper_cents;
    x.balance_cents = bal;
    totals.deposits_cents += x.deposits_cents;
    totals.deposit_fees_cents += x.deposit_fees_cents;
    totals.fills_cents += x.fills_cents;
    totals.fill_fees_cents += x.fill_fees_cents;
    totals.lumper_cents += x.lumper_cents;
  }
  totals.balance_cents = bal;
  return { totals, days: ordered };
}

export async function computeRelayWalletRollForward(client: DbClient, operatingCompanyId: string): Promise<RollForward> {
  const fills = (
    await client.query<{ id: string; transaction_id: string; day: string; paid_cents: string; fees: unknown; line_fee_cents: Array<string | null> | null; fuel_code_type: string | null }>(
      `SELECT r.id::text, r.transaction_id, (r.relay_created_at AT TIME ZONE 'America/Chicago')::date::text AS day,
              abs(r.total_amount_paid_cents)::text AS paid_cents, r.fees, r.fuel_code_type,
              (SELECT array_agg(l.fee_amount_cents::text) FROM integrations.relay_fuel_transaction_lines l
                WHERE l.relay_fuel_transaction_id = r.id AND l.voided_at IS NULL AND l.is_active) AS line_fee_cents
         FROM integrations.relay_fuel_transactions r
        WHERE r.operating_company_id = $1::uuid AND r.voided_at IS NULL AND r.is_active`,
      [operatingCompanyId]
    )
  ).rows.map((r) => ({
    id: r.id,
    transaction_id: r.transaction_id,
    day: r.day,
    paid_cents: Number(r.paid_cents),
    fees: Array.isArray(r.fees) ? r.fees : null,
    line_fee_cents: (r.line_fee_cents ?? []).map((c) => (c == null ? null : Number(c))),
    is_lumper: /lumper/i.test(r.fuel_code_type ?? ""),
  }));
  const deposits = (
    await client.query<{ id: string; deposit_id: string; day: string; raw_payload: Record<string, unknown> | null; total_amount_cents: string }>(
      `SELECT id::text, deposit_id, (relay_created_at AT TIME ZONE 'America/Chicago')::date::text AS day, raw_payload, total_amount_cents::text
         FROM integrations.relay_deposits
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND lower(status) = 'settled'`,
      [operatingCompanyId]
    )
  ).rows.map((d) => {
    const raw = d.raw_payload ?? {};
    const fee = cents(raw.fee);
    const amount = raw.amount != null && String(raw.amount).trim() !== "" ? cents(raw.amount) : Number(d.total_amount_cents) - fee;
    return { id: d.id, deposit_id: d.deposit_id, day: d.day, amount_cents: amount, fee_cents: fee };
  });
  return buildRollForward(fills, deposits);
}
