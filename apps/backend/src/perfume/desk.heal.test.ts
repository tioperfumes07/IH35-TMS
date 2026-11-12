/**
 * PERFUME-DESK import HEAL (LST-F12013, real Postgres): an item a newer list reaches by UPC takes the identity the
 * newer list reads for it (renamed), or — if another live item already holds that identity — is merged into it.
 * Prod case: MTZ 11/10/2026 created "4711 · U" and "100 PASSION 3 4 6 7 H BW · 15 ml" under the old rules.
 * Everything runs in ONE transaction that is rolled back: nothing is left in the database.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { importList } from "./desk.service.js";
import { identify, looseKey } from "./normalize.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("perfume import heals stale auto-identified items (real Postgres, rolled back)", () => {
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

  it("renames a stale item and merges a stale duplicate into the live holder", async () => {
    const vendor = (await db.query<{ id: string }>(
      `INSERT INTO perfume.vendors (name, kind) VALUES ('HEAL TEST VENDOR', 'buy') RETURNING id`)).rows[0].id;
    const ins = async (brand: string, name: string, key: string) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, identity_key, loose_key, display_name) VALUES ($1,$2,$3,$3,$2) RETURNING id`,
      [brand, name, key])).rows[0].id;
    const stale1 = await ins("4711", "U", "HEALTEST|U|100|EDC|?|");
    await db.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ('94011700748945', $1)`, [stale1]);

    const line2 = { description: "ABERCROMBIE 100% PASSION 3.4 EDT M + 6.7 H/BW + 15ML  (136339) - USA - 6pcs ByBox", brand: "ABERCROMBIE" };
    const right2 = identify(line2);
    const holder = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, identity_key, loose_key, display_name) VALUES ($1,$2,$3,$4,$2) RETURNING id`,
      [right2.brand, right2.nameText, right2.key, looseKey(right2)])).rows[0].id;
    const stale2 = await ins("ABERCROMBIE & FITCH", "100 PASSION 3 4 6 7 H BW", "HEALTEST|100 PASSION 3 4 6 7 H BW|15|EDT|M|SET");
    await db.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ('9085715169983', $1)`, [stale2]);

    const { list_id, check } = await importList(db as never, TEST_OWNER_USER_ID, {
      vendor_id: vendor, list_date: "2026-11-10", file_name: "heal.xlsx", source_kind: "xlsx", rows_read: 2, file_price_total_cents: 2975,
      rows: [
        { row_no: 1, upc: "94011700748945", brand: "4711", description: "4711 3.4 EDC U  (130562) - Germany - 30pcs ByBox", price: "7.75" },
        { row_no: 2, upc: "9085715169983", ...line2, price: "22.00" },
      ],
    });
    expect(check.totals_match).toBe(true);
    expect(check.items_renamed).toBe(1);
    expect(check.items_merged).toBe(1);
    expect(check.items_created).toBe(0);

    const s1 = (await db.query(`SELECT name, gender, size_ml::int AS ml, conc FROM perfume.items WHERE id = $1`, [stale1])).rows[0];
    expect(s1).toEqual({ name: "4711", gender: "U", ml: 100, conc: "EDC" });
    const s2 = (await db.query(`SELECT merged_into_id FROM perfume.items WHERE id = $1`, [stale2])).rows[0];
    expect(s2.merged_into_id).toBe(holder);
    const upc2 = (await db.query(`SELECT item_id FROM perfume.item_upcs WHERE upc = '9085715169983'`)).rows[0];
    expect(upc2.item_id).toBe(holder);
    const rows = (await db.query(`SELECT upc, item_id FROM perfume.price_list_rows WHERE list_id = $1 ORDER BY row_no`, [list_id])).rows;
    expect(rows.map((r) => r.item_id)).toEqual([stale1, holder]);
  });

  it("a no-barcode MTZ line takes the vendor code printed in its description as its SKU and becomes an item", async () => {
    const vendor = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('HEAL TEST VENDOR 3', 'buy') RETURNING id`)).rows[0].id;
    const { list_id, check } = await importList(db as never, TEST_OWNER_USER_ID, {
      vendor_id: vendor, list_date: "2026-11-10", file_name: "sku.xlsx", source_kind: "xlsx", rows_read: 1, file_price_total_cents: 1500,
      rows: [{ row_no: 1, brand: "ARABIYAT", description: "ARABIYAT SUGAR COOKIE DOUGH 3.4 EDP L TST  (139920) - United Arab Emir", price: "15.00" }],
    });
    expect(check.items_created).toBe(1);
    const row = (await db.query(`SELECT sku, match_status, match_method FROM perfume.price_list_rows WHERE list_id = $1`, [list_id])).rows[0];
    expect(row).toEqual({ sku: "139920", match_status: "matched", match_method: "new_item" });
  });

  it("an item confirmed by hand is never renamed by an import", async () => {
    const vendor = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('HEAL TEST VENDOR 2', 'buy') RETURNING id`)).rows[0].id;
    const item = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, identity_key, loose_key, display_name, internal_code) VALUES ('4711','MY NAME','HEALTEST2','HEALTEST2','MY NAME','TIO-1') RETURNING id`)).rows[0].id;
    await db.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ('94011700740277', $1)`, [item]);
    const { check } = await importList(db as never, TEST_OWNER_USER_ID, {
      vendor_id: vendor, list_date: "2026-11-10", file_name: "heal2.xlsx", source_kind: "xlsx", rows_read: 1, file_price_total_cents: 550,
      rows: [{ row_no: 1, upc: "94011700740277", brand: "4711", description: "4711 3.4 AFTER SHAVE U  (129508) - Germany - 48pcs ByBox", price: "5.50" }],
    });
    expect(check.items_renamed).toBe(0);
    expect((await db.query(`SELECT name FROM perfume.items WHERE id = $1`, [item])).rows[0].name).toBe("MY NAME");
  });
});

describeIntegration("a full list replaces the vendor's older lists (real Postgres, rolled back)", () => {
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

  it("voids the old full list and the add-on list; an add-on list alone voids nothing", async () => {
    const vendor = (await db.query<{ id: string }>(
      `INSERT INTO perfume.vendors (name, kind) VALUES ('REPLACE TEST VENDOR', 'buy') RETURNING id`)).rows[0].id;
    const line = (n: number, price: string) => ({ row_no: n, upc: `99887766554${n}`, brand: "4711", description: `4711 ORIGINAL ${n} 3.4 EDC U`, price });
    const imp = (file: string, date: string, full: boolean) => importList(db as never, TEST_OWNER_USER_ID, {
      vendor_id: vendor, list_date: date, file_name: file, source_kind: "xlsx", rows_read: 1, file_price_total_cents: 1000,
      replaces_current: full, rows: [line(1, "10.00")],
    });
    const old = await imp("old.xlsx", "2026-11-01", true);
    const addon = await imp("arrivals.xlsx", "2026-11-05", false);
    const state = async () => (await db.query<{ id: string; is_current: boolean; voided: boolean; void_reason: string | null }>(
      `SELECT id, is_current, voided_at IS NOT NULL AS voided, void_reason FROM perfume.price_lists WHERE vendor_id = $1 ORDER BY imported_at`, [vendor])).rows;
    let s = await state();
    expect(s.map((r) => [r.is_current, r.voided])).toEqual([[true, false], [true, false]]);
    const fresh = await imp("new.xlsx", "2026-11-10", true);
    s = await state();
    const byId = new Map(s.map((r) => [r.id, r]));
    expect(byId.get(old.list_id)).toMatchObject({ is_current: false, voided: true, void_reason: "Replaced by new.xlsx (2026-11-10)" });
    expect(byId.get(addon.list_id)).toMatchObject({ is_current: false, voided: true });
    expect(byId.get(fresh.list_id)).toMatchObject({ is_current: true, voided: false });
  });
});

describeIntegration("another vendor's list never renames an item; a UPC on a differently named item is not trusted (real Postgres, rolled back)", () => {
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

  it("Lux (no gender column) does not strip MTZ's reading; Lux KISMET ANGEL on MTZ KISMET MAGIC's UPC is a new item", async () => {
    const mk = async (name: string) => (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ($1, 'buy') RETURNING id`, [name])).rows[0].id;
    const mtz = await mk("HEALTEST MTZ"), lux = await mk("HEALTEST LUX");
    const imp = (vendor: string, file: string, rows: Array<Record<string, unknown>>) => importList(db as never, TEST_OWNER_USER_ID, {
      vendor_id: vendor, list_date: "2026-11-12", file_name: file, source_kind: "xlsx", rows_read: rows.length,
      file_price_total_cents: rows.reduce((t, r) => t + Math.round(Number(r.price) * 100), 0), rows: rows as never,
    });
    await imp(mtz, "mtz.xlsx", [
      { row_no: 1, upc: "6290360590004", brand: "MAISON ALHAMBRA", description: "MAISON ALHAMBRA BRONZE 3.4 EDP M  (128948) - United Arab Emirates - 24pcs ByBox", price: "11.00" },
      { row_no: 2, upc: "6290360590011", brand: "MAISON ALHAMBRA", description: "MAISON ALHAMBRA KISMET MAGIC 3.4 EDP M  (129438) - United Arab Emirates - 24pcs ByBox", price: "12.00" },
    ]);
    const before = (await db.query<{ display_name: string }>(`SELECT i.display_name FROM perfume.items i JOIN perfume.item_upcs u ON u.item_id = i.id WHERE u.upc = '6290360590004'`)).rows[0].display_name;
    const { check } = await imp(lux, "lux.xlsx", [
      { row_no: 1, upc: "6290360590004", description: "AL HAMBRA BRONZE FOR MEN 100ML EDP SPRAY", price: "10.50" },
      { row_no: 2, upc: "6290360590011", description: "AL HAMBRA KISMET ANGEL 100ML EDP SPRAY", price: "10.75" },
    ]);
    const after = (await db.query<{ display_name: string }>(`SELECT i.display_name FROM perfume.items i JOIN perfume.item_upcs u ON u.item_id = i.id WHERE u.upc = '6290360590004'`)).rows[0].display_name;
    expect(after).toBe(before);
    expect(check.items_renamed).toBe(0);
    expect(check.upc_name_conflicts).toBe(1);
    const magic = (await db.query<{ n: string }>(
      `SELECT count(*)::text n FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.item_upcs u ON u.item_id = r.item_id
        WHERE l.vendor_id = $1 AND u.upc = '6290360590011'`, [lux])).rows[0].n;
    expect(magic).toBe("0");
  });
});
