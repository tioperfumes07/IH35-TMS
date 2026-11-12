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
