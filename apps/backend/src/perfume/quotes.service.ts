/**
 * PERFUME-QUOTES — quotations to customers with their full history (owner 2026-11-26 18:13 CT: "we need exporters to excel,
 * we need pdfs, we need quotations, and then historoy for quotations"). Owner-only perfume schema; never posts to accounting
 * (owner: "maybe later"). Money is integer cents, exact — never rounded (owner 2026-11-20 21:45 CT).
 *
 * Wired both ways: a quote → its customer (perfume.contact_companies) and its items (perfume.items, cost from the current
 * supplier lists); a customer → its quotes (quotesOfCompany) and an item → the quotes it is on (quotesOfItem).
 */
import { applyDocCatalogs, docCatalogColumns, docCatalogFields } from "./doc-catalogs.service.js";
import type pg from "pg";
import { z } from "zod";
import ExcelJS from "exceljs";
import { getRules } from "./desk.service.js";
import { roundRule, sellingPrice } from "./selling-price.js";
import { levelPriceFor } from "./accounts.service.js";

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;
export type QuoteStatus = typeof QUOTE_STATUSES[number];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const text = (n: number) => z.string().trim().max(n).nullable().optional().transform((v) => (v ? v : null));
const cents = z.number().int().min(0).max(100_000_000_00);

export const quoteSchema = z.object({
  company_id: z.string().uuid().nullable().optional(),
  customer_name: text(300), customer_email: text(200), customer_phone: text(80),
  quote_date: date.optional(), valid_until: date.nullable().optional(),
  currency: z.enum(["USD", "MXN"]).optional(), terms: text(4000), notes: text(4000),
  ...docCatalogFields,
});
export const quotePatchSchema = quoteSchema;
export const lineSchema = z.object({
  item_id: z.string().uuid().nullable().optional(),
  description: text(400), upc: text(40),
  qty: z.number().int().min(1).max(1_000_000),
  unit_price_cents: cents.nullable().optional(),
});
export const linePatchSchema = z.object({ description: text(400), qty: z.number().int().min(1).max(1_000_000).optional(), unit_price_cents: cents.optional() });

export class QuoteNotFound extends Error { constructor() { super("quote_not_found"); } }
export class QuoteInvalid extends Error {}

export async function quoteEvent(c: pg.PoolClient, quoteId: string, uid: string | null, kind: string, detail: Record<string, unknown> = {}) {
  await c.query(`INSERT INTO perfume.quote_events (quote_id, kind, detail, created_by, created_at) VALUES ($1, $2, $3::jsonb, $4, clock_timestamp())`, [quoteId, kind, JSON.stringify(detail), uid]);
}

const TOTALS = `(SELECT coalesce(sum(l.qty * l.unit_price_cents), 0)::bigint FROM perfume.quote_lines l WHERE l.quote_id = q.id AND l.archived_at IS NULL) AS total_cents,
  (SELECT coalesce(sum(l.qty * l.cost_cents), 0)::bigint FROM perfume.quote_lines l WHERE l.quote_id = q.id AND l.archived_at IS NULL AND l.cost_cents IS NOT NULL) AS cost_cents,
  (SELECT coalesce(sum(l.qty * l.unit_price_cents), 0)::bigint FROM perfume.quote_lines l WHERE l.quote_id = q.id AND l.archived_at IS NULL AND l.cost_cents IS NOT NULL) AS costed_total_cents,
  (SELECT count(*)::int FROM perfume.quote_lines l WHERE l.quote_id = q.id AND l.archived_at IS NULL) AS lines,
  (SELECT coalesce(sum(l.qty), 0)::int FROM perfume.quote_lines l WHERE l.quote_id = q.id AND l.archived_at IS NULL) AS units`;
