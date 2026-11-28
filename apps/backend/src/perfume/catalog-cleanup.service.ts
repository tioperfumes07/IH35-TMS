/**
 * PERFUME catalog cleanup — owner 2026-11-27 17:35 CT: "SHOULDNT THE ITEM PRODUCT TYPES BE REGULAR, TESTER, SET, MINI, DUPES, SAMPLE, VIAL,
 * ETC. AND THEN THE GENDER ASSIGNED FROM THE GENDER CATALOG? AND CUSTOMER TYPES SHOULD BE CLEANER, YOU HAVE MULTIPLE THAT I BELIEVE ARE
 * OVERLAPPING OR THE SAME, JUST OTHER WORDING".
 *
 * Measured on production 2026-11-27 (perfume.items, perfume.catalog_values):
 *   * product types mixed the kind with the gender — "Woman" 6,447 items, "Man" 5,250, "Unisex" 3,819, "Tester Woman" 1,678,
 *     "Man Set" 1,251, "Woman Set" 1,235, "Tester Man" 1,060 — and every one of those items already carries the same gender in its own
 *     gender column (W / M / U), so moving the kind to "Regular" / "Tester" / "Set" loses nothing.
 *   * customer types had 28 values, several the same thing in other words; vendor types had "Brand direct" and "Brand-direct".
 *
 * CLEANUP_PLAN is the proposal, one row per value: merge it into another value (its contacts / items move, the old value is archived,
 * history on every item and on the catalog value). New values the owner named are added. Nothing runs until the owner ticks the rows
 * and presses Apply; a row whose value is already gone shows as done.
 */
import type pg from "pg";
import { z } from "zod";
import { logEvent } from "./leads.events.js";
import { CATALOG_LABELS, moveCatalogCarriers, type CatalogKind } from "./leads.service.js";

export type CleanupRow = { key: string; kind: CatalogKind; from: string; to: string; why: string };

const P = (kind: CatalogKind, to: string, why: string, ...from: string[]): CleanupRow[] =>
  from.map((f) => ({ key: `${kind}:${f}`, kind, from: f, to, why }));

export const CLEANUP_PLAN: CleanupRow[] = [
  // Item product types: the kind only; the gender stays in the gender column.
  ...P("product_type", "Regular", "A regular bottle — the gender is already on the item", "Woman", "Man", "Unisex", "Perfume"),
  ...P("product_type", "Tester", "A tester — the gender is already on the item", "Tester Man", "Tester Woman"),
  ...P("product_type", "Set", "A set — the gender is already on the item", "Man Set", "Woman Set"),
  // Customer types: one value per kind of customer.
  ...P("customer_type", "Beer depot", "Same kind of customer", "Beer"),
  ...P("customer_type", "Beauty & cosmetics supply", "Same kind of customer", "Cosmetics"),
  ...P("customer_type", "Distributor", "Same kind of customer", "Distributor / exporter", "Niche & luxury distributor"),
  ...P("customer_type", "Importer", "Same kind of customer", "Importer / wholesaler", "Perfume importer (customs record)"),
  ...P("customer_type", "Wholesale", "Same kind of customer", "Formal wholesale", "Perfume wholesale"),
  ...P("customer_type", "Liquor store", "Same kind of customer", "Wine & liquor"),
  ...P("customer_type", "Perfume retail", "Same kind of customer (a shop that sells perfume)", "Perfume / fragrance retail", "Perfume shop", "Perfume seller", "Perfume retailer/maker", "Retailer"),
  // Business types (segment): the Sección Amarilla import wrote Spanish web slugs beside the English names (measured 2026-11-27:
  // depositos-de-cerveza 265, perfumerias 69, vinos-y-licores 66, cosmeticos 65, cervezas 35, perfumes 20, puros-y-tabacos 12).
  ...P("segment", "Beer depot", "Spanish web slug of the same business type", "depositos-de-cerveza", "cervezas"),
  ...P("segment", "Beauty supply / cosmetics", "Spanish web slug of the same business type", "cosmeticos"),
  ...P("segment", "Perfume (retail/brand)", "Spanish web slug of the same business type", "perfumerias", "perfumes"),
  ...P("segment", "Liquor store", "Spanish web slug of the same business type", "vinos-y-licores"),
  ...P("segment", "Tobacco / smoke shop", "Spanish web slug of the same business type", "puros-y-tabacos"),
  // Vendor types.
  ...P("vendor_type", "Brand direct", "Same thing, other spelling", "Brand-direct", "Manufacturer / brand"),
];

/** Values the owner named that the catalogs must carry (added once, never duplicated). */
export const CLEANUP_ADD: Array<{ kind: CatalogKind; value: string }> = [
  { kind: "product_type", value: "Regular" }, { kind: "product_type", value: "Kids" }, { kind: "product_type", value: "Dupe" },
  { kind: "product_type", value: "Sample" }, { kind: "product_type", value: "Vial" }, { kind: "customer_type", value: "Perfume retail" }, { kind: "segment", value: "Beer depot" },
];

type Q = Pick<pg.PoolClient, "query">;

async function usage(c: Q, kind: CatalogKind, value: string): Promise<number> {
  const sql = kind === "product_type" ? `SELECT count(*)::int n FROM perfume.items WHERE product_type = $1 AND merged_into_id IS NULL`
    : kind === "customer_type" ? `SELECT count(*)::int n FROM perfume.contact_companies WHERE customer_type = $1 AND archived_at IS NULL`
    : kind === "segment" ? `SELECT count(*)::int n FROM perfume.contact_companies WHERE segment = $1 AND archived_at IS NULL`
    : `SELECT count(*)::int n FROM perfume.contact_companies WHERE vendor_type = $1 AND archived_at IS NULL`;
  return (await c.query<{ n: number }>(sql, [value])).rows[0]!.n;
}

