/**
 * PERFUME-ITEM-FILE (owner 2026-11-26 22:51 CT): the item file lists UPCs, TIO and HK codes; edits keep matching vendors' lines and
 * are refused onto another item's identity; a UPC / HK code moves with both items' history; TIO codes fill from his offer list only
 * when he presses it; the linkage screen finds every line by UPC / code. Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { addCatalogValue, listCatalogs, renameCatalogValue } from "./leads.service.js";
import { addHkCode, addUpc, bulkEditItems, createItem, itemOptions, fillCodesApply, fillCodesPreview, getItemFile, ItemInvalid, linkage, listItemFile, updateItemFile } from "./items.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("item file + linkage (real Postgres, rolled back)", () => {
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
  const item = async (name: string) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name) VALUES ('ZZQ', $1, 100, 'EDP', 'M', $2, 'x', $3) RETURNING id`,
    [name, `ZZQ|${name}|100|EDP|M|`, `ZZQ · ${name} · 100 ml`])).rows[0].id;
  const list = async (vendorId: string) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
     VALUES ($1, current_date, 'zz.xlsx', 'xlsx', 1, 1, 0, 0, 0, true) RETURNING id`, [vendorId])).rows[0].id;
  const line = async (listId: string, n: number, itemId: string | null, sku: string | null, upc: string | null, desc: string, cents: number, raw: Record<string, unknown> = {}) =>
    (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_list_rows (list_id, row_no, raw, description, price_cents, identity_key, loose_key, item_id, match_method, match_status, sku, upc)
       VALUES ($1, $2, $3::jsonb, $4, $5, 'x', 'x', $6, 'key', $7, $8, $9) RETURNING id`,
      [listId, n, JSON.stringify(raw), desc, cents, itemId, itemId ? "matched" : "unmatched", sku, upc])).rows[0].id;

  it("edits, UPC + HK code moves with history, TIO codes from the offer list, linkage by UPC and code", async () => {
    const a = await item("ALPHA"), b = await item("BRAVO");
    const inv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZQ Inventory', 'inventory') RETURNING id`)).rows[0].id;
    const off = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZQ Offer', 'offer') RETURNING id`)).rows[0].id;
    const pca = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZQ PCA', 'buy') RETURNING id`)).rows[0].id;
    const invL = await list(inv), offL = await list(off), pcaL = await list(pca);
    await line(invL, 1, a, "Z109571", null, "ZZQ ALPHA EDP 100 ML (M)", 4800);
    await line(offL, 1, a, "Z109571", "0812256028475", "ZZQ ALPHA EDP 100ML (M)", 5600, { 0: "Z109571", 2: "Z56014815" });
    await line(offL, 2, b, "Z109999", null, "ZZQ BRAVO EDP 100ML (M)", 3000, { 0: "Z109999", 2: "Z24329" });
    const pcaLine = await line(pcaL, 1, null, "PCA-1", "812256028475", "ZZQ ALPHA 3.4 EDP M", 4500);

    // TIO codes fill from the offer list only when pressed; a code already on an item is never reused.
    await updateItemFile(db as never, TEST_OWNER_USER_ID, b, { tio_code: "Z24329" });
    const pv = await fillCodesPreview(db as never);
    expect(pv.sample.filter((s) => s.item_id === a).map((s) => s.code)).toEqual(["Z56014815"]);
    expect(pv.sample.some((s) => s.item_id === b)).toBe(false);
    await fillCodesApply(db as never, TEST_OWNER_USER_ID);
    expect((await db.query(`SELECT internal_code FROM perfume.items WHERE id = $1`, [a])).rows[0].internal_code).toBe("Z56014815");
    await expect(updateItemFile(db as never, TEST_OWNER_USER_ID, a, { tio_code: "Z24329" })).rejects.toThrow(/already on/);

    // UPC onto ALPHA: the PCA line carrying it follows.
    const u = await addUpc(db as never, TEST_OWNER_USER_ID, a, "0812256028475");
    expect([u.upc, u.lines_relinked]).toEqual(["812256028475", 1]);
    expect((await db.query(`SELECT item_id FROM perfume.price_list_rows WHERE id = $1`, [pcaLine])).rows[0].item_id).toBe(a);
    await expect(addUpc(db as never, TEST_OWNER_USER_ID, a, "12")).rejects.toBeInstanceOf(ItemInvalid);
    // Moved to BRAVO: both files say so.
    const mv = await addUpc(db as never, TEST_OWNER_USER_ID, b, "812256028475");
    expect(mv.moved_from).toBe(a);
    // Confirming the UPC on the item that already has it still brings over a line another item carries with it (owner 13:09 CT:
    // the item most vendors name is the one) — before, the early return left that line where it was.
    await db.query(`UPDATE perfume.price_list_rows SET item_id = $2 WHERE id = $1`, [pcaLine, a]);
    const again = await addUpc(db as never, TEST_OWNER_USER_ID, b, "812256028475");
    expect([again.moved_from, again.lines_relinked]).toEqual([null, 1]);
    expect((await db.query(`SELECT item_id FROM perfume.price_list_rows WHERE id = $1`, [pcaLine])).rows[0].item_id).toBe(b);
    expect((await db.query(`SELECT count(*)::int AS n FROM perfume.item_events WHERE item_id = $1 AND kind = 'line_linked' AND detail->>'by_upc' = '812256028475'`, [b])).rows[0].n).toBe(1);
    const fa = await getItemFile(db as never, a) as { events: Array<{ kind: string }> };
    expect(fa.events.map((e) => e.kind)).toEqual(["codes_filled", "upc_added", "upc_moved_out"]);

    // HK code: new on ALPHA, then moved to BRAVO.
    expect((await addHkCode(db as never, TEST_OWNER_USER_ID, a, "Z200001")).moved_from).toBeNull();
    expect((await addHkCode(db as never, TEST_OWNER_USER_ID, b, "Z200001")).moved_from).toBe(a);
    const fb = await getItemFile(db as never, b) as { hk_codes: Array<{ sku: string }>; events: Array<{ kind: string }> };
    expect(fb.hk_codes.map((h) => h.sku)).toContain("Z200001");
    expect(fb.events.map((e) => e.kind)).toEqual(["tio_code", "upc_moved_in", "line_linked", "hk_code_moved_in"]);

    // Editing ALPHA into BRAVO's reading is refused; a real edit is kept with before / after.
    await expect(updateItemFile(db as never, TEST_OWNER_USER_ID, a, { name: "BRAVO" })).rejects.toBeInstanceOf(ItemInvalid);
    await updateItemFile(db as never, TEST_OWNER_USER_ID, a, { size_ml: 50 });
    const ea = await getItemFile(db as never, a) as { item: { size_ml: string }; events: Array<{ kind: string }> };
    expect(Number(ea.item.size_ml)).toBe(50);
    expect(ea.events.at(-1)!.kind).toBe("edited");

    // The list finds by code / UPC and shows the codes.
    const byHk = await listItemFile(db as never, { q: "Z200001", limit: 10, offset: 0, scope: "all" });
    expect(byHk.rows.map((r) => r.id)).toEqual([b]);
    expect(byHk.rows[0].upcs).toEqual(["812256028475"]);
    expect((await listItemFile(db as never, { q: "Z56014815", limit: 10, offset: 0, scope: "all" })).rows.map((r) => r.tio_code)).toEqual(["Z56014815"]);

    // Our items vs vendors' items only (owner 23:23 CT): CHARLIE is only on the PCA list.
    const ch = await item("CHARLIE");
    await line(pcaL, 2, ch, "PCA-2", null, "ZZQ CHARLIE EDP 3.4", 2000);
    expect((await listItemFile(db as never, { q: "ZZQ", limit: 50, offset: 0, scope: "mine" })).rows.map((r) => r.id).sort()).toEqual([a, b].sort());
    expect((await listItemFile(db as never, { q: "ZZQ", limit: 50, offset: 0, scope: "vendors" })).rows.map((r) => r.id)).toEqual([ch]);

    // Linkage by UPC: the item that carries it and every line linked to it, with each vendor's own words.
    const lk = await linkage(db as never, { q: "812256028475", limit: 100 });
    expect(lk.items.map((i) => i.id)).toEqual([b]);
    expect(lk.lines.map((l) => [l.vendor, l.description, l.found_by]).sort()).toEqual([
      ["ZZQ Offer", "ZZQ ALPHA EDP 100ML (M)", "upc"], ["ZZQ Offer", "ZZQ BRAVO EDP 100ML (M)", "item"], ["ZZQ PCA", "ZZQ ALPHA 3.4 EDP M", "upc"],
    ].sort());
  });
  it("item attributes (model, type, category, description) save with history; bulk edit is all-or-nothing", async () => {
    const d = await item("DELTA"), e = await item("ECHO"), f = await item("FOXTROT");
    await updateItemFile(db as never, TEST_OWNER_USER_ID, d, { model: "Queen of Seduction", product_type: "Woman", category: "Perfume", description: "Red box" });
    const fd = await getItemFile(db as never, d) as { item: Record<string, unknown>; events: Array<{ kind: string; detail: { to?: Record<string, unknown> } }> };
    expect(fd.item).toMatchObject({ model: "Queen of Seduction", product_type: "Woman", category: "Perfume", description: "Red box" });
    expect(fd.events.at(-1)).toMatchObject({ kind: "attributes", detail: { to: { model: "Queen of Seduction", product_type: "Woman" } } });
    // Clearing one attribute; the identity (and the name) does not change.
    await updateItemFile(db as never, TEST_OWNER_USER_ID, d, { description: "" });
    expect(((await getItemFile(db as never, d)) as { item: Record<string, unknown> }).item).toMatchObject({ description: null, name: "DELTA" });

    // Bulk: type + category + a flag on two items, each with its own history row.
    expect(await bulkEditItems(db as never, TEST_OWNER_USER_ID, { ids: [e, f], set: { product_type: "Tester", category: "Perfume", conc: "EDT" }, flags_add: ["TESTER"] })).toEqual({ updated: 2 });
    const rows = (await listItemFile(db as never, { q: "ZZQ", limit: 50, offset: 0, scope: "all" })).rows.filter((r) => [e, f].includes(r.id));
    expect(rows.map((r) => [r.product_type, r.category, r.conc, (r.flags ?? []).includes("TESTER")])).toEqual([["Tester", "Perfume", "EDT", true], ["Tester", "Perfume", "EDT", true]]);
    const ev = await db.query<{ n: number }>(`SELECT count(*)::int n FROM perfume.item_events WHERE item_id = ANY($1::uuid[]) AND kind = 'attributes'`, [[e, f]]);
    expect(ev.rows[0]!.n).toBe(2);

    // All or nothing: HOTEL 75 ml exists; a bulk "size 75" on ECHO and a second HOTEL (100 ml) would make that one a copy of it,
    // so the whole bulk is refused, names the item, and ECHO keeps its size.
    const h = await item("HOTEL");
    await updateItemFile(db as never, TEST_OWNER_USER_ID, h, { size_ml: 75 });
    const h2 = await item("HOTEL");
    await expect(bulkEditItems(db as never, TEST_OWNER_USER_ID, { ids: [e, h2], set: { size_ml: 75 } })).rejects.toThrow(/Nothing was saved/);
    const eNow = (await getItemFile(db as never, e)) as { item: { size_ml: string } };
    expect(Number(eNow.item.size_ml)).toBe(100);
    await expect(bulkEditItems(db as never, TEST_OWNER_USER_ID, { ids: [e], set: {} })).rejects.toThrow(/at least one field/);
  });
  it("the item creator saves every field with a 'created' history row, refuses a copy, a used TIO code or a used UPC", async () => {
    const u = TEST_OWNER_USER_ID;
    const made = await createItem(db as never, u, { brand: "ZZK", name: "KILO", size_ml: 100, conc: "EDP", gender: "W", flags: ["TESTER"], model: "Kilo Rouge",
      product_type: "Tester Woman", category: "Perfume", description: "New 2026", tio_code: "ZK0001", upc: "0712345678905" });
    const f = await getItemFile(db as never, made.id) as { item: Record<string, unknown>; upcs: string[]; events: Array<{ kind: string }> };
    expect(f.item).toMatchObject({ brand: "ZZK", internal_code: "ZK0001", model: "Kilo Rouge", product_type: "Tester Woman", category: "Perfume", description: "New 2026", conc: "EDP", gender: "W" });
    expect(Number(f.item.size_ml)).toBe(100);
    expect(f.upcs).toEqual(["712345678905"]);
    expect(f.events.map((e) => e.kind)).toEqual(["created"]);
    await expect(createItem(db as never, u, { brand: "ZZK", name: "KILO", size_ml: 100, conc: "EDP", gender: "W", flags: ["TESTER"] })).rejects.toThrow(/already in the file/);
    await expect(createItem(db as never, u, { brand: "ZZK", name: "LIMA", tio_code: "ZK0001" })).rejects.toThrow(/already on/);
    await expect(createItem(db as never, u, { brand: "ZZK", name: "LIMA", upc: "712345678905" })).rejects.toThrow(/already on/);
    await expect(createItem(db as never, u, { brand: "ZZK", name: "LIMA", upc: "12" })).rejects.toThrow(/not a UPC/);
    const o = await itemOptions(db as never);
    expect(o.brands).toContain("ZZK");
    expect(o.models).toContain("Kilo Rouge");
  });
  it("item lists are their own catalogs: counted on items, and a rename moves every item carrying it with history", async () => {
    const u = TEST_OWNER_USER_ID;
    const cat = await addCatalogValue(db as never, u, { kind: "item_category", value: "ZZ Gift sets" });
    const it1 = await createItem(db as never, u, { brand: "ZZM", name: "MIKE", category: "ZZ Gift sets", product_type: "Man Set" });
    const it2 = await createItem(db as never, u, { brand: "ZZM", name: "NOVEMBER", category: "ZZ Gift sets" });
    const kinds = (await listCatalogs(db as never)).kinds;
    const ic = kinds.find((k) => k.kind === "item_category")!;
    expect(ic.used_by).toBe("items");
    expect(ic.values.find((v) => v.value === "ZZ Gift sets")!.contacts).toBe(2);
    expect(ic.values.map((v) => v.value)).toEqual(expect.arrayContaining(["Perfume", "Cosmetics"]));
    expect(kinds.find((k) => k.kind === "category")!.used_by).toBe("contacts");
    expect(await renameCatalogValue(db as never, cat.id, "ZZ Gift boxes", u)).toMatchObject({ items_moved: 2 });
    for (const id of [it1.id, it2.id]) {
      const f = await getItemFile(db as never, id) as { item: { category: string }; events: Array<{ kind: string; detail: { via?: string } }> };
      expect(f.item.category).toBe("ZZ Gift boxes");
      expect(f.events.at(-1)).toMatchObject({ kind: "attributes", detail: { via: "catalog_rename" } });
    }
  });
  it("trade data: case pack, minimum order, weight, origin, HS code save, clear and are checked", async () => {
    const u = TEST_OWNER_USER_ID;
    const it = await createItem(db as never, u, { brand: "ZZT", name: "TANGO", size_ml: 100, case_pack: 24, min_order_qty: 6, weight_g: 410, origin_country: "FR", hs_code: "330300" });
    const f = async () => ((await getItemFile(db as never, it.id)) as { item: Record<string, unknown>; events: Array<{ kind: string; detail: { to?: Record<string, unknown> } }> });
    expect((await f()).item).toMatchObject({ case_pack: 24, min_order_qty: 6, weight_g: 410, origin_country: "FR", hs_code: "330300" });
    await updateItemFile(db as never, u, it.id, { case_pack: 12, hs_code: null });
    const g = await f();
    expect(g.item).toMatchObject({ case_pack: 12, hs_code: null, origin_country: "FR" });
    expect(g.events.at(-1)).toMatchObject({ kind: "attributes", detail: { to: { case_pack: 12, hs_code: null } } });
    const row = (await listItemFile(db as never, { q: "ZZT", limit: 5, offset: 0, scope: "all" })).rows[0]!;
    expect(row).toMatchObject({ case_pack: 12, min_order_qty: 6, origin_country: "FR" });
    await db.query("SAVEPOINT tr");
    await expect(db.query(`UPDATE perfume.items SET hs_code = '33.03' WHERE id = $1`, [it.id])).rejects.toThrow(/perfume_items_trade_check/);
    await db.query("ROLLBACK TO SAVEPOINT tr");
  });

  it("the creator files our TIO code and the HK code on the new item, links our own list lines to it, refuses a used HK code", async () => {
    const inv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZH Inventory', 'inventory') RETURNING id`)).rows[0]!.id;
    const hl = await list(inv);
    await line(hl, 1, null, "HK-ZZH-1", null, "ZZH ALFA 100", 1500);
    const made = await createItem(db as never, TEST_OWNER_USER_ID, { brand: "ZZH", name: "ALFA", size_ml: 100, tio_code: "ZH0001", hk_code: "HK-ZZH-1" });
    const f = await getItemFile(db as never, made.id);
    if (!("item" in f)) throw new Error("merged");
    expect(f.item.internal_code).toBe("ZH0001");
    expect(f.hk_codes.map((h: { sku: string }) => h.sku)).toEqual(["HK-ZZH-1"]);
    expect((await db.query(`SELECT item_id FROM perfume.price_list_rows WHERE list_id = $1`, [hl])).rows[0]!.item_id).toBe(made.id);
    const ev = (await db.query<{ kind: string }>(`SELECT kind FROM perfume.item_events WHERE item_id = $1 ORDER BY created_at, id`, [made.id])).rows.map((r) => r.kind);
    expect(ev).toEqual(expect.arrayContaining(["created", "hk_code_added"]));
    await expect(createItem(db as never, TEST_OWNER_USER_ID, { brand: "ZZH", name: "BRAVO", hk_code: "HK-ZZH-1" })).rejects.toThrow(/HK code HK-ZZH-1 is already on/);
  });
});
