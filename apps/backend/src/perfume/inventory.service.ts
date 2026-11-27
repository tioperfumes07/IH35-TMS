/**
 * PERFUME-INVENTORY — the ScentsX stock ledger (owner 2026-11-26 20:21 CT; answers 20:28 CT: the sites are the ones in his
 * inventory file, "we should use fifo, but we use avg cost for lists etc, we need to be able to manage both", adjustments
 * over $500 need a second person).
 *
 * On hand is never typed: it is the sum of append-only stock moves. Each move records the FIFO cost of the lot it used and
 * the item's moving-average cost at that site after it. Lots keep vendor + PO line (recall / counterfeit trace). Negative
 * stock is refused. Every inflow / outflow runs inside the caller's transaction, row-locked, so two shipments can never
 * take the same bottle. Nothing here writes accounting (the ScentsX accounting layer links its entries to a move's id).
 */
import type pg from "pg";
import { z } from "zod";
import { escapeHtml, formatDate } from "../render/pdf-template.js";

export class InvInvalid extends Error {}
export class InvNotFound extends Error { constructor() { super("not_found"); } }

export type MoveKind = "opening" | "receipt" | "shipment" | "transfer_out" | "transfer_in" | "adjustment" | "count" | "return" | "write_down";
export type MoveLinks = { purchase_order_id?: string | null; po_line_id?: string | null; sales_order_id?: string | null; so_line_id?: string | null;
  transfer_id?: string | null; count_id?: string | null; writeoff_id?: string | null; reason?: string | null };
export type Slice = { lot_id: string; qty: number; unit_cost_cents: number };

const ADJUST_SECOND_PERSON_CENTS = 50_000; // owner 20:28 CT: over $500 needs a second person

async function stockRow(c: pg.PoolClient, itemId: string, loc: string) {
  await c.query(`INSERT INTO perfume.item_stock (item_id, location_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [itemId, loc]);
  return (await c.query<{ qty: number; avg: string }>(
    `SELECT qty, avg_cost_cents::text AS avg FROM perfume.item_stock WHERE item_id = $1 AND location_code = $2 FOR UPDATE`, [itemId, loc])).rows[0]!;
}

async function assertSite(c: pg.PoolClient, loc: string, allowTransit = false) {
  const l = (await c.query<{ kind: string | null; own: boolean; active: boolean }>(`SELECT kind, own, active FROM perfume.locations WHERE code = $1`, [loc])).rows[0];
  if (!l) throw new InvInvalid(`Site ${loc} is not on the desk.`);
  if (!l.own || !l.active) throw new InvInvalid(`Site ${loc} does not hold stock.`);
  if (l.kind === "transit" && !allowTransit) throw new InvInvalid("Goods only pass through In transit on a transfer.");
}

/** Goods in: a new lot at its cost; the site's moving average takes it in. */
export async function stockIn(c: pg.PoolClient, uid: string | null, x: {
  kind: MoveKind; item_id: string; location_code: string; qty: number; unit_cost_cents: number; source: "opening" | "receipt" | "transfer" | "return" | "adjustment" | "count";
  lot_code?: string | null; vendor_id?: string | null; parent_lot_id?: string | null; received_on?: string | null; allowTransit?: boolean;
} & MoveLinks): Promise<{ lot_id: string; move_id: string }> {
  if (!Number.isInteger(x.qty) || x.qty <= 0) throw new InvInvalid("Quantity in must be a whole number above 0.");
  if (!(x.unit_cost_cents >= 0)) throw new InvInvalid("Cost cannot be negative.");
  await assertSite(c, x.location_code, x.allowTransit);
  const s = await stockRow(c, x.item_id, x.location_code);
  const qtyAfter = s.qty + x.qty;
  const avgAfter = (s.qty * Number(s.avg) + x.qty * x.unit_cost_cents) / qtyAfter;
  const lot = (await c.query<{ id: string }>(
    `INSERT INTO perfume.inventory_lots (item_id, location_code, lot_code, source, received_on, qty_in, qty_left, unit_cost_cents, vendor_id, po_line_id, parent_lot_id, created_by)
     VALUES ($1,$2,$3,$4,coalesce($5::date, current_date),$6,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [x.item_id, x.location_code, x.lot_code ?? null, x.source, x.received_on ?? null, x.qty, x.unit_cost_cents, x.vendor_id ?? null, x.po_line_id ?? null, x.parent_lot_id ?? null, uid])).rows[0]!;
  await c.query(`UPDATE perfume.item_stock SET qty = $3, avg_cost_cents = $4, updated_at = now() WHERE item_id = $1 AND location_code = $2`,
    [x.item_id, x.location_code, qtyAfter, avgAfter]);
  const m = await insertMove(c, uid, x.kind, x.item_id, x.location_code, x.qty, x.unit_cost_cents, lot.id, qtyAfter, avgAfter, x);
  return { lot_id: lot.id, move_id: m };
}

/** Goods out: oldest lots first (or the lots named), each slice at its own lot cost. The average stays; refused below zero. */
export async function stockOut(c: pg.PoolClient, uid: string | null, x: {
  kind: MoveKind; item_id: string; location_code: string; qty: number; lot_ids?: string[]; allowTransit?: boolean;
} & MoveLinks): Promise<Slice[]> {
  if (!Number.isInteger(x.qty) || x.qty <= 0) throw new InvInvalid("Quantity out must be a whole number above 0.");
  await assertSite(c, x.location_code, x.allowTransit);
  if (x.kind === "shipment" && (await c.query(`SELECT 1 FROM perfume.locations WHERE code = $1 AND kind = 'quarantine'`, [x.location_code])).rowCount) {
    throw new InvInvalid(`${x.location_code} is a quarantine site — its stock is not sold or shipped. Transfer it to a selling site first.`);
  }
  const s = await stockRow(c, x.item_id, x.location_code);
  const lots = (await c.query<{ id: string; qty_left: number; unit_cost_cents: string }>(
    `SELECT id, qty_left, unit_cost_cents::text FROM perfume.inventory_lots
      WHERE item_id = $1 AND location_code = $2 AND qty_left > 0 ${x.lot_ids ? "AND id = ANY($3::uuid[])" : ""}
      ORDER BY received_on, created_at, id FOR UPDATE`, x.lot_ids ? [x.item_id, x.location_code, x.lot_ids] : [x.item_id, x.location_code])).rows;
  const have = lots.reduce((t, l) => t + l.qty_left, 0);
  if (have < x.qty) {
    const name = (await c.query<{ display_name: string }>(`SELECT display_name FROM perfume.items WHERE id = $1`, [x.item_id])).rows[0]?.display_name ?? "the item";
    throw new InvInvalid(`Only ${have} of ${name} on hand at ${x.location_code}; ${x.qty} needed.`);
  }
  let need = x.qty, qtyNow = s.qty;
  const slices: Slice[] = [];
  for (const l of lots) {
    if (need === 0) break;
    const take = Math.min(need, l.qty_left);
    await c.query(`UPDATE perfume.inventory_lots SET qty_left = qty_left - $2 WHERE id = $1`, [l.id, take]);
    qtyNow -= take;
    await insertMove(c, uid, x.kind, x.item_id, x.location_code, -take, Number(l.unit_cost_cents), l.id, qtyNow, Number(s.avg), x);
    slices.push({ lot_id: l.id, qty: take, unit_cost_cents: Number(l.unit_cost_cents) });
    need -= take;
  }
  await c.query(`UPDATE perfume.item_stock SET qty = $3, updated_at = now() WHERE item_id = $1 AND location_code = $2`, [x.item_id, x.location_code, qtyNow]);
  return slices;
}

