/**
 * PERFUME E3 — salespeople + sales / commission by salesperson (ROUND L.31 M18 E3, taken over by LEAD; owner 2026-11-27 22:54 CT
 * "… customers … fully total and complete"). Migration 202617300100.
 *   · salespeople: name, commission % (0 until the owner sets it), active.
 *   · a customer company's salesperson: ONE live row per company; reassigning ends the old row (ended_at / ended_by / reason) and opens a
 *     new one, so the history is kept, never overwritten. Bulk: assign several companies at once.
 *   · report (READ ONLY): per salesperson, for a period, the customers they hold today and those customers' sales — ScentsX's issued
 *     invoices before tax (subtotal_cents, USD) by the contact company linked to the ScentsX customer, plus the imported purchase history
 *     (perfume.customer_purchase_history) in the chosen currency — and the commission = sales × the salesperson's %. Attribution is by
 *     the customer's CURRENT salesperson, like QuickBooks "Sales by Rep". Customers with no salesperson are one "Unassigned" row.
 * Nothing posts: a commission actually paid goes through the bill / expense writer.
 */
import type pg from "pg";
import { z } from "zod";

type Q = Pick<pg.PoolClient, "query">;
export class SalespersonInvalid extends Error {}

export const salespersonBody = z.object({
  name: z.string().trim().min(1).max(120),
  commission_pct: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
});
export const salespersonPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  commission_pct: z.coerce.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});
export const assignBody = z.object({
  company_ids: z.array(z.string().uuid()).min(1).max(2000),
  salesperson_id: z.string().uuid().nullable(),
  reason: z.string().trim().max(300).optional().nullable(),
});
export const salesRepQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.enum(["USD", "MXN"]).default("USD"),
}).refine((q) => q.from <= q.to, { message: "from must be on or before to" });

export async function listSalespeople(c: Q) {
  const r = await c.query<{ id: string; name: string; commission_pct: string; active: boolean; notes: string | null; customers: number; created_at: string }>(
    `SELECT s.id::text, s.name, s.commission_pct::text, s.active, s.notes, s.created_at::text,
            (SELECT count(*)::int FROM perfume.customer_salespeople a WHERE a.salesperson_id = s.id AND a.ended_at IS NULL) AS customers
       FROM perfume.salespeople s ORDER BY s.active DESC, s.name`);
  return r.rows.map((x) => ({ ...x, commission_pct: Number(x.commission_pct) }));
}

export async function createSalesperson(c: Q, uid: string, b: z.infer<typeof salespersonBody>) {
  const dup = await c.query(`SELECT 1 FROM perfume.salespeople WHERE name_key = lower(regexp_replace(btrim($1), '\\s+', ' ', 'g'))`, [b.name]);
  if (dup.rows.length) throw new SalespersonInvalid(`A salesperson named "${b.name}" already exists`);
  try {
    const r = await c.query<{ id: string }>(
      `INSERT INTO perfume.salespeople (name, commission_pct, notes, created_by) VALUES ($1, $2, $3, $4::uuid) RETURNING id::text`,
      [b.name, b.commission_pct, b.notes ?? null, uid]);
    return r.rows[0]!;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new SalespersonInvalid(`A salesperson named "${b.name}" already exists`);
    throw e;
  }
}

export async function updateSalesperson(c: Q, id: string, b: z.infer<typeof salespersonPatch>) {
  const r = await c.query<{ id: string }>(
    `UPDATE perfume.salespeople SET name = COALESCE($2, name), commission_pct = COALESCE($3, commission_pct), active = COALESCE($4, active),
            notes = CASE WHEN $5::boolean THEN $6 ELSE notes END, updated_at = now()
      WHERE id = $1::uuid RETURNING id::text`,
    [id, b.name ?? null, b.commission_pct ?? null, b.active ?? null, b.notes !== undefined, b.notes ?? null]);
  if (!r.rows[0]) throw new SalespersonInvalid("salesperson not found");
  return r.rows[0];
}

