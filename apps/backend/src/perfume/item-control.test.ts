/**
 * PERFUME CONTROL item fields (migration 202617100100, LEAD ROUND L.20; owner 2026-11-27 13:50 / 14:16 CT): POS code, ticket description,
 * sold by pack with its units, preferred vendor, stock / active flags, special and minimum price, and the change-price lock.
 * A sales-order line below the minimum is refused unless the owner writes the reason (the override goes in item history); a locked
 * item's typed price must be the level price; an inactive item is not offered and not sold. Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { bulkEditItems, createItem, getItemFile, ItemInvalid, listItemFile, updateItemFile } from "./items.service.js";
import { addOrderLine, createOrder, getOrder, orderFromQuote, OrderInvalid, updateOrderLine } from "./orders.service.js";
import { addLine, createQuote, searchQuoteItems } from "./quotes.service.js";
import { listLevels, saveAccount, setLevelItem } from "./accounts.service.js";

const U = TEST_OWNER_USER_ID;
const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("CONTROL item fields + minimum price (real Postgres, rolled back)", () => {
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
  const events = async (id: string, kind: string) =>
    (await db.query<{ detail: Record<string, unknown> }>(`SELECT detail FROM perfume.item_events WHERE item_id = $1 AND kind = $2 ORDER BY created_at, id`, [id, kind])).rows;

  it("creates with POS code, ticket description and a pack of 12; edits are checked and recorded", async () => {
    const vendor = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZC Supplier', 'buy') RETURNING id`)).rows[0].id;
    const a = await createItem(db as never, U, { brand: "ZZC", name: "PACK TWELVE", size_ml: 100, conc: "EDP", gender: "M",
      pos_code: "zzc-001", ticket_description: "ZZC PACK 12", sold_by: "pack", units_per_pack: 12, preferred_vendor_id: vendor, min_price_cents: 1500 });
    const f = await getItemFile(db as never, a.id) as Record<string, unknown>;
    const it = (f.item ?? f) as Record<string, unknown>;
    expect(it).toMatchObject({ pos_code: "zzc-001", ticket_description: "ZZC PACK 12", sold_by: "pack", units_per_pack: 12, preferred_vendor_id: vendor,
      preferred_vendor: "ZZC Supplier", is_stock_item: true, is_active: true, min_price_cents: 1500, price_locked: false });
    const page = await listItemFile(db as never, { q: "zzc-001", scope: "all", limit: 10, offset: 0 } as never);
    expect(page.rows.map((r) => [r.pos_code, r.units_per_pack, r.preferred_vendor])).toEqual([["zzc-001", 12, "ZZC Supplier"]]);

    // Refusals: the same POS code on another item (any case), a pack without its units, units on a piece, a vendor not in the file.
    await expect(createItem(db as never, U, { brand: "ZZC", name: "OTHER", size_ml: 50, pos_code: "ZZC-001" })).rejects.toThrow(/POS code ZZC-001 is already on/);
    await expect(createItem(db as never, U, { brand: "ZZC", name: "OTHER", size_ml: 50, sold_by: "pack" })).rejects.toThrow(/units per pack/);
    await expect(updateItemFile(db as never, U, a.id, { sold_by: "piece", units_per_pack: 6 })).rejects.toThrow(ItemInvalid);
    await expect(updateItemFile(db as never, U, a.id, { preferred_vendor_id: "00000000-0000-4000-8000-000000000001" })).rejects.toThrow(/preferred vendor/);
    await expect(updateItemFile(db as never, U, a.id, { special_price_cents: 1000 })).rejects.toThrow(/below the minimum/);

    // Piece clears the units; one 'attributes' event carries every field that changed.
    await updateItemFile(db as never, U, a.id, { sold_by: "piece", is_stock_item: false, special_price_cents: 1800, price_locked: true });
    const ev = await events(a.id, "attributes");
    expect(ev.at(-1)!.detail).toEqual({
      from: { sold_by: "pack", units_per_pack: 12, is_stock_item: true, special_price_cents: null, price_locked: false },
      to: { sold_by: "piece", units_per_pack: null, is_stock_item: false, special_price_cents: 1800, price_locked: true },
    });
    const n = ev.length;
    await updateItemFile(db as never, U, a.id, { sold_by: "piece", is_stock_item: false }); // no change → no event
    expect((await events(a.id, "attributes")).length).toBe(n);
  });

  it("refuses an order line below the minimum unless the owner writes the reason (item history), and holds the price lock", async () => {
    const item = (await createItem(db as never, U, { brand: "ZZC", name: "FLOOR", size_ml: 100, conc: "EDT", gender: "W", min_price_cents: 2000 })).id;
    const co = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, role, source) VALUES ('ZZC Buyer', 'customer', 'CTRLTEST') RETURNING id`)).rows[0].id;
    const o = await createOrder(db as never, U, { company_id: co } as never);

    await expect(addOrderLine(db as never, U, o.id, { item_id: item, qty: 1, unit_price_cents: 1999 })).rejects.toThrow(/below the minimum price \$20\.00/);
    expect((await getOrder(db as never, o.id)).lines).toHaveLength(0);
    expect(await events(item, "price_override")).toHaveLength(0);
    expect((await addOrderLine(db as never, U, o.id, { item_id: item, qty: 1, unit_price_cents: 2000 })).unit_price_cents).toBe(2000); // at the floor is fine

    const low = await addOrderLine(db as never, U, o.id, { item_id: item, qty: 2, unit_price_cents: 1500, price_override_reason: "Closing out old stock for this buyer" });
    expect(low.unit_price_cents).toBe(1500);
    const ov = await events(item, "price_override");
    expect(ov).toHaveLength(1);
    expect(ov[0]!.detail).toMatchObject({ order_id: o.id, line_no: 2, qty: 2, unit_price_cents: 1500, min_price_cents: 2000, reason: "Closing out old stock for this buyer" });

    // Retyping an existing line below the floor is refused the same way.
    const line1 = (await getOrder(db as never, o.id)).lines.find((l) => l.line_no === 1)!;
    await expect(updateOrderLine(db as never, U, line1.id, { unit_price_cents: 100 })).rejects.toThrow(/below the minimum/);
    await updateOrderLine(db as never, U, line1.id, { unit_price_cents: 1900, price_override_reason: "Damaged box" });
    expect((await events(item, "price_override")).length).toBe(2);

    // "Change price? N": with a level, a typed price other than the level price is refused; no typed price takes the level.
    const wholesale = (await listLevels(db as never)).find((l) => l.name === "Wholesale")!;
    await saveAccount(db as never, U, co, { price_level_id: wholesale.id });
    const locked = (await createItem(db as never, U, { brand: "ZZC", name: "LOCKED", size_ml: 100, conc: "EDP", gender: "M", price_locked: true })).id;
    await setLevelItem(db as never, U, wholesale.id, locked, 1, 2500);
    const auto = await addOrderLine(db as never, U, o.id, { item_id: locked, qty: 1 });
    expect(auto.unit_price_cents).toBe(2500);
    await expect(addOrderLine(db as never, U, o.id, { item_id: locked, qty: 1, unit_price_cents: auto.unit_price_cents + 100 })).rejects.toThrow(/price is locked/);
    expect((await addOrderLine(db as never, U, o.id, { item_id: locked, qty: 1, unit_price_cents: auto.unit_price_cents })).unit_price_cents).toBe(auto.unit_price_cents);

    // A quote with a line below the floor does not become an order.
    const q = await createQuote(db as never, U, { company_id: co });
    await addLine(db as never, U, q.id, { item_id: item, qty: 1, unit_price_cents: 900 });
    await expect(orderFromQuote(db as never, U, q.id)).rejects.toThrow(OrderInvalid);
  });

  it("an inactive item is not offered and not sold; bulk edit sets the flags", async () => {
    const x = (await createItem(db as never, U, { brand: "ZZC", name: "SLEEPER ONE", size_ml: 100, pos_code: "ZZC-SL1" })).id;
    const y = (await createItem(db as never, U, { brand: "ZZC", name: "SLEEPER TWO", size_ml: 100 })).id;
    expect((await searchQuoteItems(db as never, "zzc-sl1")).map((r) => r.id)).toEqual([x]); // the POS code finds it
    expect(await bulkEditItems(db as never, U, { ids: [x, y], set: { is_active: false, is_stock_item: false } })).toEqual({ updated: 2 });
    expect((await searchQuoteItems(db as never, "zzc sleeper")).length).toBe(0);
    const o = await createOrder(db as never, U, { customer_name: "ZZC Walk-in" } as never);
    await expect(addOrderLine(db as never, U, o.id, { item_id: x, qty: 1, unit_price_cents: 500 })).rejects.toThrow(/inactive/);
    expect((await listItemFile(db as never, { q: "zzc sleeper", has: "inactive", scope: "all", limit: 10, offset: 0 } as never)).total).toBe(2);
    expect((await events(y, "attributes")).at(-1)!.detail).toEqual({ from: { is_stock_item: true, is_active: true }, to: { is_stock_item: false, is_active: false } });
  });
});
