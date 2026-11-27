/**
 * PERFUME item families (migration 202617030100) — owner 2026-11-27 08:10 CT "We must also have locations, families … all must be fully
 * wired linked". A family is one fragrance line: the parent over its sizes, testers, sets and minis (NetSuite matrix parent). Only the
 * items are sold, stocked and costed; the family adds them up — items, units on hand, stock value at average cost, best supplier cost.
 * Linked both ways: an item names its family (perfume.items.family_id, edited from the item, the creator or the bulk bar) and the
 * family lists its items. Every change is written to perfume.item_family_events and, for an item joining / leaving, to the item's
 * own history. Never deleted: archived, and only once no item belongs to it.
 */
import type pg from "pg";
import { z } from "zod";

export class FamilyInvalid extends Error {}
export class FamilyNotFound extends Error {}

export const familySchema = z.object({
  name: z.string().trim().min(1).max(160),
  brand: z.string().trim().max(80).nullable().optional(),
  olfactory_family: z.string().trim().max(60).nullable().optional(),
  gender: z.enum(["M", "W", "U", ""]).nullable().optional(),
  launch_year: z.number().int().min(1900).max(2100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const familyListQuery = z.object({ q: z.string().trim().max(200).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) });

const blank = (v: string | null | undefined) => (v == null ? null : v.trim() || null);

async function familyEvent(c: pg.PoolClient, familyId: string, uid: string | null, kind: string, detail: Record<string, unknown> = {}) {
  await c.query(`INSERT INTO perfume.item_family_events (family_id, kind, detail, created_by) VALUES ($1, $2, $3::jsonb, $4)`, [familyId, kind, JSON.stringify(detail), uid]);
}

async function liveFamily(c: pg.PoolClient, id: string) {
  const r = (await c.query<{ id: string; name: string; brand: string | null; olfactory_family: string | null; gender: string | null; launch_year: number | null; notes: string | null }>(
    `SELECT id, name, brand, olfactory_family, gender, launch_year, notes FROM perfume.item_families WHERE id = $1 AND archived_at IS NULL FOR UPDATE`, [id])).rows[0];
  if (!r) throw new FamilyNotFound();
  return r;
}

async function clash(c: pg.PoolClient, name: string, brand: string | null, notId: string | null) {
  const r = (await c.query<{ name: string }>(
    `SELECT name FROM perfume.item_families WHERE archived_at IS NULL AND lower(btrim(coalesce(brand, ''))) = lower(btrim(coalesce($2, ''))) AND lower(btrim(name)) = lower(btrim($1))
        AND ($3::uuid IS NULL OR id <> $3::uuid) LIMIT 1`, [name, brand, notId])).rows[0];
  if (r) throw new FamilyInvalid(`The family "${[brand, name].filter(Boolean).join(" ")}" already exists — open it instead.`);
}

export async function createFamily(c: pg.PoolClient, uid: string, x: z.infer<typeof familySchema>) {
  const v = { name: x.name.trim(), brand: blank(x.brand), olfactory_family: blank(x.olfactory_family), gender: blank(x.gender ?? null), launch_year: x.launch_year ?? null, notes: blank(x.notes) };
  await clash(c, v.name, v.brand, null);
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.item_families (name, brand, olfactory_family, gender, launch_year, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [v.name, v.brand, v.olfactory_family, v.gender, v.launch_year, v.notes, uid]);
  await familyEvent(c, r.rows[0]!.id, uid, "created", v);
  return { id: r.rows[0]!.id };
}

export async function updateFamily(c: pg.PoolClient, uid: string, id: string, x: Partial<z.infer<typeof familySchema>>) {
  const b = await liveFamily(c, id);
  const want = {
    name: x.name !== undefined ? x.name.trim() : b.name, brand: x.brand !== undefined ? blank(x.brand) : b.brand,
    olfactory_family: x.olfactory_family !== undefined ? blank(x.olfactory_family) : b.olfactory_family,
    gender: x.gender !== undefined ? blank(x.gender) : b.gender, launch_year: x.launch_year !== undefined ? x.launch_year : b.launch_year,
    notes: x.notes !== undefined ? blank(x.notes) : b.notes,
  };
  const from: Record<string, unknown> = {}, to: Record<string, unknown> = {};
  for (const k of Object.keys(want) as Array<keyof typeof want>) if ((b[k] ?? null) !== (want[k] ?? null)) { from[k] = b[k]; to[k] = want[k]; }
  if (!Object.keys(to).length) return { ok: true, changed: 0 };
  if (to.name !== undefined || to.brand !== undefined) await clash(c, want.name, want.brand, id);
  await c.query(`UPDATE perfume.item_families SET name = $2, brand = $3, olfactory_family = $4, gender = $5, launch_year = $6, notes = $7, updated_at = now() WHERE id = $1`,
    [id, want.name, want.brand, want.olfactory_family, want.gender, want.launch_year, want.notes]);
  await familyEvent(c, id, uid, "edited", { from, to });
  return { ok: true, changed: Object.keys(to).length };
}

export async function archiveFamily(c: pg.PoolClient, uid: string, id: string) {
  await liveFamily(c, id);
  const n = (await c.query<{ n: number }>(`SELECT count(*)::int n FROM perfume.items WHERE family_id = $1 AND merged_into_id IS NULL`, [id])).rows[0]!.n;
  if (n) throw new FamilyInvalid(`${n} item(s) still belong to this family — move them out first.`);
  await c.query(`UPDATE perfume.item_families SET archived_at = now(), updated_at = now() WHERE id = $1`, [id]);
  await familyEvent(c, id, uid, "archived");
  return { ok: true };
}

/** An item joins a family (or leaves it with null). Both histories say so. Called by the item editor / creator / bulk bar. */
export async function setItemFamily(c: pg.PoolClient, uid: string, itemId: string, familyId: string | null, itemName: string) {
  const cur = (await c.query<{ family_id: string | null }>(`SELECT family_id FROM perfume.items WHERE id = $1`, [itemId])).rows[0];
  if ((cur?.family_id ?? null) === familyId) return false;
  if (familyId) await liveFamily(c, familyId);
  await c.query(`UPDATE perfume.items SET family_id = $2, updated_at = now() WHERE id = $1`, [itemId, familyId]);
  await c.query(`INSERT INTO perfume.item_events (item_id, kind, detail, created_by) VALUES ($1, 'family', $2::jsonb, $3)`,
    [itemId, JSON.stringify({ from: cur?.family_id ?? null, to: familyId }), uid]);
  if (cur?.family_id) await familyEvent(c, cur.family_id, uid, "item_removed", { item_id: itemId, item: itemName });
  if (familyId) await familyEvent(c, familyId, uid, "item_added", { item_id: itemId, item: itemName });
  return true;
}

/** Every live family with its roll-up: items, units on hand, stock value (qty × average cost), best supplier cost. */
export async function listFamilies(c: pg.PoolClient, f: z.infer<typeof familyListQuery>) {
  const args: unknown[] = [];
  let where = "f.archived_at IS NULL";
  if (f.q) { args.push(`%${f.q.toLowerCase()}%`); where += ` AND (lower(f.name) LIKE $1 OR lower(coalesce(f.brand, '')) LIKE $1)`; }
  args.push(f.limit);
  const rows = (await c.query(
    `SELECT f.id, f.name, f.brand, f.olfactory_family, f.gender, f.launch_year,
            count(DISTINCT i.id)::int AS items,
            coalesce(sum(s.qty), 0)::int AS on_hand,
            coalesce(sum(s.qty::bigint * s.avg_cost_cents), 0)::bigint AS stock_value_cents
       FROM perfume.item_families f
       LEFT JOIN perfume.items i ON i.family_id = f.id AND i.merged_into_id IS NULL
       LEFT JOIN perfume.item_stock s ON s.item_id = i.id
      WHERE ${where}
      GROUP BY f.id ORDER BY lower(coalesce(f.brand, '')), lower(f.name) LIMIT $${args.length}`, args)).rows;
  return { rows: rows.map((r) => ({ ...r, stock_value_cents: Number(r.stock_value_cents) })) };
}

/** A family's page: the family, each of its items with stock / cost / UPCs, and its history. */
export async function familyProfile(c: pg.PoolClient, id: string) {
  const fam = (await c.query(`SELECT id, name, brand, olfactory_family, gender, launch_year, notes, created_at, archived_at FROM perfume.item_families WHERE id = $1`, [id])).rows[0];
  if (!fam) throw new FamilyNotFound();
  const items = (await c.query(
    `SELECT i.id, i.display_name, i.internal_code AS tio_code, i.size_ml::float8 AS size_ml, i.conc, i.product_type, i.flags,
            coalesce((SELECT sum(qty) FROM perfume.item_stock s WHERE s.item_id = i.id), 0)::int AS on_hand,
            (SELECT avg_cost_cents FROM perfume.item_costs k WHERE k.item_id = i.id) AS avg_cost_cents,
            (SELECT array_agg(u.upc ORDER BY u.upc) FROM perfume.item_upcs u WHERE u.item_id = i.id) AS upcs
       FROM perfume.items i WHERE i.family_id = $1 AND i.merged_into_id IS NULL ORDER BY i.size_ml NULLS LAST, i.display_name`, [id])).rows;
  const events = (await c.query(
    `SELECT e.id, e.kind, e.detail, e.created_at, u.email AS by_email FROM perfume.item_family_events e LEFT JOIN identity.users u ON u.id = e.created_by
      WHERE e.family_id = $1 ORDER BY e.created_at, e.id`, [id])).rows;
  return { family: fam, items: items.map((r) => ({ ...r, upcs: r.upcs ?? [] })), events };
}
