/**
 * PERFUME-DESK brand canon (owner 2026-11-12 "perfumes completely done", real Postgres, rolled back): items filed
 * under a second spelling of a brand take the canonical one; the same bottle under two spellings becomes one item
 * with both items' UPCs and price lines. Idempotent.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { canonicalizeItemBrands, importList, upsertVendor } from "./desk.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("perfume brand canon (real Postgres, rolled back)", () => {
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

  it("CALVIN → CALVIN KLEIN: respelled items merge into the canonical twin; others are renamed", async () => {
    const v = await upsertVendor(db as never, TEST_OWNER_USER_ID, { name: "BRANDS TEST SUP", kind: "buy" });
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: v.id, list_date: "2026-11-12", file_name: "b.xlsx", source_kind: "xlsx", rows_read: 2, file_price_total_cents: 3000,
      rows: [
        { row_no: 1, upc: "8100000000066", brand: "Calvin Klein", description: "ZZCANON ONE (M) EDT SP 3.4oz", price: "15.00" },
        { row_no: 2, upc: "8100000000073", brand: "Calvin Klein", description: "ZZCANON TWO (W) EDP SP 3.4oz", price: "15.00" },
      ] });
    // The same bottle (ONE) and a new one (THREE) filed under the short spelling, as older lists left them.
    const one = (await db.query<{ id: string; identity_key: string; display_name: string }>(`SELECT id, identity_key, display_name FROM perfume.items WHERE name = 'ZZCANON ONE'`)).rows[0];
    const dupId = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, flags, identity_key, loose_key, display_name)
       VALUES ('CALVIN', 'ZZCANON ONE', 100, 'EDT', 'M', '{}', $1, 'x', $2) RETURNING id`,
      [one.identity_key.replace(/^CALVIN KLEIN\|/, "CALVIN|"), one.display_name.replace(/^CALVIN KLEIN · /, "CALVIN · ")])).rows[0].id;
    await db.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ('8100000000080', $1)`, [dupId]);
    const threeId = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, flags, identity_key, loose_key, display_name)
       VALUES ('CALVIN', 'ZZCANON THREE', 100, 'EDT', 'M', '{}', 'CALVIN|ZZCANON THREE|100|EDT|M|', 'y', 'CALVIN · ZZCANON THREE · 100 ml') RETURNING id`)).rows[0].id;

    const r = await canonicalizeItemBrands(db as never);
    expect(r.brands.CALVIN).toBe("CALVIN KLEIN");
    const dup = (await db.query<{ merged_into_id: string | null }>(`SELECT merged_into_id FROM perfume.items WHERE id = $1`, [dupId])).rows[0];
    expect(dup.merged_into_id).toBe(one.id);
    expect((await db.query(`SELECT 1 FROM perfume.item_upcs WHERE upc = '8100000000080' AND item_id = $1`, [one.id])).rowCount).toBe(1);
    const three = (await db.query<{ brand: string; identity_key: string; display_name: string; merged_into_id: string | null }>(
      `SELECT brand, identity_key, display_name, merged_into_id FROM perfume.items WHERE id = $1`, [threeId])).rows[0];
    expect(three).toEqual({ brand: "CALVIN KLEIN", identity_key: "CALVIN KLEIN|ZZCANON THREE|100|EDT|M|", display_name: "CALVIN KLEIN · ZZCANON THREE · 100 ml", merged_into_id: null });
    // Idempotent: a second pass finds nothing to do for these items.
    const again = await canonicalizeItemBrands(db as never);
    expect(again.brands.CALVIN).toBeUndefined();
  });
});
