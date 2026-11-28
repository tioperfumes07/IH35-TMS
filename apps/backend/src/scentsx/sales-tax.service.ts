/**
 * ScentsX sales tax — ROUND L.31 M11 (owner 2026-11-27 22:54 CT "… liability … fully total and complete"). The QuickBooks "Sales tax
 * liability" view for a period, READ ONLY:
 *   · the liability itself is the books: ScentsX's sales_tax_payable account (2100 Sales Tax Payable - Texas) from the General
 *     Ledger read model — balance at the start, tax collected (credits), tax paid (debits), balance owed at the end;
 *   · the sales behind it, month by month, from ScentsX's invoices (not voided): taxable sales (an invoice that carries tax), exempt
 *     sales (no tax — a resale certificate on file or goods exported; sales-invoice.service.ts never guesses tax), and the tax on them.
 * "Pay sales tax" is a bill to the tax agency's vendor coded to 2100, paid through the ONE bill + bill-payment engines (Dr 2100 / Cr A/P,
 * then Dr A/P / Cr bank), and the period's return (accounting/sales-tax) is marked paid with that bill — nothing posts here.
 */
import type pg from "pg";
import { z } from "zod";
import { scopeToScentsx } from "./links.service.js";
import { generalLedger } from "./general-ledger.service.js";

type Q = Pick<pg.PoolClient, "query">;
export const salesTaxQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((q) => q.from <= q.to, { message: "from must be on or before to" });

export class ScentsxSalesTaxNotMapped extends Error {}

export async function salesTaxLiability(c: Q, q: z.infer<typeof salesTaxQuery>) {
  const co = await scopeToScentsx(c);
  const role = await c.query<{ account_id: string; account_number: string | null; account_name: string }>(
    `SELECT a.id::text AS account_id, a.account_number, a.account_name
       FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id = r.account_id
      WHERE r.operating_company_id = $1::uuid AND r.role = 'sales_tax_payable' AND r.is_active
      LIMIT 1`,
    [co]
  );
  const acct = role.rows[0];
  if (!acct) throw new ScentsxSalesTaxNotMapped("ScentsX has no sales_tax_payable account bound");
  const gl = await generalLedger(c, { from: q.from, to: q.to, account_id: acct.account_id, include_empty: "true" });
  const a = gl.accounts[0];
  const months = (await c.query<{ month: string; invoices: string; taxable: string; exempt: string; tax: string; exempt_invoices: string }>(
    `SELECT to_char(date_trunc('month', i.issue_date), 'YYYY-MM') AS month,
            count(*)::text AS invoices,
            COALESCE(SUM(i.subtotal_cents) FILTER (WHERE COALESCE(i.tax_cents, 0) > 0), 0)::text AS taxable,
            COALESCE(SUM(i.subtotal_cents) FILTER (WHERE COALESCE(i.tax_cents, 0) = 0), 0)::text AS exempt,
            COALESCE(SUM(i.tax_cents), 0)::text AS tax,
            count(*) FILTER (WHERE COALESCE(i.tax_cents, 0) = 0)::text AS exempt_invoices
       FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL AND i.issue_date BETWEEN $2::date AND $3::date
        AND i.status::text NOT IN ('draft', 'voided')
      GROUP BY 1 ORDER BY 1`,
    [co, q.from, q.to]
  )).rows.map((m) => ({ month: m.month, invoices: Number(m.invoices), exempt_invoices: Number(m.exempt_invoices), taxable_sales_cents: Number(m.taxable),
    exempt_sales_cents: Number(m.exempt), tax_cents: Number(m.tax) }));
  const sum = (k: "taxable_sales_cents" | "exempt_sales_cents" | "tax_cents") => months.reduce((t, m) => t + m[k], 0);
  return {
    operating_company_id: co, from: q.from, to: q.to,
    account: { account_id: acct.account_id, account_number: acct.account_number, account_name: acct.account_name },
    liability: {
      opening_cents: a?.opening_cents ?? 0, collected_cents: a?.credit_cents ?? 0, paid_cents: a?.debit_cents ?? 0, closing_cents: a?.closing_cents ?? 0,
      lines: a?.lines ?? [],
    },
    sales: { months, taxable_sales_cents: sum("taxable_sales_cents"), exempt_sales_cents: sum("exempt_sales_cents"), tax_on_invoices_cents: sum("tax_cents") },
  };
}