const HEADER = `q.id, q.number, q.company_id, q.customer_name, q.customer_email, q.customer_phone, q.quote_date::text, q.valid_until::text,
  CASE WHEN q.status = 'sent' AND q.valid_until IS NOT NULL AND q.valid_until < current_date THEN 'expired' ELSE q.status END AS status,
  q.currency, q.terms, q.notes, q.created_at, q.updated_at, ${docCatalogColumns("q", true)},
  (SELECT o.id FROM perfume.sales_orders o WHERE o.quote_id = q.id AND o.archived_at IS NULL LIMIT 1) AS order_id,
  (SELECT o.number FROM perfume.sales_orders o WHERE o.quote_id = q.id AND o.archived_at IS NULL LIMIT 1) AS order_number`;

export async function listQuotes(c: pg.PoolClient, f: { status?: string; company_id?: string; item_id?: string; q?: string } = {}) {
  const where = ["q.archived_at IS NULL"];
  const args: unknown[] = [];
  if (f.company_id) { args.push(f.company_id); where.push(`q.company_id = $${args.length}`); }
  if (f.item_id) { args.push(f.item_id); where.push(`EXISTS (SELECT 1 FROM perfume.quote_lines l WHERE l.quote_id = q.id AND l.archived_at IS NULL AND l.item_id = $${args.length})`); }
  if (f.q?.trim()) { args.push(`%${f.q.trim().toLowerCase()}%`); where.push(`(lower(q.number) LIKE $${args.length} OR lower(q.customer_name) LIKE $${args.length})`); }
  const rows = (await c.query(`SELECT ${HEADER}, ${TOTALS} FROM perfume.quotes q WHERE ${where.join(" AND ")} ORDER BY q.quote_date DESC, q.number DESC`, args)).rows;
  return f.status ? rows.filter((r) => r["status"] === f.status) : rows;
}

/** The quotes a customer has (shown on the contact profile). */
export const quotesOfCompany = (c: pg.PoolClient, companyId: string) => listQuotes(c, { company_id: companyId });
/** The quotes an item is on (shown from the item). */
export const quotesOfItem = (c: pg.PoolClient, itemId: string) => listQuotes(c, { item_id: itemId });

export type QuoteLine = { id: string; line_no: number; item_id: string | null; description: string; upc: string | null; qty: number;
  unit_price_cents: number; cost_cents: number | null; cost_vendor_id: string | null; cost_vendor: string | null; item_name: string | null };
export type QuoteFull = Record<string, unknown> & { id: string; number: string; company_id: string | null; customer_name: string; customer_email: string | null;
  customer_phone: string | null; quote_date: string; valid_until: string | null; status: string; currency: string; terms: string | null; notes: string | null;
  payment_terms_id: string | null; shipping_method: string | null; terms_days: number | null; tax_code_id: string | null; tax_code_name: string | null;
  lines: QuoteLine[]; events: Array<Record<string, unknown>> };

export async function getQuote(c: pg.PoolClient, id: string): Promise<QuoteFull> {
  const h = (await c.query(`SELECT ${HEADER}, ${TOTALS} FROM perfume.quotes q WHERE q.id = $1 AND q.archived_at IS NULL`, [id])).rows[0];
  if (!h) throw new QuoteNotFound();
  const lines = (await c.query(
    `SELECT l.id, l.line_no, l.item_id, l.description, l.upc, l.qty, l.unit_price_cents::bigint AS unit_price_cents, l.cost_cents::bigint AS cost_cents,
            l.cost_vendor_id, v.name AS cost_vendor, i.display_name AS item_name
       FROM perfume.quote_lines l LEFT JOIN perfume.vendors v ON v.id = l.cost_vendor_id LEFT JOIN perfume.items i ON i.id = l.item_id
      WHERE l.quote_id = $1 AND l.archived_at IS NULL ORDER BY l.line_no`, [id])).rows;
  const events = (await c.query(
    `SELECT e.id, e.kind, e.detail, e.created_at, u.email AS by_email FROM perfume.quote_events e LEFT JOIN identity.users u ON u.id = e.created_by
      WHERE e.quote_id = $1 ORDER BY e.created_at, e.id`, [id])).rows;
  return { ...(h as QuoteFull), lines: lines.map((l) => ({ ...l, unit_price_cents: Number(l.unit_price_cents), cost_cents: l.cost_cents == null ? null : Number(l.cost_cents) }) as QuoteLine), events };
}