async function insertMove(c: pg.PoolClient, uid: string | null, kind: MoveKind, itemId: string, loc: string, qty: number, cost: number, lotId: string,
  qtyAfter: number, avgAfter: number, l: MoveLinks) {
  if (qtyAfter < 0) throw new InvInvalid("Stock cannot go below zero.");
  return (await c.query<{ id: string }>(
    `INSERT INTO perfume.stock_moves (kind, item_id, location_code, qty, unit_cost_cents, lot_id, qty_after, avg_cost_after_cents,
       purchase_order_id, po_line_id, sales_order_id, so_line_id, transfer_id, count_id, writeoff_id, reason, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [kind, itemId, loc, qty, cost, lotId, qtyAfter, avgAfter, l.purchase_order_id ?? null, l.po_line_id ?? null, l.sales_order_id ?? null,
     l.so_line_id ?? null, l.transfer_id ?? null, l.count_id ?? null, l.writeoff_id ?? null, l.reason ?? null, uid])).rows[0]!.id;
}

/* ------------------------------------------------------------------ reads */

export async function listSites(c: pg.PoolClient) {
  return (await c.query(
    `SELECT l.code, l.name, l.kind, l.own, l.active, l.address, l.sort_order,
            coalesce(sum(s.qty), 0)::int AS units, count(s.item_id) FILTER (WHERE s.qty > 0)::int AS items,
            coalesce((SELECT sum(lt.qty_left * lt.unit_cost_cents) FROM perfume.inventory_lots lt WHERE lt.location_code = l.code), 0)::bigint AS fifo_value_cents
       FROM perfume.locations l LEFT JOIN perfume.item_stock s ON s.location_code = l.code
      GROUP BY l.code ORDER BY l.sort_order, l.code`)).rows;
}

export const siteSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(), kind: z.enum(["warehouse", "store", "consignment", "quarantine"]).nullable().optional(),
  own: z.boolean().optional(), active: z.boolean().optional(), address: z.string().trim().max(500).nullable().optional(),
});
export async function updateSite(c: pg.PoolClient, uid: string, code: string, x: z.infer<typeof siteSchema>) {
  if (code === "TRANSIT") throw new InvInvalid("In transit is the system's own site.");
  const b = (await c.query(`SELECT * FROM perfume.locations WHERE code = $1`, [code])).rows[0];
  if (!b) throw new InvNotFound();
  if ((x.own === false || x.active === false) && (await c.query(`SELECT 1 FROM perfume.item_stock WHERE location_code = $1 AND qty > 0`, [code])).rowCount) {
    throw new InvInvalid("This site still holds stock — move or count it out first.");
  }
  const keep = <T>(v: T | undefined, old: T) => (v !== undefined ? v : old);
  await c.query(`UPDATE perfume.locations SET name = $2, kind = $3, own = $4, active = $5, address = $6, updated_by = $7, updated_at = now() WHERE code = $1`,
    [code, x.name ?? b.name, keep(x.kind, b.kind), keep(x.own, b.own), keep(x.active, b.active), keep(x.address, b.address), uid]);
}

/** On hand per item per site with FIFO value and moving average. */
export async function stockOnHand(c: pg.PoolClient, f: { location?: string; q?: string; item_id?: string; low?: boolean } = {}) {
  const where = ["s.qty > 0 OR s.min_qty IS NOT NULL"];
  const args: unknown[] = [];
  if (f.location) { args.push(f.location); where.push(`s.location_code = $${args.length}`); }
  if (f.item_id) { args.push(f.item_id); where.push(`s.item_id = $${args.length}`); }
  if (f.q?.trim()) {
    for (const w of f.q.trim().toLowerCase().split(/\s+/).slice(0, 6)) { args.push(`%${w}%`); where.push(`lower(i.display_name || ' ' || coalesce(i.internal_code, '')) LIKE $${args.length}`); }
  }
  if (f.low) where.push("s.min_qty IS NOT NULL AND s.qty < s.min_qty");
  return (await c.query(
    `SELECT s.item_id, i.display_name, i.internal_code, s.location_code, l.name AS location_name, s.qty, s.avg_cost_cents::float8 AS avg_cost_cents,
            coalesce((SELECT sum(lt.qty_left * lt.unit_cost_cents) FROM perfume.inventory_lots lt WHERE lt.item_id = s.item_id AND lt.location_code = s.location_code), 0)::float8 AS fifo_value_cents,
            (SELECT min(lt.received_on)::text FROM perfume.inventory_lots lt WHERE lt.item_id = s.item_id AND lt.location_code = s.location_code AND lt.qty_left > 0) AS oldest_lot,
            s.min_qty, s.max_qty
       FROM perfume.item_stock s JOIN perfume.items i ON i.id = s.item_id JOIN perfume.locations l ON l.code = s.location_code
      WHERE (${where[0]}) ${where.slice(1).map((w) => `AND ${w}`).join(" ")}
      ORDER BY i.display_name, l.sort_order LIMIT 5000`, args)).rows;
}

export async function itemLots(c: pg.PoolClient, itemId: string) {
  return (await c.query(
    `SELECT lt.id, lt.location_code, lt.lot_code, lt.source, lt.received_on::text, lt.qty_in, lt.qty_left, lt.unit_cost_cents::float8 AS unit_cost_cents,
            v.name AS vendor, lt.po_line_id, (SELECT p.number FROM perfume.purchase_order_lines pl JOIN perfume.purchase_orders p ON p.id = pl.po_id WHERE pl.id = lt.po_line_id) AS po_number,
            (SELECT p.id FROM perfume.purchase_order_lines pl JOIN perfume.purchase_orders p ON p.id = pl.po_id WHERE pl.id = lt.po_line_id) AS po_id
       FROM perfume.inventory_lots lt LEFT JOIN perfume.vendors v ON v.id = lt.vendor_id
      WHERE lt.item_id = $1 ORDER BY lt.received_on DESC, lt.created_at DESC`, [itemId])).rows;
}

export async function listMoves(c: pg.PoolClient, f: { item_id?: string; location?: string; kind?: string; purchase_order_id?: string; sales_order_id?: string; limit?: number } = {}) {
  const where: string[] = []; const args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };
  if (f.item_id) add("m.item_id = ?", f.item_id);
  if (f.location) add("m.location_code = ?", f.location);
  if (f.kind) add("m.kind = ?", f.kind);
  if (f.purchase_order_id) add("m.purchase_order_id = ?", f.purchase_order_id);
  if (f.sales_order_id) add("m.sales_order_id = ?", f.sales_order_id);
  args.push(Math.min(f.limit ?? 1000, 5000));
  return (await c.query(
    `SELECT m.id, m.moved_at, m.kind, m.item_id, i.display_name, m.location_code, m.qty, m.unit_cost_cents::float8 AS unit_cost_cents, m.qty_after,
            m.avg_cost_after_cents::float8 AS avg_cost_after_cents, m.lot_id, lt.lot_code, m.reason,
            m.purchase_order_id, (SELECT number FROM perfume.purchase_orders WHERE id = m.purchase_order_id) AS po_number,
            m.sales_order_id, (SELECT number FROM perfume.sales_orders WHERE id = m.sales_order_id) AS so_number,
            m.transfer_id, (SELECT number FROM perfume.stock_transfers WHERE id = m.transfer_id) AS transfer_number,
            m.count_id, (SELECT number FROM perfume.stock_counts WHERE id = m.count_id) AS count_number,
            m.writeoff_id, (SELECT number FROM perfume.stock_writeoffs WHERE id = m.writeoff_id) AS writeoff_number, u.email AS by_email
       FROM perfume.stock_moves m JOIN perfume.items i ON i.id = m.item_id LEFT JOIN perfume.inventory_lots lt ON lt.id = m.lot_id
       LEFT JOIN identity.users u ON u.id = m.created_by
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY m.moved_at DESC, m.id LIMIT $${args.length}`, args)).rows;
}

export async function setReorder(c: pg.PoolClient, itemId: string, loc: string, min: number | null, max: number | null,
  extra: { bin?: string | null; reorder_qty?: number | null } = {}) {
  if (min != null && max != null && max < min) throw new InvInvalid("Max cannot be below min.");
  await assertSite(c, loc);
  await stockRow(c, itemId, loc);
  await c.query(`UPDATE perfume.item_stock SET min_qty = $3, max_qty = $4, updated_at = now() WHERE item_id = $1 AND location_code = $2`, [itemId, loc, min, max]);
  // Bin and usual reorder quantity (migration 202617040100) — only touched when sent.
  if (extra.bin !== undefined) await c.query(`UPDATE perfume.item_stock SET bin = $3 WHERE item_id = $1 AND location_code = $2`, [itemId, loc, extra.bin?.trim() || null]);
  if (extra.reorder_qty !== undefined) await c.query(`UPDATE perfume.item_stock SET reorder_qty = $3 WHERE item_id = $1 AND location_code = $2`, [itemId, loc, extra.reorder_qty]);
}

/** One item's settings and stock at every own site (the item profile's "Sites" block). */
export async function itemSites(c: pg.PoolClient, itemId: string) {
  return (await c.query(
    `SELECT l.code AS location_code, l.name AS location_name, l.kind, coalesce(s.qty, 0)::int AS on_hand, s.avg_cost_cents, s.min_qty, s.max_qty, s.bin, s.reorder_qty
       FROM perfume.locations l LEFT JOIN perfume.item_stock s ON s.location_code = l.code AND s.item_id = $1
      WHERE l.active AND l.own ORDER BY l.sort_order, l.code`, [itemId])).rows;
}

/* ------------------------------------------------------------------ transfers */

export const transferSchema = z.object({ from_code: z.string().min(1).max(40), to_code: z.string().min(1).max(40), notes: z.string().trim().max(2000).nullable().optional() });
export async function createTransfer(c: pg.PoolClient, uid: string, x: z.infer<typeof transferSchema>) {
  if (x.from_code === x.to_code) throw new InvInvalid("Pick two different sites.");
  await assertSite(c, x.from_code); await assertSite(c, x.to_code);
  return (await c.query<{ id: string; number: string }>(
    `INSERT INTO perfume.stock_transfers (from_code, to_code, notes, created_by) VALUES ($1,$2,$3,$4) RETURNING id, number`,
    [x.from_code, x.to_code, x.notes ?? null, uid])).rows[0]!;
}
async function transferHead(c: pg.PoolClient, id: string) {
  const t = (await c.query(`SELECT * FROM perfume.stock_transfers WHERE id = $1 FOR UPDATE`, [id])).rows[0];
  if (!t) throw new InvNotFound();
  return t as { id: string; number: string; from_code: string; to_code: string; status: string };
}
export async function addTransferLine(c: pg.PoolClient, id: string, itemId: string, qty: number) {
  const t = await transferHead(c, id);
  if (t.status !== "draft") throw new InvInvalid("Only a draft transfer takes lines.");
  if (!Number.isInteger(qty) || qty < 1) throw new InvInvalid("Quantity must be a whole number above 0.");
  return (await c.query<{ id: string }>(`INSERT INTO perfume.stock_transfer_lines (transfer_id, item_id, qty) VALUES ($1,$2,$3) RETURNING id`, [id, itemId, qty])).rows[0]!;
}
export async function removeTransferLine(c: pg.PoolClient, lineId: string) {
  const l = (await c.query(`SELECT transfer_id FROM perfume.stock_transfer_lines WHERE id = $1 AND archived_at IS NULL`, [lineId])).rows[0];
  if (!l) throw new InvNotFound();
  if ((await transferHead(c, l.transfer_id)).status !== "draft") throw new InvInvalid("Only a draft transfer changes.");
  await c.query(`UPDATE perfume.stock_transfer_lines SET archived_at = now() WHERE id = $1`, [lineId]);
}
/** Ship: out of the sending site (FIFO) into In transit at the same lot cost. */
export async function shipTransfer(c: pg.PoolClient, uid: string, id: string) {
  const t = await transferHead(c, id);
  if (t.status !== "draft") throw new InvInvalid("This transfer already left.");
  const lines = (await c.query<{ item_id: string; qty: number }>(`SELECT item_id, qty FROM perfume.stock_transfer_lines WHERE transfer_id = $1 AND archived_at IS NULL`, [id])).rows;
  if (!lines.length) throw new InvInvalid("The transfer has no lines.");
  for (const l of lines) {
    const slices = await stockOut(c, uid, { kind: "transfer_out", item_id: l.item_id, location_code: t.from_code, qty: l.qty, transfer_id: id });
    for (const s of slices) {
      await stockIn(c, uid, { kind: "transfer_in", item_id: l.item_id, location_code: "TRANSIT", qty: s.qty, unit_cost_cents: s.unit_cost_cents, source: "transfer",
        parent_lot_id: s.lot_id, transfer_id: id, allowTransit: true });
    }
  }
  await c.query(`UPDATE perfume.stock_transfers SET status = 'shipped', shipped_at = now(), shipped_by = $2, updated_at = now() WHERE id = $1`, [id, uid]);
}
/** Receive: out of In transit (this transfer's own lots) into the receiving site, same cost, same lot code. */
export async function receiveTransfer(c: pg.PoolClient, uid: string, id: string) {
  const t = await transferHead(c, id);
  if (t.status !== "shipped") throw new InvInvalid("Only a shipped transfer is received.");
  const lots = (await c.query<{ id: string; item_id: string; qty_left: number; unit_cost_cents: string; lot_code: string | null; parent_lot_id: string | null }>(
    `SELECT lt.id, lt.item_id, lt.qty_left, lt.unit_cost_cents::text, p.lot_code, lt.parent_lot_id FROM perfume.inventory_lots lt LEFT JOIN perfume.inventory_lots p ON p.id = lt.parent_lot_id
      WHERE lt.location_code = 'TRANSIT' AND lt.qty_left > 0 AND lt.id IN (SELECT lot_id FROM perfume.stock_moves WHERE transfer_id = $1 AND kind = 'transfer_in' AND location_code = 'TRANSIT')`, [id])).rows;
  for (const l of lots) {
    await stockOut(c, uid, { kind: "transfer_out", item_id: l.item_id, location_code: "TRANSIT", qty: l.qty_left, lot_ids: [l.id], transfer_id: id, allowTransit: true });
    await stockIn(c, uid, { kind: "transfer_in", item_id: l.item_id, location_code: t.to_code, qty: l.qty_left, unit_cost_cents: Number(l.unit_cost_cents), source: "transfer",
      lot_code: l.lot_code, parent_lot_id: l.id, transfer_id: id });
  }
  await c.query(`UPDATE perfume.stock_transfers SET status = 'received', received_at = now(), received_by = $2, updated_at = now() WHERE id = $1`, [id, uid]);
}
export async function cancelTransfer(c: pg.PoolClient, id: string) {
  const t = await transferHead(c, id);
  if (t.status !== "draft") throw new InvInvalid("A transfer on the road is received, not cancelled.");
  await c.query(`UPDATE perfume.stock_transfers SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id]);
}
export async function listTransfers(c: pg.PoolClient) {
  return (await c.query(
    `SELECT t.id, t.number, t.from_code, t.to_code, t.status, t.notes, t.created_at, t.shipped_at, t.received_at,
            (SELECT count(*)::int FROM perfume.stock_transfer_lines l WHERE l.transfer_id = t.id AND l.archived_at IS NULL) AS lines,
            (SELECT coalesce(sum(l.qty), 0)::int FROM perfume.stock_transfer_lines l WHERE l.transfer_id = t.id AND l.archived_at IS NULL) AS units
       FROM perfume.stock_transfers t ORDER BY t.created_at DESC LIMIT 1000`)).rows;
}
export async function getTransfer(c: pg.PoolClient, id: string) {
  const t = (await c.query(`SELECT * FROM perfume.stock_transfers WHERE id = $1`, [id])).rows[0];
  if (!t) throw new InvNotFound();
  const lines = (await c.query(
    `SELECT l.id, l.item_id, i.display_name, l.qty, coalesce((SELECT s.qty FROM perfume.item_stock s WHERE s.item_id = l.item_id AND s.location_code = $2), 0)::int AS on_hand_from
       FROM perfume.stock_transfer_lines l JOIN perfume.items i ON i.id = l.item_id WHERE l.transfer_id = $1 AND l.archived_at IS NULL ORDER BY l.created_at`, [id, t.from_code])).rows;
  const moves = (await c.query(
    `SELECT m.kind, m.location_code, m.qty, m.unit_cost_cents::float8 AS unit_cost_cents, m.moved_at, i.display_name
       FROM perfume.stock_moves m JOIN perfume.items i ON i.id = m.item_id WHERE m.transfer_id = $1 ORDER BY m.moved_at, m.id`, [id])).rows;
  return { ...t, lines, moves };
}

