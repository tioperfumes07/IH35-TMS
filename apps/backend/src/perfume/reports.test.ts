/**
 * PERFUME inquiry + reports (LEAD ROUND L.20 items 2, 4, 5, 6): Items inquiry card, Inventory status, Price book, Product family report.
 * Real Postgres, one transaction rolled back; test rows only (ZZR…), never prod data.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createItem, updateItemFile } from "./items.service.js";
import { createFamily } from "./families.service.js";
import { stockIn } from "./inventory.service.js";
import { listLevels, setLevelItem } from "./accounts.service.js";
import { familyReport, inventoryStatus, itemInquiry, priceBook, reportFilter, tierQuery, vendorPriceTiers } from "./reports.service.js";

const U = TEST_OWNER_USER_ID;
const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("perfume inquiry + reports (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, kind, own) VALUES ('ZRA', 'ZZ Reports A', 901, 'warehouse', true), ('ZRB', 'ZZ Reports B', 902, 'warehouse', true)`);
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });
  const f = (x: Record<string, unknown>) => reportFilter.parse(x);

  it("item card, inventory status, price book and family report read the same stock and prices", async () => {
    const fam = await createFamily(db as never, U, { name: "ZZR Family One", brand: "ZZR" });
    const a = (await createItem(db as never, U, { brand: "ZZR", name: "ALPHA", size_ml: 100, conc: "EDP", gender: "M", tio_code: "ZZR-001", pos_code: "ZR1",
      family_id: fam.id, special_price_cents: 3000, min_price_cents: 2500 })).id;
    const b = (await createItem(db as never, U, { brand: "ZZR", name: "BRAVO", size_ml: 50, conc: "EDT", gender: "W", tio_code: "ZZR-002", family_id: fam.id })).id;
    const z0 = (await createItem(db as never, U, { brand: "ZZR", name: "ZERO", size_ml: 30, tio_code: "ZZR-003" })).id;
    await db.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ('99999000017', $1)`, [a]);
    await stockIn(db as never, U, { kind: "receipt", item_id: a, location_code: "ZRA", qty: 4, unit_cost_cents: 1000, source: "receipt" });
    await stockIn(db as never, U, { kind: "receipt", item_id: a, location_code: "ZRB", qty: 6, unit_cost_cents: 1500, source: "receipt" });
    await stockIn(db as never, U, { kind: "opening", item_id: b, location_code: "ZRA", qty: 2, unit_cost_cents: 800, source: "opening" });
    const retail = (await listLevels(db as never)).find((l) => l.name === "Retail")!;
    await setLevelItem(db as never, U, retail.id, a, 1, 4999);

    // Items inquiry: codes left, prices and stock right.
    const card = await itemInquiry(db as never, a) as Exclude<Awaited<ReturnType<typeof itemInquiry>>, { merged_into_id: string }>;
    expect(card.codes).toEqual({ tio_code: "ZZR-001", pos_code: "ZR1", upcs: ["99999000017"], hk_codes: [] });
    expect(card.prices.find((p) => p.level === "Retail")).toMatchObject({ price_cents: 4999, how: "fixed" });
    expect(card).toMatchObject({ special_price_cents: 3000, min_price_cents: 2500, on_hand: 10, inventory_value_cents: 13000, avg_cost_cents: 1300,
      avg_cost_source: "stock", last_cost_cents: 1500, last_cost_source: "last_receipt" });
    expect(card.last_receipt_at).toBeTruthy();
    expect(card.stock.map((s) => [s.location_code, s.qty, s.value_cents])).toEqual([["ZRA", 4, 4000], ["ZRB", 6, 9000]]);

    // Inventory status: zero on hand left out unless asked; code range; totals.
    const st = await inventoryStatus(db as never, f({ code_from: "ZZR-001", code_to: "ZZR-003" }));
    expect(st.rows.map((r) => [r.tio_code, r.on_hand, r.value_cents])).toEqual([["ZZR-001", 10, 13000], ["ZZR-002", 2, 1600]]);
    expect(st.total).toEqual({ items: 2, on_hand: 12, value_cents: 14600 });
    expect((await inventoryStatus(db as never, f({ code_from: "ZZR-001", code_to: "ZZR-003", zero: "Y" }))).rows.map((r) => r.tio_code)).toEqual(["ZZR-001", "ZZR-002", "ZZR-003"]);
    expect((await inventoryStatus(db as never, f({ family_id: fam.id }))).total.items).toBe(2);
    // An inactive item is left out unless active_only = N.
    await updateItemFile(db as never, U, b, { is_active: false });
    expect((await inventoryStatus(db as never, f({ family_id: fam.id }))).total.items).toBe(1);
    expect((await inventoryStatus(db as never, f({ family_id: fam.id, active_only: "N" }))).total.items).toBe(2);

    // Price book at Retail: the level's own price per item (the order line's rule).
    const pb = await priceBook(db as never, { ...f({ code_from: "ZZR-001", code_to: "ZZR-003", zero: "Y" }), level_id: retail.id });
    expect(pb.level.name).toBe("Retail");
    expect(pb.rows.map((r) => [r.tio_code, r.price_cents, r.special_price_cents, r.min_price_cents, r.upc])).toEqual([["ZZR-001", 4999, 3000, 2500, "99999000017"], ["ZZR-003", null, null, null, null]]);
    expect(pb.total).toEqual({ items: 2, priced: 1 });
    await expect(priceBook(db as never, { ...f({}), level_id: "00000000-0000-4000-8000-000000000009" })).rejects.toThrow(/active price level/);

    // Product family report.
    const fr = await familyReport(db as never, { active_only: false });
    expect(fr.rows.find((r) => r.family_id === fam.id)).toMatchObject({ family: "ZZR Family One", brand: "ZZR", items: 2, items_on_hand: 2, on_hand: 12, value_cents: 14600 });
    expect(fr.rows.at(-1)!.family).toBe("(no family)");
    void z0;
  });
  it("vendor price tiers: on items in common, the vendor's median price ratio sets Low / Medium / High", async () => {
    const vend = async (name: string) => (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind, roles) VALUES ($1, 'buy', '{purchase}') RETURNING id`, [name])).rows[0].id;
    const cheap = await vend("ZZT Cheap Dist"), mid1 = await vend("ZZT Mid One"), mid2 = await vend("ZZT Mid Two"), dear = await vend("ZZT Dear Wholesale");
    const its: string[] = [];
    for (let k = 0; k < 3; k++) {
      its.push((await db.query<{ id: string }>(`INSERT INTO perfume.items (brand, name, size_ml, identity_key, loose_key, display_name) VALUES ('ZZT', $1, 100, $2, 'x', $1) RETURNING id`,
        [`ZZT ITEM ${k}`, `ZZT|ITEM${k}|100`])).rows[0].id);
    }
    const prices: Record<string, number> = { [cheap]: 900, [mid1]: 1000, [mid2]: 1000, [dear]: 1200 };
    for (const [v, cents] of Object.entries(prices)) {
      const l = (await db.query<{ id: string }>(
        `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
         VALUES ($1, current_date, 't.xlsx', 'xlsx', 3, 3, 0, 0, 0, true) RETURNING id`, [v])).rows[0].id;
      let n = 0;
      for (const it of its) await db.query(`INSERT INTO perfume.price_list_rows (list_id, row_no, raw, description, price_cents, identity_key, loose_key, item_id, match_method, match_status)
        VALUES ($1, $2, '{}', 'ZZT', $3, 'x', 'x', $4, 'key', 'matched')`, [l, ++n, cents, it]);
    }
    const r = await vendorPriceTiers(db as never, tierQuery.parse({ min_items: 3 }));
    const mine = new Map(r.rows.filter((x) => x.vendor.startsWith("ZZT ")).map((x) => [x.vendor, x]));
    // Median of 900 / 1000 / 1000 / 1200 = 1000.
    expect(mine.get("ZZT Cheap Dist")).toMatchObject({ items_compared: 3, index_pct: 90, cheapest_pct: 100, tier: "Low" });
    expect(mine.get("ZZT Mid One")).toMatchObject({ index_pct: 100, tier: "Medium" });
    expect(mine.get("ZZT Dear Wholesale")).toMatchObject({ index_pct: 120, priciest_pct: 100, tier: "High" });
    expect((await vendorPriceTiers(db as never, tierQuery.parse({ min_items: 4 }))).rows.find((x) => x.vendor === "ZZT Cheap Dist")!.tier).toBe("Too few items");
  });
});
