/**
 * SCENTSX item account mapping (owner 2026-11-27 08:10 CT): an item category's Inventory / COGS accounts replace the role accounts in the
 * reused stock-move poster (same amounts, same pairs); an item override wins; an unmapped item keeps 1200 / 5000; the inventory tie-out
 * still ties across every inventory account; an inventory account cannot move while covered stock is on hand; only ScentsX Inventory /
 * COGS accounts are accepted. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { postStockMove, STOCK_MOVE_SOURCE } from "./stock-move-poster.service.js";
import { inventoryTieOut } from "./inventory-tieout.service.js";
import { itemAccountMap, itemPostingAccounts, setCategoryAccounts, setItemAccounts } from "./item-accounts.service.js";

describe("ScentsX item → Inventory / COGS accounts (real Postgres, rolled back)", () => {
  let db: pg.Client;
  const u = TEST_OWNER_USER_ID;
  const actor = { userId: u, role: "Owner" };
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key = 'SCENTSX_STOCK_MOVE_GL_POSTING_ENABLED' AND operating_company_id = $1::uuid AND user_uuid IS NULL`, [co]);
    await db.query(`INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid) VALUES ('SCENTSX_STOCK_MOVE_GL_POSTING_ENABLED', $1::uuid, true, $2::uuid)`, [co, u]);
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  const acct = async (num: string, name: string, type: string, subtype: string) => (await db.query<{ id: string }>(
    `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype)
     VALUES (scentsx.company_id(), $1, $2, $3, $4) RETURNING id::text`, [num, name, type, subtype])).rows[0]!.id;
  const posted = async (moveId: string) => (await db.query<{ num: string; side: string; cents: string }>(
    `SELECT a.account_number AS num, p.debit_or_credit AS side, p.amount_cents::text AS cents FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE p.source_transaction_type = $2 AND p.source_transaction_id = $1 ORDER BY p.debit_or_credit DESC`, [moveId, STOCK_MOVE_SOURCE])).rows.map((r) => [r.num, r.side, Number(r.cents)]);

  it("maps a category, posts to its accounts, keeps the tie-out, refuses a remap over stock and a wrong account type", async () => {
    const inv = await acct("1201", "Inventory - ZZ Skincare", "Asset", "Inventory");
    const cogs = await acct("5001", "COGS - ZZ Skincare", "CostOfGoodsSold", "Supplies & Materials - COGS");
    const inv2 = await acct("1202", "Inventory - ZZ Other", "Asset", "Inventory");
    const bank = (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = scentsx.company_id() AND account_number = '1000'`)).rows[0]!.id;

    const mkItem = async (name: string, category: string | null) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, display_name, identity_key, loose_key, category) VALUES ('ZZA', $1, $1, $2, $2, $3) RETURNING id::text`, [name, `zza-${name}`, category])).rows[0]!.id;
    const mapped = await mkItem("Mapped", "ZZ Skincare"), plain = await mkItem("Plain", null), over = await mkItem("Override", "ZZ Skincare");
    const loc = (await db.query<{ code: string }>(`SELECT code FROM perfume.locations WHERE active ORDER BY sort_order LIMIT 1`)).rows[0]!.code;
    const move = async (item: string, kind: string, qty: number) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.stock_moves (kind, item_id, location_code, qty, unit_cost_cents, qty_after, avg_cost_after_cents) VALUES ($1, $2::uuid, $3, $4, 1000, 0, 1000) RETURNING id::text`,
      [kind, item, loc, qty])).rows[0]!.id;

    // Wrong type refused by the database rule.
    await db.query("SAVEPOINT t1");
    await expect(setCategoryAccounts(db, u, "ZZ Skincare", { inventory_account_id: bank, cogs_account_id: null })).rejects.toThrow(/subtype Inventory/);
    await db.query("ROLLBACK TO SAVEPOINT t1");

    expect(await setCategoryAccounts(db, u, "ZZ Skincare", { inventory_account_id: inv, cogs_account_id: cogs })).toEqual({ changed: true });
    expect(await setItemAccounts(db, u, over, { inventory_account_id: inv2, cogs_account_id: null })).toEqual({ changed: true });
    expect(await itemPostingAccounts(db, mapped)).toMatchObject({ inventory_account_id: inv, cogs_account_id: cogs, source: "category" });
    expect(await itemPostingAccounts(db, over)).toMatchObject({ inventory_account_id: inv2, cogs_account_id: cogs, source: "item" });
    expect(await itemPostingAccounts(db, plain)).toMatchObject({ inventory_account_id: null, cogs_account_id: null, source: "role" });

    const before = await inventoryTieOut(db);
    const r1 = await move(mapped, "receipt", 10), s1 = await move(mapped, "shipment", -4), r2 = await move(plain, "receipt", 3), r3 = await move(over, "receipt", 2);
    for (const m of [r1, s1, r2, r3]) expect(await postStockMove(db, m, actor)).toMatchObject({ posted: true });
    const p1 = await posted(r1);
    expect(p1[0]).toEqual(["1201", "debit", 10000]);
    expect(p1[1]).toEqual([expect.not.stringMatching(/^1201$/), "credit", 10000]); // GRNI side unchanged by the map
    expect(await posted(s1)).toEqual([["5001", "debit", 4000], ["1201", "credit", 4000]]);
    expect((await posted(r2))[0]).toEqual(["1200", "debit", 3000]);
    expect((await posted(r3))[0]).toEqual(["1202", "debit", 2000]);

    const after = await inventoryTieOut(db);
    expect(after.account_ids).toEqual(expect.arrayContaining([inv, inv2]));
    expect(after.difference_cents).toBe(before.difference_cents);

    // Stock is on hand for the category → its inventory account cannot move; COGS can.
    await db.query(`INSERT INTO perfume.item_stock (item_id, location_code, qty, avg_cost_cents) VALUES ($1, $2, 6, 1000) ON CONFLICT (item_id, location_code) DO UPDATE SET qty = 6`, [mapped, loc]);
    await db.query("SAVEPOINT t2");
    await expect(setCategoryAccounts(db, u, "ZZ Skincare", { inventory_account_id: inv2, cogs_account_id: cogs })).rejects.toThrow(/in stock/);
    await db.query("ROLLBACK TO SAVEPOINT t2");
    expect(await setCategoryAccounts(db, u, "ZZ Skincare", { inventory_account_id: inv, cogs_account_id: null })).toEqual({ changed: true });

    const m = await itemAccountMap(db);
    expect(m.history.filter((h: { category: string | null }) => h.category === "ZZ Skincare").length).toBe(2);
    expect(m.defaults).toMatchObject({ inventory_asset: expect.stringContaining("1200"), cogs_goods: expect.stringContaining("5000") });
  });
});
