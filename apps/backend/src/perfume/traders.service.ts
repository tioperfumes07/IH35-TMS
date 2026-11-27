/**
 * PERFUME-TRADERS — vendors you also sell to (design board 3; owner 2026-11-26 16:59 CT "get this all completely done now").
 * A trade is an item a vendor offered, its buy / sell price and quantity, moving across the board: offer received → buyers
 * matched → offer sent → negotiating → closed (or lost). Each trade carries the buyers matched to it.
 *
 * The side panels read what the app already holds, nothing typed by hand:
 *  - who carries which strong brands — the brands on each vendor's current price list in the price desk;
 *  - buyers on several exposed lists — contacts copied on two or more vendors' emails (contact origins);
 *  - exposed vendor lists — whose customer list reached the owner, and how many buyers each one showed.
 */
import type pg from "pg";
import { z } from "zod";
import { logEvent } from "./leads.events.js";

export const TRADE_STAGES = ["offer_received", "buyers_matched", "offer_sent", "negotiating", "closed", "lost"] as const;
export type TradeStage = typeof TRADE_STAGES[number];

const cents = z.number().int().positive().max(1_000_000_000).nullable().optional();
export const tradeSchema = z.object({
  id: z.string().uuid().optional(),
  item: z.string().trim().min(1).max(300),
  brand: z.string().trim().max(120).nullable().optional(),
  upc: z.string().trim().regex(/^\d{8,14}$/).nullable().optional().or(z.literal("").transform(() => null)),
  from_company_id: z.string().uuid().nullable().optional(),
  buy_cents: cents,
  sell_cents: cents,
  qty: z.number().int().positive().max(10_000_000).nullable().optional(),
  stage: z.enum(TRADE_STAGES).default("offer_received"),
  note: z.string().max(4000).nullable().optional(),
});
export type TradeInput = z.infer<typeof tradeSchema>;

export const buyerSchema = z.object({ company_id: z.string().uuid(), offer_cents: cents, note: z.string().max(2000).nullable().optional() });
export const buyerPatchSchema = z.object({
  status: z.enum(["matched", "offered", "negotiating", "won", "lost"]).optional(),
  offer_cents: cents, note: z.string().max(2000).nullable().optional(), archived: z.boolean().optional(),
});

export class TradeError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

/** Contacts copied on a vendor's email: the origin rows the import wrote ("Copied by <vendor>"). */
const EXPOSED = `o.how = 'Copied on vendor email' AND o.source ILIKE 'Copied by %'`;

export async function tradersOverview(c: pg.PoolClient, opts: { brands?: string[] } = {}) {
  const k = (await c.query(
    `SELECT (SELECT count(*)::int FROM perfume.contact_companies WHERE role = 'both' AND archived_at IS NULL) AS both,
            (SELECT count(*)::int FROM perfume.contact_companies WHERE role = 'both' AND archived_at IS NULL
               AND EXISTS (SELECT 1 FROM perfume.contact_people p WHERE p.company_id = contact_companies.id AND p.email IS NOT NULL AND p.archived_at IS NULL)) AS both_with_email,
            (SELECT count(*)::int FROM perfume.contact_people WHERE sent_lists AND archived_at IS NULL) AS sent_lists,
            (SELECT count(DISTINCT o.source)::int FROM perfume.contact_origins o WHERE ${EXPOSED}) AS exposed_lists,
            (SELECT count(*)::int FROM (SELECT o.company_id FROM perfume.contact_origins o WHERE ${EXPOSED}
               GROUP BY o.company_id HAVING count(DISTINCT o.source) >= 2) x) AS common_buyers,
            (SELECT count(*)::int FROM perfume.trades WHERE archived_at IS NULL AND stage NOT IN ('closed', 'lost')) AS open_trades,
            (SELECT count(*)::int FROM perfume.trades WHERE archived_at IS NULL AND stage = 'closed') AS closed_trades`)).rows[0];

  const trades = (await c.query(
    `SELECT t.id, t.item, t.brand, t.upc, t.from_company_id, co.name AS from_company, t.buy_cents, t.sell_cents, t.qty, t.stage, t.note,
            t.closed_on, t.created_at, t.updated_at,
            coalesce((SELECT json_agg(json_build_object('id', b.id, 'company_id', b.company_id, 'company', bc.name, 'status', b.status,
                       'offer_cents', b.offer_cents, 'note', b.note) ORDER BY bc.name)
                        FROM perfume.trade_buyers b JOIN perfume.contact_companies bc ON bc.id = b.company_id
                       WHERE b.trade_id = t.id AND b.archived_at IS NULL), '[]'::json) AS buyers
       FROM perfume.trades t LEFT JOIN perfume.contact_companies co ON co.id = t.from_company_id
      WHERE t.archived_at IS NULL ORDER BY t.updated_at DESC LIMIT 500`)).rows;

  const commonBuyers = (await c.query(
    `SELECT co.id, co.name, co.role, co.city, co.country, count(DISTINCT o.source)::int AS lists,
            array_agg(DISTINCT substr(o.source, 11) ORDER BY substr(o.source, 11)) AS senders
       FROM perfume.contact_origins o JOIN perfume.contact_companies co ON co.id = o.company_id AND co.archived_at IS NULL
      WHERE ${EXPOSED}
      GROUP BY co.id HAVING count(DISTINCT o.source) >= 2 ORDER BY lists DESC, co.name LIMIT 200`)).rows;

  const exposedLists = (await c.query(
    `SELECT substr(o.source, 11) AS sender, count(DISTINCT o.company_id)::int AS buyers,
            min(o.occurred_on) AS first_on, max(o.occurred_on) AS last_on
       FROM perfume.contact_origins o WHERE ${EXPOSED}
      GROUP BY o.source ORDER BY buyers DESC, sender LIMIT 200`)).rows;

  const matrix = await brandMatrix(c, opts.brands ?? []);
  return { kpis: k, trades, common_buyers: commonBuyers, exposed_lists: exposedLists, ...matrix };
}

