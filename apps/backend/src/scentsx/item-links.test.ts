/**
 * SCENTSX M21: Items → books. The list shows each item's inventory / COGS account (category map, else the role accounts); "Make
 * ScentsX item" creates one catalogs.items product per unlinked stock item (income 4000, expense = the item's COGS) with one live
 * link; a second run makes nothing; a filter run says what is left. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { itemBooks, itemBooksQuery, makeItemsSchema, makeScentsxItems, syncScentsxItemAccounts } from "./item-links.service.js";
import { setCategoryAccounts } from "./item-accounts.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("ScentsX item books (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("accounts by category, one product per item, re-run makes nothing, filter run counts what is left", async () => {
    const acct = async (n: string, name: string, type: string, sub: string) => {
      const have = (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = scentsx.company_id() AND account_number = $1`, [n])).rows[0];
      if (have) return have.id;
      return (await db.query<{ id: string }>(
        `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype) VALUES (scentsx.company_id(), $1, $2, $3, $4) RETURNING id::text`,
        [n, name, type, sub])).rows[0]!.id;
    };
    const inc = await acct("4000", "Sales of Goods - Wholesale", "Income", "Sales of Product Income");
    const inv1201 = await acct("1201", "Inventory - Perfume", "Asset", "Inventory");
    const cogs5001 = await acct("5001", "Cost of Goods Sold - Perfume", "CostOfGoodsSold", "Supplies & Materials - COGS");
    await acct("5000", "Cost of Goods Sold", "CostOfGoodsSold", "Supplies & Materials - COGS");
    await acct("1200", "Inventory", "Asset", "Inventory");
    await setCategoryAccounts(db, TEST_OWNER_USER_ID, "ZZBooks Perfume", { inventory_account_id: inv1201, cogs_account_id: cogs5001 });
    const item = async (name: string, cat: string | null) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name, category)
       VALUES ('ZZBOOKS', $1, 100, 'EDP', 'W', $2, 'x', $3, $4) RETURNING id::text`, [name, `ZZBOOKS|${name}`, `ZZBOOKS · ${name}`, cat])).rows[0]!.id;
    const a = await item("ALPHA", "ZZBooks Perfume"), b = await item("BETA", null), c2 = await item("GAMMA", null);

    const list = await itemBooks(db, itemBooksQuery.parse({ q: "zzbooks" }));
    expect(list.total).toBe(3);
    const byId = Object.fromEntries(list.rows.map((r) => [r.id, r]));
    expect(byId[a]).toMatchObject({ accounts_from: "category", inventory_account: "1201 Inventory - Perfume", cogs_account: "5001 Cost of Goods Sold - Perfume" });
    expect(byId[b]!.accounts_from).toBe("role");
    expect(byId[b]!.cogs_account).toMatch(/^5000 /);

    const r1 = await makeScentsxItems(db, TEST_OWNER_USER_ID, makeItemsSchema.parse({ item_ids: [a, b] }));
    expect(r1).toMatchObject({ created: 2, already_linked: 0 });
    const prod = (await db.query<{ type: string; inc: string; exp: string; co: string }>(
      `SELECT ci.item_type AS type, ci.default_income_account_id::text AS inc, ci.default_expense_account_id::text AS exp, c.code AS co
         FROM scentsx.item_links l JOIN catalogs.items ci ON ci.id = l.catalog_item_id JOIN org.companies c ON c.id = ci.operating_company_id
        WHERE l.perfume_item_id = $1::uuid AND l.voided_at IS NULL`, [a])).rows[0]!;
    expect(prod).toEqual({ type: "Inventory", inc, exp: cogs5001, co: "SCENTSX" });
    const audit = await db.query(`SELECT 1 FROM audit.audit_events WHERE payload->>'resource_id' = $1`, [r1.made[0]!.catalog_item_id]);
    expect(audit.rowCount).toBeGreaterThan(0);

    const r2 = await makeScentsxItems(db, TEST_OWNER_USER_ID, makeItemsSchema.parse({ item_ids: [a, b] }));
    expect(r2).toMatchObject({ created: 0, already_linked: 2 });

    const r3 = await makeScentsxItems(db, TEST_OWNER_USER_ID, makeItemsSchema.parse({ filter: { q: "zzbooks" }, max: 500 }));
    expect(r3).toMatchObject({ created: 1, remaining: 0 });
    expect(r3.made[0]!.perfume_item_id).toBe(c2);
    expect((await itemBooks(db, itemBooksQuery.parse({ q: "zzbooks", linked: "no" }))).total).toBe(0);

    // BETA is re-categorized after its product was made: the product's expense drifts until the sync brings it to 5001.
    await db.query(`UPDATE perfume.items SET category = 'ZZBooks Perfume' WHERE id = $1::uuid`, [b]);
    expect((await itemBooks(db, itemBooksQuery.parse({ q: "zzbooks" }))).account_drift).toBeGreaterThanOrEqual(1);
    const s1 = await syncScentsxItemAccounts(db, TEST_OWNER_USER_ID, 500);
    expect(s1.updated).toBeGreaterThanOrEqual(1);
    expect(s1.remaining).toBe(0);
    const bp = (await db.query<{ id: string; exp: string }>(
      `SELECT ci.id::text, ci.default_expense_account_id::text AS exp FROM scentsx.item_links l JOIN catalogs.items ci ON ci.id = l.catalog_item_id
        WHERE l.perfume_item_id = $1::uuid AND l.voided_at IS NULL`, [b])).rows[0]!;
    expect(bp.exp).toBe(cogs5001);
    const ev = await db.query(`SELECT 1 FROM audit.audit_events WHERE payload->>'resource_id' = $1 AND payload->'changes' ? 'default_expense_account_id'`, [bp.id]);
    expect(ev.rowCount).toBe(1);
    expect((await syncScentsxItemAccounts(db, TEST_OWNER_USER_ID, 500)).updated).toBe(0);
  });
});