/** Assigns (or, with salesperson_id null, removes) the salesperson of each company: ends the live row, opens a new one. Idempotent per company. */
export async function assignSalesperson(c: Q, uid: string, b: z.infer<typeof assignBody>) {
  if (b.salesperson_id) {
    const s = await c.query(`SELECT 1 FROM perfume.salespeople WHERE id = $1::uuid AND active`, [b.salesperson_id]);
    if (!s.rows.length) throw new SalespersonInvalid("salesperson not found or inactive");
  }
  const known = await c.query<{ id: string }>(`SELECT id::text FROM perfume.contact_companies WHERE id = ANY($1::uuid[])`, [b.company_ids]);
  if (known.rows.length !== new Set(b.company_ids).size) throw new SalespersonInvalid("one or more companies not found");
  // Companies already with this salesperson are left alone (no history noise).
  const same = new Set((await c.query<{ company_id: string }>(
    `SELECT company_id::text FROM perfume.customer_salespeople WHERE company_id = ANY($1::uuid[]) AND ended_at IS NULL AND salesperson_id IS NOT DISTINCT FROM $2::uuid`,
    [b.company_ids, b.salesperson_id])).rows.map((r) => r.company_id));
  const change = [...new Set(b.company_ids)].filter((id) => !same.has(id));
  if (!change.length) return { changed: 0, unchanged: same.size };
  await c.query(
    `UPDATE perfume.customer_salespeople SET ended_at = now(), ended_by = $2::uuid, end_reason = $3
      WHERE company_id = ANY($1::uuid[]) AND ended_at IS NULL`,
    [change, uid, b.reason?.trim() || (b.salesperson_id ? "reassigned" : "salesperson removed")]);
  if (b.salesperson_id) {
    await c.query(
      `INSERT INTO perfume.customer_salespeople (company_id, salesperson_id, assigned_by) SELECT x, $2::uuid, $3::uuid FROM unnest($1::uuid[]) AS x`,
      [change, b.salesperson_id, uid]);
  }
  return { changed: change.length, unchanged: same.size };
}

/** A company's salesperson now and its history. */
export async function companySalesperson(c: Q, companyId: string) {
  const r = await c.query<{ id: string; salesperson_id: string; salesperson: string; assigned_at: string; ended_at: string | null; end_reason: string | null }>(
    `SELECT a.id::text, a.salesperson_id::text, s.name AS salesperson, a.assigned_at::text, a.ended_at::text, a.end_reason
       FROM perfume.customer_salespeople a JOIN perfume.salespeople s ON s.id = a.salesperson_id
      WHERE a.company_id = $1::uuid ORDER BY a.ended_at DESC NULLS FIRST, a.assigned_at DESC`, [companyId]);
  return { current: r.rows.find((x) => !x.ended_at) ?? null, history: r.rows };
}

export type RepRow = { salesperson_id: string | null; salesperson: string; commission_pct: number; customers: number; buying_customers: number;
  invoice_sales_cents: number; history_sales_cents: number; sales_cents: number; commission_cents: number };

export async function salesBySalesperson(c: Q, q: z.infer<typeof salesRepQuery>) {
  const rows = (await c.query<{ company_id: string; salesperson_id: string | null; inv: string; hist: string }>(
    `WITH live AS (SELECT company_id, salesperson_id FROM perfume.customer_salespeople WHERE ended_at IS NULL),
     inv AS (
       SELECT l.contact_company_id AS company_id, sum(i.subtotal_cents)::bigint AS cents
         FROM accounting.invoices i JOIN scentsx.customer_links l ON l.customer_id = i.customer_id AND l.voided_at IS NULL
        WHERE $3 = 'USD' AND i.operating_company_id = (SELECT id FROM org.companies WHERE code = 'SCENTSX')
          AND i.status NOT IN ('void', 'voided', 'draft', 'proforma') AND i.voided_at IS NULL AND i.is_sample_data = false
          AND i.issue_date BETWEEN $1::date AND $2::date
        GROUP BY 1),
     hist AS (
       SELECT h.company_id, sum(h.amount_cents)::bigint AS cents FROM perfume.customer_purchase_history h
        WHERE h.company_id IS NOT NULL AND h.currency = $3 AND h.period_start BETWEEN $1::date AND $2::date GROUP BY 1),
     comp AS (SELECT company_id FROM inv UNION SELECT company_id FROM hist UNION SELECT company_id FROM live)
     SELECT comp.company_id::text, live.salesperson_id::text, COALESCE(inv.cents, 0)::text AS inv, COALESCE(hist.cents, 0)::text AS hist
       FROM comp LEFT JOIN live ON live.company_id = comp.company_id
       LEFT JOIN inv ON inv.company_id = comp.company_id LEFT JOIN hist ON hist.company_id = comp.company_id`,
    [q.from, q.to, q.currency])).rows;
  const people = await listSalespeople(c);
  const byId = new Map<string | null, RepRow>();
  for (const p of people) byId.set(p.id, { salesperson_id: p.id, salesperson: p.name, commission_pct: p.commission_pct, customers: 0, buying_customers: 0,
    invoice_sales_cents: 0, history_sales_cents: 0, sales_cents: 0, commission_cents: 0 });
  byId.set(null, { salesperson_id: null, salesperson: "Unassigned", commission_pct: 0, customers: 0, buying_customers: 0, invoice_sales_cents: 0, history_sales_cents: 0, sales_cents: 0, commission_cents: 0 });
  for (const r of rows) {
    const row = byId.get(r.salesperson_id) ?? byId.get(null)!;
    const inv = Number(r.inv); const hist = Number(r.hist);
    if (r.salesperson_id) row.customers += 1;
    if (inv + hist > 0) { row.buying_customers += 1; if (!r.salesperson_id) row.customers += 1; }
    row.invoice_sales_cents += inv; row.history_sales_cents += hist; row.sales_cents += inv + hist;
  }
  const out = [...byId.values()].map((r) => ({ ...r, commission_cents: Math.round((r.sales_cents * r.commission_pct) / 100) }))
    .filter((r) => r.salesperson_id !== null || r.sales_cents > 0)
    .sort((a, b) => b.sales_cents - a.sales_cents || a.salesperson.localeCompare(b.salesperson));
  const total = (k: "sales_cents" | "commission_cents") => out.reduce((s, r) => s + r[k], 0);
  return { from: q.from, to: q.to, currency: q.currency, attribution: "current salesperson of each customer", totals: { sales_cents: total("sales_cents"), commission_cents: total("commission_cents") }, rows: out };
}

