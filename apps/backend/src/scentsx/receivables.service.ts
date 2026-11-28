/**
 * SCENTSX receivables — owner 2026-11-27 13:50 CT "lets incorporate what we need from here [CONTROL, TIO's POS] in the app": the CONTROL
 * screens On Account Aging Balance Report (aging date, aging days 30 / 60 / 90, Current · 30 · 60 · 90+ · A/R balance per customer),
 * Customer Account Status (ticket · date · days · amount · on account · balance, with the bucket strip) and Customer's Invoice History
 * (each ticket's payments), read from ScentsX LLC's own books.
 *
 * READ ONLY — no new money math. An invoice's open balance as of a date is the books' own reconstruction, the same expression the
 * accounting A/R aging uses (accounting.invoice_applied_cents_as_of + credit-memo applications on or before the date, factored /
 * recoursed invoices off trade A/R, drafts / proformas / voids / sample rows excluded), less each customer's unapplied credit memos
 * and payments (they posted Cr A/R), so the aging total ties to the A/R control account to the cent. Payments are recorded and voided by the existing payment engine (POST /api/v1/accounting/payments,
 * /payments/:id/void) — this file never writes.
 *
 * Aging basis = days since the invoice date (CONTROL's "Days" column, the way TIO has always aged); the due date is shown beside it.
 */
import type pg from "pg";
import { z } from "zod";
import { scopeToScentsx, ScentsxLinkNotFound } from "./links.service.js";
import { invoiceAppliedCentsAsOfSql } from "../accounting/invoice-applied-cents.js";
import { invoiceOnTradeArSql } from "../accounting/invoice-factored-identity.js";

type Q = Pick<pg.PoolClient, "query">;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const agingQuery = z.object({
  as_of: isoDate.optional(),
  d1: z.coerce.number().int().min(1).max(3650).default(30),
  d2: z.coerce.number().int().min(1).max(3650).default(60),
  d3: z.coerce.number().int().min(1).max(3650).default(90),
}).refine((x) => x.d1 < x.d2 && x.d2 < x.d3, { message: "Aging days must go up: 30 < 60 < 90." });

/** credits = the customer's unapplied credit memos and unapplied payments (both already Cr A/R), shown negative the QuickBooks way;
 *  total = the open invoices in the buckets − credits, so the report total equals the A/R control account. */
export type Buckets = { current: number; b1: number; b2: number; b3: number; credits: number; total: number };
const zero = (): Buckets => ({ current: 0, b1: 0, b2: 0, b3: 0, credits: 0, total: 0 });

/**
 * Each ScentsX customer's unapplied credit as of $2: credit memos (posted, not void) less what was applied to invoices or refunded
 * (customer_refunds) on or before the date, plus payments (not void) less what was applied on or before the date. Each of these
 * posted Cr A/R when it was made, so the aging nets them to tie to the books.
 */
const CREDITS_SQL = `
  WITH cm AS (
    SELECT m.customer_id, m.amount_cents
             - coalesce((SELECT sum(a.applied_cents) FROM accounting.credit_memo_applications a WHERE a.credit_memo_id = m.id AND a.voided_at IS NULL
                          AND (a.applied_at AT TIME ZONE 'UTC')::date <= $2::date), 0)
             - coalesce((SELECT sum(r.amount_cents) FROM accounting.customer_refunds r WHERE r.credit_memo_id = m.id AND r.voided_at IS NULL
                          AND r.refund_date <= $2::date), 0) AS left_cents
      FROM accounting.credit_memos m
     WHERE m.operating_company_id = $1::uuid AND m.journal_entry_id IS NOT NULL AND m.issue_date <= $2::date
       AND (m.voided_at IS NULL OR m.voided_at::date > $2::date) AND coalesce(m.status, '') NOT IN ('void', 'voided')),
  pay AS (
    SELECT p.customer_id, p.amount_cents
             - coalesce((SELECT sum(pa.amount_cents) FROM accounting.payment_applications pa WHERE pa.payment_id = p.id
                          AND (pa.applied_at AT TIME ZONE 'UTC')::date <= $2::date
                          AND (pa.unapplied_at IS NULL OR (pa.unapplied_at AT TIME ZONE 'UTC')::date > $2::date)), 0) AS left_cents
      FROM accounting.payments p
     WHERE p.operating_company_id = $1::uuid AND p.payment_date <= $2::date AND p.is_sample_data = false
       AND (p.voided_at IS NULL OR p.voided_at::date > $2::date))
  SELECT x.customer_id::text, coalesce(cu.customer_name, '') AS customer, sum(x.left_cents)::text AS credit_cents
    FROM (SELECT * FROM cm UNION ALL SELECT * FROM pay) x LEFT JOIN mdata.customers cu ON cu.id = x.customer_id
   WHERE x.left_cents > 0 AND x.customer_id IS NOT NULL
   GROUP BY 1, 2`;