/* ------------------------------------------------------------------ counts (and every adjustment) */

/**
 * Physical count cycle (migration 202617110100 — CONTROL's Physical Inventory Process, owner 2026-11-27 13:50 CT).
 * Start: pick the site and which items go on the sheet (all stocked items, or by category / brand / product type / family; with or
 * without the items at 0 on hand). The sheet is BLIND — every line starts not counted.
 * Count: typing a line stamps who counted and when, and takes the on-hand at that moment as expected (the line's cut-off).
 * Variance = counted − expected. Submit values the variance; over $500 a second person posts. Post moves stock by each line's variance
 * against today's stock, so a sale between counting and posting is never counted twice. Lines never counted move nothing.
 */
export const countSelectionSchema = z.object({
  all_items: z.boolean().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  product_type: z.string().trim().max(60).nullable().optional(),
  family_id: z.string().uuid().nullable().optional(),
  include_zero: z.boolean().optional(),
});
export async function createCount(c: pg.PoolClient, uid: string, loc: string, opts: z.infer<typeof countSelectionSchema> & { notes?: string | null } = {}) {
  await assertSite(c, loc);
  const sel = { category: opts.category || null, brand: opts.brand || null, product_type: opts.product_type || null, family_id: opts.family_id || null,
    include_zero: Boolean(opts.include_zero), all_items: Boolean(opts.all_items) };
  const h = (await c.query<{ id: string; number: string }>(
    `INSERT INTO perfume.stock_counts (location_code, notes, created_by, selection) VALUES ($1,$2,$3,$4::jsonb) RETURNING id, number`,
    [loc, opts.notes ?? null, uid, JSON.stringify(sel)])).rows[0]!;
  if (sel.all_items || sel.category || sel.brand || sel.product_type || sel.family_id) {
    await c.query(
      `INSERT INTO perfume.stock_count_lines (count_id, item_id, expected_qty, counted_qty, unit_cost_cents)
       SELECT $1, s.item_id, s.qty, NULL, s.avg_cost_cents
         FROM perfume.item_stock s JOIN perfume.items i ON i.id = s.item_id AND i.merged_into_id IS NULL
        WHERE s.location_code = $2 AND (s.qty > 0 OR $7::boolean)
          AND ($3::text IS NULL OR lower(btrim(i.category)) = lower(btrim($3)))
          AND ($4::text IS NULL OR lower(btrim(i.brand)) = lower(btrim($4)))
          AND ($5::text IS NULL OR lower(btrim(i.product_type)) = lower(btrim($5)))
          AND ($6::uuid IS NULL OR i.family_id = $6::uuid)`,
      [h.id, loc, sel.category, sel.brand, sel.product_type, sel.family_id, sel.include_zero]);
  }
  return h;
}
async function countHead(c: pg.PoolClient, id: string) {
  const h = (await c.query(`SELECT * FROM perfume.stock_counts WHERE id = $1 FOR UPDATE`, [id])).rows[0];
  if (!h) throw new InvNotFound();
  return h as { id: string; location_code: string; status: string; submitted_by: string | null; diff_value_cents: string | null };
}
/** Type what is on the shelf for an item (adds the line when it is not on the sheet). The on-hand right now is the line's cut-off. */
export async function setCountLine(c: pg.PoolClient, countId: string, itemId: string, counted: number, uid: string | null = null) {
  const h = await countHead(c, countId);
  if (h.status !== "draft") throw new InvInvalid("Only a draft count is typed into.");
  if (!Number.isInteger(counted) || counted < 0) throw new InvInvalid("Counted must be a whole number, 0 or more.");
  const s = (await c.query<{ qty: number; avg: string }>(`SELECT qty, avg_cost_cents::text AS avg FROM perfume.item_stock WHERE item_id = $1 AND location_code = $2`, [itemId, h.location_code])).rows[0];
  await c.query(
    `INSERT INTO perfume.stock_count_lines (count_id, item_id, expected_qty, counted_qty, unit_cost_cents, counted_at, counted_by) VALUES ($1,$2,$3,$4,$5, now(), $6)
     ON CONFLICT (count_id, item_id) DO UPDATE SET counted_qty = EXCLUDED.counted_qty, expected_qty = EXCLUDED.expected_qty,
       unit_cost_cents = EXCLUDED.unit_cost_cents, counted_at = now(), counted_by = EXCLUDED.counted_by, updated_at = now()`,
    [countId, itemId, s?.qty ?? 0, counted, s?.avg ?? 0, uid]);
}
/** Submit: the variance (counted − on hand when counted) of every counted line, valued at the line's cost. Over $500 the poster must be someone else. */
export async function submitCount(c: pg.PoolClient, uid: string, countId: string) {
  const h = await countHead(c, countId);
  if (h.status !== "draft") throw new InvInvalid("This count was already submitted.");
  const v = (await c.query<{ diff: string; counted: number; lines: number }>(
    `SELECT coalesce(sum((l.counted_qty - l.expected_qty) * l.unit_cost_cents) FILTER (WHERE l.counted_at IS NOT NULL), 0)::text AS diff,
            count(*) FILTER (WHERE l.counted_at IS NOT NULL)::int AS counted, count(*)::int AS lines
       FROM perfume.stock_count_lines l WHERE l.count_id = $1`, [countId])).rows[0]!;
  if (!v.counted) throw new InvInvalid("Nothing has been counted on this sheet yet.");
  await c.query(`UPDATE perfume.stock_counts SET status = 'submitted', diff_value_cents = $2, submitted_by = $3, submitted_at = now(), updated_at = now() WHERE id = $1`,
    [countId, Number(v.diff).toFixed(2), uid]);
  return { diff_value_cents: Number(v.diff), needs_second_person: Math.abs(Number(v.diff)) > ADJUST_SECOND_PERSON_CENTS, counted: v.counted, not_counted: v.lines - v.counted };
}
/** Post: each counted line's variance against today's stock — a gain comes in at the moving average, a loss leaves FIFO. */
export async function postCount(c: pg.PoolClient, uid: string, countId: string) {
  const h = await countHead(c, countId);
  if (h.status !== "submitted") throw new InvInvalid("Submit the count first.");
  if (Math.abs(Number(h.diff_value_cents ?? 0)) > ADJUST_SECOND_PERSON_CENTS && h.submitted_by === uid) {
    throw new InvInvalid("This count moves more than $500 — a second person posts it.");
  }
  const lines = (await c.query<{ item_id: string; counted_qty: number; expected_qty: number; unit_cost_cents: string }>(
    `SELECT item_id, counted_qty, expected_qty, unit_cost_cents::text FROM perfume.stock_count_lines WHERE count_id = $1 AND counted_at IS NOT NULL`, [countId])).rows;
  let moved = 0;
  for (const l of lines) {
    const diff = l.counted_qty - l.expected_qty;
    if (diff > 0) {
      const s = await stockRow(c, l.item_id, h.location_code);
      const cost = s.qty > 0 ? Number(s.avg) : Number(l.unit_cost_cents);
      await stockIn(c, uid, { kind: "count", item_id: l.item_id, location_code: h.location_code, qty: diff, unit_cost_cents: cost, source: "count", count_id: countId, reason: "count gain" });
      moved++;
    } else if (diff < 0) {
      await stockOut(c, uid, { kind: "count", item_id: l.item_id, location_code: h.location_code, qty: -diff, count_id: countId, reason: "count loss" });
      moved++;
    }
  }
  await c.query(`UPDATE perfume.stock_counts SET status = 'posted', approved_by = $2, approved_at = now(), updated_at = now() WHERE id = $1`, [countId, uid]);
  return { lines_moved: moved };
}
export async function cancelCount(c: pg.PoolClient, countId: string) {
  const h = await countHead(c, countId);
  if (h.status === "posted") throw new InvInvalid("A posted count is final; count again to correct it.");
  await c.query(`UPDATE perfume.stock_counts SET status = 'cancelled', updated_at = now() WHERE id = $1`, [countId]);
}
export async function listCounts(c: pg.PoolClient) {
  return (await c.query(
    `SELECT k.id, k.number, k.location_code, k.status, k.diff_value_cents::float8 AS diff_value_cents, k.created_at, k.submitted_at, k.approved_at,
            su.email AS submitted_by_email, ap.email AS approved_by_email,
            (SELECT count(*)::int FROM perfume.stock_count_lines l WHERE l.count_id = k.id) AS lines
       FROM perfume.stock_counts k LEFT JOIN identity.users su ON su.id = k.submitted_by LEFT JOIN identity.users ap ON ap.id = k.approved_by
      ORDER BY k.created_at DESC LIMIT 1000`)).rows;
}
export async function getCount(c: pg.PoolClient, id: string) {
  const h = (await c.query(`SELECT * FROM perfume.stock_counts WHERE id = $1`, [id])).rows[0];
  if (!h) throw new InvNotFound();
  const lines = (await c.query(
    `SELECT l.id, l.item_id, i.display_name, i.internal_code AS tio_code, i.brand,
            (SELECT u.upc FROM perfume.item_upcs u WHERE u.item_id = l.item_id ORDER BY u.upc LIMIT 1) AS upc,
            s.bin, l.expected_qty, l.counted_qty, l.counted_at, cu.email AS counted_by_email, coalesce(s.qty, 0)::int AS on_hand_now,
            l.unit_cost_cents::float8 AS unit_cost_cents,
            CASE WHEN l.counted_at IS NULL THEN NULL ELSE l.counted_qty - l.expected_qty END AS variance
       FROM perfume.stock_count_lines l JOIN perfume.items i ON i.id = l.item_id
       LEFT JOIN perfume.item_stock s ON s.item_id = l.item_id AND s.location_code = $2 LEFT JOIN identity.users cu ON cu.id = l.counted_by
      WHERE l.count_id = $1 ORDER BY s.bin NULLS LAST, lower(i.brand), i.display_name`, [id, h.location_code])).rows;
  let gain = 0, loss = 0, counted = 0;
  for (const l of lines) {
    if (l.variance == null) continue;
    counted++;
    const v = Number(l.variance) * Number(l.unit_cost_cents);
    if (v > 0) gain += v; else loss += v;
  }
  return { ...h, diff_value_cents: h.diff_value_cents == null ? null : Number(h.diff_value_cents), lines,
    totals: { lines: lines.length, counted, not_counted: lines.length - counted, gain_cents: Math.round(gain), loss_cents: Math.round(loss), net_cents: Math.round(gain + loss) },
    needs_second_person: Math.abs(Number(h.diff_value_cents ?? 0)) > ADJUST_SECOND_PERSON_CENTS };
}