/** The customers of one salesperson (or unassigned, id null) with their sales in the period — the report's drill-down. */
export async function salespersonCustomers(c: Q, salespersonId: string | null, q: z.infer<typeof salesRepQuery>) {
  const r = await c.query<{ company_id: string; name: string; inv: string; hist: string; assigned_at: string | null }>(
    `WITH live AS (SELECT company_id, salesperson_id, assigned_at FROM perfume.customer_salespeople WHERE ended_at IS NULL)
     SELECT cc.id::text AS company_id, cc.name, live.assigned_at::text,
            COALESCE((SELECT sum(i.subtotal_cents) FROM accounting.invoices i JOIN scentsx.customer_links l ON l.customer_id = i.customer_id AND l.voided_at IS NULL
                       WHERE $4 = 'USD' AND l.contact_company_id = cc.id AND i.operating_company_id = (SELECT id FROM org.companies WHERE code = 'SCENTSX')
                         AND i.status NOT IN ('void', 'voided', 'draft', 'proforma') AND i.voided_at IS NULL AND i.is_sample_data = false
                         AND i.issue_date BETWEEN $2::date AND $3::date), 0)::text AS inv,
            COALESCE((SELECT sum(h.amount_cents) FROM perfume.customer_purchase_history h WHERE h.company_id = cc.id AND h.currency = $4
                       AND h.period_start BETWEEN $2::date AND $3::date), 0)::text AS hist
       FROM perfume.contact_companies cc LEFT JOIN live ON live.company_id = cc.id
      WHERE ($1::uuid IS NOT NULL AND live.salesperson_id = $1::uuid)
         OR ($1::uuid IS NULL AND live.salesperson_id IS NULL AND (
              EXISTS (SELECT 1 FROM perfume.customer_purchase_history h WHERE h.company_id = cc.id AND h.currency = $4 AND h.period_start BETWEEN $2::date AND $3::date)
           OR EXISTS (SELECT 1 FROM accounting.invoices i JOIN scentsx.customer_links l ON l.customer_id = i.customer_id AND l.voided_at IS NULL
                       WHERE $4 = 'USD' AND l.contact_company_id = cc.id AND i.voided_at IS NULL AND i.status NOT IN ('void', 'voided', 'draft', 'proforma')
                         AND i.issue_date BETWEEN $2::date AND $3::date)))
      ORDER BY cc.name LIMIT 2000`,
    [salespersonId, q.from, q.to, q.currency]);
  return r.rows.map((x) => ({ company_id: x.company_id, name: x.name, assigned_at: x.assigned_at, invoice_sales_cents: Number(x.inv), history_sales_cents: Number(x.hist),
    sales_cents: Number(x.inv) + Number(x.hist) }));
}
