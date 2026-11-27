/**
 * PERFUME-SALES-ORDERS — what a customer bought (owner 2026-11-26 19:08 CT "continue": the module after Quotes). An accepted
 * quote becomes an order with its lines; an order can also be started by hand. Each line keeps qty ordered and qty shipped;
 * the order is shipped when every line is. Full history, Excel and PDF. Owner-only perfume schema; never posts to accounting.
 *
 * Wired both ways: order → its quote, customer and items; quote → its order (quotes HEADER order_id / order_number);
 * customer → its orders (ordersOfCompany); item → the orders it is on (ordersOfItem).
 */
import type pg from "pg";
import { z } from "zod";
import ExcelJS from "exceljs";
import { bestCostOf, customerOf, esc, getQuote, money, quoteEvent, QuoteNotFound, usDate } from "./quotes.service.js";
import { getRules } from "./desk.service.js";
import { roundRule, sellingPrice } from "./selling-price.js";
import { InvInvalid, stockIn, stockOut } from "./inventory.service.js";
import { AcctInvalid, assertCanShip, levelPriceFor } from "./accounts.service.js";

export const ORDER_STATUSES = ["open", "shipped", "cancelled"] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const text = (n: number) => z.string().trim().max(n).nullable().optional().transform((v) => (v ? v : null));
const cents = z.number().int().min(0).max(100_000_000_00);

export const orderSchema = z.object({
  company_id: z.string().uuid().nullable().optional(),
  customer_name: text(300), customer_email: text(200), customer_phone: text(80), ship_to: text(1000),
  /** The own site the goods ship from (inventory). */
  location_code: z.string().min(1).max(40).nullable().optional(),
  order_date: date.optional(), ship_by: date.nullable().optional(),
  currency: z.enum(["USD", "MXN"]).optional(), terms: text(4000), notes: text(4000),
});
export const orderLineSchema = z.object({
  item_id: z.string().uuid().nullable().optional(), description: text(400), upc: text(40),
  qty: z.number().int().min(1).max(1_000_000), unit_price_cents: cents.optional(),
  /** The owner's written reason for a price below the item's minimum, or a retyped price on an item whose price is locked. */
  price_override_reason: z.string().trim().min(3).max(500).optional(),
});
export const orderLinePatchSchema = z.object({ qty: z.number().int().min(1).max(1_000_000).optional(), unit_price_cents: cents.optional(), qty_shipped: z.number().int().min(0).max(1_000_000).optional(),
  price_override_reason: z.string().trim().min(3).max(500).optional() });

export class OrderNotFound extends Error { constructor() { super("order_not_found"); } }
export class OrderInvalid extends Error {}

async function event(c: pg.PoolClient, orderId: string, uid: string | null, kind: string, detail: Record<string, unknown> = {}) {
  await c.query(`INSERT INTO perfume.sales_order_events (order_id, kind, detail, created_by, created_at) VALUES ($1, $2, $3::jsonb, $4, clock_timestamp())`,
    [orderId, kind, JSON.stringify(detail), uid]);
}

const TOTALS = `(SELECT coalesce(sum(l.qty * l.unit_price_cents), 0)::bigint FROM perfume.sales_order_lines l WHERE l.order_id = o.id AND l.archived_at IS NULL) AS total_cents,
  (SELECT coalesce(sum(l.qty * l.cost_cents), 0)::bigint FROM perfume.sales_order_lines l WHERE l.order_id = o.id AND l.archived_at IS NULL AND l.cost_cents IS NOT NULL) AS cost_cents,
  (SELECT coalesce(sum(l.qty * l.unit_price_cents), 0)::bigint FROM perfume.sales_order_lines l WHERE l.order_id = o.id AND l.archived_at IS NULL AND l.cost_cents IS NOT NULL) AS costed_total_cents,
  (SELECT count(*)::int FROM perfume.sales_order_lines l WHERE l.order_id = o.id AND l.archived_at IS NULL) AS lines,
  (SELECT coalesce(sum(l.qty), 0)::int FROM perfume.sales_order_lines l WHERE l.order_id = o.id AND l.archived_at IS NULL) AS units,
  (SELECT coalesce(sum(l.qty_shipped), 0)::int FROM perfume.sales_order_lines l WHERE l.order_id = o.id AND l.archived_at IS NULL) AS units_shipped`;
const HEADER = `o.id, o.number, o.quote_id, (SELECT q.number FROM perfume.quotes q WHERE q.id = o.quote_id) AS quote_number, o.company_id, o.customer_name,
  o.customer_email, o.customer_phone, o.ship_to, o.order_date::text, o.ship_by::text, o.status, o.currency, o.terms, o.notes, o.created_at, o.updated_at, o.location_code,
  (SELECT count(*)::int FROM perfume.purchase_orders p WHERE p.sales_order_id = o.id AND p.archived_at IS NULL AND p.status <> 'cancelled') AS purchase_orders`;

