/**
 * SCENTSX item account mapping (migration 202617050100) — owner 2026-11-27 08:10 CT "money wiring etc chart of accounts … assets".
 * Which Inventory and COGS accounts an item's stock moves post to: the item's own mapping, else its item category's, else the role
 * accounts (inventory_asset / cogs_goods → 1200 / 5000). The stock-move poster asks itemPostingAccounts(); amounts and debit / credit
 * pairs stay the poster's. A change archives the old row and inserts the new one (the rows are the history). An inventory account is
 * never moved while the items it covers hold stock — the value already posted would stay on the old account (reclass first).
 */
import type pg from "pg";
import { z } from "zod";
import { scopeToScentsx, ScentsxLinkInvalid } from "./links.service.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";

type Q = Pick<pg.PoolClient, "query">;

export const accountMapSchema = z.object({
  inventory_account_id: z.string().uuid().nullable(),
  cogs_account_id: z.string().uuid().nullable(),
});

export type PostingAccounts = { inventory_account_id: string | null; cogs_account_id: string | null; source: "item" | "category" | "role" };

/** The accounts one item's stock moves post to (item mapping, else its category's, else none → the poster keeps its role accounts). */
export async function itemPostingAccounts(c: Q, itemId: string): Promise<PostingAccounts> {
  const co = await scopeToScentsx(c);
  const r = await c.query<{ scope: "item" | "category"; inventory_account_id: string | null; cogs_account_id: string | null }>(
    `SELECT m.scope, m.inventory_account_id::text, m.cogs_account_id::text
       FROM scentsx.item_account_map m
      WHERE m.operating_company_id = $1::uuid AND m.archived_at IS NULL
        AND ((m.scope = 'item' AND m.item_id = $2::uuid)
          OR (m.scope = 'category' AND lower(btrim(m.category)) = (SELECT lower(btrim(i.category)) FROM perfume.items i WHERE i.id = $2::uuid)))`,
    [co, itemId]
  );
  const item = r.rows.find((x) => x.scope === "item");
  const cat = r.rows.find((x) => x.scope === "category");
  // Field by field: an item override that names only COGS still takes the category's inventory account.
  const inv = item?.inventory_account_id ?? cat?.inventory_account_id ?? null;
  const cogs = item?.cogs_account_id ?? cat?.cogs_account_id ?? null;
  return { inventory_account_id: inv, cogs_account_id: cogs, source: item ? "item" : cat ? "category" : "role" };
}

/** Units on hand across all sites for the items a mapping covers (blocks moving the inventory account). */
async function unitsOnHand(c: Q, scope: "category" | "item", key: string) {
  const r = await c.query<{ n: string }>(
    scope === "item"
      ? `SELECT coalesce(sum(s.qty), 0)::text n FROM perfume.item_stock s WHERE s.item_id = $1::uuid`
      : `SELECT coalesce(sum(s.qty), 0)::text n FROM perfume.item_stock s JOIN perfume.items i ON i.id = s.item_id
          WHERE lower(btrim(i.category)) = lower(btrim($1)) AND i.merged_into_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM scentsx.item_account_map m WHERE m.scope = 'item' AND m.item_id = i.id AND m.archived_at IS NULL AND m.inventory_account_id IS NOT NULL)`,
    [key]
  );
  return Number(r.rows[0]!.n);
}

async function setMap(c: Q, uid: string, scope: "category" | "item", key: string, x: z.infer<typeof accountMapSchema>) {
  const co = await scopeToScentsx(c);
  const cur = (await c.query<{ id: string; inventory_account_id: string | null; cogs_account_id: string | null }>(
    `SELECT id::text, inventory_account_id::text, cogs_account_id::text FROM scentsx.item_account_map
      WHERE operating_company_id = $1::uuid AND archived_at IS NULL AND scope = $2
        AND ((scope = 'item' AND item_id = $3::uuid) OR (scope = 'category' AND lower(btrim(category)) = lower(btrim($4::text))))
      FOR UPDATE`, [co, scope, scope === "item" ? key : null, scope === "category" ? key : null])).rows[0];
  const same = (cur?.inventory_account_id ?? null) === x.inventory_account_id && (cur?.cogs_account_id ?? null) === x.cogs_account_id;
  if (same) return { changed: false };
  if ((cur?.inventory_account_id ?? null) !== x.inventory_account_id) {
    const units = await unitsOnHand(c, scope, key);
    if (units !== 0) {
      throw new ScentsxLinkInvalid(`${units} unit(s) covered by this mapping are in stock — their value is on the current inventory account. Move the stock value with a reclass journal entry first, or change only the COGS account.`);
    }
  }
  if (cur) await c.query(`UPDATE scentsx.item_account_map SET archived_at = now(), archived_by = $2::uuid WHERE id = $1::uuid`, [cur.id, uid]);
  if (x.inventory_account_id || x.cogs_account_id) {
    await c.query(
      `INSERT INTO scentsx.item_account_map (operating_company_id, scope, category, item_id, inventory_account_id, cogs_account_id, created_by)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid)`,
      [co, scope, scope === "category" ? key.trim() : null, scope === "item" ? key : null, x.inventory_account_id, x.cogs_account_id, uid]
    );
  }
  return { changed: true };
}

