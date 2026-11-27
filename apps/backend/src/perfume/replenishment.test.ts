/**
 * PERFUME replenishment (owner 2026-11-27 08:10 CT): items at or below their min at a site — counting what is already on open POs —
 * with the quantity to buy and the cheapest supplier; "make purchase orders" builds one PO per vendor through the PO engine, after
 * which the item is no longer short. Pure quantity rule + real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { quantityToBuy, reorderReport, reorderToPurchaseOrders } from "./replenishment.service.js";
import { itemSites, setReorder } from "./inventory.service.js";
import { createItem } from "./items.service.js";

describe("quantityToBuy (pure)", () => {
  it("buys up to max, at least the usual reorder qty, nothing while above min", () => {
    expect(quantityToBuy(2, 0, 5, 20, null)).toBe(18);
    expect(quantityToBuy(2, 0, 5, 20, 24)).toBe(24);
    expect(quantityToBuy(2, 10, 5, 20, null)).toBe(0);
    expect(quantityToBuy(5, 0, 5, null, null)).toBe(1);
    expect(quantityToBuy(0, 0, 0, null, 12)).toBe(12);
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("reorder report → purchase orders (real Postgres, rolled back)", () => {
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

  it("lists the shortfall with the cheapest supplier, makes one PO per vendor, then the item is covered", async () => {
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, active, kind, own) VALUES ('ZZWH', 'ZZ Warehouse', 999, true, 'warehouse', true) ON CONFLICT (code) DO NOTHING`);
    const a = await createItem(db as never, u, { brand: "ZZR", name: "OSCAR", size_ml: 100 });
    const b = await createItem(db as never, u, { brand: "ZZR", name: "PAPA", size_ml: 100 });
    const cheap = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZR Cheap', 'buy') RETURNING id`)).rows[0]!.id;
    const dear = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZR Dear', 'buy') RETURNING id`)).rows[0]!.id;
    const list = async (v: string) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
       VALUES ($1, current_date, 'zz.xlsx', 'xlsx', 1, 1, 0, 0, 0, true) RETURNING id`, [v])).rows[0]!.id;
    const lc = await list(cheap), ld = await list(dear);
    const row = (l: string, n: number, item: string, cents: number) => db.query(
      `INSERT INTO perfume.price_list_rows (list_id, row_no, raw, description, price_cents, identity_key, loose_key, item_id, match_method, match_status, sku)
       VALUES ($1, $2, '{}'::jsonb, 'ZZR line', $3, 'x', 'x', $4, 'key', 'matched', $5)`, [l, n, cents, item, `ZZR-${n}`]);
    await row(lc, 1, a.id, 2000); await row(ld, 1, a.id, 2500); await row(ld, 2, b.id, 3000);

    await setReorder(db as never, a.id, "ZZWH", 5, 20, { bin: "A-01", reorder_qty: null });
    await setReorder(db as never, b.id, "ZZWH", 2, null, { reorder_qty: 12 });
    expect((await itemSites(db as never, a.id)).find((s: { location_code: string }) => s.location_code === "ZZWH")).toMatchObject({ bin: "A-01", min_qty: 5, max_qty: 20, on_hand: 0 });

    const rep = (await reorderReport(db as never, { location_code: "ZZWH" })).rows;
    expect(rep.map((r) => [r.display_name.includes("OSCAR") ? "A" : "B", r.to_buy, r.vendor, r.unit_cost_cents, r.bin])).toEqual(
      expect.arrayContaining([["A", 20, "ZZR Cheap", 2000, "A-01"], ["B", 12, "ZZR Dear", 3000, null]]));

    const made = await reorderToPurchaseOrders(db as never, u, { location_code: "ZZWH", item_ids: [a.id, b.id] });
    expect(made.purchase_orders.map((p) => [p.vendor_id, p.lines]).sort()).toEqual([[cheap, 1], [dear, 1]].sort());
    const lines = await db.query<{ qty: number; unit_cost_cents: string }>(
      `SELECT pl.qty, pl.unit_cost_cents::text FROM perfume.purchase_order_lines pl WHERE pl.po_id = ANY($1::uuid[]) ORDER BY pl.qty`, [made.purchase_orders.map((p) => p.id)]);
    expect(lines.rows.map((l) => [l.qty, Number(l.unit_cost_cents)])).toEqual([[12, 3000], [20, 2000]]);

    // Now on order: nothing short any more, so a second run makes nothing.
    expect((await reorderReport(db as never, { location_code: "ZZWH" })).rows).toEqual([]);
    expect((await reorderToPurchaseOrders(db as never, u, { location_code: "ZZWH", item_ids: [a.id] })).purchase_orders).toEqual([]);
  });
});
