/**
 * PERFUME wholesale lists (owner 2026-11-27 08:10 CT): one price level's list of our items — fixed price breaks first, at the item's
 * minimum order, else the level's rule on cost — with case pack, case price, availability and trade data; filters by category / family /
 * in stock. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { wholesaleList } from "./wholesale.service.js";
import { createItem } from "./items.service.js";
import { createFamily } from "./families.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("wholesale list (real Postgres, rolled back)", () => {
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

  it("prices our items at the level, with breaks, case price, availability and filters", async () => {
    const level = (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_levels (name, channel, method, pct, cost_basis, sort_order) VALUES ('ZZ Wholesale test', 'wholesale', 'markup', 25, 'avg', 999) RETURNING id`)).rows[0]!.id;
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, active, kind, own) VALUES ('ZZWL', 'ZZ WL', 998, true, 'warehouse', true) ON CONFLICT (code) DO NOTHING`);
    const fam = await createFamily(db as never, u, { name: "ZZW Line", brand: "ZZW" });
    const a = await createItem(db as never, u, { brand: "ZZW", name: "ALFA", size_ml: 100, case_pack: 12, min_order_qty: 6, origin_country: "AE", hs_code: "330300", category: "Perfume", family_id: fam.id });
    const b = await createItem(db as never, u, { brand: "ZZW", name: "BETA", size_ml: 50 });
    const n = await createItem(db as never, u, { brand: "ZZW", name: "NOTOURS", size_ml: 30 });
    // Stock: ALFA 30 units at $20 avg; BETA 5 units at $10 avg. NOTOURS has no stock and is on no list of mine → not on the list.
    await db.query(`INSERT INTO perfume.item_stock (item_id, location_code, qty, avg_cost_cents) VALUES ($1, 'ZZWL', 30, 2000), ($2, 'ZZWL', 5, 1000)`, [a.id, b.id]);
    // ALFA has fixed breaks at this level: 6+ $30, 24+ $28.
    await db.query(`INSERT INTO perfume.price_level_items (level_id, item_id, min_qty, price_cents, updated_by) VALUES ($1, $2, 6, 3000, $3), ($1, $2, 24, 2800, $3)`, [level, a.id, u]);

    const all = await wholesaleList(db as never, { level_id: level, q: "ZZW" });
    expect(all.rows.map((r) => r.item_id)).not.toContain(n.id);
    const ra = all.rows.find((r) => r.item_id === a.id)!, rb = all.rows.find((r) => r.item_id === b.id)!;
    expect(ra).toMatchObject({ price_cents: 3000, price_from: "fixed", case_pack: 12, case_price_cents: 36000, available: 30, family: "ZZW Line", origin_country: "AE", hs_code: "330300",
      breaks: [{ min_qty: 6, price_cents: 3000 }, { min_qty: 24, price_cents: 2800 }] });
    expect(rb).toMatchObject({ price_cents: 1250, price_from: "rule", case_price_cents: null, available: 5 }); // $10 avg + 25 % markup

    expect((await wholesaleList(db as never, { level_id: level, q: "ZZW", category: "Perfume" })).rows.map((r) => r.item_id)).toEqual([a.id]);
    expect((await wholesaleList(db as never, { level_id: level, q: "ZZW", family_id: fam.id })).rows.map((r) => r.item_id)).toEqual([a.id]);
    await db.query(`UPDATE perfume.item_stock SET qty = 0 WHERE item_id = $1`, [b.id]);
    expect((await wholesaleList(db as never, { level_id: level, q: "ZZW", in_stock: "1" })).rows.map((r) => r.item_id)).toEqual([a.id]);
  });
});
