/**
 * LEAD 443.168 K — Engine Registry E-47 misdirected-payment alert.
 *
 * Faro contract: any payment WE (or the Equity Holder) receive on a Purchased Account must be forwarded to Faro WITHIN
 * 1 BUSINESS DAY; missing it is a breach that triggers the acceleration clause. When a bank line is matched to a
 * customer payment (directly, through a deposit, or to the invoice itself) and that payment is applied to an invoice on
 * a live Faro purchase, this raises ONE alert per (bank line, purchased invoice) with the forward-by date.
 *
 * Posts nothing: no JE, no bank movement, no change to the match. Called from the one match write point (storeMatch).
 */
import { nextBusinessDay } from "../compliance/form-2290-generator.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

const MS_PER_DAY = 86_400_000;

/** Pure: the business day after the day the money landed (weekends + US federal holidays skipped). */
export function misdirectedForwardByDate(receivedOn: string): string {
  const next = new Date(new Date(`${receivedOn.slice(0, 10)}T00:00:00Z`).getTime() + MS_PER_DAY);
  return nextBusinessDay(next).toISOString().slice(0, 10);
}

export const MISDIRECTED_ALERT_KINDS = ["payment", "deposit", "invoice"] as const;

/**
 * The purchased invoices a matched document pays. A purchase that is voided, a voided line, or an invoice Faro
 * already sold back (repurchase confirmed) is not Faro's — no alert.
 */
const PURCHASED_INVOICES_SQL = `
  WITH docs AS (
    SELECT pa.invoice_id AS invoice_id, COALESCE(pa.amount_cents, 0)::bigint AS cents, p.customer_id
      FROM accounting.payment_applications pa
      JOIN accounting.payments p ON p.id = pa.payment_id AND p.operating_company_id = $1::uuid AND p.voided_at IS NULL
     WHERE $2::text = 'payment' AND pa.payment_id = $3::uuid AND pa.unapplied_at IS NULL AND pa.invoice_id IS NOT NULL
    UNION ALL
    SELECT pa.invoice_id, COALESCE(pa.amount_cents, 0)::bigint, p.customer_id
      FROM accounting.deposit_lines dl
      JOIN accounting.payments p ON p.id = dl.source_payment_id AND p.operating_company_id = $1::uuid AND p.voided_at IS NULL
      JOIN accounting.payment_applications pa ON pa.payment_id = p.id AND pa.unapplied_at IS NULL AND pa.invoice_id IS NOT NULL
     WHERE $2::text = 'deposit' AND dl.deposit_id = $3::uuid
    UNION ALL
    SELECT i.id, 0::bigint, i.customer_id
      FROM accounting.invoices i
     WHERE $2::text = 'invoice' AND i.id = $3::uuid AND i.operating_company_id = $1::uuid
  )
  SELECT d.invoice_id::text, d.cents::text AS cents, d.customer_id::text,
         l.id::text AS purchase_line_id, fp.id::text AS purchase_id, fp.factoring_company_vendor_id::text AS factor_vendor_id,
         l.gross_cents::text AS gross_cents
    FROM docs d
    JOIN accounting.factoring_purchase_lines l ON l.invoice_id = d.invoice_id AND l.voided_at IS NULL AND l.operating_company_id = $1::uuid
    JOIN accounting.factoring_purchases fp ON fp.id = l.purchase_id AND fp.voided_at IS NULL AND fp.status <> 'voided'
   WHERE NOT EXISTS (
     SELECT 1 FROM accounting.factoring_repurchase_due_events r
      WHERE r.purchase_line_id = l.id AND r.state = 'repurchase_confirmed'
   )
`;

export async function raiseMisdirectedPaymentAlerts(
  client: Queryable,
  input: { operating_company_id: string; bank_transaction_id: string; ledger_entry_kind: string; ledger_entry_id: string; actor_user_uuid: string | null }
): Promise<{ raised: number; forward_by: string | null }> {
  if (!(MISDIRECTED_ALERT_KINDS as readonly string[]).includes(input.ledger_entry_kind)) return { raised: 0, forward_by: null };
  const line = (
    await client.query<{ transaction_date: string; is_credit: boolean; amount_cents: string }>(
      `SELECT transaction_date::text, is_credit, abs(amount_cents)::text AS amount_cents
         FROM banking.bank_transactions WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [input.bank_transaction_id, input.operating_company_id]
    )
  ).rows[0];
  // Money that LEFT us is never a payment received.
  if (!line || !line.is_credit) return { raised: 0, forward_by: null };
  const hits = (
    await client.query<{ invoice_id: string; cents: string; customer_id: string | null; purchase_line_id: string; purchase_id: string; factor_vendor_id: string | null; gross_cents: string }>(
      PURCHASED_INVOICES_SQL,
      [input.operating_company_id, input.ledger_entry_kind, input.ledger_entry_id]
    )
  ).rows;
  if (!hits.length) return { raised: 0, forward_by: null };
  const forwardBy = misdirectedForwardByDate(line.transaction_date);
  let raised = 0;
  for (const h of hits) {
    const amount = Number(h.cents) > 0 ? h.cents : hits.length === 1 ? line.amount_cents : h.gross_cents;
    const res = await client.query(
      `INSERT INTO accounting.factoring_misdirected_payment_alerts (
         operating_company_id, bank_transaction_id, ledger_entry_kind, ledger_entry_id, invoice_id, purchase_id,
         purchase_line_id, factor_vendor_id, customer_id, received_on, forward_by, amount_cents, raised_by_user_id
       ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid, $10::date, $11::date, $12::bigint, $13::uuid)
       ON CONFLICT (bank_transaction_id, invoice_id) WHERE state = 'open' DO NOTHING`,
      [
        input.operating_company_id, input.bank_transaction_id, input.ledger_entry_kind, input.ledger_entry_id, h.invoice_id, h.purchase_id,
        h.purchase_line_id, h.factor_vendor_id, h.customer_id, line.transaction_date, forwardBy, amount, input.actor_user_uuid,
      ]
    );
    raised += res.rowCount ?? 0;
  }
  return { raised, forward_by: forwardBy };
}
