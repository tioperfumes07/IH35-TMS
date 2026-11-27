/**
 * PERFUME-DESK — my locations and my own lists (owner 2026-11-20 20:38 / 20:46 CT, HK inventory 11-17):
 * stock per location, $0 testers / blotters kept at $0, and my own item number makes its own item.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { buildGrid, importList, invalidateGridCache, listLocations, locationCode, prepare, qtyByLocation, saveLocation, type ImportIn } from "./desk.service.js";
import { emptyIndex, matchLine } from "./matching.js";

const body = (rows: ImportIn["rows"]): ImportIn => ({
  vendor_id: "00000000-0000-0000-0000-000000000000", list_date: "2026-11-17", file_name: "hk.xlsx", source_kind: "xlsx",
  rows_read: rows.length, file_price_total_cents: 0, rows,
});

describe("PERFUME-DESK locations", () => {
  it("location numbers read the way the owner writes them", () => {
    expect(["8", "008", "11", "229", "t1", "T1", "", "abc def"].map(locationCode)).toEqual(["008", "008", "011", "229", "T1", "T1", "", ""]);
  });
  it("stock by location: whole pieces, codes padded, blanks and zeros dropped, same code summed", () => {
    expect(qtyByLocation({ "008": "12", "11": 5, "011": "2", "019": "", "229": "0", junk: "x" })).toEqual({ "008": 12, "011": 7 });
    expect(qtyByLocation(null)).toBeNull();
    expect(qtyByLocation({ "008": "" })).toBeNull();
  });
});

describe("PERFUME-DESK my own list", () => {
  it("a cost the file prints as 0 (tester / blotter) stays $0 on my list; an empty cost stays empty; suppliers still need a price", () => {
    const rows = [
      { row_no: 2, description: "CW CORAL REEF EDT 100ML (WT)", sku: "41046", price: "0.00", qty: "36" },
      { row_no: 3, description: "BLOTTER STRIPS", sku: "99999", price: null, qty: "500" },
      { row_no: 4, description: "EROS NAJIM PARFUM 100ML (M)", sku: "109832", price: "52.51", qty: "248" },
    ];
    const own = prepare(body(rows), true);
    expect(own.saved.map((r) => r.price_cents)).toEqual([0, null, 5251]);
    expect(own.total).toBe(5251);
    const supplier = prepare(body(rows), false);
    expect(supplier.saved.map((r) => r.price_cents)).toEqual([5251]);
  });

  it("my own item number makes its own item when nothing resembles it; so does a supplier's own code; a competitor line never does", () => {
    const ix = emptyIndex();
    const line = { description: "MO TREATMENT FOR ALL HAIR TYPES GLASS BOTTLE", sku: "110758" };
    expect(matchLine(ix, "inv", line, { allowNewItem: true, ownList: true }).method).toBe("new_item");
    // Owner 2026-11-26 15:56 CT: a completely new item is created — a supplier line with its own code and nothing alike too.
    const sup = matchLine(ix, "pca", line, { allowNewItem: true });
    expect([sup.method, sup.status]).toEqual(["new_item", "matched"]);
    // A competitor's list (allowNewItem false) never creates an item.
    expect(matchLine(ix, "comp", line, { allowNewItem: false }).method).toBeNull();
    // No item number → never a new item, even on my own list.
    expect(matchLine(ix, "inv", { description: "MO TREATMENT FOR ALL HAIR TYPES GLASS BOTTLE" }, { allowNewItem: true, ownList: true }).method).toBeNull();
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("my inventory by location on the desk (real Postgres, rolled back)", () => {
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

  it("the register holds the owner's numbers and names; a rename keeps the number", async () => {
    const before = await listLocations(db as never);
    expect(before.filter((l) => ["008", "011", "231"].includes(l.code)).map((l) => [l.code, l.name])).toEqual([
      ["008", "Perfume Bodega Laredo"], ["011", "Laredo"], ["231", "New Orleans"]]);
    const r = await saveLocation(db as never, TEST_OWNER_USER_ID, { code: "2", name: "Main office" });
    expect([r.code, r.name]).toEqual(["002", "Main office"]);
    await expect(saveLocation(db as never, TEST_OWNER_USER_ID, { code: "bad code!", name: "x" })).rejects.toThrow("location_code_invalid");
  });

  it("stock per location sums every line of the bottle, shows one column per location, and a $0 tester keeps $0", async () => {
    const inv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZLOC MY STOCK', 'inventory') RETURNING id`)).rows[0].id;
    const a = { upc: "8000000997013", brand: "ZZLOC", description: "ZZLOC ALPHA EDP 100ML (M)" };
    const t = { upc: "8000000997020", brand: "ZZLOC", description: "ZZLOC BETA EDT 100ML (WT)" };
    const res = await importList(db as never, TEST_OWNER_USER_ID, {
      vendor_id: inv, list_date: "2026-11-17", file_name: "hk.xlsx", label: "HK 11-17", source_kind: "xlsx", rows_read: 3, file_price_total_cents: 4000 + 4200, save_as_new: true,
      rows: [
        { ...a, row_no: 2, sku: "1001", price: "40.00", qty: "10", qty_by_location: { "008": "7", "11": "3" } },
        { ...a, row_no: 3, sku: "1002", price: "42.00", qty: "5", qty_by_location: { "008": "5" } },
        { ...t, row_no: 4, sku: "1003", price: "0", qty: "36", qty_by_location: { "229": "36" } },
      ],
    });
    expect([res.check.rows_saved, res.check.totals_match]).toEqual([3, true]);
    const ids = Object.fromEntries((await db.query<{ upc: string; item_id: string }>(`SELECT upc, item_id FROM perfume.item_upcs WHERE upc IN ('8000000997013','8000000997020')`)).rows.map((x) => [x.upc, x.item_id]));
    invalidateGridCache();
    const g = await buildGrid(db as never);
    const ra = g.rows.find((r) => r.id === ids["8000000997013"])!;
    const rt = g.rows.find((r) => r.id === ids["8000000997020"])!;
    expect([ra.my_qty, ra["loc:008"], ra["loc:011"]]).toEqual([15, 12, 3]);
    expect([rt.my_qty, rt["loc:229"], rt.my_last_cost]).toEqual([36, 36, 0]);
    const labels = g.cols.filter((c) => c.key.startsWith("loc:")).map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(["Qty 008 · Perfume Bodega Laredo", "Qty 011 · Laredo", "Qty 229 · Calexico"]));
    // Owner 2026-11-27 15:40 / 15:42 CT: the Mine group opens with last purchase date, qty purchased, qty sold, then the Laredo
    // warehouse (008), the all-sites total, the other sites, then avg cost and last cost.
    const mine = g.cols.filter((c) => c.group === "Mine").map((c) => c.key);
    expect(mine.slice(0, 5)).toEqual(["my_purchase_date", "my_qty_purchased", "my_qty_sold", "loc:008", "my_qty"]);
    expect(mine.indexOf("my_avg_cost")).toBeGreaterThan(mine.indexOf("loc:229"));
    expect(mine.indexOf("my_last_cost")).toBe(mine.indexOf("my_avg_cost") + 1);
  });
});

describe("PERFUME-DESK money is never rounded unless the owner asks (owner 2026-11-20 21:45 CT)", () => {
  it("the default rule is exact to the cent; a closed-number rule still works when chosen", async () => {
    const { closeCents } = await import("./pricing.js");
    const { DEFAULT_RULES, analysisFields } = await import("./desk.service.js");
    expect(DEFAULT_RULES.round_step).toBe("1");
    expect(closeCents(2717, "1", "up")).toBe(2717);
    expect(closeCents(2717.4, "1", "up")).toBe(2717);
    expect(closeCents(2717, "50", "up")).toBe(2750);
    // List analysis · Sales: my average cost with its own margin and markup, next to the last cost.
    const f = analysisFields({ upc: null, sku: null, brand: null, name: null, size: null, type: null, gender: null, purchDate: null, qtyPurch: null,
      cost: 5251, avgCost: 5000, sold: null, invQty: 248, offer: 6000, comp: null, lowVendor: null, lowPrice: null, minMargin: 10, myDesc: null });
    expect([f["a:last_cost"], f["a:avg_cost"], f["a:margin"], f["a:margin_avg"], f["a:markup_avg"]]).toEqual([5251, 5000, 12.5, 16.7, 20]);
    // No competitor price → nothing to match.
    expect(f["a:match_price"]).toBeNull();
  });
  it("match the competitor: their price − $0.25, the change, and my margin / profit there on last and average cost (exact cents)", async () => {
    const { matchFields } = await import("./desk.service.js");
    // Esperanza $29.99 → match $29.74; my price $46.00 → lower $16.26; avg cost $40.00 → −$10.26 (below cost), last $27.37.
    expect(matchFields(4600, 2999, 2737, 4000, 25)).toEqual({
      "a:match_price": 2974, "a:match_change": -1626,
      "a:match_margin": 8, "a:match_profit": 237,
      "a:match_margin_avg": -34.5, "a:match_profit_avg": -1026,
    });
    // I am cheaper: raise to their price − 0.25.
    expect(matchFields(1750, 2000, 1465, 1465, 25)["a:match_change"]).toBe(225);
  });
});

describeIntegration("HK tester codes never ride onto the regular bottle (real Postgres, rolled back)", () => {
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
  it("(MT) is its own tester item; the regular bottle keeps its real cost; a SKU first linked wrong is corrected on the next import", async () => {
    const inv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZHK MY STOCK', 'inventory') RETURNING id`)).rows[0].id;
    const reg = { row_no: 2, upc: "8000000996016", sku: "82891", description: "ZZOBSESSION MEN EDT 125ML (M)", price: "13.87", qty: "323" };
    const tst = { row_no: 3, sku: "82473", description: "ZZOBSESSION MEN EDT 125ML (MT)", price: "0.01", qty: "43" };
    // Simulate the old wrong link: the tester's SKU already aliased to the regular bottle.
    const first = await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: inv, list_date: "2026-11-17", file_name: "hk.xlsx", source_kind: "xlsx", rows_read: 1, file_price_total_cents: 1387, save_as_new: true, rows: [reg] });
    const regItem = (await db.query<{ item_id: string }>(`SELECT item_id FROM perfume.price_list_rows WHERE list_id = $1`, [first.list_id])).rows[0].item_id;
    await db.query(`INSERT INTO perfume.item_aliases (item_id, vendor_id, sku, method) VALUES ($1, $2, '82473', 'import')`, [regItem, inv]);
    const second = await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: inv, list_date: "2026-11-17", file_name: "hk2.xlsx", source_kind: "xlsx", rows_read: 2, file_price_total_cents: 1388, save_as_new: true, rows: [reg, tst] });
    const rows = (await db.query<{ sku: string; item_id: string; flags: string[] }>(
      `SELECT r.sku, r.item_id, i.flags FROM perfume.price_list_rows r JOIN perfume.items i ON i.id = r.item_id WHERE r.list_id = $1 ORDER BY r.row_no`, [second.list_id])).rows;
    expect(rows[0].item_id).toBe(regItem);
    expect(rows[1].item_id).not.toBe(regItem);
    expect(rows[1].flags).toContain("TESTER");
    const alias = (await db.query<{ item_id: string }>(`SELECT item_id FROM perfume.item_aliases WHERE vendor_id = $1 AND sku = '82473'`, [inv])).rows[0];
    expect(alias.item_id).toBe(rows[1].item_id);
    invalidateGridCache();
    const g = await buildGrid(db as never);
    expect(g.rows.find((r) => r.id === regItem)?.my_last_cost).toBe(1387);
    expect(g.rows.find((r) => r.id === regItem)?.my_qty).toBe(323);
  });
});