/** The customer's name / email / phone come from the contacts database when a company is picked. */
export async function customerOf(c: pg.PoolClient, companyId: string) {
  const r = (await c.query<{ name: string; phone: string | null; email: string | null }>(
    `SELECT co.name, co.phone, (SELECT p.email FROM perfume.contact_people p WHERE p.company_id = co.id AND p.archived_at IS NULL AND p.email IS NOT NULL
             AND p.opted_out_at IS NULL ORDER BY p.last_email_on DESC NULLS LAST LIMIT 1) AS email
       FROM perfume.contact_companies co WHERE co.id = $1 AND co.archived_at IS NULL`, [companyId])).rows[0];
  if (!r) throw new QuoteInvalid("That customer is not in Contacts.");
  return r;
}

export async function createQuote(c: pg.PoolClient, uid: string, x: z.infer<typeof quoteSchema>) {
  const cu = x.company_id ? await customerOf(c, x.company_id) : null;
  const name = x.customer_name ?? cu?.name;
  if (!name) throw new QuoteInvalid("Pick a customer or type its name.");
  const r = await c.query<{ id: string; number: string }>(
    `INSERT INTO perfume.quotes (company_id, customer_name, customer_email, customer_phone, quote_date, valid_until, currency, terms, notes, created_by)
     VALUES ($1,$2,$3,$4,coalesce($5::date, current_date),$6,coalesce($7,'USD'),$8,$9,$10) RETURNING id, number`,
    [x.company_id ?? null, name, x.customer_email ?? cu?.email ?? null, x.customer_phone ?? cu?.phone ?? null, x.quote_date ?? null, x.valid_until ?? null,
     x.currency ?? null, x.terms, x.notes, uid]);
  await applyDocCatalogs(c, "quotes", r.rows[0]!.id, x);
  await quoteEvent(c, r.rows[0]!.id, uid, "created", { number: r.rows[0]!.number, customer: name });
  return r.rows[0]!;
}

export async function updateQuote(c: pg.PoolClient, uid: string, id: string, x: z.infer<typeof quotePatchSchema>) {
  const before = (await c.query(`SELECT * FROM perfume.quotes WHERE id = $1 AND archived_at IS NULL`, [id])).rows[0];
  if (!before) throw new QuoteNotFound();
  const cu = x.company_id ? await customerOf(c, x.company_id) : null;
  const next: Record<string, unknown> = {
    company_id: x.company_id !== undefined ? x.company_id : before.company_id,
    customer_name: x.customer_name ?? cu?.name ?? before.customer_name,
    customer_email: x.customer_email !== undefined ? x.customer_email ?? cu?.email ?? null : before.customer_email,
    customer_phone: x.customer_phone !== undefined ? x.customer_phone ?? cu?.phone ?? null : before.customer_phone,
    quote_date: x.quote_date ?? (before.quote_date instanceof Date ? before.quote_date.toISOString().slice(0, 10) : before.quote_date),
    valid_until: x.valid_until !== undefined ? x.valid_until : before.valid_until,
    currency: x.currency ?? before.currency,
    terms: x.terms !== undefined ? x.terms : before.terms,
    notes: x.notes !== undefined ? x.notes : before.notes,
  };
  await c.query(
    `UPDATE perfume.quotes SET company_id = $2, customer_name = $3, customer_email = $4, customer_phone = $5, quote_date = $6, valid_until = $7,
            currency = $8, terms = $9, notes = $10, updated_at = now() WHERE id = $1`,
    [id, next.company_id, next.customer_name, next.customer_email, next.customer_phone, next.quote_date, next.valid_until, next.currency, next.terms, next.notes]);
  await applyDocCatalogs(c, "quotes", id, x);
  const changed = Object.keys(x).filter((k) => x[k as keyof typeof x] !== undefined);
  await quoteEvent(c, id, uid, "edited", { fields: changed });
}