/** The blind count sheet (CONTROL "Print Count Sheets"): the lines by bin with TIO code and UPC and an empty box to write the
 *  shelf count. Blind on purpose — the expected (on-hand) quantity is never printed, so the counter writes what is on the shelf. */
export async function countSheetBody(c: pg.PoolClient, id: string): Promise<{ title: string; body: string }> {
  const x = await getCount(c, id);
  const rows = x.lines.map((l: { bin: string | null; tio_code: string | null; upc: string | null; display_name: string }, i: number) =>
    `<tr><td>${i + 1}</td><td>${escapeHtml(l.bin ?? "")}</td><td>${escapeHtml(l.tio_code ?? "")}</td><td>${escapeHtml(l.upc ?? "")}</td><td>${escapeHtml(l.display_name)}</td><td style="width:90px"></td></tr>`).join("");
  const title = `Count sheet ${x.number}`;
  const body = `<h1>TIO Perfumes · ${escapeHtml(title)}</h1>
<p>Site ${escapeHtml(String(x.location_code))} · started ${escapeHtml(formatDate(x.created_at))} · ${x.lines.length} lines</p>
<p>Counted by: ______________________________ &nbsp; Date: ______________ &nbsp; Checked by: ______________________________</p>
<table><thead><tr><th>#</th><th>Bin</th><th>TIO code</th><th>UPC</th><th>Item</th><th>Counted</th></tr></thead><tbody>${rows}</tbody></table>`;
  return { title, body };
}