/** Which bucket an invoice of `days` age falls in (CONTROL: Current < d1 ≤ 30 Days < d2 ≤ 60 Days < d3 ≤ 90+ Days). */
export function bucketOf(days: number, d1: number, d2: number, d3: number): keyof Omit<Buckets, "total" | "credits"> {
  if (days < d1) return "current";
  if (days < d2) return "b1";
  if (days < d3) return "b2";
  return "b3";
}

/** Open balance as of $2 (the books' own reconstruction — see the header). */
const OPEN_SQL = (a: string) => `GREATEST(coalesce(${a}.total_cents, 0) - ${invoiceAppliedCentsAsOfSql(a, "$2::date")}
      - coalesce((SELECT sum(cma.applied_cents) FROM accounting.credit_memo_applications cma
                   WHERE cma.invoice_id = ${a}.id AND cma.operating_company_id = $1::uuid AND cma.voided_at IS NULL
                     AND (cma.applied_at AT TIME ZONE 'UTC')::date <= $2::date), 0), 0)`;

const ON_BOOKS = (a: string) => `${a}.operating_company_id = $1::uuid AND ${a}.issue_date <= $2::date AND ${a}.total_cents IS NOT NULL
      AND (${a}.voided_at IS NULL OR ${a}.voided_at::date > $2::date) AND ${a}.status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')
      AND ${invoiceOnTradeArSql(a)} AND ${a}.is_sample_data = false`;