/**
 * Which vendors carry which brands on their CURRENT price list. Without picked brands: the 8 brands the most vendors carry.
 * Rows: every vendor with a current list carrying at least one of those brands, most brands first.
 */
export async function brandMatrix(c: pg.PoolClient, picked: string[]) {
  const pairs = (await c.query<{ vendor_id: string; vendor: string; brand: string; lines: number }>(
    `SELECT v.id AS vendor_id, v.name AS vendor, upper(btrim(i.brand)) AS brand, count(*)::int AS lines
       FROM perfume.price_list_rows r
       JOIN perfume.price_lists l ON l.id = r.list_id AND l.voided_at IS NULL AND l.is_current
       JOIN perfume.vendors v ON v.id = l.vendor_id
       JOIN perfume.items i ON i.id = r.item_id AND btrim(i.brand) <> ''
      GROUP BY 1, 2, 3`)).rows;
  const vendorsPerBrand = new Map<string, Set<string>>();
  for (const p of pairs) { const s = vendorsPerBrand.get(p.brand) ?? new Set(); s.add(p.vendor_id); vendorsPerBrand.set(p.brand, s); }
  const allBrands = [...vendorsPerBrand.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).map(([b, s]) => ({ brand: b, vendors: s.size }));
  const want = picked.length ? picked.map((b) => b.trim().toUpperCase()).filter(Boolean) : allBrands.slice(0, 8).map((b) => b.brand);
  const rows = new Map<string, { vendor_id: string; vendor: string; brands: Record<string, number>; carried: number }>();
  for (const p of pairs) {
    if (!want.includes(p.brand)) continue;
    const r = rows.get(p.vendor_id) ?? { vendor_id: p.vendor_id, vendor: p.vendor, brands: {}, carried: 0 };
    if (!r.brands[p.brand]) r.carried += 1;
    r.brands[p.brand] = (r.brands[p.brand] ?? 0) + p.lines;
    rows.set(p.vendor_id, r);
  }
  return {
    matrix_brands: want,
    matrix: [...rows.values()].sort((a, b) => b.carried - a.carried || a.vendor.localeCompare(b.vendor)),
    brand_options: allBrands.slice(0, 400),
  };
}

