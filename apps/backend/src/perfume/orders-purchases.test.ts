/**
 * PERFUME-SALES-ORDERS + PURCHASE-ORDERS + PROFILES + vendor-word memory (owner 2026-11-26 19:12 CT). Real Postgres, one
 * transaction rolled back.
 */
import pg from "pg";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { addLine, createQuote, getQuote } from "./quotes.service.js";
import { getOrder, orderFromQuote, OrderInvalid, ordersOfCompany, ordersOfItem, shipAll, updateOrderLine } from "./orders.service.js";
import {
  addPurchaseLine, getPurchaseOrder, PoInvalid, purchaseOrdersFromOrder, purchaseOrdersOfItem, purchaseOrdersOfOrder, purchaseOrdersOfVendor, purchaseOrderXlsx,
  receiveAll, setPurchaseOrderStatus, updatePurchaseLine,
} from "./purchases.service.js";
import { companyActivity, itemProfile, setVendorCompany, vendorProfile } from "./profiles.service.js";
import { loadIndex, rememberVendorLinks } from "./desk.service.js";
import { matchLine } from "./matching.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("sales orders, purchase orders, profiles (real Postgres, rolled back)", () => {
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

  const item = async (name: string, upc: string) => {
    const id = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name) VALUES ('ZZO', $1, 100, 'EDP', 'M', $2, 'x', $3) RETURNING id`,
      [name, `ZZO|${name}|100|EDP|M|`, `ZZO · ${name} · 100 ml`])).rows[0].id;
    await db.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ($1, $2)`, [upc, id]);
    return id;
  };
  const vendor = async (name: string, kind: string) => (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ($1, $2) RETURNING id`, [name, kind])).rows[0].id;
  const list = async (v: string) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
     VALUES ($1, '2026-11-26', 'o.xlsx', 'xlsx', 1, 1, 0, 0, 0, true) RETURNING id`, [v])).rows[0].id;
  const row = async (l: string, n: number, x: { sku: string | null; description: string; cents: number; item: string | null; method?: string; upc?: string | null }) =>
    (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_list_rows (list_id, row_no, raw, sku, upc, description, price_cents, identity_key, loose_key, item_id, match_method, match_status)
       VALUES ($1, $2, '{}', $3, $4, $5, $6, 'x', 'x', $7, $8, $9) RETURNING id`,
      [l, n, x.sku, x.upc ?? null, x.description, x.cents, x.item, x.item ? x.method ?? "upc" : null, x.item ? "matched" : "unmatched"])).rows[0].id;

  it("quote → order → POs per cheapest vendor (their own code and words) → receive; every link both ways; history on all three", async () => {
    const co = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, role, source) VALUES ('ZZO Customer', 'customer', 'ORDERTEST') RETURNING id`)).rows[0].id;
    const night = await item("NIGHT", "8099922233441");
    const day = await item("DAY", "8099922233458");
    const vA = await vendor("ZZO Vendor A", "buy"), vB = await vendor("ZZO Vendor B", "buy"), comp = await vendor("ZZO Competitor", "sell");
    const lA = await list(vA), lB = await list(vB), lC = await list(comp);
    await row(lA, 1, { sku: "A-NIGHT", description: "ZZO NIGHT EDP 3.4OZ M", cents: 1000, item: night });
    await row(lA, 2, { sku: "A-DAY", description: "ZZO DAY EDP 3.4OZ M", cents: 2500, item: day });
    await row(lB, 1, { sku: "B-DAY", description: "DAY BY ZZO 100ML", cents: 2000, item: day });
    await row(lC, 1, { sku: "C-NIGHT", description: "ZZO NIGHT", cents: 500, item: night }); // a competitor is never bought from

    const q = await createQuote(db as never, TEST_OWNER_USER_ID, { company_id: co });
    await addLine(db as never, TEST_OWNER_USER_ID, q.id, { item_id: night, qty: 10, unit_price_cents: 1500 });
    await addLine(db as never, TEST_OWNER_USER_ID, q.id, { item_id: day, qty: 4, unit_price_cents: 3000 });
    await addLine(db as never, TEST_OWNER_USER_ID, q.id, { description: "Gift bag", qty: 1, unit_price_cents: 100 });

    const o = await orderFromQuote(db as never, TEST_OWNER_USER_ID, q.id);
    // The order ships from (and its POs arrive at) one of my own sites — goods move through the inventory ledger.
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, kind, own) VALUES ('ZOP', 'ZZ Orders site', 900, 'warehouse', true)`);
    await db.query(`UPDATE perfume.sales_orders SET location_code = 'ZOP' WHERE id = $1`, [o.id]);
    expect(o.number).toMatch(/^SO-\d{6}$/);
    expect((await orderFromQuote(db as never, TEST_OWNER_USER_ID, q.id)).id).toBe(o.id); // never two orders for one quote
    const qa = await getQuote(db as never, q.id);
    expect([qa.status, qa["order_number"]]).toEqual(["accepted", o.number]);
    expect(qa.events.map((e) => e["kind"]).slice(-2)).toEqual(["status", "ordered"]);

    const made = await purchaseOrdersFromOrder(db as never, TEST_OWNER_USER_ID, o.id);
    expect(made.skipped).toEqual([{ line_no: 3, description: "Gift bag", reason: "no item on the line" }]);
    expect(made.purchase_orders.map((p) => [p.vendor_id, p.lines]).sort()).toEqual([[vA, 1], [vB, 1]].sort());
    // Nothing twice: the order is already bought.
    expect((await purchaseOrdersFromOrder(db as never, TEST_OWNER_USER_ID, o.id)).purchase_orders).toEqual([]);
    const poA = await getPurchaseOrder(db as never, made.purchase_orders.find((p) => p.vendor_id === vA)!.id);
    const poB = await getPurchaseOrder(db as never, made.purchase_orders.find((p) => p.vendor_id === vB)!.id);
    expect(poA.lines.map((l) => [l.vendor_sku, l.description, l.qty, l.unit_cost_cents, l.upc])).toEqual([["A-NIGHT", "ZZO NIGHT EDP 3.4OZ M", 10, 1000, "8099922233441"]]);
    expect(poB.lines.map((l) => [l.vendor_sku, l.description, l.qty, l.unit_cost_cents])).toEqual([["B-DAY", "DAY BY ZZO 100ML", 4, 2000]]); // B is cheaper for DAY
    expect([poA.sales_order_number, poA.vendor_name]).toEqual([o.number, "ZZO Vendor A"]);

    // Receive: a line, then all; the PO becomes received by itself; a received PO is not cancelled.
    await updatePurchaseLine(db as never, TEST_OWNER_USER_ID, poA.lines[0]!.id, { qty_received: 4 });
    await expect(updatePurchaseLine(db as never, TEST_OWNER_USER_ID, poA.lines[0]!.id, { qty_received: 11 })).rejects.toBeInstanceOf(PoInvalid);
    await receiveAll(db as never, TEST_OWNER_USER_ID, poA.id);
    const ra = await getPurchaseOrder(db as never, poA.id);
    expect([ra.status, ra.lines[0]!.qty_received]).toEqual(["received", 10]);
    expect(ra.events.map((e) => e["kind"])).toEqual(["created", "line_added", "received", "received", "status"]);
    await expect(setPurchaseOrderStatus(db as never, TEST_OWNER_USER_ID, poA.id, "cancelled")).rejects.toBeInstanceOf(PoInvalid);
    // A typed line needs its cost; an item line takes the price given (else the vendor's own).
    await expect(addPurchaseLine(db as never, TEST_OWNER_USER_ID, poB.id, { description: "Box", qty: 1 })).rejects.toBeInstanceOf(PoInvalid);
    const hand = await addPurchaseLine(db as never, TEST_OWNER_USER_ID, poB.id, { item_id: night, qty: 2, unit_cost_cents: 1100 });
    expect(hand.unit_cost_cents).toBe(1100);

    // Ship the order; shipped comes from the lines.
    const so = await getOrder(db as never, o.id);
    await expect(updateOrderLine(db as never, TEST_OWNER_USER_ID, so.lines[0]!.id, { qty_shipped: 99 })).rejects.toBeInstanceOf(OrderInvalid);
    await receiveAll(db as never, TEST_OWNER_USER_ID, poB.id);
    await shipAll(db as never, TEST_OWNER_USER_ID, o.id);
    const shipped = await getOrder(db as never, o.id);
    expect([shipped.status, shipped["purchase_orders"]]).toEqual(["shipped", 2]);
    expect(shipped.events.map((e) => e["kind"]).filter((k) => k === "purchased")).toHaveLength(2);

    // Reverse links.
    expect((await ordersOfCompany(db as never, co)).map((x) => x["number"])).toEqual([o.number]);
    expect((await ordersOfItem(db as never, day)).map((x) => x["number"])).toEqual([o.number]);
    expect((await purchaseOrdersOfOrder(db as never, o.id))).toHaveLength(2);
    expect((await purchaseOrdersOfVendor(db as never, vB)).map((x) => x["number"])).toEqual([poB.number]);
    expect((await purchaseOrdersOfItem(db as never, night)).map((x) => x["number"]).sort()).toEqual([poA.number, poB.number].sort());

    // Excel: the vendor's code column and a formula total.
    const x = await purchaseOrderXlsx(db as never, TEST_OWNER_USER_ID, poA.id);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.buffer as never);
    const cells: string[] = []; wb.worksheets[0]!.eachRow((r) => r.eachCell((cl) => cells.push(JSON.stringify(cl.value))));
    expect(cells.join(" ")).toContain("A-NIGHT");
    expect(cells.join(" ")).toContain(`"formula":"E7*G7"`);

    // Profiles.
    await setVendorCompany(db as never, vA, co);
    const vp = await vendorProfile(db as never, vA);
    expect([vp.company?.name, vp.items, vp.lists.length, vp.po_total_cents, vp.po_open]).toEqual(["ZZO Customer", 2, 1, 10_000, 0]);
    const ip = await itemProfile(db as never, night) as Awaited<ReturnType<typeof itemProfile>> & { vendor_lines: Array<{ vendor: string; sku: string }> };
    expect(ip.vendor_lines.map((l) => [l.vendor, l.sku])).toEqual([["ZZO Vendor A", "A-NIGHT"], ["ZZO Competitor", "C-NIGHT"]]);
    expect([("best_cost_cents" in ip) && ip.best_cost_cents, ip.orders.length, ip.purchase_orders.length, ip.quotes.length]).toEqual([1000, 1, 2, 1]);
    const act = await companyActivity(db as never, co);
    expect([act.quotes.length, act.orders.length, act.vendors.length, act.ordered_cents, act.bought_cents]).toEqual([1, 1, 1, 15_000 + 12_000 + 100, 10_000]);
  });

  it("every linked line teaches its vendor's code, words and barcode — the next list from any spelling links by itself", async () => {
    const it1 = await item("ZZWORDS", "8099933344452");
    const v = await vendor("ZZO Words Vendor", "buy");
    const l = await list(v);
    await row(l, 1, { sku: "W-1", upc: "8099933344469", description: "ZZO zzwords   edp 3.4oz", cents: 900, item: it1, method: "key" });
    await row(l, 2, { sku: "W-2", description: "ZZO ZZWORDS LOOSE", cents: 900, item: it1, method: "loose_key" }); // a loose link teaches nothing
    const learned = await rememberVendorLinks(db as never, l);
    expect(learned).toEqual({ upcs: 1, codes: 1, words: 1 });
    const a = (await db.query(`SELECT sku, text_key, method FROM perfume.item_aliases WHERE vendor_id = $1 ORDER BY sku NULLS LAST`, [v])).rows;
    expect(a).toEqual([{ sku: "W-1", text_key: null, method: "import" }, { sku: null, text_key: "ZZO ZZWORDS EDP 3.4OZ", method: "import" }]);
    expect((await db.query(`SELECT item_id FROM perfume.item_upcs WHERE upc = '8099933344469'`)).rows[0]?.item_id).toBe(it1);
    // Same words, no code, no barcode → links by the remembered words.
    const ix = await loadIndex(db as never);
    expect(matchLine(ix, v, { description: "ZZO zzwords edp 3.4oz" }, { allowNewItem: false })).toMatchObject({ itemId: it1, method: "alias" });
    // Run twice: nothing new, nothing moved.
    expect(await rememberVendorLinks(db as never, l)).toEqual({ upcs: 0, codes: 0, words: 0 });
  });
});
