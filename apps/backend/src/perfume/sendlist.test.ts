/**
 * PERFUME-SEND-LIST (owner 2026-11-26 23:23 CT): the list he sends comes from our items, shows only the columns he picks, leaves out
 * restricted brands / items and brands he unticks, counts only the sites he picks, and prices at my list price or a level's price.
 * Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { buildSendList, getRestricted, sendListSchema, sendListXlsx, setRestricted } from "./sendlist.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("send list (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    // Only this test's lists are current.
    await db.query(`UPDATE perfume.price_lists SET is_current = false`);
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });
  const item = async (brand: string, name: string, gender = "W", flags: string[] = []) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, flags, identity_key, loose_key, display_name, internal_code) VALUES ($1, $2, 100, 'EDP', $3, $4, $5, 'x', $6, $7) RETURNING id`,
    [brand, name, gender, flags, `${brand}|${name}|100|EDP|${gender}|${flags.join("+")}`, `${brand} · ${name}`, `T-${name}`])).rows[0].id;
  const list = async (kind: string) => {
    const v = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ($1, $2) RETURNING id`, [`ZZS ${kind}`, kind])).rows[0].id;
    return (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
       VALUES ($1, current_date, 'zz.xlsx', 'xlsx', 1, 1, 0, 0, 0, true) RETURNING id`, [v])).rows[0].id;
  };
  const line = (l: string, n: number, it: string, sku: string, desc: string, cents: number, qty: number | null, byLoc: Record<string, number> | null) => db.query(
    `INSERT INTO perfume.price_list_rows (list_id, row_no, raw, description, price_cents, identity_key, loose_key, item_id, match_method, match_status, sku, qty, qty_by_location)
     VALUES ($1, $2, '{}', $3, $4, 'x', 'x', $5, 'key', 'matched', $6, $7, $8)`, [l, n, desc, cents, it, sku, qty, byLoc ? JSON.stringify(byLoc) : null]);

  it("our items, chosen columns, restricted out, site stock, list or level price", async () => {
    const a = await item("ZZDIOR", "ALPHA"), b = await item("ZZCHANEL", "BRAVO"), t = await item("ZZDIOR", "CHARLIE", "W", ["TESTER"]);
    const inv = await list("inventory"), off = await list("offer");
    await line(inv, 1, a, "H1", "ZZDIOR ALPHA EDP 100", 4000, 10, { "008": 6, "011": 4 });
    await line(inv, 2, b, "H2", "ZZCHANEL BRAVO EDP 100", 5000, 3, { "011": 3 });
    await line(inv, 3, t, "H3", "ZZDIOR CHARLIE TESTER", 2000, 2, { "008": 2 });
    await line(off, 1, a, "H1", "DIOR ALPHA EDP 100ML (W)", 4600, null, null);
    await db.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ('3348901250146', $1)`, [a]);

    const base = sendListSchema.parse({ columns: ["description", "upc", "tio_code", "hk_code", "qty", "my_price"] });
    const all = await buildSendList(db as never, base);
    expect(all.rows.map((r) => r.description)).toEqual(["ZZCHANEL BRAVO EDP 100", "DIOR ALPHA EDP 100ML (W)", "ZZDIOR CHARLIE TESTER"]);
    expect(all.rows[1]).toMatchObject({ upc: "3348901250146", tio_code: "T-ALPHA", hk_code: "H1", qty: 10, my_price: 4600 });

    // Restricted brand (saved) + an unticked brand for this list + only site 008 + only testers.
    await setRestricted(db as never, TEST_OWNER_USER_ID, { brands: ["zzchanel"], item_ids: [] });
    expect((await getRestricted(db as never)).brands).toEqual(["ZZCHANEL"]);
    const r1 = await buildSendList(db as never, { ...base, sites: ["008"] });
    expect(r1.rows.map((r) => [r.description, r.qty])).toEqual([["DIOR ALPHA EDP 100ML (W)", 6], ["ZZDIOR CHARLIE TESTER", 2]]);
    expect(r1.left_out.restricted).toBe(1);
    const r2 = await buildSendList(db as never, { ...base, categories: ["Tester Women"] });
    expect(r2.rows.map((r) => r.description)).toEqual(["ZZDIOR CHARLIE TESTER"]);
    const r3 = await buildSendList(db as never, { ...base, exclude_restricted: false, exclude_brands: ["ZZDIOR"] });
    expect(r3.rows.map((r) => r.description)).toEqual(["ZZCHANEL BRAVO EDP 100"]);

    // A level's price on my cost: Retail 28% margin on the inventory file's $40.00 → $55.56.
    const retail = (await db.query<{ id: string }>(`UPDATE perfume.price_levels SET pct = 28, method = 'margin', cost_basis = 'avg' WHERE name = 'Retail' RETURNING id`)).rows[0].id;
    const r4 = await buildSendList(db as never, { ...base, columns: ["description", "level_price"], level_id: retail });
    expect(r4.rows.find((r) => r.item_id === a)!.level_price).toBe(5556);

    // The Excel carries only the chosen columns; the UPC stays text.
    const f = await sendListXlsx(db as never, { ...base, columns: ["description", "upc", "my_price"], title: "Laredo list" });
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(f.buffer);
    const ws = wb.worksheets[0]!;
    expect((ws.getRow(3).values as unknown[]).slice(1)).toEqual(["Description", "UPC", "Price"]);
    expect((ws.getRow(4).values as unknown[]).slice(1)).toEqual(["DIOR ALPHA EDP 100ML (W)", "3348901250146", 46]);
    expect(f.filename).toBe("Laredo list.xlsx");
  });
});