/* ------------------------------------------------------------------ write-offs (damaged / expired / stolen / counterfeit) */

export const WRITEOFF_REASONS = ["damaged", "expired", "stolen", "counterfeit", "sample", "other"] as const;
export const writeoffSchema = z.object({ location_code: z.string().min(1).max(40), reason: z.enum(WRITEOFF_REASONS), notes: z.string().trim().max(2000).nullable().optional() });
export async function createWriteoff(c: pg.PoolClient, uid: string, x: z.infer<typeof writeoffSchema>) {
  await assertSite(c, x.location_code);
  if (x.reason === "other" && !x.notes?.trim()) throw new InvInvalid("Say what happened when the reason is Other.");
  return (await c.query<{ id: string; number: string }>(
    `INSERT INTO perfume.stock_writeoffs (location_code, reason, notes, created_by) VALUES ($1, $2, $3, $4) RETURNING id, number`,
    [x.location_code, x.reason, x.notes ?? null, uid])).rows[0]!;
}
async function writeoffHead(c: pg.PoolClient, id: string) {
  const h = (await c.query<{ id: string; status: string; location_code: string; submitted_by: string | null; value_cents: string | null; reason: string }>(
    `SELECT id, status, location_code, submitted_by, value_cents::text, reason FROM perfume.stock_writeoffs WHERE id = $1 FOR UPDATE`, [id])).rows[0];
  if (!h) throw new InvNotFound();
  return h;
}
export async function addWriteoffLine(c: pg.PoolClient, id: string, itemId: string, qty: number, lotId: string | null = null) {
  const h = await writeoffHead(c, id);
  if (h.status !== "draft") throw new InvInvalid("Only a draft write-off takes lines.");
  if (!Number.isInteger(qty) || qty <= 0) throw new InvInvalid("Quantity must be a whole number above 0.");
  if (lotId && !(await c.query(`SELECT 1 FROM perfume.inventory_lots WHERE id = $1 AND item_id = $2 AND location_code = $3`, [lotId, itemId, h.location_code])).rowCount) {
    throw new InvInvalid("That lot is not this item at this site.");
  }
  return (await c.query(`INSERT INTO perfume.stock_writeoff_lines (writeoff_id, item_id, qty, lot_id) VALUES ($1, $2, $3, $4) RETURNING id`, [id, itemId, qty, lotId])).rows[0];
}
export async function removeWriteoffLine(c: pg.PoolClient, lineId: string) {
  const l = (await c.query<{ writeoff_id: string }>(`SELECT writeoff_id FROM perfume.stock_writeoff_lines WHERE id = $1 AND archived_at IS NULL`, [lineId])).rows[0];
  if (!l) throw new InvNotFound();
  if ((await writeoffHead(c, l.writeoff_id)).status !== "draft") throw new InvInvalid("Only a draft write-off changes.");
  await c.query(`UPDATE perfume.stock_writeoff_lines SET archived_at = now() WHERE id = $1`, [lineId]);
}
/** The value that leaves: the FIFO cost of the lots each line will take (the named lot, else oldest first). */
async function writeoffValue(c: pg.PoolClient, id: string, loc: string) {
  const lines = (await c.query<{ item_id: string; qty: number; lot_id: string | null }>(
    `SELECT item_id, qty, lot_id FROM perfume.stock_writeoff_lines WHERE writeoff_id = $1 AND archived_at IS NULL`, [id])).rows;
  let total = 0;
  for (const l of lines) {
    const lots = (await c.query<{ qty_left: number; unit_cost_cents: string }>(
      `SELECT qty_left, unit_cost_cents::text FROM perfume.inventory_lots WHERE item_id = $1 AND location_code = $2 AND qty_left > 0 ${l.lot_id ? "AND id = $3" : ""}
        ORDER BY received_on, created_at, id`, l.lot_id ? [l.item_id, loc, l.lot_id] : [l.item_id, loc])).rows;
    let need = l.qty;
    for (const lt of lots) { if (need === 0) break; const t = Math.min(need, lt.qty_left); total += t * Number(lt.unit_cost_cents); need -= t; }
    if (need > 0) throw new InvInvalid("A line asks for more pieces than the site holds.");
  }
  return { lines: lines.length, value: Math.round(total * 100) / 100 };
}
export async function submitWriteoff(c: pg.PoolClient, uid: string, id: string) {
  const h = await writeoffHead(c, id);
  if (h.status !== "draft") throw new InvInvalid("This write-off was already submitted.");
  const v = await writeoffValue(c, id, h.location_code);
  if (v.lines === 0) throw new InvInvalid("Add the pieces first.");
  await c.query(`UPDATE perfume.stock_writeoffs SET status = 'submitted', value_cents = $2, submitted_by = $3, submitted_at = now(), updated_at = now() WHERE id = $1`,
    [id, v.value.toFixed(2), uid]);
  return { value_cents: v.value, needs_second_person: v.value > ADJUST_SECOND_PERSON_CENTS };
}
/** Post: each line leaves FIFO (or from its lot) as a write_down move carrying this write-off. Over $500 a second person posts. */
export async function postWriteoff(c: pg.PoolClient, uid: string, id: string) {
  const h = await writeoffHead(c, id);
  if (h.status !== "submitted") throw new InvInvalid("Submit the write-off first.");
  if (Number(h.value_cents ?? 0) > ADJUST_SECOND_PERSON_CENTS && h.submitted_by === uid) throw new InvInvalid("This write-off is more than $500 — a second person posts it.");
  const lines = (await c.query<{ item_id: string; qty: number; lot_id: string | null }>(
    `SELECT item_id, qty, lot_id FROM perfume.stock_writeoff_lines WHERE writeoff_id = $1 AND archived_at IS NULL`, [id])).rows;
  let cost = 0;
  for (const l of lines) {
    const slices = await stockOut(c, uid, { kind: "write_down", item_id: l.item_id, location_code: h.location_code, qty: l.qty, lot_ids: l.lot_id ? [l.lot_id] : undefined,
      writeoff_id: id, reason: h.reason });
    cost += slices.reduce((t, x) => t + x.qty * x.unit_cost_cents, 0);
  }
  await c.query(`UPDATE perfume.stock_writeoffs SET status = 'posted', value_cents = $3, approved_by = $2, approved_at = now(), updated_at = now() WHERE id = $1`,
    [id, uid, (Math.round(cost * 100) / 100).toFixed(2)]);
  return { cost_cents: Math.round(cost * 100) / 100 };
}
export async function cancelWriteoff(c: pg.PoolClient, id: string) {
  const h = await writeoffHead(c, id);
  if (h.status === "posted") throw new InvInvalid("A posted write-off is final.");
  await c.query(`UPDATE perfume.stock_writeoffs SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id]);
}
export async function listWriteoffs(c: pg.PoolClient) {
  return (await c.query(
    `SELECT w.id, w.number, w.location_code, w.reason, w.notes, w.status, w.value_cents::float8 AS value_cents, w.created_at, w.submitted_at, w.approved_at,
            su.email AS submitted_by_email, ap.email AS approved_by_email,
            (SELECT count(*)::int FROM perfume.stock_writeoff_lines l WHERE l.writeoff_id = w.id AND l.archived_at IS NULL) AS lines,
            (SELECT coalesce(sum(l.qty), 0)::int FROM perfume.stock_writeoff_lines l WHERE l.writeoff_id = w.id AND l.archived_at IS NULL) AS units
       FROM perfume.stock_writeoffs w LEFT JOIN identity.users su ON su.id = w.submitted_by LEFT JOIN identity.users ap ON ap.id = w.approved_by
      ORDER BY w.created_at DESC LIMIT 1000`)).rows;
}
export async function getWriteoff(c: pg.PoolClient, id: string) {
  const h = (await c.query(`SELECT *, value_cents::float8 AS value_cents FROM perfume.stock_writeoffs WHERE id = $1`, [id])).rows[0];
  if (!h) throw new InvNotFound();
  const lines = (await c.query(
    `SELECT l.id, l.item_id, i.display_name, l.qty, l.lot_id, lt.lot_code, coalesce(s.qty, 0)::int AS on_hand
       FROM perfume.stock_writeoff_lines l JOIN perfume.items i ON i.id = l.item_id LEFT JOIN perfume.inventory_lots lt ON lt.id = l.lot_id
       LEFT JOIN perfume.item_stock s ON s.item_id = l.item_id AND s.location_code = $2
      WHERE l.writeoff_id = $1 AND l.archived_at IS NULL ORDER BY i.display_name`, [id, h.location_code])).rows;
  const moves = (await c.query(`SELECT id, item_id, qty, unit_cost_cents::float8 AS unit_cost_cents, lot_id, moved_at FROM perfume.stock_moves WHERE writeoff_id = $1 ORDER BY moved_at`, [id])).rows;
  return { ...h, lines, moves, needs_second_person: Number(h.value_cents ?? 0) > ADJUST_SECOND_PERSON_CENTS };
}

/* ------------------------------------------------------------------ month-end valuation */

/** Stock value at the close of a day, per site and item, both ways: FIFO (the lot cost each move carried, summed — what the
 *  lots still held) and moving average (the last move's qty × average). Read-only, from the ledger alone. */
export async function valuation(c: pg.PoolClient, asOf: string, loc?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new InvInvalid("Pick the date (YYYY-MM-DD).");
  const args: unknown[] = [asOf];
  const where = loc ? (args.push(loc), `AND m.location_code = $2`) : "";
  const rows = (await c.query<{ location_code: string; item_id: string; display_name: string; qty: number; fifo_cents: string; avg_cents: string }>(
    `WITH upto AS (
       SELECT m.* FROM perfume.stock_moves m WHERE m.moved_at < ($1::date + 1)::timestamp AT TIME ZONE 'America/Chicago' ${where}),
     last AS (
       SELECT DISTINCT ON (location_code, item_id) location_code, item_id, qty_after, avg_cost_after_cents
         FROM upto ORDER BY location_code, item_id, moved_at DESC, id DESC)
     SELECT u.location_code, u.item_id, i.display_name, sum(u.qty)::int AS qty, sum(u.qty * u.unit_cost_cents)::text AS fifo_cents,
            (max(l.qty_after) * max(l.avg_cost_after_cents))::text AS avg_cents
       FROM upto u JOIN last l ON l.location_code = u.location_code AND l.item_id = u.item_id JOIN perfume.items i ON i.id = u.item_id
      GROUP BY u.location_code, u.item_id, i.display_name HAVING sum(u.qty) <> 0
      ORDER BY u.location_code, i.display_name`, args)).rows;
  const out = rows.map((r) => ({ ...r, fifo_cents: Math.round(Number(r.fifo_cents) * 100) / 100, avg_cents: Math.round(Number(r.avg_cents) * 100) / 100 }));
  const bySite = new Map<string, { location_code: string; units: number; fifo_cents: number; avg_cents: number }>();
  for (const r of out) {
    const s = bySite.get(r.location_code) ?? { location_code: r.location_code, units: 0, fifo_cents: 0, avg_cents: 0 };
    s.units += r.qty; s.fifo_cents += r.fifo_cents; s.avg_cents += r.avg_cents; bySite.set(r.location_code, s);
  }
  const sites = [...bySite.values()].map((s) => ({ ...s, fifo_cents: Math.round(s.fifo_cents * 100) / 100, avg_cents: Math.round(s.avg_cents * 100) / 100 }));
  return { as_of: asOf, rows: out, sites, total_fifo_cents: Math.round(sites.reduce((t, s) => t + s.fifo_cents, 0) * 100) / 100,
    total_avg_cents: Math.round(sites.reduce((t, s) => t + s.avg_cents, 0) * 100) / 100 };
}

/* ------------------------------------------------------------------ opening stock from the owner's inventory file */

/** What the owner's current inventory list would bring in: quantity per site from its location columns, at the list's cost.
 *  Read-only; the owner presses Apply (opening figures are his, never entered by the desk on its own). */
export async function openingPreview(c: pg.PoolClient) {
  const rows = (await c.query<{ list_id: string; file_name: string; list_date: string; item_id: string; display_name: string; loc: string; qty: number; cost: number | null }>(
    `SELECT l.id AS list_id, l.file_name, l.list_date::text, r.item_id, i.display_name, k.key AS loc, (k.value)::int AS qty, r.price_cents AS cost
       FROM perfume.price_lists l JOIN perfume.vendors v ON v.id = l.vendor_id
       JOIN perfume.price_list_rows r ON r.list_id = l.id JOIN perfume.items i ON i.id = r.item_id AND i.merged_into_id IS NULL
       CROSS JOIN LATERAL jsonb_each_text(coalesce(r.qty_by_location, '{}'::jsonb)) k
      WHERE v.kind = 'inventory' AND l.is_current AND l.voided_at IS NULL AND r.item_id IS NOT NULL AND k.value ~ '^[0-9]+$' AND (k.value)::int > 0`)).rows;
  const sites = new Set((await c.query<{ code: string }>(`SELECT code FROM perfume.locations WHERE own AND active AND coalesce(kind, '') <> 'transit'`)).rows.map((r) => r.code));
  const already = (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM perfume.stock_moves WHERE kind = 'opening'`)).rows[0]!.n;
  const usable = rows.filter((r) => sites.has(r.loc) && r.cost != null && r.cost > 0);
  const bySite = new Map<string, { units: number; value: number; lines: number }>();
  for (const r of usable) { const b = bySite.get(r.loc) ?? { units: 0, value: 0, lines: 0 }; b.units += r.qty; b.value += r.qty * r.cost!; b.lines++; bySite.set(r.loc, b); }
  return {
    lists: [...new Set(rows.map((r) => `${r.file_name} (${r.list_date})`))],
    lines: usable.length, units: usable.reduce((t, r) => t + r.qty, 0), value_cents: usable.reduce((t, r) => t + r.qty * r.cost!, 0),
    skipped_no_cost: rows.filter((r) => sites.has(r.loc) && !(r.cost != null && r.cost > 0)).length,
    skipped_unknown_site: rows.filter((r) => !sites.has(r.loc)).length,
    by_site: [...bySite].map(([code, b]) => ({ code, ...b })).sort((a, b) => a.code.localeCompare(b.code)),
    already_applied: already > 0,
  };
}
export async function openingApply(c: pg.PoolClient, uid: string, onDate: string) {
  // Opening stock is the first entry of the ledger: refused once anything has moved.
  if ((await c.query(`SELECT 1 FROM perfume.stock_moves LIMIT 1`)).rowCount) throw new InvInvalid("Stock has already moved — opening stock comes in only on an empty ledger.");
  // One set-based write (about 30,000 lines in the live file): lots, then their moves with the running qty and moving average
  // per item and site, then on hand. Same rules as stockIn, in one statement each.
  const src = `SELECT r.item_id, k.key AS loc, (k.value)::int AS qty, r.price_cents::numeric AS cost
       FROM perfume.price_lists l JOIN perfume.vendors v ON v.id = l.vendor_id
       JOIN perfume.price_list_rows r ON r.list_id = l.id JOIN perfume.items i ON i.id = r.item_id AND i.merged_into_id IS NULL
       CROSS JOIN LATERAL jsonb_each_text(coalesce(r.qty_by_location, '{}'::jsonb)) k
       JOIN perfume.locations lc ON lc.code = k.key AND lc.own AND lc.active AND coalesce(lc.kind, '') <> 'transit'
      WHERE v.kind = 'inventory' AND l.is_current AND l.voided_at IS NULL AND k.value ~ '^[0-9]+$' AND (k.value)::int > 0 AND r.price_cents > 0`;
  await c.query(
    `INSERT INTO perfume.inventory_lots (item_id, location_code, lot_code, source, received_on, qty_in, qty_left, unit_cost_cents, created_by)
     SELECT item_id, loc, 'OPENING', 'opening', $1::date, qty, qty, cost, $2 FROM (${src}) s`, [onDate, uid]);
  await c.query(
    `INSERT INTO perfume.stock_moves (kind, item_id, location_code, qty, unit_cost_cents, lot_id, qty_after, avg_cost_after_cents, reason, created_by)
     SELECT 'opening', item_id, location_code, qty_in, unit_cost_cents, id,
            sum(qty_in) OVER w, sum(qty_in * unit_cost_cents) OVER w / sum(qty_in) OVER w, 'opening stock from my inventory file', $1
       FROM perfume.inventory_lots WHERE source = 'opening'
     WINDOW w AS (PARTITION BY item_id, location_code ORDER BY id ROWS UNBOUNDED PRECEDING)`, [uid]);
  await c.query(
    `INSERT INTO perfume.item_stock (item_id, location_code, qty, avg_cost_cents)
     SELECT item_id, location_code, sum(qty_in), sum(qty_in * unit_cost_cents) / sum(qty_in) FROM perfume.inventory_lots WHERE source = 'opening' GROUP BY 1, 2
     ON CONFLICT (item_id, location_code) DO UPDATE SET qty = EXCLUDED.qty, avg_cost_cents = EXCLUDED.avg_cost_cents, updated_at = now()`);
  const t = (await c.query<{ lines: number; units: number; value: string }>(
    `SELECT count(*)::int AS lines, coalesce(sum(qty_in), 0)::int AS units, coalesce(sum(qty_in * unit_cost_cents), 0)::text AS value FROM perfume.inventory_lots WHERE source = 'opening'`)).rows[0]!;
  return { lines: t.lines, units: t.units, value_cents: Number(t.value) };
}
