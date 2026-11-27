/**
 * SCENTSX B7 (books side) — credit exposure of a TIO Perfumes customer in ScentsX LLC's books.
 *
 * Owner 2026-11-26 20:18 CT "credit limits approvals new accounts new credit accounts"; D8 (owner approves every credit account and
 * any limit over $25,000). The account, limit, terms and hold live on P1's perfume.customer_accounts (#29886). This service reads
 * the money side: what the customer owes ScentsX right now, what is about to be owed, and what is left of the limit.
 * READ-ONLY — writes nothing, posts nothing.
 *
 * Exposure (NetSuite "customer credit" pattern):
 *   open A/R            = amount_open_cents of ScentsX invoices that are posted (not draft / proforma / void / factored), live rows only
 *   draft invoices      = total_cents of ScentsX invoices still in draft for this customer
 *   shipped not billed  = shipped units not yet on a live ScentsX invoice × unit price (scentsx.sales_order_invoice_lines)
 *   open orders         = ordered-but-not-shipped units × unit price on open sales orders
 *   exposure            = the sum; available = credit_limit_cents − exposure (null when the account has no limit)
 * B12 (owner 23:17 CT): the same read carries the customer's KYC result (kyc.service.ts requirements — one rule list) and the
 *   pagarés held as security, per currency. A pagaré does not reduce exposure (it secures it; the debt stays A/R).
 */
import type pg from "pg";
import { scopeToScentsx } from "./links.service.js";
import { pagareCover, partyKyc } from "./kyc.service.js";

type Q = Pick<pg.PoolClient, "query">;

export type CreditExposure = {
  contact_company_id: string;
  customer_id: string | null;
  account_type: string | null;
  credit_limit_cents: number | null;
  terms_days: number | null;
  on_hold: boolean;
  hold_reason: string | null;
  open_ar_cents: number;
  past_due_cents: number;
  oldest_past_due_days: number | null;
  draft_invoice_cents: number;
  shipped_not_billed_cents: number;
  open_order_cents: number;
  exposure_cents: number;
  available_cents: number | null;
  over_limit: boolean;
  kyc_status: "none" | "incomplete" | "complete";
  kyc_missing: string[];
  kyc_warnings: string[];
  pagare_held_usd_cents: number;
  pagare_held_mxn_cents: number;
  pagares_held: number;
};

export async function creditExposure(c: Q, contactCompanyId: string): Promise<CreditExposure> {
  const co = await scopeToScentsx(c);
  const acct = await c.query<{ account_type: string; credit_limit_cents: string | null; terms_days: number | null; on_hold: boolean; hold_reason: string | null }>(
    `SELECT account_type, credit_limit_cents::text, terms_days, on_hold, hold_reason FROM perfume.customer_accounts WHERE company_id = $1::uuid`,
    [contactCompanyId]
  );
  const link = await c.query<{ customer_id: string }>(
    `SELECT customer_id::text FROM scentsx.customer_links WHERE contact_company_id = $1::uuid AND voided_at IS NULL LIMIT 1`,
    [contactCompanyId]
  );
  const customerId = link.rows[0]?.customer_id ?? null;

  let ar = { open: 0, past_due: 0, oldest: null as number | null, draft: 0 };
  if (customerId) {
    const r = await c.query<{ open: string; past_due: string; oldest: number | null; draft: string }>(
      `SELECT
         coalesce(sum(i.amount_open_cents) FILTER (WHERE i.status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')), 0)::text AS open,
         coalesce(sum(i.amount_open_cents) FILTER (WHERE i.status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')
                                                     AND i.due_date < (now() AT TIME ZONE 'America/Chicago')::date), 0)::text AS past_due,
         max((now() AT TIME ZONE 'America/Chicago')::date - i.due_date) FILTER (WHERE i.status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')
                                                     AND i.amount_open_cents > 0 AND i.due_date < (now() AT TIME ZONE 'America/Chicago')::date) AS oldest,
         coalesce(sum(i.total_cents) FILTER (WHERE i.status = 'draft'), 0)::text AS draft
       FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid AND i.customer_id = $2::uuid AND i.voided_at IS NULL AND i.is_sample_data = false`,
      [co, customerId]
    );
    const x = r.rows[0]!;
    ar = { open: Number(x.open), past_due: Number(x.past_due), oldest: x.oldest, draft: Number(x.draft) };
  }

  const so = await c.query<{ shipped_not_billed: string; open_orders: string }>(
    `SELECT
       coalesce(sum(greatest(0, l.qty_shipped - coalesce(b.billed, 0))::bigint * l.unit_price_cents), 0)::text AS shipped_not_billed,
       coalesce(sum(greatest(0, l.qty - l.qty_shipped)::bigint * l.unit_price_cents) FILTER (WHERE o.status = 'open'), 0)::text AS open_orders
     FROM perfume.sales_orders o
     JOIN perfume.sales_order_lines l ON l.order_id = o.id AND l.archived_at IS NULL
     LEFT JOIN LATERAL (
       SELECT sum(x.qty) AS billed FROM scentsx.sales_order_invoice_lines x JOIN accounting.invoices i ON i.id = x.invoice_id
        WHERE x.so_line_id = l.id AND i.voided_at IS NULL AND i.status <> 'void'
     ) b ON true
    WHERE o.company_id = $1::uuid AND o.archived_at IS NULL AND o.status <> 'cancelled' AND o.currency = 'USD'`,
    [contactCompanyId]
  );
  const shippedNotBilled = Number(so.rows[0]!.shipped_not_billed);
  const openOrders = Number(so.rows[0]!.open_orders);
  const exposure = ar.open + ar.draft + shippedNotBilled + openOrders;
  const kyc = await partyKyc(c, { kind: "customer", contact_company_id: contactCompanyId });
  const cover = await pagareCover(c, contactCompanyId);
  const a = acct.rows[0];
  const limit = a?.credit_limit_cents == null ? null : Number(a.credit_limit_cents);
  return {
    contact_company_id: contactCompanyId,
    customer_id: customerId,
    account_type: a?.account_type ?? null,
    credit_limit_cents: limit,
    terms_days: a?.terms_days ?? null,
    on_hold: a?.on_hold ?? false,
    hold_reason: a?.hold_reason ?? null,
    open_ar_cents: ar.open,
    past_due_cents: ar.past_due,
    oldest_past_due_days: ar.oldest,
    draft_invoice_cents: ar.draft,
    shipped_not_billed_cents: shippedNotBilled,
    open_order_cents: openOrders,
    exposure_cents: exposure,
    available_cents: limit == null ? null : limit - exposure,
    over_limit: limit != null && exposure > limit,
    kyc_status: kyc.status,
    kyc_missing: kyc.missing,
    kyc_warnings: kyc.warnings,
    pagare_held_usd_cents: cover.usd_cents,
    pagare_held_mxn_cents: cover.mxn_cents,
    pagares_held: cover.held,
  };
}
