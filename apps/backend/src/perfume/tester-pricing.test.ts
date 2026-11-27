/**
 * PERFUME product types + tester pricing (migration 202617070100) — owner 2026-11-27 12:03 CT "Search our regular items and they
 * [testers] should be sold at around 70 percent of the selling price of the regular goods" and 12:04 CT "Testers should have testers
 * product type and bags should be tagged as bags, etc all those should exist". Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { wholesaleList } from "./wholesale.service.js";
import { createItem, setRegularItem, updateItemFile } from "./items.service.js";
import { priceAtLevel } from "./accounts.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("product types + tester pricing (real Postgres, rolled back)", () => {
  let db: pg.Client;
  const u = TEST_OWNER_USER_ID;
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

  it("classifies product types from the item's flags, words, gender and concentration", async () => {
    const t = async (name: string, flags: string[], g: string | null, conc: string | null) =>
      (await db.query<{ t: string | null }>(`SELECT perfume.classify_product_type($1, $2::text[], $3, $4) t`, [name, flags, g, conc])).rows[0]!.t;
    expect(await t("SAUVAGE TESTER", ["TESTER"], "M", "EDT")).toBe("Tester Man");
    expect(await t("GOOD GIRL", ["TESTER"], "W", "EDP")).toBe("Tester Woman");
    expect(await t("CK ONE", ["TESTER"], "U", "EDT")).toBe("Tester");
    expect(await t("SHOPPING BAG", [], null, null)).toBe("Bag");
    expect(await t("PAPER BLOTTERS", [], null, null)).toBe("Blotter");
    expect(await t("GOOD GIRL 3PC", [], "W", "EDP")).toBe("Woman Set");
    expect(await t("BODY LOTION", [], "W", null)).toBe("Body care");
    expect(await t("CANDLE", [], null, null)).toBe("Home fragrance");
    expect(await t("BLEU", [], "M", "EDP")).toBe("Man");
    expect(await t("X", [], null, "EDP")).toBe("Perfume");
    expect(await t("X", [], null, null)).toBeNull();
    // every type it returns exists in the product-type catalog
    const missing = await db.query(`SELECT v FROM unnest(ARRAY['Tester','Tester Man','Tester Woman','Bag','Blotter','Woman Set','Man Set','Set','Body care','Home fragrance',
      'Man','Woman','Unisex','Perfume','Mini','Sample / Vial','Gift with purchase','Box / Packaging','Display','Accessory','Deodorant','Hair care','Cosmetics','Body Mist']) v
      WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values c WHERE c.kind = 'product_type' AND c.archived_at IS NULL AND lower(c.value) = lower(v))`);
    expect(missing.rows).toEqual([]);
  });

  it("links a new tester to its regular version on insert — same size and concentration, never a set or a flanker", async () => {
    const reg = await createItem(db as never, u, { brand: "ZZT", name: "ALPHA NOVA", size_ml: 100, conc: "EDP", gender: "M" });
    await createItem(db as never, u, { brand: "ZZT", name: "ALPHA NOVA", size_ml: 100, conc: "EDP", gender: "M", flags: ["SET"] });
    await createItem(db as never, u, { brand: "ZZT", name: "ALPHA NOVA INTENSE", size_ml: 100, conc: "EDP", gender: "M" });
    await createItem(db as never, u, { brand: "ZZT", name: "ALPHA NOVA", size_ml: 100, conc: "EDT", gender: "M" });
    const tst = await createItem(db as never, u, { brand: "ZZT", name: "ALPHA NOVA", size_ml: 100, conc: "EDP", gender: "M", flags: ["TESTER"] });
    const row = (await db.query(`SELECT product_type, regular_item_id FROM perfume.items WHERE id = $1`, [tst.id])).rows[0];
    expect(row).toEqual({ product_type: "Tester Man", regular_item_id: reg.id });
    // a flanker tester does not take the plain regular
    const fl = await createItem(db as never, u, { brand: "ZZT", name: "ALPHA NOVA ELIXIR", size_ml: 100, conc: "EDP", gender: "M", flags: ["TESTER"] });
    expect((await db.query(`SELECT regular_item_id FROM perfume.items WHERE id = $1`, [fl.id])).rows[0]!.regular_item_id).toBeNull();
    // the link is editable and refuses a tester as the regular / a non-tester as the item
    await expect(setRegularItem(db as never, u, tst.id, fl.id)).rejects.toThrow(/can't itself be a tester/);
    await expect(setRegularItem(db as never, u, reg.id, tst.id)).rejects.toThrow(/Only a tester/);
    await updateItemFile(db as never, u, tst.id, { regular_item_id: null });
    expect((await db.query(`SELECT regular_item_id FROM perfume.items WHERE id = $1`, [tst.id])).rows[0]!.regular_item_id).toBeNull();
    const ev = await db.query(`SELECT detail FROM perfume.item_events WHERE item_id = $1 AND kind = 'attributes' ORDER BY created_at DESC, id DESC LIMIT 1`, [tst.id]);
    expect(ev.rows[0]!.detail).toEqual({ from: { regular_item_id: reg.id }, to: { regular_item_id: null } });
    await setRegularItem(db as never, u, tst.id, reg.id);
  });

  it("prices a tester at the level's tester % of its regular's price — on the Wholesale list and on the sales order alike", async () => {
    const lv = (await db.query<{ id: string; name: string; method: "markup"; pct: string; cost_basis: "avg"; floor_pct: null; tester_pct: string }>(
      `INSERT INTO perfume.price_levels (name, channel, method, pct, cost_basis, sort_order) VALUES ('ZZ Tester lvl', 'wholesale', 'markup', 25, 'avg', 999)
       RETURNING id, name, method, pct::text, cost_basis, floor_pct::text, tester_pct::text`)).rows[0]!;
    expect(Number(lv.tester_pct)).toBe(70);
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, active, kind, own) VALUES ('ZZTP', 'ZZ TP', 998, true, 'warehouse', true) ON CONFLICT (code) DO NOTHING`);
    const reg = await createItem(db as never, u, { brand: "ZZP", name: "BRAVO", size_ml: 50, conc: "EDT", gender: "W" });
    const tst = await createItem(db as never, u, { brand: "ZZP", name: "BRAVO", size_ml: 50, conc: "EDT", gender: "W", flags: ["TESTER"] });
    // regular: $40 avg cost, in stock → level price $50 (25 % markup). Tester: in stock at $15 avg (its own rule would be $18.75).
    await db.query(`INSERT INTO perfume.item_stock (item_id, location_code, qty, avg_cost_cents) VALUES ($1, 'ZZTP', 4, 4000), ($2, 'ZZTP', 9, 1500)`, [reg.id, tst.id]);

    const wl = await wholesaleList(db as never, { level_id: lv.id, q: "ZZP" });
    const rt = wl.rows.find((r) => r.item_id === tst.id)!;
    expect(rt).toMatchObject({ price_cents: 3500, price_from: "tester", regular_item_id: reg.id, product_type: "Tester Woman" }); // 70 % of $50
    expect(wl.rows.find((r) => r.item_id === reg.id)).toMatchObject({ price_cents: 5000, price_from: "rule" });
    const so = await priceAtLevel(db as never, lv, tst.id, 1, null);
    expect(so).toMatchObject({ cents: 3500, how: "tester_of_regular", regular_cents: 5000, tester_pct: 70 });

    // the level's tester % is the knob
    await db.query(`UPDATE perfume.price_levels SET tester_pct = 60 WHERE id = $1`, [lv.id]);
    expect((await wholesaleList(db as never, { level_id: lv.id, q: "ZZP" })).rows.find((r) => r.item_id === tst.id)!.price_cents).toBe(3000);
    expect((await priceAtLevel(db as never, { ...lv, tester_pct: "60" }, tst.id, 1, null))!.cents).toBe(3000);

    // a fixed price on the tester itself still wins
    await db.query(`INSERT INTO perfume.price_level_items (level_id, item_id, min_qty, price_cents, updated_by) VALUES ($1, $2, 1, 2200, $3)`, [lv.id, tst.id, u]);
    expect((await wholesaleList(db as never, { level_id: lv.id, q: "ZZP" })).rows.find((r) => r.item_id === tst.id)).toMatchObject({ price_cents: 2200, price_from: "fixed" });
    expect((await priceAtLevel(db as never, { ...lv, tester_pct: "60" }, tst.id, 1, null))).toMatchObject({ cents: 2200, how: "fixed" });

    // no regular linked → the tester's own rule
    await db.query(`UPDATE perfume.price_level_items SET archived_at = now() WHERE level_id = $1 AND item_id = $2`, [lv.id, tst.id]);
    await setRegularItem(db as never, u, tst.id, null);
    expect((await wholesaleList(db as never, { level_id: lv.id, q: "ZZP" })).rows.find((r) => r.item_id === tst.id)).toMatchObject({ price_cents: 1875, price_from: "rule" });
  });

  it("never prices from a placeholder cost under $1 (item_costs at 1¢ priced testers at 1¢ live on 2026-11-27)", async () => {
    const lv = (await db.query<{ id: string; name: string; method: "markup"; pct: string; cost_basis: "avg"; floor_pct: null; tester_pct: string }>(
      `INSERT INTO perfume.price_levels (name, channel, method, pct, cost_basis, sort_order) VALUES ('ZZ Penny lvl', 'wholesale', 'markup', 25, 'avg', 999)
       RETURNING id, name, method, pct::text, cost_basis, floor_pct::text, tester_pct::text`)).rows[0]!;
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, active, kind, own) VALUES ('ZZPN', 'ZZ PN', 997, true, 'warehouse', true) ON CONFLICT (code) DO NOTHING`);
    const reg = await createItem(db as never, u, { brand: "ZZN", name: "PENNY", size_ml: 100, conc: "EDT", gender: "M" });
    const tst = await createItem(db as never, u, { brand: "ZZN", name: "PENNY", size_ml: 100, conc: "EDT", gender: "M", flags: ["TESTER"] });
    await db.query(`INSERT INTO perfume.item_costs (item_id, avg_cost_cents) VALUES ($1, 1)`, [reg.id]);
    await db.query(`INSERT INTO perfume.item_stock (item_id, location_code, qty, avg_cost_cents) VALUES ($1, 'ZZPN', 3, 0)`, [tst.id]);
    const rows = (await wholesaleList(db as never, { level_id: lv.id, q: "ZZN" })).rows;
    expect(rows.find((r) => r.item_id === tst.id)).toMatchObject({ price_cents: null, price_from: null });
    expect(await priceAtLevel(db as never, lv, reg.id, 1, 50)).toBeNull(); // a 50¢ supplier price is not a cost either
  });

  it("refuses a tester % outside (0, 100]", async () => {
    await db.query("SAVEPOINT p");
    await expect(db.query(`INSERT INTO perfume.price_levels (name, channel, method, pct, cost_basis, sort_order, tester_pct) VALUES ('ZZ bad', 'wholesale', 'markup', 10, 'avg', 999, 120)`))
      .rejects.toThrow(/tester_pct/);
    await db.query("ROLLBACK TO SAVEPOINT p");
  });
});