export async function saveTrade(c: pg.PoolClient, uid: string, t: TradeInput) {
  const vals = [t.item, t.brand || null, t.upc || null, t.from_company_id ?? null, t.buy_cents ?? null, t.sell_cents ?? null, t.qty ?? null, t.stage, t.note || null];
  if (t.id) {
    const r = await c.query(
      `UPDATE perfume.trades SET item = $2, brand = $3, upc = $4, from_company_id = $5, buy_cents = $6, sell_cents = $7, qty = $8, stage = $9, note = $10,
          closed_on = CASE WHEN $9 = 'closed' THEN coalesce(closed_on, (now() AT TIME ZONE 'America/Chicago')::date) ELSE NULL END, updated_at = now()
        WHERE id = $1 AND archived_at IS NULL`, [t.id, ...vals]);
    if (!r.rowCount) throw new TradeError("not_found", "Trade not found.");
    await logEvent(c, uid, { entity: "trade", entity_id: t.id, company_id: t.from_company_id ?? null, action: "edited",
      detail: { item: t.item, stage: t.stage, buy_cents: t.buy_cents ?? null, sell_cents: t.sell_cents ?? null, qty: t.qty ?? null } });
    return { id: t.id };
  }
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.trades (item, brand, upc, from_company_id, buy_cents, sell_cents, qty, stage, note, closed_on, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $8 = 'closed' THEN (now() AT TIME ZONE 'America/Chicago')::date END, $10) RETURNING id`, [...vals, uid]);
  await logEvent(c, uid, { entity: "trade", entity_id: r.rows[0]!.id, company_id: t.from_company_id ?? null, action: "created",
    detail: { item: t.item, stage: t.stage, buy_cents: t.buy_cents ?? null, sell_cents: t.sell_cents ?? null, qty: t.qty ?? null } });
  return { id: r.rows[0]!.id };
}

export async function setStage(c: pg.PoolClient, id: string, stage: TradeStage, uid: string | null = null) {
  const before = (await c.query<{ stage: string; from_company_id: string | null }>(`SELECT stage, from_company_id FROM perfume.trades WHERE id = $1`, [id])).rows[0];
  const r = await c.query(
    `UPDATE perfume.trades SET stage = $2, closed_on = CASE WHEN $2 = 'closed' THEN coalesce(closed_on, (now() AT TIME ZONE 'America/Chicago')::date) ELSE NULL END,
        updated_at = now() WHERE id = $1 AND archived_at IS NULL`, [id, stage]);
  if (!r.rowCount) throw new TradeError("not_found", "Trade not found.");
  if (before && before.stage !== stage) await logEvent(c, uid, { entity: "trade", entity_id: id, company_id: before.from_company_id, action: "stage", detail: { from: before.stage, to: stage } });
}

export async function archiveTrade(c: pg.PoolClient, id: string, uid: string | null = null) {
  const r = await c.query<{ from_company_id: string | null }>(`UPDATE perfume.trades SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING from_company_id`, [id]);
  if (r.rowCount) await logEvent(c, uid, { entity: "trade", entity_id: id, company_id: r.rows[0]!.from_company_id, action: "archived" });
}

export async function addBuyer(c: pg.PoolClient, uid: string, tradeId: string, b: z.infer<typeof buyerSchema>) {
  const t = (await c.query<{ stage: string }>(`SELECT stage FROM perfume.trades WHERE id = $1 AND archived_at IS NULL`, [tradeId])).rows[0];
  if (!t) throw new TradeError("not_found", "Trade not found.");
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.trade_buyers (trade_id, company_id, offer_cents, note, created_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (trade_id, company_id) WHERE archived_at IS NULL DO UPDATE SET offer_cents = coalesce(EXCLUDED.offer_cents, trade_buyers.offer_cents),
       note = coalesce(EXCLUDED.note, trade_buyers.note), updated_at = now() RETURNING id`,
    [tradeId, b.company_id, b.offer_cents ?? null, b.note || null, uid]);
  await logEvent(c, uid, { entity: "trade_buyer", entity_id: r.rows[0]!.id, company_id: b.company_id, action: "matched", detail: { trade_id: tradeId, offer_cents: b.offer_cents ?? null } });
  // The first buyer moves a new offer to "buyers matched".
  if (t.stage === "offer_received") await setStage(c, tradeId, "buyers_matched", uid);
  return { id: r.rows[0]!.id };
}

export async function updateBuyer(c: pg.PoolClient, id: string, p: z.infer<typeof buyerPatchSchema>, uid: string | null = null) {
  const r = await c.query<{ company_id: string; trade_id: string }>(
    `UPDATE perfume.trade_buyers SET status = coalesce($2, status), offer_cents = CASE WHEN $5 THEN $3 ELSE offer_cents END,
        note = CASE WHEN $6 THEN $4 ELSE note END, archived_at = CASE WHEN $7 THEN now() ELSE archived_at END, updated_at = now()
      WHERE id = $1 RETURNING company_id, trade_id`,
    [id, p.status ?? null, p.offer_cents ?? null, p.note ?? null, p.offer_cents !== undefined, p.note !== undefined, Boolean(p.archived)]);
  if (!r.rowCount) throw new TradeError("not_found", "Buyer not found.");
  await logEvent(c, uid, { entity: "trade_buyer", entity_id: id, company_id: r.rows[0]!.company_id, action: p.archived ? "taken_off" : "edited",
    detail: { trade_id: r.rows[0]!.trade_id, ...(p.status ? { status: p.status } : {}), ...(p.offer_cents !== undefined ? { offer_cents: p.offer_cents } : {}), ...(p.note !== undefined ? { note: p.note } : {}) } });
}