export async function setQuoteStatus(c: pg.PoolClient, uid: string, id: string, status: QuoteStatus) {
  const r = await c.query<{ status: string }>(`SELECT status FROM perfume.quotes WHERE id = $1 AND archived_at IS NULL`, [id]);
  if (!r.rows[0]) throw new QuoteNotFound();
  if (r.rows[0].status === status) return;
  await c.query(`UPDATE perfume.quotes SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  await quoteEvent(c, id, uid, "status", { from: r.rows[0].status, to: status });
}

export async function archiveQuote(c: pg.PoolClient, uid: string, id: string) {
  const r = await c.query(`UPDATE perfume.quotes SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL`, [id]);
  if (!r.rowCount) throw new QuoteNotFound();
  await quoteEvent(c, id, uid, "edited", { archived: true });
}

/** The lowest price an item is on at a current supplier list (competitors, my own lists and offers never count). */
export async function bestCostOf(c: pg.PoolClient, itemId: string): Promise<{ cents: number; vendor_id: string; vendor: string } | null> {
  const r = (await c.query<{ cents: string; vendor_id: string; vendor: string }>(
    `SELECT r.price_cents::bigint AS cents, v.id AS vendor_id, v.name AS vendor
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE r.item_id = $1 AND l.is_current AND l.voided_at IS NULL AND r.price_cents IS NOT NULL AND r.price_cents > 0
        AND v.kind IN ('buy', 'both') ORDER BY r.price_cents, v.name LIMIT 1`, [itemId])).rows[0];
  return r ? { cents: Number(r.cents), vendor_id: r.vendor_id, vendor: r.vendor } : null;
}

/** Items to put on a quote: by name, brand or barcode, each with its best supplier cost. */
export async function searchQuoteItems(c: pg.PoolClient, q: string) {
  const t = q.trim();
  if (t.length < 2) return [];
  // Every typed word must be in the item (brand, name or display name), so "versace dylan" finds VERSACE · DYLAN BLUE;
  // a barcode finds its item. Plain bottles come before sets / minis / testers (measured 00:50Z: "versace dylan" listed
  // three gift sets first).
  const words = t.toLowerCase().split(/\s+/).filter((w) => w.length > 0).slice(0, 8);
  // Inactive items (CONTROL "Active? N", migration 202617100100) are not offered; the register's POS code finds its item.
  const args: unknown[] = [t.replace(/\D/g, ""), t.toUpperCase()];
  const conds = words.map((w) => { args.push(`%${w}%`); return `lower(i.brand || ' ' || i.name || ' ' || i.display_name) LIKE $${args.length}`; });
  const rows = (await c.query<{ id: string; display_name: string; upc: string | null }>(
    `SELECT i.id, i.display_name, (SELECT u.upc FROM perfume.item_upcs u WHERE u.item_id = i.id ORDER BY u.upc LIMIT 1) AS upc
       FROM perfume.items i
      WHERE i.merged_into_id IS NULL AND i.is_active AND i.is_stock_item
        AND ((${conds.join(" AND ")}) OR upper(i.pos_code) = $2 OR ($1 <> '' AND EXISTS (SELECT 1 FROM perfume.item_upcs u WHERE u.item_id = i.id AND u.upc = $1)))
      ORDER BY (cardinality(coalesce(i.flags, '{}'::text[])) = 0) DESC, length(i.display_name), i.display_name LIMIT 25`, args)).rows;
  const out = [];
  for (const r of rows) out.push({ ...r, best: await bestCostOf(c, r.id) });
  return out;
}

export async function addLine(c: pg.PoolClient, uid: string, quoteId: string, x: z.infer<typeof lineSchema>) {
  const q = await c.query<{ company_id: string | null }>(`SELECT company_id FROM perfume.quotes WHERE id = $1 AND archived_at IS NULL`, [quoteId]);
  if (!q.rowCount) throw new QuoteNotFound();
  let description = x.description, upc = x.upc, cost: Awaited<ReturnType<typeof bestCostOf>> = null;
  if (x.item_id) {
    const it = (await c.query<{ display_name: string; upc: string | null }>(
      `SELECT i.display_name, (SELECT u.upc FROM perfume.item_upcs u WHERE u.item_id = i.id ORDER BY u.upc LIMIT 1) AS upc
         FROM perfume.items i WHERE i.id = $1 AND i.merged_into_id IS NULL`, [x.item_id])).rows[0];
    if (!it) throw new QuoteInvalid("That item is not on the desk.");
    description = description ?? it.display_name;
    upc = upc ?? it.upc;
    cost = await bestCostOf(c, x.item_id);
  }
  if (!description) throw new QuoteInvalid("A line needs an item or a description.");
  let price = x.unit_price_cents ?? null;
  // The customer's price level first (owner 2026-11-26 20:28 CT), then the desk's first wholesale target on the best cost.
  if (price == null && x.item_id) price = (await levelPriceFor(c, q.rows[0]!.company_id, x.item_id, x.qty, cost?.cents ?? null))?.cents ?? null;
  if (price == null) {
    if (!cost) throw new QuoteInvalid("No supplier cost for this item — type the price.");
    const rules = await getRules(c);
    // Calculated (never typed): closed by the desk rounding rule — owner 2026-11-27 15:40 CT "round to the nearest .25 upwards".
    price = sellingPrice(cost.cents, rules.wholesale_targets_pct[0] ?? 12.5, "markup", await roundRule(c));
  }
  const no = (await c.query<{ n: number }>(`SELECT coalesce(max(line_no), 0)::int + 1 AS n FROM perfume.quote_lines WHERE quote_id = $1`, [quoteId])).rows[0]!.n;
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.quote_lines (quote_id, line_no, item_id, description, upc, qty, unit_price_cents, cost_cents, cost_vendor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [quoteId, no, x.item_id ?? null, description, upc, x.qty, price, cost?.cents ?? null, cost?.vendor_id ?? null]);
  await c.query(`UPDATE perfume.quotes SET updated_at = now() WHERE id = $1`, [quoteId]);
  await quoteEvent(c, quoteId, uid, "line_added", { line_no: no, description, qty: x.qty, unit_price_cents: price, cost_cents: cost?.cents ?? null, cost_vendor: cost?.vendor ?? null });
  return { id: r.rows[0]!.id, unit_price_cents: price };
}

export async function updateLine(c: pg.PoolClient, uid: string, lineId: string, x: z.infer<typeof linePatchSchema>) {
  const b = (await c.query(`SELECT quote_id, line_no, description, qty, unit_price_cents FROM perfume.quote_lines WHERE id = $1 AND archived_at IS NULL`, [lineId])).rows[0];
  if (!b) throw new QuoteNotFound();
  await c.query(
    `UPDATE perfume.quote_lines SET description = coalesce($2, description), qty = coalesce($3, qty), unit_price_cents = coalesce($4, unit_price_cents), updated_at = now() WHERE id = $1`,
    [lineId, x.description ?? null, x.qty ?? null, x.unit_price_cents ?? null]);
  await c.query(`UPDATE perfume.quotes SET updated_at = now() WHERE id = $1`, [b.quote_id]);
  await quoteEvent(c, b.quote_id, uid, "line_changed", { line_no: b.line_no, from: { qty: b.qty, unit_price_cents: Number(b.unit_price_cents), description: b.description }, to: x });
}

export async function removeLine(c: pg.PoolClient, uid: string, lineId: string) {
  const b = (await c.query(`UPDATE perfume.quote_lines SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING quote_id, line_no, description`, [lineId])).rows[0];
  if (!b) throw new QuoteNotFound();
  await quoteEvent(c, b.quote_id, uid, "line_removed", { line_no: b.line_no, description: b.description });
}

/** A new draft with the same customer and lines (today's date; prices as they were). */
export async function copyQuote(c: pg.PoolClient, uid: string, id: string) {
  const src = await getQuote(c, id);
  const n = await createQuote(c, uid, { company_id: src.company_id, customer_name: src.customer_name, customer_email: src.customer_email,
    customer_phone: src.customer_phone, currency: src.currency as "USD" | "MXN", terms: src.terms, notes: src.notes,
    payment_terms_id: src.payment_terms_id, shipping_method: src.shipping_method, tax_code_id: src.tax_code_id });
  let no = 0;
  for (const l of src.lines) {
    no++;
    await c.query(
      `INSERT INTO perfume.quote_lines (quote_id, line_no, item_id, description, upc, qty, unit_price_cents, cost_cents, cost_vendor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [n.id, no, l.item_id, l.description, l.upc, l.qty, l.unit_price_cents, l.cost_cents, l.cost_vendor_id]);
  }
  await quoteEvent(c, n.id, uid, "copied_from", { number: src.number, lines: no });
  return n;
}

