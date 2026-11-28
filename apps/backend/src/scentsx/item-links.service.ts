/**
 * SCENTSX M21 (LEAD ROUND L.32) — Items → books. Every perfume item shows the ScentsX accounts it posts to (inventory 1201–1204
 * and COGS 5001–5004 by its category through scentsx.item_account_map, else the role accounts 1200 / 5000; income by sales channel
 * 4000 / 4010 / 4020), and "Make ScentsX item" makes it a product in the engine's Products & Services (catalogs.items, through
 * the one catalog-item writer) linked one-to-one (scentsx.item_links, migration 202617240100). No journal entry, no amount.
 */
import type pg from "pg";
import { z } from "zod";
import { scopeToScentsx, ScentsxLinkInvalid } from "./links.service.js";
import { insertCatalogItemInClientTx } from "../catalogs/items.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueTmsItemPushRequested } from "../qbo/tms-item-push-chain.service.js";

type Q = Pick<pg.PoolClient, "query">;

export const itemBooksQuery = z.object({
  q: z.string().trim().max(200).optional(),
  /** A category name, or "none" for items with no category. */
  category: z.string().trim().max(60).optional(),
  conc: z.string().trim().max(20).optional(),
  linked: z.enum(["yes", "no"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ItemBooksFilter = z.infer<typeof itemBooksQuery>;

/** The rows a filter selects (same predicate for the list and for "all matching" bulk actions). */
function where(f: Omit<ItemBooksFilter, "limit" | "offset">, args: unknown[]) {
  const w = ["i.merged_into_id IS NULL", "i.is_active", "i.is_stock_item"];
  if (f.q) { args.push(`%${f.q.toLowerCase()}%`); w.push(`lower(i.display_name) LIKE $${args.length}`); }
  if (f.category === "none") w.push("(i.category IS NULL OR btrim(i.category) = '')");
  else if (f.category) { args.push(f.category); w.push(`lower(btrim(i.category)) = lower(btrim($${args.length}))`); }
  if (f.conc) { args.push(f.conc); w.push(`upper(coalesce(i.conc, '')) = upper($${args.length})`); }
  if (f.linked === "yes") w.push("l.id IS NOT NULL");
  if (f.linked === "no") w.push("l.id IS NULL");
  return w.join(" AND ");
}

const FROM = `perfume.items i
  LEFT JOIN scentsx.item_links l ON l.perfume_item_id = i.id AND l.voided_at IS NULL
  LEFT JOIN catalogs.items ci ON ci.id = l.catalog_item_id
  LEFT JOIN scentsx.item_account_map mi ON mi.scope = 'item' AND mi.item_id = i.id AND mi.archived_at IS NULL
  LEFT JOIN scentsx.item_account_map mc ON mc.scope = 'category' AND lower(btrim(mc.category)) = lower(btrim(i.category)) AND mc.archived_at IS NULL`;

async function roleAccounts(c: Q, co: string) {
  const r = await c.query<{ n: string; id: string; name: string }>(
    `SELECT account_number AS n, id::text, account_name AS name FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND account_number IN ('1200', '5000', '4000', '4010', '4020')`, [co]);
  return new Map(r.rows.map((x) => [x.n, x]));
}

export async function itemBooks(c: Q, f: ItemBooksFilter) {
  const co = await scopeToScentsx(c);
  const args: unknown[] = [];
  const w = where(f, args);
  const total = Number((await c.query<{ n: string }>(`SELECT count(*)::text n FROM ${FROM} WHERE ${w}`, args)).rows[0]!.n);
  const linked = Number((await c.query<{ n: string }>(`SELECT count(*)::text n FROM ${FROM} WHERE ${w} AND l.id IS NOT NULL`, args)).rows[0]!.n);
  args.push(f.limit, f.offset);
  const rows = (await c.query<{ id: string; display_name: string; category: string | null; conc: string | null; inv_id: string | null; cogs_id: string | null;
      src: string; catalog_item_id: string | null; catalog_item_name: string | null }>(
    `SELECT i.id::text, i.display_name, i.category, i.conc,
            coalesce(mi.inventory_account_id, mc.inventory_account_id)::text AS inv_id, coalesce(mi.cogs_account_id, mc.cogs_account_id)::text AS cogs_id,
            CASE WHEN mi.id IS NOT NULL THEN 'item' WHEN mc.id IS NOT NULL THEN 'category' ELSE 'role' END AS src,
            ci.id::text AS catalog_item_id, ci.item_name AS catalog_item_name
       FROM ${FROM} WHERE ${w}
      ORDER BY i.display_name LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
  const ids = [...new Set(rows.flatMap((r) => [r.inv_id, r.cogs_id]).filter((x): x is string => !!x))];
  const acc = ids.length ? new Map((await c.query<{ id: string; n: string; name: string }>(
    `SELECT id::text, account_number AS n, account_name AS name FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [ids])).rows.map((a) => [a.id, a])) : new Map();
  const role = await roleAccounts(c, co);
  const label = (id: string | null, fallback: string) => {
    const a = id ? acc.get(id) : role.get(fallback);
    return a ? `${a.n} ${a.name}` : null;
  };
  return {
    total, linked, limit: f.limit, offset: f.offset, account_drift: await itemAccountDrift(c),
    income_accounts: ["4000", "4010", "4020"].map((n) => role.get(n)).filter(Boolean).map((a) => ({ number: a!.n, name: a!.name })),
    rows: rows.map((r) => ({
      id: r.id, display_name: r.display_name, category: r.category, conc: r.conc, accounts_from: r.src,
      inventory_account: label(r.inv_id, "1200"), cogs_account: label(r.cogs_id, "5000"),
      catalog_item_id: r.catalog_item_id, catalog_item_name: r.catalog_item_name,
    })),
  };
}

export const makeItemsSchema = z.union([
  z.object({ item_ids: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({ filter: itemBooksQuery.omit({ limit: true, offset: true }), max: z.number().int().min(1).max(500).default(500) }),
]);

/**
 * Makes each selected, not yet linked perfume item a ScentsX product: catalogs.items type Inventory, income 4000 (wholesale —
 * the invoice still books the channel's own account), expense = the item's COGS account (category map, else 5000), then the link.
 * At most 500 per call; with a filter it takes the next 500 unlinked rows and says how many are left.
 */
export async function makeScentsxItems(c: Q, uid: string, x: z.infer<typeof makeItemsSchema>) {
  const co = await scopeToScentsx(c);
  const role = await roleAccounts(c, co);
  const income = role.get("4000");
  if (!income) throw new ScentsxLinkInvalid("ScentsX income account 4000 is missing.");
  let ids: string[];
  if ("item_ids" in x) ids = [...new Set(x.item_ids)];
  else {
    const args: unknown[] = [];
    const w = where({ ...x.filter, linked: "no" }, args);
    args.push(x.max);
    ids = (await c.query<{ id: string }>(`SELECT i.id::text FROM ${FROM} WHERE ${w} ORDER BY i.display_name LIMIT $${args.length}`, args)).rows.map((r) => r.id);
  }
  const items = ids.length ? (await c.query<{ id: string; display_name: string; linked: boolean; cogs_id: string | null; ok: boolean }>(
    `SELECT i.id::text, i.display_name, (l.id IS NOT NULL) AS linked, coalesce(mi.cogs_account_id, mc.cogs_account_id)::text AS cogs_id,
            (i.merged_into_id IS NULL AND i.is_active AND i.is_stock_item) AS ok
       FROM ${FROM} WHERE i.id = ANY($1::uuid[]) ORDER BY i.display_name`, [ids])).rows : [];
  let created = 0, already = 0, not_stock = 0;
  const made: Array<{ perfume_item_id: string; catalog_item_id: string; item_name: string }> = [];
  for (const it of items) {
    if (it.linked) { already++; continue; }
    if (!it.ok) { not_stock++; continue; }
    // Products & Services names are unique per company: a name already taken gets the item's short id after it.
    const taken = (await c.query(`SELECT 1 FROM catalogs.items WHERE operating_company_id = $1::uuid AND item_name = $2`, [co, it.display_name.slice(0, 200)])).rowCount;
    const name = (taken ? `${it.display_name.slice(0, 188)} · ${it.id.slice(0, 8)}` : it.display_name).slice(0, 200);
    const row = await insertCatalogItemInClientTx(c, uid, co, {
      item_name: name, item_type: "Inventory", description: it.display_name.slice(0, 2000), taxable: true,
      default_income_account_id: income.id, default_expense_account_id: it.cogs_id ?? role.get("5000")?.id ?? null,
      notes: "Made from the TIO Perfumes item master (scentsx.item_links)",
    });
    await c.query(`INSERT INTO scentsx.item_links (operating_company_id, perfume_item_id, catalog_item_id, created_by) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
      [co, it.id, row.id, uid]);
    created++;
    made.push({ perfume_item_id: it.id, catalog_item_id: String(row.id), item_name: name });
  }
  let remaining: number | null = null;
  if ("filter" in x) {
    const args: unknown[] = [];
    const w = where({ ...x.filter, linked: "no" }, args);
    remaining = Number((await c.query<{ n: string }>(`SELECT count(*)::text n FROM ${FROM} WHERE ${w}`, args)).rows[0]!.n);
  }
  return { created, already_linked: already, not_stock_items: not_stock, remaining, made };
}

/**
 * The linked ScentsX products whose expense account no longer matches the item's COGS account (the item's category changed, or
 * the category map changed after the product was made). Expected = item map, else category map, else role 5000.
 */
const DRIFT = `SELECT ci.id::text AS catalog_item_id, ci.item_name, ci.default_expense_account_id::text AS old_id,
         coalesce(mi.cogs_account_id, mc.cogs_account_id, r5.id)::text AS new_id
    FROM perfume.items i
    JOIN scentsx.item_links l ON l.perfume_item_id = i.id AND l.voided_at IS NULL
    JOIN catalogs.items ci ON ci.id = l.catalog_item_id
    LEFT JOIN scentsx.item_account_map mi ON mi.scope = 'item' AND mi.item_id = i.id AND mi.archived_at IS NULL
    LEFT JOIN scentsx.item_account_map mc ON mc.scope = 'category' AND lower(btrim(mc.category)) = lower(btrim(i.category)) AND mc.archived_at IS NULL
    LEFT JOIN catalogs.accounts r5 ON r5.operating_company_id = $1::uuid AND r5.account_number = '5000' AND r5.deactivated_at IS NULL
   WHERE ci.default_expense_account_id IS DISTINCT FROM coalesce(mi.cogs_account_id, mc.cogs_account_id, r5.id)
     AND coalesce(mi.cogs_account_id, mc.cogs_account_id, r5.id) IS NOT NULL`;

export async function itemAccountDrift(c: Q) {
  const co = await scopeToScentsx(c);
  return Number((await c.query<{ n: string }>(`SELECT count(*)::text n FROM (${DRIFT}) d`, [co])).rows[0]!.n);
}

/**
 * Brings up to 500 drifted products in line: each catalogs.items row gets the expected expense account, with its own
 * catalogs.items.updated audit row (old → new) and the QuickBooks item push queued, the same as an edit on Products & Services.
 */
export async function syncScentsxItemAccounts(c: Q, uid: string, max = 500) {
  const co = await scopeToScentsx(c);
  const rows = (await c.query<{ catalog_item_id: string; item_name: string; old_id: string | null; new_id: string }>(
    `${DRIFT} ORDER BY ci.item_name LIMIT $2`, [co, Math.min(Math.max(max, 1), 500)])).rows;
  for (const r of rows) {
    await c.query(`UPDATE catalogs.items SET default_expense_account_id = $2::uuid, updated_at = now(), updated_by_user_id = $3::uuid WHERE id = $1::uuid`,
      [r.catalog_item_id, r.new_id, uid]);
    await appendCrudAudit(c as pg.PoolClient, uid, "catalogs.items.updated", {
      resource_id: r.catalog_item_id, resource_type: "catalogs.items",
      changes: { default_expense_account_id: { from: r.old_id, to: r.new_id } },
    });
    await enqueueTmsItemPushRequested(c as pg.PoolClient, { operating_company_id: co, item_id: r.catalog_item_id, operation: "update" });
  }
  return { updated: rows.length, remaining: await itemAccountDrift(c) };
}