export type OrderLine = { id: string; line_no: number; item_id: string | null; description: string; upc: string | null; qty: number; qty_shipped: number;
  unit_price_cents: number; cost_cents: number | null; cost_vendor_id: string | null; cost_vendor: string | null };
export type OrderFull = Record<string, unknown> & { id: string; number: string; quote_id: string | null; quote_number: string | null; company_id: string | null;
  customer_name: string; customer_email: string | null; customer_phone: string | null; ship_to: string | null; order_date: string; ship_by: string | null;
  status: OrderStatus; currency: string; terms: string | null; notes: string | null; lines: OrderLine[]; events: Array<Record<string, unknown>> };

export async function listOrders(c: pg.PoolClient, f: { status?: string; company_id?: string; item_id?: string; q?: string } = {}) {
  const where = ["o.archived_at IS NULL"];
  const args: unknown[] = [];
  if (f.status) { args.push(f.status); where.push(`o.status = $${args.length}`); }
  if (f.company_id) { args.push(f.company_id); where.push(`o.company_id = $${args.length}`); }
  if (f.item_id) { args.push(f.item_id); where.push(`EXISTS (SELECT 1 FROM perfume.sales_order_lines l WHERE l.order_id = o.id AND l.archived_at IS NULL AND l.item_id = $${args.length})`); }
  if (f.q?.trim()) { args.push(`%${f.q.trim().toLowerCase()}%`); where.push(`(lower(o.number) LIKE $${args.length} OR lower(o.customer_name) LIKE $${args.length})`); }
  return (await c.query(`SELECT ${HEADER}, ${TOTALS} FROM perfume.sales_orders o WHERE ${where.join(" AND ")} ORDER BY o.order_date DESC, o.number DESC`, args)).rows;
}
export const ordersOfCompany = (c: pg.PoolClient, companyId: string) => listOrders(c, { company_id: companyId });
export const ordersOfItem = (c: pg.PoolClient, itemId: string) => listOrders(c, { item_id: itemId });

export async function getOrder(c: pg.PoolClient, id: string): Promise<OrderFull> {
  const h = (await c.query(`SELECT ${HEADER}, ${TOTALS} FROM perfume.sales_orders o WHERE o.id = $1 AND o.archived_at IS NULL`, [id])).rows[0];
  if (!h) throw new OrderNotFound();
  const lines = (await c.query(
    `SELECT l.id, l.line_no, l.item_id, l.description, l.upc, l.qty, l.qty_shipped, l.unit_price_cents::bigint AS unit_price_cents, l.cost_cents::bigint AS cost_cents,
            l.cost_vendor_id, v.name AS cost_vendor
       FROM perfume.sales_order_lines l LEFT JOIN perfume.vendors v ON v.id = l.cost_vendor_id
      WHERE l.order_id = $1 AND l.archived_at IS NULL ORDER BY l.line_no`, [id])).rows;
  const events = (await c.query(
    `SELECT e.id, e.kind, e.detail, e.created_at, u.email AS by_email FROM perfume.sales_order_events e LEFT JOIN identity.users u ON u.id = e.created_by
      WHERE e.order_id = $1 ORDER BY e.created_at, e.id`, [id])).rows;
  return { ...(h as OrderFull), lines: lines.map((l) => ({ ...l, unit_price_cents: Number(l.unit_price_cents), cost_cents: l.cost_cents == null ? null : Number(l.cost_cents) }) as OrderLine), events };
}

/** An order by hand (no quote). */
export async function createOrder(c: pg.PoolClient, uid: string, x: z.infer<typeof orderSchema>) {
  const cu = x.company_id ? await customerOf(c, x.company_id).catch((e) => { throw new OrderInvalid((e as Error).message); }) : null;
  const name = x.customer_name ?? cu?.name;
  if (!name) throw new OrderInvalid("Pick a customer or type its name.");
  const r = await c.query<{ id: string; number: string }>(
    `INSERT INTO perfume.sales_orders (company_id, customer_name, customer_email, customer_phone, ship_to, order_date, ship_by, currency, terms, notes, created_by, location_code)
     VALUES ($1,$2,$3,$4,$5,coalesce($6::date, current_date),$7,coalesce($8,'USD'),$9,$10,$11,$12) RETURNING id, number`,
    [x.company_id ?? null, name, x.customer_email ?? cu?.email ?? null, x.customer_phone ?? cu?.phone ?? null, x.ship_to, x.order_date ?? null, x.ship_by ?? null,
     x.currency ?? null, x.terms, x.notes, uid, x.location_code ?? null]);
  await event(c, r.rows[0]!.id, uid, "created", { number: r.rows[0]!.number, customer: name });
  return r.rows[0]!;
}