/* ------------------------------------------------------------------ Excel + PDF */

export const money = (cents: number, cur: string) => `${cur === "MXN" ? "MX$" : "$"}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const usDate = (d: string | null) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : "");

/** The quote as an Excel file: header, one row per line with formulas (qty × price = total), and the total by formula. */
export async function quoteXlsx(c: pg.PoolClient, uid: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const q = await getQuote(c, id);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(q.number);
  ws.columns = [{ width: 6 }, { width: 60 }, { width: 16 }, { width: 10 }, { width: 14 }, { width: 16 }];
  ws.addRow(["TIO Perfumes (ScentsX LLC)"]).font = { bold: true, size: 14, name: "Arial" };
  ws.addRow([`Quotation ${q.number}`]).font = { bold: true, name: "Arial" };
  ws.addRow([`Customer: ${q.customer_name}`]);
  if (q.customer_email || q.customer_phone) ws.addRow([[q.customer_email, q.customer_phone].filter(Boolean).join(" · ")]);
  ws.addRow([`Date: ${usDate(q.quote_date)}${q.valid_until ? `   Valid until: ${usDate(q.valid_until)}` : ""}   Currency: ${q.currency}`]);
  ws.addRow([]);
  const head = ws.addRow(["#", "Item", "UPC", "Qty", "Unit price", "Total"]);
  head.font = { bold: true, name: "Arial" };
  const first = ws.rowCount + 1;
  for (const l of q.lines) {
    const r = ws.addRow([l.line_no, l.description, l.upc ?? "", l.qty, l.unit_price_cents / 100, null]);
    r.getCell(6).value = { formula: `D${r.number}*E${r.number}` };
  }
  const last = ws.rowCount;
  const tot = ws.addRow(["", "", "", { formula: `SUM(D${first}:D${Math.max(first, last)})` }, "Total", { formula: `SUM(F${first}:F${Math.max(first, last)})` }]);
  tot.font = { bold: true, name: "Arial" };
  const fmt = q.currency === "MXN" ? '"MX$"#,##0.00' : '"$"#,##0.00';
  for (let i = first; i <= tot.number; i++) { ws.getCell(`E${i}`).numFmt = fmt; ws.getCell(`F${i}`).numFmt = fmt; }
  if (q.terms) { ws.addRow([]); ws.addRow([`Terms: ${q.terms}`]); }
  if (q.notes) ws.addRow([`Notes: ${q.notes}`]);
  ws.eachRow((row) => row.eachCell((cell) => { cell.font = { ...(cell.font ?? {}), name: "Arial" }; }));
  await quoteEvent(c, id, uid, "exported_xlsx", {});
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${q.number} ${q.customer_name}.xlsx`.replace(/[^\w .-]+/g, "") };
}

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));

