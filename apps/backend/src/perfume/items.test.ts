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
import { addHkCode, addUpc, fillCodesApply, fillCodesPreview, getItemFile, ItemInvalid, linkage, listItemFile, updateItemFile } from "./items.service.js";

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
    const fa = await getItemFile(db as never, a) as { events: Array<{ kind: string }> };
    expect(fa.events.map((e) => e.kind)).toEqual(["codes_filled", "upc_added", "upc_moved_out"]);

    // HK code: new on ALPHA, then moved to BRAVO.
    expect((await addHkCode(db as never, TEST_OWNER_USER_ID, a, "Z200001")).moved_from).toBeNull();
    expect((await addHkCode(db as never, TEST_OWNER_USER_ID, b, "Z200001")).moved_from).toBe(a);
    const fb = await getItemFile(db as never, b) as { hk_codes: Array<{ sku: string }>; events: Array<{ kind: string }> };
    expect(fb.hk_codes.map((h) => h.sku)).toContain("Z200001");
    expect(fb.events.map((e) => e.kind)).toEqual(["tio_code", "upc_moved_in", "hk_code_moved_in"]);

    // Editing ALPHA into BRAVO's reading is refused; a real edit is kept with before / after.
    await expect(updateItemFile(db as never, TEST_OWNER_USER_ID, a, { name: "BRAVO" })).rejects.toBeInstanceOf(ItemInvalid);
    await updateItemFile(db as never, TEST_OWNER_USER_ID, a, { size_ml: 50 });
    const ea = await getItemFile(db as never, a) as { item: { size_ml: string }; events: Array<{ kind: string }> };
    expect(Number(ea.item.size_ml)).toBe(50);
    expect(ea.events.at(-1)!.kind).toBe("edited");

    // The list finds by code / UPC and shows the codes.
    const byHk = await listItemFile(db as never, { q: "Z200001", limit: 10, offset: 0 });
    expect(byHk.rows.map((r) => r.id)).toEqual([b]);
    expect(byHk.rows[0].upcs).toEqual(["812256028475"]);
    expect((await listItemFile(db as never, { q: "Z56014815", limit: 10, offset: 0 })).rows.map((r) => r.tio_code)).toEqual(["Z56014815"]);

    // Linkage by UPC: the item that carries it and every line linked to it, with each vendor's own words.
    const lk = await linkage(db as never, { q: "812256028475", limit: 100 });
    expect(lk.items.map((i) => i.id)).toEqual([b]);
    expect(lk.lines.map((l) => [l.vendor, l.description, l.found_by]).sort()).toEqual([
      ["ZZQ Offer", "ZZQ ALPHA EDP 100ML (M)", "upc"], ["ZZQ Offer", "ZZQ BRAVO EDP 100ML (M)", "item"], ["ZZQ PCA", "ZZQ ALPHA 3.4 EDP M", "upc"],
    ].sort());
  });
});