export const setCategoryAccounts = (c: Q, uid: string, category: string, x: z.infer<typeof accountMapSchema>) => {
  if (!category.trim()) throw new ScentsxLinkInvalid("Pick the item category.");
  return setMap(c, uid, "category", category, x);
};
export const setItemAccounts = (c: Q, uid: string, itemId: string, x: z.infer<typeof accountMapSchema>) => setMap(c, uid, "item", itemId, x);

/** The mapping screen: every item category (his catalog) with its accounts, every item override, the role defaults, and the history. */
export async function itemAccountMap(c: Q) {
  const co = await scopeToScentsx(c);
  const acct = `(SELECT a.account_number || ' ' || a.account_name FROM catalogs.accounts a WHERE a.id = %s)`;
  const live = await c.query(
    `SELECT m.id::text, m.scope, m.category, m.item_id::text, i.display_name AS item, m.inventory_account_id::text, m.cogs_account_id::text,
            ${acct.replace("%s", "m.inventory_account_id")} AS inventory_account, ${acct.replace("%s", "m.cogs_account_id")} AS cogs_account, m.created_at
       FROM scentsx.item_account_map m LEFT JOIN perfume.items i ON i.id = m.item_id
      WHERE m.operating_company_id = $1::uuid AND m.archived_at IS NULL ORDER BY m.scope, lower(coalesce(m.category, i.display_name))`, [co]);
  const categories = await c.query<{ value: string; items: number }>(
    `SELECT v.value, (SELECT count(*)::int FROM perfume.items i WHERE lower(btrim(i.category)) = lower(btrim(v.value)) AND i.merged_into_id IS NULL) AS items
       FROM perfume.catalog_values v WHERE v.kind = 'item_category' AND v.archived_at IS NULL ORDER BY v.sort, lower(v.value)`);
  const history = await c.query(
    `SELECT m.id::text, m.scope, m.category, i.display_name AS item, ${acct.replace("%s", "m.inventory_account_id")} AS inventory_account,
            ${acct.replace("%s", "m.cogs_account_id")} AS cogs_account, m.created_at, m.archived_at, cu.email AS created_by, au.email AS archived_by
       FROM scentsx.item_account_map m LEFT JOIN perfume.items i ON i.id = m.item_id
       LEFT JOIN identity.users cu ON cu.id = m.created_by LEFT JOIN identity.users au ON au.id = m.archived_by
      WHERE m.operating_company_id = $1::uuid ORDER BY m.created_at DESC LIMIT 500`, [co]);
  const defaults: Record<string, string | null> = {};
  for (const r of ["inventory_asset", "cogs_goods"] as const) {
    const id = await resolveRoleAccountOptional(c as never, co, r);
    defaults[r] = id ? ((await c.query<{ n: string }>(`SELECT account_number || ' ' || account_name AS n FROM catalogs.accounts WHERE id = $1::uuid`, [id])).rows[0]?.n ?? null) : null;
  }
  return { categories: categories.rows, mappings: live.rows, history: history.rows, defaults };
}

/** Every inventory account ScentsX stock has ever been mapped to (for the tie-out). */
export async function mappedInventoryAccounts(c: Q, co: string): Promise<string[]> {
  return (await c.query<{ id: string }>(
    `SELECT DISTINCT inventory_account_id::text AS id FROM scentsx.item_account_map WHERE operating_company_id = $1::uuid AND inventory_account_id IS NOT NULL`, [co])).rows.map((r) => r.id);
}
