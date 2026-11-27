/**
 * SCENTSX Sales inquiry (LEAD ROUND L.20 item 3; owner 2026-11-27 13:50 CT "bring what we need from CONTROL into the app") — CONTROL's
 * "Sales Inquiry by Item" and "Sales Inquiry", read from the same issued invoices the Sales by Customer / Item report reads
 * (sales-report.service.ts): accounting.invoices of ScentsX with a posting-eligible status (sent / partial / paid / factored), not
 * voided, not sample data, dated by issue_date. A sale line = an invoice line on an Income account (sales tax is a liability and is
 * left out, as the report does). A line made from a TIO Perfumes sales order (scentsx.sales_order_invoice_lines) carries the item.
 *   - salesLines: every sale line in a date range, optionally for one item and / or one customer (or one invoice — the drill-down).
 *   - salesInvoices: the invoices in a date range, optionally for one customer, with their lines' units and sales.
 * Read only — nothing is written.
 */
import type pg from "pg";
import { scopeToScentsx, ScentsxLinkInvalid } from "./links.service.js";

type Q = Pick<pg.PoolClient, "query">;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INQUIRY_CAP = 5000;

export type InquiryFilter = { from: string; to: string; item_id?: string; customer_id?: string; invoice_id?: string };
function check(f: InquiryFilter) {
  if (!ISO.test(f.from) || !ISO.test(f.to) || f.from > f.to) throw new ScentsxLinkInvalid("from and to must be dates, from on or before to");
  for (const k of ["item_id", "customer_id", "invoice_id"] as const) if (f[k] && !UUID.test(f[k]!)) throw new ScentsxLinkInvalid(`${k} must be an id`);
}
const ELIGIBLE = `i.status IN ('sent', 'partial', 'paid', 'factored') AND i.voided_at IS NULL AND coalesce(i.is_sample_data, false) = false`;

export type SaleLine = { invoice_line_id: string; invoice_id: string; invoice: string | null; issue_date: string; customer_id: string | null; customer: string;
  item_id: string | null; item: string | null; description: string | null; qty: number; unit_price_cents: number; amount_cents: number };

export async function salesLines(c: Q, f: InquiryFilter) {
  check(f);
  const co = await scopeToScentsx(c);
  const args: unknown[] = [co, f.from, f.to];
  const w = [`i.operating_company_id = $1::uuid`, ELIGIBLE, `i.issue_date BETWEEN $2::date AND $3::date`, `l.soft_deleted_at IS NULL`];
  if (f.item_id) { args.push(f.item_id); w.push(`sol.item_id = $${args.length}::uuid`); }
  if (f.customer_id) { args.push(f.customer_id); w.push(`i.customer_id = $${args.length}::uuid`); }
  if (f.invoice_id) { args.push(f.invoice_id); w.push(`i.id = $${args.length}::uuid`); }
  const base = `FROM accounting.invoices i
       JOIN accounting.invoice_lines l ON l.invoice_id = i.id
       JOIN catalogs.accounts a ON a.id = l.account_id AND a.account_type = 'Income'
       LEFT JOIN scentsx.sales_order_invoice_lines x ON x.invoice_line_id = l.id
       LEFT JOIN perfume.sales_order_lines sol ON sol.id = x.so_line_id
       LEFT JOIN perfume.items it ON it.id = sol.item_id
       LEFT JOIN mdata.customers cu ON cu.id = i.customer_id
      WHERE ${w.join(" AND ")}`;
  const tot = (await c.query<{ n: number; qty: string; amount: string; invoices: number }>(
    `SELECT count(*)::int AS n, coalesce(sum(coalesce(x.qty, l.quantity)), 0)::text AS qty, coalesce(sum(l.line_total_cents), 0)::text AS amount,
            count(DISTINCT i.id)::int AS invoices ${base}`, args)).rows[0]!;
  const rows = (await c.query<SaleLine & { qty: string; unit_price_cents: string; amount_cents: string }>(
    `SELECT l.id AS invoice_line_id, i.id AS invoice_id, i.display_id AS invoice, i.issue_date::text AS issue_date, i.customer_id,
            coalesce(cu.customer_name, '(no customer)') AS customer, sol.item_id, it.display_name AS item, l.description,
            coalesce(x.qty, l.quantity)::text AS qty, coalesce(l.unit_amount_cents, 0)::text AS unit_price_cents, l.line_total_cents::text AS amount_cents
       ${base}
      ORDER BY i.issue_date DESC, i.display_id DESC, l.display_order, l.id LIMIT ${INQUIRY_CAP}`, args)).rows;
  return {
    from: f.from, to: f.to,
    rows: rows.map((r) => ({ ...r, qty: Number(r.qty), unit_price_cents: Number(r.unit_price_cents), amount_cents: Number(r.amount_cents) })) as SaleLine[],
    total: { lines: tot.n, invoices: tot.invoices, qty: Number(tot.qty), amount_cents: Number(tot.amount) },
    truncated: tot.n > rows.length,
  };
}