/** The plan with what each row would move now (items for product types, companies for customer / vendor types). */
export async function previewCleanup(c: Q) {
  const live = new Set((await c.query<{ k: string }>(`SELECT kind || ':' || value AS k FROM perfume.catalog_values WHERE archived_at IS NULL`)).rows.map((r) => r.k));
  const rows = [];
  for (const r of CLEANUP_PLAN) {
    const n = await usage(c, r.kind, r.from);
    rows.push({ ...r, list: CATALOG_LABELS[r.kind], carriers: n, done: !live.has(`${r.kind}:${r.from}`) && n === 0 });
  }
  const adds = CLEANUP_ADD.map((a) => ({ ...a, list: CATALOG_LABELS[a.kind], exists: live.has(`${a.kind}:${a.value}`) }));
  const asOf = (await c.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Chicago')::date::text AS d`)).rows[0]!.d;
  return { rows: rows.map((r) => ({ ...r, counted_on: asOf })), adds };
}

export const applyCleanupSchema = z.object({ keys: z.array(z.string().min(3).max(300)).min(1).max(200) });

/** Applies the picked rows: the values to add first, then each merge (carriers move, the old value archived, history written). */
export async function applyCleanup(c: pg.PoolClient, uid: string, keys: string[]) {
  const picked = CLEANUP_PLAN.filter((r) => keys.includes(r.key));
  for (const a of CLEANUP_ADD) {
    await c.query(
      `INSERT INTO perfume.catalog_values (kind, value, created_by) SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values WHERE kind = $1 AND lower(btrim(value)) = lower(btrim($2)) AND archived_at IS NULL)`, [a.kind, a.value, uid]);
  }
  const done: Array<{ key: string; moved: number }> = [];
  for (const r of picked) {
    const to = (await c.query<{ id: string }>(`SELECT id FROM perfume.catalog_values WHERE kind = $1 AND lower(btrim(value)) = lower(btrim($2)) AND archived_at IS NULL`, [r.kind, r.to])).rows[0];
    if (!to) await c.query(`INSERT INTO perfume.catalog_values (kind, value, created_by) VALUES ($1, $2, $3)`, [r.kind, r.to, uid]);
    const m = await moveCatalogCarriers(c, r.kind, r.from, r.to, uid, "catalog_cleanup");
    const old = await c.query<{ id: string }>(
      `UPDATE perfume.catalog_values SET archived_at = now(), updated_at = now() WHERE kind = $1 AND value = $2 AND archived_at IS NULL RETURNING id`, [r.kind, r.from]);
    for (const o of old.rows) {
      await logEvent(c, uid, { entity: "catalog_value", entity_id: o.id, action: "merged", detail: { kind: r.kind, from: r.from, to: r.to, contacts_moved: m.moved, items_moved: m.itemsMoved } });
    }
    done.push({ key: r.key, moved: m.moved + m.itemsMoved });
  }
  return { applied: done.length, moved: done.reduce((s, d) => s + d.moved, 0), rows: done };
}

export class CatalogMergeError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

/**
 * Owner 2026-11-27 16:57 CT: "WE SHOULD NOT HAVE DUPLICATE ITEMS IN LISTS, IF SO, WE SOULD BE ABLE TO MERGE". One value merges into another
 * of the SAME list: every contact / item / family carrying it moves (history on each item and family), the merged value is archived
 * (never deleted) and the catalog history says where it went.
 */
export async function mergeCatalogValue(c: pg.PoolClient, uid: string, fromId: string, intoId: string) {
  if (fromId === intoId) throw new CatalogMergeError("same_value", "Pick a different value to merge into.");
  const rows = (await c.query<{ id: string; kind: CatalogKind; value: string }>(
    `SELECT id::text, kind, value FROM perfume.catalog_values WHERE id = ANY($1::uuid[]) AND archived_at IS NULL FOR UPDATE`, [[fromId, intoId]])).rows;
  const from = rows.find((r) => r.id === fromId), into = rows.find((r) => r.id === intoId);
  if (!from || !into) throw new CatalogMergeError("not_found", "That value is no longer in the list.");
  if (from.kind !== into.kind) throw new CatalogMergeError("other_list", "A value merges only into a value of the same list.");
  if (from.kind === "source_kind") throw new CatalogMergeError("source_kind_fixed", "Lead source kinds come from where a lead was found; archive instead.");
  const m = await moveCatalogCarriers(c, from.kind, from.value, into.value, uid, "catalog_merge");
  await c.query(`UPDATE perfume.catalog_values SET archived_at = now(), updated_at = now() WHERE id = $1::uuid`, [fromId]);
  await logEvent(c, uid, { entity: "catalog_value", entity_id: fromId, action: "merged", detail: { kind: from.kind, from: from.value, to: into.value, into_id: intoId, contacts_moved: m.moved, items_moved: m.itemsMoved } });
  await logEvent(c, uid, { entity: "catalog_value", entity_id: intoId, action: "merged_in", detail: { kind: from.kind, from: from.value, from_id: fromId, contacts_moved: m.moved, items_moved: m.itemsMoved } });
  return { moved: m.moved + m.itemsMoved, into: into.value };
}