/** The quote becomes an order: same customer, lines, prices and costs; the quote is marked accepted; both histories say so.
 *  A quote already ordered opens the order it has (never two orders for one quote). */
export async function orderFromQuote(c: pg.PoolClient, uid: string, quoteId: string, x: { ship_by?: string | null } = {}) {
  const have = (await c.query<{ id: string; number: string }>(`SELECT id, number FROM perfume.sales_orders WHERE quote_id = $1 AND archived_at IS NULL`, [quoteId])).rows[0];
  if (have) return { ...have, created: false };
  let q;
  try { q = await getQuote(c, quoteId); } catch (e) { if (e instanceof QuoteNotFound) throw new OrderNotFound(); throw e; }
  if (!q.lines.length) throw new OrderInvalid("The quote has no lines.");
  if (q.status === "rejected") throw new OrderInvalid("The quote was rejected.");
  // The item's minimum price and active flag hold here too (migration 202617100100): a quoted line below the floor is named, and the
  // order is not made — fix the quote's price, or add the line on the order with the written override.
  const ids = q.lines.map((l) => l.item_id).filter((v): v is string => !!v);
  if (ids.length) {
    const rules = new Map((await c.query<{ id: string; display_name: string; min_price_cents: string | null; is_active: boolean }>(
      `SELECT id, display_name, min_price_cents::text, is_active FROM perfume.items WHERE id = ANY($1::uuid[])`, [ids])).rows.map((r) => [r.id, r]));
    for (const l of q.lines) {
      const it = l.item_id ? rules.get(l.item_id) : undefined;
      if (!it) continue;
      if (!it.is_active) throw new OrderInvalid(`Quote line ${l.line_no}: "${it.display_name}" is inactive.`);
      if (it.min_price_cents != null && Number(l.unit_price_cents) < Number(it.min_price_cents)) {
        throw new OrderInvalid(`Quote line ${l.line_no}: "${it.display_name}" at ${usd(Number(l.unit_price_cents))} is below the minimum price ${usd(Number(it.min_price_cents))}.`);
      }
    }
  }
  const r = await c.query<{ id: string; number: string }>(
    `INSERT INTO perfume.sales_orders (quote_id, company_id, customer_name, customer_email, customer_phone, ship_by, currency, terms, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, number`,
    [quoteId, q.company_id, q.customer_name, q.customer_email, q.customer_phone, x.ship_by ?? null, q.currency, q.terms, q.notes, uid]);
  const o = r.rows[0]!;
  for (const l of q.lines) {
    await c.query(
      `INSERT INTO perfume.sales_order_lines (order_id, line_no, quote_line_id, item_id, description, upc, qty, unit_price_cents, cost_cents, cost_vendor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [o.id, l.line_no, l.id, l.item_id, l.description, l.upc, l.qty, l.unit_price_cents, l.cost_cents, l.cost_vendor_id]);
  }
  if (q.status !== "accepted") {
    await c.query(`UPDATE perfume.quotes SET status = 'accepted', updated_at = now() WHERE id = $1`, [quoteId]);
    await quoteEvent(c, quoteId, uid, "status", { from: q.status, to: "accepted" });
  }
  await quoteEvent(c, quoteId, uid, "ordered", { order_id: o.id, number: o.number });
  await event(c, o.id, uid, "created", { number: o.number, customer: q.customer_name, from_quote: q.number, lines: q.lines.length });
  return { ...o, created: true };
}

export async function updateOrder(c: pg.PoolClient, uid: string, id: string, x: z.infer<typeof orderSchema>) {
  const b = (await c.query(`SELECT * FROM perfume.sales_orders WHERE id = $1 AND archived_at IS NULL`, [id])).rows[0];
  if (!b) throw new OrderNotFound();
  const keep = <T>(v: T | undefined, old: T) => (v !== undefined ? v : old);
  await c.query(
    `UPDATE perfume.sales_orders SET customer_name = $2, customer_email = $3, customer_phone = $4, ship_to = $5, ship_by = $6, currency = $7, terms = $8, notes = $9,
            location_code = $10, updated_at = now() WHERE id = $1`,
    [id, x.customer_name ?? b.customer_name, keep(x.customer_email, b.customer_email), keep(x.customer_phone, b.customer_phone), keep(x.ship_to, b.ship_to),
     keep(x.ship_by, b.ship_by), x.currency ?? b.currency, keep(x.terms, b.terms), keep(x.notes, b.notes), keep(x.location_code, b.location_code)]);
  await event(c, id, uid, "edited", { fields: Object.keys(x).filter((k) => x[k as keyof typeof x] !== undefined) });
}

/** Open ↔ cancelled by hand; "shipped" comes from the lines (every line fully shipped), never typed. */
export async function setOrderStatus(c: pg.PoolClient, uid: string, id: string, status: "open" | "cancelled") {
  const r = (await c.query<{ status: OrderStatus }>(`SELECT status FROM perfume.sales_orders WHERE id = $1 AND archived_at IS NULL`, [id])).rows[0];
  if (!r) throw new OrderNotFound();
  if (r.status === status) return;
  if (r.status === "shipped") throw new OrderInvalid("A shipped order is not reopened or cancelled.");
  await c.query(`UPDATE perfume.sales_orders SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  await event(c, id, uid, "status", { from: r.status, to: status });
}

async function refreshShipped(c: pg.PoolClient, uid: string, orderId: string) {
  const r = (await c.query<{ open: number; lines: number; status: OrderStatus }>(
    `SELECT (SELECT count(*)::int FROM perfume.sales_order_lines l WHERE l.order_id = o.id AND l.archived_at IS NULL AND l.qty_shipped < l.qty) AS open,
            (SELECT count(*)::int FROM perfume.sales_order_lines l WHERE l.order_id = o.id AND l.archived_at IS NULL) AS lines, o.status
       FROM perfume.sales_orders o WHERE o.id = $1`, [orderId])).rows[0]!;
  const next: OrderStatus = r.lines > 0 && r.open === 0 ? "shipped" : r.status === "shipped" ? "open" : r.status;
  if (next !== r.status) {
    await c.query(`UPDATE perfume.sales_orders SET status = $2, updated_at = now() WHERE id = $1`, [orderId, next]);
    await event(c, orderId, uid, "status", { from: r.status, to: next });
  }
}

async function assertEditable(c: pg.PoolClient, orderId: string) {
  const s = (await c.query<{ status: OrderStatus }>(`SELECT status FROM perfume.sales_orders WHERE id = $1 AND archived_at IS NULL`, [orderId])).rows[0];
  if (!s) throw new OrderNotFound();
  if (s.status === "cancelled") throw new OrderInvalid("The order is cancelled.");
}


const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/**
 * The item's price rules on an order line (CONTROL "Minimum price" and "Change price?", migration 202617100100, LEAD L.20):
 *   - below the item's minimum price → refused, unless the owner writes a reason;
 *   - "Change price? N" (price_locked) and a typed price that is not the customer's level price → refused, unless the owner writes a reason.
 * An override is one perfume.item_events 'price_override' row (the item's history) and is returned for the order's own line event.
 */
async function assertLinePrice(c: pg.PoolClient, uid: string, orderId: string, itemId: string | null | undefined, qty: number, price: number,
  typed: boolean, reason: string | undefined, lineNo: number | null) {
  if (!itemId) return null;
  const it = (await c.query<{ display_name: string; min_price_cents: string | null; price_locked: boolean }>(
    `SELECT display_name, min_price_cents::text, price_locked FROM perfume.items WHERE id = $1`, [itemId])).rows[0];
  if (!it) return null;
  const why: string[] = [];
  const min = it.min_price_cents == null ? null : Number(it.min_price_cents);
  if (min != null && price < min) why.push(`below the minimum price ${usd(min)}`);
  let level: number | null = null;
  if (it.price_locked && typed) {
    const co = (await c.query<{ company_id: string | null }>(`SELECT company_id FROM perfume.sales_orders WHERE id = $1`, [orderId])).rows[0]?.company_id ?? null;
    level = (await levelPriceFor(c, co, itemId, qty, (await bestCostOf(c, itemId))?.cents ?? null))?.cents ?? null;
    if (level != null && price !== level) why.push(`not the level price ${usd(level)} (the item's price is locked)`);
  }
  if (!why.length) return null;
  if (!reason) throw new OrderInvalid(`"${it.display_name}" at ${usd(price)} is ${why.join(" and ")}. Write the reason to override it.`);
  const detail = { order_id: orderId, line_no: lineNo, qty, unit_price_cents: price, min_price_cents: min, level_price_cents: level, locked: it.price_locked, reason, why };
  await c.query(`INSERT INTO perfume.item_events (item_id, kind, detail, created_by) VALUES ($1, 'price_override', $2::jsonb, $3)`, [itemId, JSON.stringify(detail), uid]);
  return { reason, why };
}

export async function addOrderLine(c: pg.PoolClient, uid: string, orderId: string, x: z.infer<typeof orderLineSchema>) {
  await assertEditable(c, orderId);
  let description = x.description, upc = x.upc, cost: Awaited<ReturnType<typeof bestCostOf>> = null;
  if (x.item_id) {
    const it = (await c.query<{ display_name: string; upc: string | null; is_active: boolean }>(
      `SELECT i.display_name, i.is_active, (SELECT u.upc FROM perfume.item_upcs u WHERE u.item_id = i.id ORDER BY u.upc LIMIT 1) AS upc FROM perfume.items i WHERE i.id = $1 AND i.merged_into_id IS NULL`,
      [x.item_id])).rows[0];
    if (!it) throw new OrderInvalid("That item is not on the desk.");
    if (!it.is_active) throw new OrderInvalid(`"${it.display_name}" is inactive — make it active in its item file to sell it.`);
    description = description ?? it.display_name; upc = upc ?? it.upc; cost = await bestCostOf(c, x.item_id);
  }
  if (!description) throw new OrderInvalid("A line needs an item or a description.");
  // No price typed: the customer's price level, else the best supplier cost + the owner's first wholesale target (the quote's
  // rule); no cost → type the price.
  let price = x.unit_price_cents ?? null;
  if (price == null && x.item_id) {
    const co = (await c.query<{ company_id: string | null }>(`SELECT company_id FROM perfume.sales_orders WHERE id = $1`, [orderId])).rows[0]?.company_id ?? null;
    price = (await levelPriceFor(c, co, x.item_id, x.qty, cost?.cents ?? null))?.cents ?? null;
  }
  // Calculated (never typed): closed by the desk rounding rule — owner 2026-11-27 15:40 CT "round to the nearest .25 upwards".
  if (price == null && cost) price = sellingPrice(cost.cents, (await getRules(c)).wholesale_targets_pct[0] ?? 12.5, "markup", await roundRule(c));
  if (price == null) throw new OrderInvalid("No supplier cost for it — type the price.");
  const no = (await c.query<{ n: number }>(`SELECT coalesce(max(line_no), 0)::int + 1 AS n FROM perfume.sales_order_lines WHERE order_id = $1`, [orderId])).rows[0]!.n;
  const override = await assertLinePrice(c, uid, orderId, x.item_id, x.qty, price, x.unit_price_cents != null, x.price_override_reason, no);
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.sales_order_lines (order_id, line_no, item_id, description, upc, qty, unit_price_cents, cost_cents, cost_vendor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [orderId, no, x.item_id ?? null, description, upc, x.qty, price, cost?.cents ?? null, cost?.vendor_id ?? null]);
  await event(c, orderId, uid, "line_added", { line_no: no, description, qty: x.qty, unit_price_cents: price, ...(override ? { price_override: override } : {}) });
  await refreshShipped(c, uid, orderId);
  return { id: r.rows[0]!.id, unit_price_cents: price };
}

export async function updateOrderLine(c: pg.PoolClient, uid: string, lineId: string, x: z.infer<typeof orderLinePatchSchema>) {
  const b = (await c.query(`SELECT order_id, line_no, item_id, qty, qty_shipped, unit_price_cents FROM perfume.sales_order_lines WHERE id = $1 AND archived_at IS NULL`, [lineId])).rows[0];
  if (!b) throw new OrderNotFound();
  await assertEditable(c, b.order_id);
  const qty = x.qty ?? b.qty;
  const priceChanged = x.unit_price_cents !== undefined && x.unit_price_cents !== Number(b.unit_price_cents);
  const override = priceChanged ? await assertLinePrice(c, uid, b.order_id, b.item_id, qty, x.unit_price_cents!, true, x.price_override_reason, b.line_no) : null;
  if (b.qty_shipped > qty || (x.qty_shipped ?? 0) > qty) throw new OrderInvalid("Shipped cannot be more than ordered.");
  // Shipped pieces move stock: more = a shipment out of the order's site (FIFO), fewer = a customer return back in.
  if (x.qty_shipped !== undefined && x.qty_shipped !== b.qty_shipped) {
    if (x.qty_shipped > b.qty_shipped) await shipOrder(c, uid, b.order_id, { lines: [{ line_id: lineId, qty: x.qty_shipped - b.qty_shipped }] });
    else await customerReturn(c, uid, lineId, b.qty_shipped - x.qty_shipped);
  }
  await c.query(`UPDATE perfume.sales_order_lines SET qty = $2, unit_price_cents = coalesce($3, unit_price_cents), updated_at = now() WHERE id = $1`,
    [lineId, qty, x.unit_price_cents ?? null]);
  if ((x.qty !== undefined && x.qty !== b.qty) || (x.unit_price_cents !== undefined && x.unit_price_cents !== Number(b.unit_price_cents))) {
    await event(c, b.order_id, uid, "line_changed", { line_no: b.line_no, from: { qty: b.qty, unit_price_cents: Number(b.unit_price_cents) }, to: { qty: x.qty, unit_price_cents: x.unit_price_cents },
      ...(override ? { price_override: override } : {}) });
  }
  await refreshShipped(c, uid, b.order_id);
}

export const shipSchema = z.object({
  location_code: z.string().min(1).max(40).optional(),
  lines: z.array(z.object({ line_id: z.string().uuid(), qty: z.number().int().min(1).max(1_000_000) })).max(2000).optional(),
});
/** Goods leave: each item line out of the site, oldest lots first; the cost of what left is kept in the history. No lines = all. */
export async function shipOrder(c: pg.PoolClient, uid: string, orderId: string, x: z.infer<typeof shipSchema> = {}) {
  const o = (await c.query<{ location_code: string | null; status: OrderStatus; company_id: string | null }>(
    `SELECT location_code, status, company_id FROM perfume.sales_orders WHERE id = $1 AND archived_at IS NULL FOR UPDATE`, [orderId])).rows[0];
  if (!o) throw new OrderNotFound();
  if (o.status === "cancelled") throw new OrderInvalid("The order is cancelled.");
  // A customer on credit hold does not ship (owner 2026-11-26 20:21 CT); quoting and ordering stay open.
  try { await assertCanShip(c, o.company_id); } catch (e) { if (e instanceof AcctInvalid) throw new OrderInvalid(e.message); throw e; }
  const loc = x.location_code ?? o.location_code;
  const lines = (await c.query<{ id: string; line_no: number; item_id: string | null; qty: number; qty_shipped: number }>(
    `SELECT id, line_no, item_id, qty, qty_shipped FROM perfume.sales_order_lines WHERE order_id = $1 AND archived_at IS NULL ORDER BY line_no FOR UPDATE`, [orderId])).rows;
  const want = x.lines ?? lines.filter((l) => l.qty_shipped < l.qty).map((l) => ({ line_id: l.id, qty: l.qty - l.qty_shipped }));
  if (!want.length) throw new OrderInvalid("Nothing left to ship on this order.");
  let cost = 0;
  for (const w of want) {
    const l = lines.find((r) => r.id === w.line_id);
    if (!l) throw new OrderInvalid("That line is not on this order.");
    if (l.qty_shipped + w.qty > l.qty) throw new OrderInvalid(`Line ${l.line_no}: only ${l.qty - l.qty_shipped} still to ship.`);
    let lineCost = 0;
    if (l.item_id) {
      if (!loc) throw new OrderInvalid("Pick the site the order ships from.");
      try {
        const slices = await stockOut(c, uid, { kind: "shipment", item_id: l.item_id, location_code: loc, qty: w.qty, sales_order_id: orderId, so_line_id: l.id });
        lineCost = slices.reduce((t, s) => t + s.qty * s.unit_cost_cents, 0);
      } catch (e) { if (e instanceof InvInvalid) throw new OrderInvalid(e.message); throw e; }
    }
    await c.query(`UPDATE perfume.sales_order_lines SET qty_shipped = qty_shipped + $2, updated_at = now() WHERE id = $1`, [l.id, w.qty]);
    await event(c, orderId, uid, "shipped", { line_no: l.line_no, from: l.qty_shipped, to: l.qty_shipped + w.qty, location: l.item_id ? loc : null, cost_cents: Math.round(lineCost) });
    l.qty_shipped += w.qty; cost += lineCost;
  }
  if (loc && loc !== o.location_code) await c.query(`UPDATE perfume.sales_orders SET location_code = $2, updated_at = now() WHERE id = $1`, [orderId, loc]);
  await refreshShipped(c, uid, orderId);
  return { lines: want.length, cost_cents: Math.round(cost) };
}

/** A customer sends pieces back: into the order's site at the average cost they left at (a new lot, source 'return'). */
export async function customerReturn(c: pg.PoolClient, uid: string, lineId: string, qty: number) {
  const l = (await c.query<{ order_id: string; line_no: number; item_id: string | null; qty_shipped: number; location_code: string | null }>(
    `SELECT l.order_id, l.line_no, l.item_id, l.qty_shipped, o.location_code FROM perfume.sales_order_lines l JOIN perfume.sales_orders o ON o.id = l.order_id
      WHERE l.id = $1 AND l.archived_at IS NULL FOR UPDATE OF l`, [lineId])).rows[0];
  if (!l) throw new OrderNotFound();
  if (qty > l.qty_shipped) throw new OrderInvalid(`Only ${l.qty_shipped} were shipped on line ${l.line_no}.`);
  if (l.item_id) {
    const out = (await c.query<{ loc: string | null; units: number; cost: string | null }>(
      `SELECT max(location_code) AS loc, coalesce(-sum(qty), 0)::int AS units, sum(-qty * unit_cost_cents)::text AS cost
         FROM perfume.stock_moves WHERE so_line_id = $1 AND kind = 'shipment'`, [lineId])).rows[0]!;
    const loc = out.loc ?? l.location_code;
    if (!loc) throw new OrderInvalid("Pick the site the order ships from.");
    const unit = out.units > 0 ? Number(out.cost) / out.units : 0;
    try {
      await stockIn(c, uid, { kind: "return", item_id: l.item_id, location_code: loc, qty, unit_cost_cents: unit, source: "return", sales_order_id: l.order_id, so_line_id: lineId, reason: "customer return" });
    } catch (e) { if (e instanceof InvInvalid) throw new OrderInvalid(e.message); throw e; }
  }
  await c.query(`UPDATE perfume.sales_order_lines SET qty_shipped = qty_shipped - $2, updated_at = now() WHERE id = $1`, [lineId, qty]);
  await event(c, l.order_id, uid, "shipped", { line_no: l.line_no, from: l.qty_shipped, to: l.qty_shipped - qty, returned: qty });
  await refreshShipped(c, uid, l.order_id);
}

/** Ship everything still open on the order in one step. */
export async function shipAll(c: pg.PoolClient, uid: string, orderId: string, location_code?: string) {
  await assertEditable(c, orderId);
  return shipOrder(c, uid, orderId, { location_code });
}

export async function removeOrderLine(c: pg.PoolClient, uid: string, lineId: string) {
  const b = (await c.query(`SELECT order_id, line_no, description, qty_shipped FROM perfume.sales_order_lines WHERE id = $1 AND archived_at IS NULL`, [lineId])).rows[0];
  if (!b) throw new OrderNotFound();
  await assertEditable(c, b.order_id);
  if (b.qty_shipped > 0) throw new OrderInvalid("A line with shipped pieces is not taken off.");
  await c.query(`UPDATE perfume.sales_order_lines SET archived_at = now(), updated_at = now() WHERE id = $1`, [lineId]);
  await event(c, b.order_id, uid, "line_removed", { line_no: b.line_no, description: b.description });
  await refreshShipped(c, uid, b.order_id);
}

export async function archiveOrder(c: pg.PoolClient, uid: string, id: string) {
  const r = await c.query(`UPDATE perfume.sales_orders SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL`, [id]);
  if (!r.rowCount) throw new OrderNotFound();
  await event(c, id, uid, "edited", { archived: true });
}

/* ------------------------------------------------------------------ Excel + PDF */

export async function orderXlsx(c: pg.PoolClient, uid: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const o = await getOrder(c, id);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(o.number);
  ws.columns = [{ width: 6 }, { width: 60 }, { width: 16 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 16 }];
  ws.addRow(["TIO Perfumes (ScentsX LLC)"]).font = { bold: true, size: 14, name: "Arial" };
  ws.addRow([`Sales order ${o.number}${o.quote_number ? ` (from quote ${o.quote_number})` : ""}`]).font = { bold: true, name: "Arial" };
  ws.addRow([`Customer: ${o.customer_name}`]);
  if (o.ship_to) ws.addRow([`Ship to: ${o.ship_to}`]);
  ws.addRow([`Order date: ${usDate(o.order_date)}${o.ship_by ? `   Ship by: ${usDate(o.ship_by)}` : ""}   Status: ${o.status}   Currency: ${o.currency}`]);
  ws.addRow([]);
  ws.addRow(["#", "Item", "UPC", "Qty", "Shipped", "Unit price", "Total"]).font = { bold: true, name: "Arial" };
  const first = ws.rowCount + 1;
  for (const l of o.lines) {
    const r = ws.addRow([l.line_no, l.description, l.upc ?? "", l.qty, l.qty_shipped, l.unit_price_cents / 100, null]);
    r.getCell(7).value = { formula: `D${r.number}*F${r.number}` };
  }
  const last = Math.max(first, ws.rowCount);
  const tot = ws.addRow(["", "", "", { formula: `SUM(D${first}:D${last})` }, { formula: `SUM(E${first}:E${last})` }, "Total", { formula: `SUM(G${first}:G${last})` }]);
  tot.font = { bold: true, name: "Arial" };
  const fmt = o.currency === "MXN" ? '"MX$"#,##0.00' : '"$"#,##0.00';
  for (let i = first; i <= tot.number; i++) { ws.getCell(`F${i}`).numFmt = fmt; ws.getCell(`G${i}`).numFmt = fmt; }
  if (o.terms) { ws.addRow([]); ws.addRow([`Terms: ${o.terms}`]); }
  if (o.notes) ws.addRow([`Notes: ${o.notes}`]);
  ws.eachRow((row) => row.eachCell((cell) => { cell.font = { ...(cell.font ?? {}), name: "Arial" }; }));
  await event(c, id, uid, "exported_xlsx", {});
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${o.number} ${o.customer_name}.xlsx`.replace(/[^\w .-]+/g, "") };
}

export function orderHtml(o: OrderFull): string {
  const rows = o.lines.map((l) => `<tr><td>${l.line_no}</td><td>${esc(l.description)}</td><td>${esc(l.upc ?? "")}</td><td class="n">${l.qty.toLocaleString("en-US")}</td>
    <td class="n">${l.qty_shipped.toLocaleString("en-US")}</td><td class="n">${money(l.unit_price_cents, o.currency)}</td><td class="n">${money(l.qty * l.unit_price_cents, o.currency)}</td></tr>`).join("");
  const total = o.lines.reduce((t, l) => t + l.qty * l.unit_price_cents, 0);
  const units = o.lines.reduce((t, l) => t + l.qty, 0), shipped = o.lines.reduce((t, l) => t + l.qty_shipped, 0);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1F2A44;font-size:11px;margin:28px}
    h1{font-size:18px;margin:0}h2{font-size:13px;margin:4px 0 14px;color:#14314F}
    .top{display:flex;justify-content:space-between;border-bottom:2px solid #14314F;padding-bottom:8px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}th{background:#14314F;color:#fff;text-align:left;padding:5px}
    td{border-bottom:1px solid #D8E0E8;padding:4px 5px}.n{text-align:right;white-space:nowrap}
    tfoot td{font-weight:bold;border-top:2px solid #14314F}.muted{color:#5A6B7F}
  </style></head><body>
  <div class="top"><div><h1>TIO Perfumes</h1><div class="muted">ScentsX LLC · Laredo, TX</div></div>
  <div style="text-align:right"><h2>Sales order ${esc(o.number)}</h2>${o.quote_number ? `<div>From quote ${esc(o.quote_number)}</div>` : ""}<div>Order date: ${usDate(o.order_date)}</div>${o.ship_by ? `<div>Ship by: ${usDate(o.ship_by)}</div>` : ""}<div>Currency: ${esc(o.currency)}</div></div></div>
  <div style="margin-bottom:6px"><b>Customer:</b> ${esc(o.customer_name)}${o.customer_email ? ` · ${esc(o.customer_email)}` : ""}${o.customer_phone ? ` · ${esc(o.customer_phone)}` : ""}</div>
  ${o.ship_to ? `<div style="margin-bottom:12px"><b>Ship to:</b> ${esc(o.ship_to)}</div>` : ""}
  <table><thead><tr><th>#</th><th>Item</th><th>UPC</th><th class="n">Qty</th><th class="n">Shipped</th><th class="n">Unit price</th><th class="n">Total</th></tr></thead>
  <tbody>${rows}</tbody><tfoot><tr><td></td><td>${o.lines.length} line${o.lines.length === 1 ? "" : "s"}</td><td></td><td class="n">${units.toLocaleString("en-US")}</td><td class="n">${shipped.toLocaleString("en-US")}</td><td class="n">Total</td><td class="n">${money(total, o.currency)}</td></tr></tfoot></table>
  ${o.terms ? `<p><b>Terms:</b> ${esc(o.terms)}</p>` : ""}${o.notes ? `<p><b>Notes:</b> ${esc(o.notes)}</p>` : ""}
  </body></html>`;
}

export async function orderPdf(c: pg.PoolClient, uid: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const o = await getOrder(c, id);
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setContent(orderHtml(o), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    await event(c, id, uid, "exported_pdf", {});
    return { buffer: Buffer.from(pdf), filename: `${o.number} ${o.customer_name}.pdf`.replace(/[^\w .-]+/g, "") };
  } finally { await browser.close(); }
}

/** The order list (same filters) as one workbook. */
export async function ordersListXlsx(c: pg.PoolClient, f: Parameters<typeof listOrders>[1] = {}) {
  const rows = await listOrders(c, f);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sales orders");
  ws.columns = [{ header: "Order", width: 12 }, { header: "Customer", width: 34 }, { header: "Quote", width: 12 }, { header: "Date", width: 12 }, { header: "Ship by", width: 12 },
    { header: "Status", width: 10 }, { header: "Lines", width: 8 }, { header: "Units", width: 9 }, { header: "Shipped", width: 9 }, { header: "Total", width: 14 }, { header: "Cost", width: 14 }];
  for (const r of rows) ws.addRow([r.number, r.customer_name, r.quote_number ?? "", usDate(r.order_date), usDate(r.ship_by), r.status, r.lines, r.units, r.units_shipped,
    Number(r.total_cents) / 100, Number(r.cost_cents) / 100]);
  ws.getColumn(10).numFmt = '"$"#,##0.00'; ws.getColumn(11).numFmt = '"$"#,##0.00';
  ws.getRow(1).font = { bold: true, name: "Arial" };
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: "Sales orders.xlsx" };
}