export function quoteHtml(q: QuoteFull): string {
  const rows = q.lines.map((l) => `<tr><td>${l.line_no}</td><td>${esc(l.description)}</td><td>${esc(l.upc ?? "")}</td><td class="n">${l.qty.toLocaleString("en-US")}</td>
    <td class="n">${money(l.unit_price_cents, q.currency)}</td><td class="n">${money(l.qty * l.unit_price_cents, q.currency)}</td></tr>`).join("");
  const total = q.lines.reduce((t, l) => t + l.qty * l.unit_price_cents, 0);
  const units = q.lines.reduce((t, l) => t + l.qty, 0);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1F2A44;font-size:11px;margin:28px}
    h1{font-size:18px;margin:0}h2{font-size:13px;margin:4px 0 14px;color:#14314F}
    .top{display:flex;justify-content:space-between;border-bottom:2px solid #14314F;padding-bottom:8px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}th{background:#14314F;color:#fff;text-align:left;padding:5px}
    td{border-bottom:1px solid #D8E0E8;padding:4px 5px}.n{text-align:right;white-space:nowrap}
    tfoot td{font-weight:bold;border-top:2px solid #14314F}.muted{color:#5A6B7F}
  </style></head><body>
  <div class="top"><div><h1>TIO Perfumes</h1><div class="muted">ScentsX LLC · Laredo, TX</div></div>
  <div style="text-align:right"><h2>Quotation ${esc(q.number)}</h2><div>Date: ${usDate(q.quote_date)}</div>${q.valid_until ? `<div>Valid until: ${usDate(q.valid_until)}</div>` : ""}<div>Currency: ${esc(q.currency)}</div></div></div>
  <div style="margin-bottom:12px"><b>Customer:</b> ${esc(q.customer_name)}${q.customer_email ? ` · ${esc(q.customer_email)}` : ""}${q.customer_phone ? ` · ${esc(q.customer_phone)}` : ""}</div>
  <table><thead><tr><th>#</th><th>Item</th><th>UPC</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Total</th></tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><td></td><td>${q.lines.length} line${q.lines.length === 1 ? "" : "s"}</td><td></td><td class="n">${units.toLocaleString("en-US")}</td><td class="n">Total</td><td class="n">${money(total, q.currency)}</td></tr></tfoot></table>
  ${q.terms ? `<p><b>Terms:</b> ${esc(q.terms)}</p>` : ""}${q.notes ? `<p><b>Notes:</b> ${esc(q.notes)}</p>` : ""}
  </body></html>`;
}

/** The quote as a PDF (same Puppeteer renderer the app uses for COIs and IFTA returns). */
export async function quotePdf(c: pg.PoolClient, uid: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const q = await getQuote(c, id);
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setContent(quoteHtml(q), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    await quoteEvent(c, id, uid, "exported_pdf", {});
    return { buffer: Buffer.from(pdf), filename: `${q.number} ${q.customer_name}.pdf`.replace(/[^\w .-]+/g, "") };
  } finally { await browser.close(); }
}

/** Every quote as one Excel sheet (the list on screen). */
export async function quotesListXlsx(c: pg.PoolClient): Promise<Buffer> {
  const rows = await listQuotes(c);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Quotes");
  ws.addRow(["Number", "Date", "Valid until", "Customer", "Email", "Status", "Currency", "Lines", "Units", "Total", "Cost (costed lines)", "Margin %"]).font = { bold: true, name: "Arial" };
  for (const r of rows) {
    const total = Number(r["total_cents"]) / 100, cost = Number(r["cost_cents"]) / 100, costed = Number(r["costed_total_cents"]) / 100;
    const row = ws.addRow([r["number"], r["quote_date"], r["valid_until"] ?? "", r["customer_name"], r["customer_email"] ?? "", r["status"], r["currency"],
      r["lines"], r["units"], total, cost, null]);
    row.getCell(12).value = costed > 0 ? { formula: `IF(${costed}=0,"",(${costed}-K${row.number})/${costed})` } : "";
    row.getCell(10).numFmt = '"$"#,##0.00'; row.getCell(11).numFmt = '"$"#,##0.00'; row.getCell(12).numFmt = "0.0%";
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