async function asOfDate(c: Q, asOf?: string) {
  if (asOf) return asOf;
  return (await c.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Chicago')::date::text AS d`)).rows[0]!.d;
}

/** CONTROL "On Account Aging Balance Report": every ScentsX customer with an open balance, by bucket, with the grand totals. */
export async function agingReport(c: Q, f: z.infer<typeof agingQuery>) {
  const co = await scopeToScentsx(c);
  const asOf = await asOfDate(c, f.as_of);
  const rows = (await c.query<{ customer_id: string; customer: string; perfume_company_id: string | null; days: number; open_cents: string }>(
    `SELECT i.customer_id::text, coalesce(cu.customer_name, '') AS customer,
            (SELECT l.contact_company_id::text FROM scentsx.customer_links l WHERE l.customer_id = i.customer_id AND l.voided_at IS NULL LIMIT 1) AS perfume_company_id,
            ($2::date - i.issue_date)::int AS days, ${OPEN_SQL("i")}::text AS open_cents
       FROM accounting.invoices i LEFT JOIN mdata.customers cu ON cu.id = i.customer_id
      WHERE ${ON_BOOKS("i")} AND ${OPEN_SQL("i")} > 0`, [co, asOf])).rows;
  const by = new Map<string, { customer_id: string; customer: string; perfume_company_id: string | null; invoices: number; oldest_days: number } & Buckets>();
  const totals = zero();
  for (const r of rows) {
    const amt = Number(r.open_cents);
    const k = bucketOf(r.days, f.d1, f.d2, f.d3);
    const row = by.get(r.customer_id) ?? { customer_id: r.customer_id, customer: r.customer, perfume_company_id: r.perfume_company_id, invoices: 0, oldest_days: 0, ...zero() };
    row[k] += amt; row.total += amt; row.invoices += 1; row.oldest_days = Math.max(row.oldest_days, r.days);
    by.set(r.customer_id, row);
    totals[k] += amt; totals.total += amt;
  }
  for (const r of (await c.query<{ customer_id: string; customer: string; credit_cents: string }>(CREDITS_SQL, [co, asOf])).rows) {
    const amt = Number(r.credit_cents);
    const row = by.get(r.customer_id) ?? { customer_id: r.customer_id, customer: r.customer,
      perfume_company_id: (await c.query<{ id: string | null }>(`SELECT l.contact_company_id::text AS id FROM scentsx.customer_links l WHERE l.customer_id = $1::uuid AND l.voided_at IS NULL LIMIT 1`, [r.customer_id])).rows[0]?.id ?? null,
      invoices: 0, oldest_days: 0, ...zero() };
    row.credits += amt; row.total -= amt;
    by.set(r.customer_id, row);
    totals.credits += amt; totals.total -= amt;
  }
  return { as_of: asOf, days: { d1: f.d1, d2: f.d2, d3: f.d3 }, totals, customers: [...by.values()].sort((a, b) => a.customer.localeCompare(b.customer)) };
}

/**
 * CONTROL "Customer Account Status" + "Customer's Invoice History" in one: the customer, every invoice (open ones with days and the
 * bucket strip; paid ones too), each invoice's payments (payment no., date, amount; voided / unapplied shown, not counted), and the
 * customer's payments with how much of each is applied and unapplied.
 */
export async function customerAccount(c: Q, customerId: string, f: z.infer<typeof agingQuery>) {
  const co = await scopeToScentsx(c);
  const asOf = await asOfDate(c, f.as_of);
  const cust = (await c.query<{ id: string; name: string; perfume_company_id: string | null; terms_days: number | null; credit_limit_cents: string | null }>(
    `SELECT cu.id::text, cu.customer_name AS name,
            (SELECT l.contact_company_id::text FROM scentsx.customer_links l WHERE l.customer_id = cu.id AND l.voided_at IS NULL LIMIT 1) AS perfume_company_id,
            (SELECT a.terms_days FROM perfume.customer_accounts a JOIN scentsx.customer_links l ON l.contact_company_id = a.company_id AND l.voided_at IS NULL WHERE l.customer_id = cu.id LIMIT 1) AS terms_days,
            (SELECT a.credit_limit_cents::text FROM perfume.customer_accounts a JOIN scentsx.customer_links l ON l.contact_company_id = a.company_id AND l.voided_at IS NULL WHERE l.customer_id = cu.id LIMIT 1) AS credit_limit_cents
       FROM mdata.customers cu WHERE cu.id = $1::uuid AND cu.operating_company_id = $2::uuid`, [customerId, co])).rows[0];
  if (!cust) throw new ScentsxLinkNotFound("That customer is not on ScentsX's books.");
  const inv = (await c.query<{ id: string; number: string | null; status: string; issue_date: string; due_date: string | null; days: number; total_cents: string; open_cents: string }>(
    `SELECT i.id::text, i.display_id AS number, i.status, i.issue_date::text, i.due_date::text, ($2::date - i.issue_date)::int AS days,
            i.total_cents::text, ${OPEN_SQL("i")}::text AS open_cents
       FROM accounting.invoices i
      WHERE ${ON_BOOKS("i")} AND i.customer_id = $3::uuid
      ORDER BY i.issue_date, i.display_id`, [co, asOf, customerId])).rows;
  const ids = inv.map((x) => x.id);
  const apps = ids.length ? (await c.query<{ invoice_id: string; payment_id: string; payment_no: string | null; payment_date: string | null; method: string | null;
      reference: string | null; amount_cents: string; voided: boolean; unapplied: boolean }>(
    `SELECT pa.invoice_id::text, p.id::text AS payment_id, p.display_id AS payment_no, p.payment_date::text, p.payment_method AS method, p.reference,
            pa.amount_cents::text, (p.voided_at IS NOT NULL) AS voided, (pa.unapplied_at IS NOT NULL) AS unapplied
       FROM accounting.payment_applications pa JOIN accounting.payments p ON p.id = pa.payment_id
      WHERE pa.invoice_id = ANY($1::uuid[]) ORDER BY p.payment_date, p.display_id`, [ids])).rows : [];
  const invoices = inv.map((x) => {
    const total = Number(x.total_cents), open = Number(x.open_cents);
    return { id: x.id, number: x.number, status: x.status, issue_date: x.issue_date, due_date: x.due_date, days: x.days, total_cents: total,
      paid_cents: total - open, open_cents: open, bucket: open > 0 ? bucketOf(x.days, f.d1, f.d2, f.d3) : null,
      payments: apps.filter((a) => a.invoice_id === x.id).map((a) => ({ payment_id: a.payment_id, payment_no: a.payment_no, date: a.payment_date, method: a.method,
        reference: a.reference, amount_cents: Number(a.amount_cents), counted: !a.voided && !a.unapplied, voided: a.voided, unapplied: a.unapplied })) };
  });
  const buckets = zero();
  for (const x of invoices) if (x.bucket) { buckets[x.bucket] += x.open_cents; buckets.total += x.open_cents; }
  const payments = (await c.query<{ id: string; number: string | null; date: string; method: string; reference: string | null; amount_cents: string;
      applied_cents: string; unapplied_cents: string; voided_at: string | null; void_reason: string | null }>(
    `SELECT p.id::text, p.display_id AS number, p.payment_date::text AS date, p.payment_method AS method, p.reference, p.amount_cents::text,
            coalesce(p.amount_applied_cents, 0)::text AS applied_cents, coalesce(p.amount_unapplied_cents, 0)::text AS unapplied_cents,
            p.voided_at::text, p.void_reason
       FROM accounting.payments p WHERE p.operating_company_id = $1::uuid AND p.customer_id = $2::uuid AND p.is_sample_data = false
      ORDER BY p.payment_date DESC, p.display_id DESC LIMIT 500`, [co, customerId])).rows.map((p) => ({
    ...p, amount_cents: Number(p.amount_cents), applied_cents: Number(p.applied_cents), unapplied_cents: Number(p.unapplied_cents) }));
  return {
    as_of: asOf, days: { d1: f.d1, d2: f.d2, d3: f.d3 }, operating_company_id: co,
    customer: { ...cust, credit_limit_cents: cust.credit_limit_cents == null ? null : Number(cust.credit_limit_cents) },
    buckets, open_invoices: invoices.filter((x) => x.open_cents > 0), invoices, payments,
  };
}
