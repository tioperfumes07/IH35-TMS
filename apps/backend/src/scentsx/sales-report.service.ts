/**
 * SCENTSX B13 — Sales by Customer and Sales by Item for ScentsX LLC (TIO Perfumes), the QuickBooks "Sales by Customer Summary" and
 * "Sales by Product/Service Summary" read from the same books the P&L reads.
 *
 * Source: ScentsX's issued invoices — accounting.invoices with a posting-eligible status (sent / partial / paid / factored, the
 * posting engine's INVOICE_ELIGIBLE_STATUSES) and not voided, dated by issue_date. Amount = the invoice lines whose account is an
 * Income account (sales, shipping charged, returns and discounts net in); the sales-tax line (a liability) is left out, as
 * QuickBooks does. An invoice line made from a TIO Perfumes sales order (scentsx.sales_order_invoice_lines) carries the item and
 * the order line's cost, so units, cost on order and margin come from there; a line typed by hand has no item and is grouped as
 * "Not from a sales order". Read only — nothing is written.
 */
import type pg from "pg";
import { scopeToScentsx, ScentsxLinkInvalid } from "./links.service.js";

type Q = Pick<pg.PoolClient, "query">;

export type SalesRow = { key: string; name: string; invoices: number; units: number; sales_cents: number; cost_cents: number | null; margin_cents: number | null; pct_of_sales: number };
export type SalesReport = { from: string; to: string; by: "customer" | "item"; rows: SalesRow[]; total: Omit<SalesRow, "key" | "name" | "pct_of_sales"> };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function salesReport(c: Q, by: "customer" | "item", from: string, to: string): Promise<SalesReport> {
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new ScentsxLinkInvalid("from and to must be dates, from on or before to");
  const co = await scopeToScentsx(c);
  const group = by === "customer"
    ? `coalesce(cu.id::text, 'none') AS key, coalesce(cu.customer_name, '(no customer)') AS name`
    : `coalesce(it.id::text, 'none') AS key, coalesce(it.display_name, it.name, '(not from a sales order)') AS name`;
  const r = await c.query<{ key: string; name: string; invoices: number; units: string; sales: string; cost: string | null; costed: string }>(
    `WITH lines AS (
       SELECT i.id AS invoice_id, i.customer_id, l.line_total_cents::bigint AS amount,
              x.qty AS units, sol.item_id, CASE WHEN x.id IS NULL OR sol.cost_cents IS NULL THEN NULL ELSE x.qty * sol.cost_cents::bigint END AS cost
         FROM accounting.invoices i
         JOIN accounting.invoice_lines l ON l.invoice_id = i.id
         JOIN catalogs.accounts a ON a.id = l.account_id AND a.account_type = 'Income'
         LEFT JOIN scentsx.sales_order_invoice_lines x ON x.invoice_line_id = l.id
         LEFT JOIN perfume.sales_order_lines sol ON sol.id = x.so_line_id
        WHERE i.operating_company_id = $1::uuid
          AND i.status IN ('sent', 'partial', 'paid', 'factored') AND i.voided_at IS NULL
          AND coalesce(i.is_sample_data, false) = false
          AND i.issue_date BETWEEN $2::date AND $3::date
     )
     SELECT ${group}, count(DISTINCT lines.invoice_id)::int AS invoices, coalesce(sum(lines.units), 0)::text AS units,
            coalesce(sum(lines.amount), 0)::text AS sales, sum(lines.cost)::text AS cost, count(lines.cost)::text AS costed
       FROM lines
       LEFT JOIN mdata.customers cu ON cu.id = lines.customer_id
       LEFT JOIN perfume.items it ON it.id = lines.item_id
      GROUP BY 1, 2 ORDER BY sum(lines.amount) DESC, 2`,
    [co, from, to]
  );
  const total = r.rows.reduce((t, x) => t + Number(x.sales), 0);
  const rows: SalesRow[] = r.rows.map((x) => {
    const sales = Number(x.sales);
    const cost = x.cost == null ? null : Number(x.cost);
    return {
      key: x.key, name: x.name, invoices: x.invoices, units: Number(x.units), sales_cents: sales, cost_cents: cost,
      margin_cents: cost == null ? null : sales - cost, pct_of_sales: total ? Math.round((sales / total) * 10000) / 100 : 0,
    };
  });
  const sum = (f: (x: SalesRow) => number | null) => {
    const v = rows.map(f).filter((n): n is number => n != null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  return {
    from, to, by, rows,
    total: {
      invoices: Number((await c.query<{ n: number }>(
        `SELECT count(*)::int n FROM accounting.invoices WHERE operating_company_id = $1::uuid AND status IN ('sent','partial','paid','factored')
            AND voided_at IS NULL AND coalesce(is_sample_data, false) = false AND issue_date BETWEEN $2::date AND $3::date`, [co, from, to])).rows[0]!.n),
      units: sum((x) => x.units) ?? 0, sales_cents: total, cost_cents: sum((x) => x.cost_cents), margin_cents: sum((x) => x.margin_cents),
    },
  };
}
