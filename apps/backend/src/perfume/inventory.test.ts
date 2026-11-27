/**
 * PERFUME-INVENTORY (owner 2026-11-26 20:21 / 20:28 CT): FIFO lots + moving average, receive into a site, ship FIFO, never
 * below zero, transfers at the same cost, counts over $500 posted by a second person, returns both ways, opening stock from
 * the owner's inventory file in one set-based pass. Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import {
  addTransferLine, createCount, createTransfer, getCount, InvInvalid, itemLots, listMoves, openingApply, openingPreview, postCount, receiveTransfer, setCountLine,
  shipTransfer, stockOnHand, stockOut, submitCount,
} from "./inventory.service.js";
import { addPurchaseLine, createPurchaseOrder, getPurchaseOrder, PoInvalid, receivePurchase, updatePurchaseLine } from "./purchases.service.js";
import { addOrderLine, createOrder, getOrder, OrderInvalid, shipOrder, updateOrderLine } from "./orders.service.js";

const SECOND = "a0000000-0000-4000-8000-00000000c0de";
const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("ScentsX inventory ledger (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1, 'second.person@test.invalid', 'Dispatcher', 'en') ON CONFLICT (id) DO NOTHING`, [SECOND]);
    for (const [code, name] of [["ZW1", "ZZ Warehouse"], ["ZS1", "ZZ Store"]]) {
      await db.query(`INSERT INTO perfume.locations (code, name, sort_order, kind, own) VALUES ($1, $2, 900, $3, true)`, [code, name, code === "ZW1" ? "warehouse" : "store"]);
    }
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });
  const item = async (name: string) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name) VALUES ('ZZI', $1, 100, 'EDP', 'M', $2, 'x', $3) RETURNING id`,
    [name, `ZZI|${name}|100|EDP|M|`, `ZZI · ${name} · 100 ml`])).rows[0].id;
  const qtyAt = async (it: string, loc: string) => (await stockOnHand(db as never, { item_id: it, location: loc }))[0]?.qty ?? 0;

  it("receive two costs → FIFO lots + moving average; ship takes the oldest; never below zero; returns both ways", async () => {
    const it = await item("FIFO");
    const v = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZI Vendor', 'buy') RETURNING id`)).rows[0].id;
    const po = await createPurchaseOrder(db as never, TEST_OWNER_USER_ID, { vendor_id: v, location_code: "ZW1", terms: null, notes: null });
    const a = await addPurchaseLine(db as never, TEST_OWNER_USER_ID, po.id, { item_id: it, qty: 10, unit_cost_cents: 1000, description: null, upc: null, vendor_sku: null });
    const b = await addPurchaseLine(db as never, TEST_OWNER_USER_ID, po.id, { item_id: it, qty: 10, unit_cost_cents: 1300, description: null, upc: null, vendor_sku: null });
    await receivePurchase(db as never, TEST_OWNER_USER_ID, po.id, { lines: [{ line_id: a.id, qty: 10, lot_code: "L-A" }] });
    await receivePurchase(db as never, TEST_OWNER_USER_ID, po.id, { lines: [{ line_id: b.id, qty: 10, lot_code: "L-B" }] });
    const s = (await stockOnHand(db as never, { item_id: it }))[0]!;
    expect([s.qty, Number(s.avg_cost_cents), Number(s.fifo_value_cents)]).toEqual([20, 1150, 23000]);
    expect((await getPurchaseOrder(db as never, po.id)).status).toBe("received");
    await expect(receivePurchase(db as never, TEST_OWNER_USER_ID, po.id)).rejects.toBeInstanceOf(PoInvalid);

    // Ship 12: 10 from L-A at $10, 2 from L-B at $13 → cost $126; the average stays $11.50.
    const so = await createOrder(db as never, TEST_OWNER_USER_ID, { customer_name: "ZZ Buyer", location_code: "ZW1" } as never);
    const sl = await addOrderLine(db as never, TEST_OWNER_USER_ID, so.id, { item_id: it, qty: 12, unit_price_cents: 2000 });
    const shipped = await shipOrder(db as never, TEST_OWNER_USER_ID, so.id);
    expect(shipped.cost_cents).toBe(12600);
    const after = (await stockOnHand(db as never, { item_id: it }))[0]!;
    expect([after.qty, Number(after.avg_cost_cents), Number(after.fifo_value_cents)]).toEqual([8, 1150, 10400]);
    expect((await getOrder(db as never, so.id)).status).toBe("shipped");
    // Never below zero.
    await expect(stockOut(db as never, TEST_OWNER_USER_ID, { kind: "shipment", item_id: it, location_code: "ZW1", qty: 9 })).rejects.toBeInstanceOf(InvInvalid);
    // Customer sends 2 back at the cost they left at ($126 / 12 = $10.50).
    await updateOrderLine(db as never, TEST_OWNER_USER_ID, sl.id, { qty_shipped: 10 });
    expect(await qtyAt(it, "ZW1")).toBe(10);
    const ret = (await listMoves(db as never, { item_id: it, kind: "return" }))[0]!;
    expect([ret.qty, Number(ret.unit_cost_cents)]).toEqual([2, 1050]);
    // 3 go back to the vendor out of line B's own lot.
    await updatePurchaseLine(db as never, TEST_OWNER_USER_ID, b.id, { qty_received: 7 });
    expect(await qtyAt(it, "ZW1")).toBe(7);
    expect((await getPurchaseOrder(db as never, po.id)).status).toBe("open");
    // Every lot keeps its vendor and PO.
    const lots = await itemLots(db as never, it);
    expect(lots.filter((l) => l.lot_code === "L-B")[0]).toMatchObject({ vendor: "ZZI Vendor", po_number: po.number, qty_left: 5 });
    // A ship with no site picked is refused, not guessed.
    const so2 = await createOrder(db as never, TEST_OWNER_USER_ID, { customer_name: "ZZ Buyer 2" } as never);
    await addOrderLine(db as never, TEST_OWNER_USER_ID, so2.id, { item_id: it, qty: 1, unit_price_cents: 2000 });
    await expect(shipOrder(db as never, TEST_OWNER_USER_ID, so2.id)).rejects.toBeInstanceOf(OrderInvalid);
  });

  it("transfer: out FIFO, through In transit, in at the same cost and lot code", async () => {
    const it = await item("MOVE");
    const v = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZI Vendor 2', 'buy') RETURNING id`)).rows[0].id;
    const po = await createPurchaseOrder(db as never, TEST_OWNER_USER_ID, { vendor_id: v, location_code: "ZW1", terms: null, notes: null });
    const l = await addPurchaseLine(db as never, TEST_OWNER_USER_ID, po.id, { item_id: it, qty: 6, unit_cost_cents: 800, description: null, upc: null, vendor_sku: null });
    await receivePurchase(db as never, TEST_OWNER_USER_ID, po.id, { lines: [{ line_id: l.id, qty: 6, lot_code: "MV-1" }] });
    const t = await createTransfer(db as never, TEST_OWNER_USER_ID, { from_code: "ZW1", to_code: "ZS1" });
    await addTransferLine(db as never, t.id, it, 4);
    await shipTransfer(db as never, TEST_OWNER_USER_ID, t.id);
    expect([await qtyAt(it, "ZW1"), await qtyAt(it, "TRANSIT"), await qtyAt(it, "ZS1")]).toEqual([2, 4, 0]);
    await receiveTransfer(db as never, TEST_OWNER_USER_ID, t.id);
    expect([await qtyAt(it, "ZW1"), await qtyAt(it, "TRANSIT"), await qtyAt(it, "ZS1")]).toEqual([2, 0, 4]);
    const store = (await stockOnHand(db as never, { item_id: it, location: "ZS1" }))[0]!;
    expect(Number(store.avg_cost_cents)).toBe(800);
    expect((await itemLots(db as never, it)).find((x) => x.location_code === "ZS1")?.lot_code).toBe("MV-1");
  });

  it("count: a difference over $500 is posted only by a second person; a loss leaves FIFO, a gain comes in at the average", async () => {
    const it = await item("COUNT");
    const v = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZI Vendor 3', 'buy') RETURNING id`)).rows[0].id;
    const po = await createPurchaseOrder(db as never, TEST_OWNER_USER_ID, { vendor_id: v, location_code: "ZW1", terms: null, notes: null });
    const l = await addPurchaseLine(db as never, TEST_OWNER_USER_ID, po.id, { item_id: it, qty: 100, unit_cost_cents: 1000, description: null, upc: null, vendor_sku: null });
    await receivePurchase(db as never, TEST_OWNER_USER_ID, po.id);
    const k = await createCount(db as never, TEST_OWNER_USER_ID, "ZW1");
    await setCountLine(db as never, k.id, it, 40); // 60 missing × $10 = $600
    const sub = await submitCount(db as never, TEST_OWNER_USER_ID, k.id);
    expect([sub.diff_value_cents, sub.needs_second_person]).toEqual([-60000, true]);
    await expect(postCount(db as never, TEST_OWNER_USER_ID, k.id)).rejects.toBeInstanceOf(InvInvalid);
    await postCount(db as never, SECOND, k.id);
    expect(await qtyAt(it, "ZW1")).toBe(40);
    expect((await getCount(db as never, k.id)).status).toBe("posted");
    // A small gain: the same person may post it; it comes in at the average ($10).
    const k2 = await createCount(db as never, TEST_OWNER_USER_ID, "ZW1");
    await setCountLine(db as never, k2.id, it, 42);
    await submitCount(db as never, TEST_OWNER_USER_ID, k2.id);
    await postCount(db as never, TEST_OWNER_USER_ID, k2.id);
    const gain = (await listMoves(db as never, { item_id: it, kind: "count" })).find((m) => m.qty > 0)!;
    expect([gain.qty, Number(gain.unit_cost_cents)]).toEqual([2, 1000]);
  });

  it("opening stock from my inventory file: preview, then one set-based apply; refused once anything has moved", async () => {
    // A fresh ledger for this check: the earlier tests' moves are rolled back with the transaction, so measure in a savepoint.
    await db.query("SAVEPOINT open1");
    await db.query("DELETE FROM perfume.stock_moves"); await db.query("DELETE FROM perfume.inventory_lots"); await db.query("DELETE FROM perfume.item_stock");
    const it = await item("OPEN");
    const inv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZI My inventory', 'inventory') RETURNING id`)).rows[0].id;
    const list = (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
       VALUES ($1, '2026-11-26', 'inv.xlsx', 'xlsx', 2, 2, 0, 0, 0, true) RETURNING id`, [inv])).rows[0].id;
    await db.query(`INSERT INTO perfume.price_list_rows (list_id, row_no, raw, description, price_cents, identity_key, loose_key, item_id, match_method, match_status, qty_by_location)
      VALUES ($1, 1, '{}', 'ZZI OPEN', 1500, 'x', 'x', $2, 'key', 'matched', '{"ZW1": 7, "ZS1": 3, "NOPE": 9}')`, [list, it]);
    const pv = await openingPreview(db as never);
    expect(pv.by_site.filter((s) => s.code === "ZW1" || s.code === "ZS1")).toEqual([{ code: "ZS1", units: 3, value: 4500, lines: 1 }, { code: "ZW1", units: 7, value: 10500, lines: 1 }]);
    const ap = await openingApply(db as never, TEST_OWNER_USER_ID, "2026-11-30");
    expect(ap.units).toBeGreaterThanOrEqual(10);
    expect([await qtyAt(it, "ZW1"), await qtyAt(it, "ZS1")]).toEqual([7, 3]);
    const m = (await listMoves(db as never, { item_id: it }))[0]!;
    expect(Number(m.avg_cost_after_cents)).toBe(1500);
    await expect(openingApply(db as never, TEST_OWNER_USER_ID, "2026-11-30")).rejects.toBeInstanceOf(InvInvalid);
    await db.query("ROLLBACK TO SAVEPOINT open1");
  });
});
