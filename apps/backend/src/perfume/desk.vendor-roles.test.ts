/**
 * PERFUME-DESK vendor roles (owner 2026-11-23 12:32 CT): "in analysis or the wholesale vs competition i need to have
 * wholesalers — Esperanza, Broadway, Omni — not PCA and those, those are vendors, and they are for trading and for
 * purchasing … categorize vendors … and have toggle buttons … I also just need an analysis of Broadway."
 * Unit: the role ↔ kind rules, the wholesaler picker (compBestOf, reanalyseLine, getOrBuildView comps).
 * Integration (real Postgres, rolled back): roles saved and read; each tab reads only its vendors.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import {
  analysisFields, buildGrid, compBestOf, DEFAULT_RULES, getOrBuildView, importList, invalidateGridCache, kindOfRoles, reanalyseLine, rolesOfKind, upsertVendor,
  type GridRow, type VendorRow,
} from "./desk.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describe("vendor roles ↔ kind", () => {
  it("a supplier feeds Purchase and Trading; a competitor feeds Wholesale; my own lists feed none", () => {
    expect(rolesOfKind("buy")).toEqual(["purchase", "trading"]);
    expect(rolesOfKind("both")).toEqual(["purchase", "trading"]);
    expect(rolesOfKind("sell")).toEqual(["wholesale"]);
    expect(rolesOfKind("offer")).toEqual([]);
    expect(rolesOfKind("inventory")).toEqual([]);
  });
  it("the kind follows the roles (a wholesale-only list never creates items on import)", () => {
    expect(kindOfRoles(["wholesale"], "buy")).toBe("sell");
    expect(kindOfRoles(["wholesale", "trading"], "sell")).toBe("both");
    expect(kindOfRoles(["purchase"], "sell")).toBe("buy");
    expect(kindOfRoles([], "offer")).toBe("offer");
  });
  // Owner 2026-11-25 23:41 CT: "I'll tag or categorize vendors as vendors only trading distributors and customer as well".
  it("Distributor and Customer are the owner's tags only: they never change the kind (no tab, no import rule)", () => {
    expect(kindOfRoles(["purchase", "customer"], "buy")).toBe("buy");
    expect(kindOfRoles(["distributor", "customer"], "buy")).toBe("buy");
    expect(kindOfRoles(["wholesale", "customer"], "sell")).toBe("sell");
    expect(kindOfRoles(["wholesale", "distributor", "trading"], "sell")).toBe("both");
  });
});

describe("wholesaler picker", () => {
  const item: GridRow = {
    id: "i1",
    "s:esp:price": 3000, "s:esp:cushion": 50, "s:esp:real": 2950, "s:esp:desc": "ESP LINE",
    "s:bw:price": 3300, "s:bw:cushion": 100, "s:bw:real": 3200, "s:bw:desc": "BW LINE",
  };
  const label = (id: string) => ({ esp: "ESPERANZA", bw: "BROADWAY" } as Record<string, string>)[id] ?? id;
  it("the cheapest real price among only the picked wholesalers", () => {
    expect(compBestOf(item, new Set(["esp", "bw"]), label)?.vendor).toBe("ESPERANZA");
    const bw = compBestOf(item, new Set(["bw"]), label)!;
    expect([bw.vendor, bw.list, bw.cushion, bw.real, bw.desc]).toEqual(["BROADWAY", 3300, 100, 3200, "BW LINE"]);
    expect(compBestOf(item, new Set(["omni"]), label)).toBeNull();
  });
  it("a line of my list re-measured against Broadway only: competitor price, match price, change — exact cents", () => {
    const line: GridRow = {
      id: "m:1", item_id: "i1", item_gender: "M",
      ...analysisFields({ upc: null, sku: "S1", brand: "B", name: "MY LINE", size: 100, type: "EDT", gender: "M", purchDate: null, qtyPurch: null,
        cost: 2500, avgCost: 2600, sold: null, invQty: 10, offer: 3100, comp: compBestOf(item, new Set(["esp", "bw"]), label), lowVendor: null, lowPrice: null,
        minMargin: 15, matchUnder: 0, myDesc: "MY LINE" }),
      matched: 1,
    };
    expect(line["a:esp"]).toBe(2950);
    const r = reanalyseLine(line, compBestOf(item, new Set(["bw"]), label), 15, 0);
    expect(r["a:esp"]).toBe(3200);
    expect(r["a:c_vendor"]).toBe("BROADWAY");
    expect(r["a:match_price"]).toBe(3200);
    expect(r["a:match_change"]).toBe(100);
    expect(r["a:match_profit_avg"]).toBe(600);
    expect(r["a:offer"]).toBe(3100);
    expect(r.matched).toBe(1);
    const none = reanalyseLine(line, null, 15, 0);
    expect(none["a:esp"]).toBeNull();
    expect(none.matched).toBe(0);
  });
  it("getOrBuildView: Broadway picked → their lines only Broadway's, my lines re-measured, wholesale items only those Broadway carries", () => {
    const v = (id: string, roles: VendorRow["roles"]): VendorRow => ({ id, name: id, short_name: id.toUpperCase(), kind: "sell", roles, cushion_lo_cents: null, cushion_hi_cents: null,
      freight_lo_cents: null, freight_hi_cents: null, earn_pct: null, sells_by_box: false, contact: null, column_mapping: {} });
    const myLine = reanalyseLine({ id: "m:1", item_id: "i1", item_gender: "M", "a:offer": 3100, "a:last_cost": 2500 }, compBestOf(item, new Set(["esp"]), label), 15, 0);
    const g = {
      cols: [], rules: DEFAULT_RULES, target_pct: 12, earn_pct: 16, _vk: `roles-test-${Date.now()}`, minMargin: 15,
      vendors: [v("esp", ["wholesale"]), v("bw", ["wholesale"]), v("pca", ["purchase", "trading"])],
      rows: [{ ...item, in_offer: 1, my_offer_price: 3100, low_sell: 3000, landed_likely: 2000 }, { id: "i2", in_offer: 1, my_offer_price: 1000, low_sell: 1200, landed_likely: 900, "s:esp:price": 1200 }],
      myLines: [myLine],
      theirLines: [{ id: "c:1", c_vendor_id: "esp", matched: 1 }, { id: "c:2", c_vendor_id: "bw", matched: 1 }],
    };
    const mine = getOrBuildView(g as never, "analysis", undefined, undefined, "asc", "mine", "all", ["bw"]).sorted;
    expect(mine[0]!["a:esp"]).toBe(3200);
    expect(mine[0]!["a:c_vendor"]).toBe("BW");
    expect(getOrBuildView(g as never, "analysis", undefined, undefined, "asc", "theirs", "all", ["bw"]).sorted.map((r) => r.id)).toEqual(["c:2"]);
    expect(getOrBuildView(g as never, "wholesale", undefined, undefined, "asc", "mine", "all", ["bw"]).sorted.map((r) => r.id)).toEqual(["i1"]);
    // A supplier id, or every wholesaler picked, is the same as no pick.
    expect(getOrBuildView(g as never, "wholesale", undefined, undefined, "asc", "mine", "all", ["pca"]).sorted.map((r) => r.id)).toEqual(["i1", "i2"]);
    expect(getOrBuildView(g as never, "analysis", undefined, undefined, "asc", "mine", "all", ["esp", "bw"]).sorted[0]!["a:esp"]).toBe(2950);
  });
});

describeIntegration("vendor roles feed only their tabs (real Postgres, rolled back)", () => {
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

  it("roles save, kind follows; a supplier never shows in Wholesale, a wholesaler never in Purchase or Trading", async () => {
    const sup = await upsertVendor(db as never, TEST_OWNER_USER_ID, { name: "ROLES TEST SUP", kind: "buy", short_name: "RTS" });
    expect(sup.roles).toEqual(["purchase", "trading"]);
    const wh = await upsertVendor(db as never, TEST_OWNER_USER_ID, { name: "ROLES TEST WHOLESALER", kind: "buy", roles: ["wholesale"], short_name: "RTW" });
    expect([wh.kind, wh.roles]).toEqual(["sell", ["wholesale"]]);
    const tradeOnly = await upsertVendor(db as never, TEST_OWNER_USER_ID, { ...sup, earn_pct: null, roles: ["trading"] });
    expect([tradeOnly.kind, tradeOnly.roles]).toEqual(["buy", ["trading"]]);
    const line = (price: number) => ({ row_no: 1, upc: "8100000000929", description: "ROLESTEST AQUA EDT 100ML (M)", brand: "ROLESTEST", price: (price / 100).toFixed(2) });
    for (const [vid, price] of [[sup.id, 2000], [wh.id, 3000]] as const) {
      await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: vid, list_date: "2026-11-23", file_name: `${vid}.xlsx`, source_kind: "xlsx", rows_read: 1, file_price_total_cents: price, rows: [line(price)] } as never);
    }
    invalidateGridCache();
    const g = await buildGrid(db as never, {});
    const keys = g.cols.map((c) => c.key);
    expect(keys).not.toContain(`v:${sup.id}:price`);
    expect(keys).toContain(`t:${sup.id}:list`);
    expect(keys).not.toContain(`s:${sup.id}:price`);
    expect(keys).toContain(`s:${wh.id}:price`);
    expect(keys).not.toContain(`v:${wh.id}:price`);
    expect(keys).not.toContain(`t:${wh.id}:list`);
  });
});