export type SaleInvoice = { invoice_id: string; invoice: string | null; issue_date: string; customer_id: string | null; customer: string; status: string;
  lines: number; units: number; sales_cents: number; tax_cents: number; total_cents: number };

export async function salesInvoices(c: Q, f: Omit<InquiryFilter, "item_id" | "invoice_id">) {
  check(f);
  const co = await scopeToScentsx(c);
  const args: unknown[] = [co, f.from, f.to];
  const w = [`i.operating_company_id = $1::uuid`, ELIGIBLE, `i.issue_date BETWEEN $2::date AND $3::date`];
  if (f.customer_id) { args.push(f.customer_id); w.push(`i.customer_id = $${args.length}::uuid`); }
  const rows = (await c.query<{ invoice_id: string; invoice: string | null; issue_date: string; customer_id: string | null; customer: string; status: string;
    lines: number; units: string; sales: string; tax_cents: string; total_cents: string }>(
    `SELECT i.id AS invoice_id, i.display_id AS invoice, i.issue_date::text AS issue_date, i.customer_id, coalesce(cu.customer_name, '(no customer)') AS customer, i.status,
            count(s.id)::int AS lines, coalesce(sum(s.qty), 0)::text AS units, coalesce(sum(s.amount), 0)::text AS sales,
            coalesce(i.tax_cents, 0)::text AS tax_cents, coalesce(i.total_cents, 0)::text AS total_cents
       FROM accounting.invoices i
       LEFT JOIN mdata.customers cu ON cu.id = i.customer_id
       LEFT JOIN LATERAL (
         SELECT l.id, coalesce(x.qty, l.quantity) AS qty, l.line_total_cents AS amount
           FROM accounting.invoice_lines l JOIN catalogs.accounts a ON a.id = l.account_id AND a.account_type = 'Income'
           LEFT JOIN scentsx.sales_order_invoice_lines x ON x.invoice_line_id = l.id
          WHERE l.invoice_id = i.id AND l.soft_deleted_at IS NULL) s ON true
      WHERE ${w.join(" AND ")}
      GROUP BY i.id, cu.customer_name
      ORDER BY i.issue_date DESC, i.display_id DESC LIMIT ${INQUIRY_CAP}`, args)).rows;
  const out: SaleInvoice[] = rows.map((r) => ({ ...r, units: Number(r.units), sales_cents: Number(r.sales), tax_cents: Number(r.tax_cents), total_cents: Number(r.total_cents) }));
  const sum = (k: "units" | "sales_cents" | "tax_cents" | "total_cents") => out.reduce((t, r) => t + r[k], 0);
  return { from: f.from, to: f.to, rows: out, total: { invoices: out.length, units: sum("units"), sales_cents: sum("sales_cents"), tax_cents: sum("tax_cents"), total_cents: sum("total_cents") },
    truncated: out.length >= INQUIRY_CAP };
}

/** The customers the inquiry can pick: every ScentsX customer with an issued invoice. */
export async function inquiryCustomers(c: Q) {
  const co = await scopeToScentsx(c);
  return (await c.query<{ customer_id: string; customer: string; invoices: number }>(
    `SELECT i.customer_id::text, coalesce(cu.customer_name, '(no customer)') AS customer, count(*)::int AS invoices
       FROM accounting.invoices i LEFT JOIN mdata.customers cu ON cu.id = i.customer_id
      WHERE i.operating_company_id = $1::uuid AND ${ELIGIBLE} AND i.customer_id IS NOT NULL
      GROUP BY i.customer_id, cu.customer_name ORDER BY 2`, [co])).rows;
}
