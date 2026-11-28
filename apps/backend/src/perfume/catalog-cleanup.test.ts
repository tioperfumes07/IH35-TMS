/** Owner 17:35 CT: product types without genders; customer types without overlaps. Preview, then Apply moves carriers + history. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { applyCleanup, CLEANUP_PLAN, previewCleanup } from "./catalog-cleanup.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("catalog cleanup (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("Tester Man → Tester keeps the gender, archives the old value, writes item history; customer type merges", async () => {
    for (const [k, v] of [["product_type", "Tester Man"], ["product_type", "Tester"], ["customer_type", "Perfume shop"]]) {
      await db.query(`INSERT INTO perfume.catalog_values (kind, value) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values WHERE kind = $1 AND value = $2 AND archived_at IS NULL)`, [k, v]);
    }
    const item = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, product_type, identity_key, loose_key, display_name)
       VALUES ('ZQC', 'CLEAN', 100, 'EDT', 'M', 'Tester Man', 'ZQC|CLEAN|100|EDT|M|', 'x', 'ZQC · CLEAN') RETURNING id::text`)).rows[0]!.id;
    const co = (await db.query<{ id: string }>(
      `INSERT INTO perfume.contact_companies (name, source, role, customer_type) VALUES ('Zqc Shop', 'test', 'customer', 'Perfume shop') RETURNING id::text`)).rows[0]!.id;
    const pv = await previewCleanup(db);
    const row = pv.rows.find((r) => r.key === "product_type:Tester Man")!;
    expect(row.to).toBe("Tester");
    expect(row.carriers).toBeGreaterThanOrEqual(1);
    const keys = CLEANUP_PLAN.filter((r) => r.key === "product_type:Tester Man" || r.key === "customer_type:Perfume shop").map((r) => r.key);
    const r = await applyCleanup(db as unknown as pg.PoolClient, TEST_OWNER_USER_ID, keys);
    expect(r.applied).toBe(2);
    expect((await db.query(`SELECT product_type, gender FROM perfume.items WHERE id = $1::uuid`, [item])).rows[0]).toEqual({ product_type: "Tester", gender: "M" });
    expect((await db.query(`SELECT customer_type FROM perfume.contact_companies WHERE id = $1::uuid`, [co])).rows[0].customer_type).toBe("Perfume retail");
    expect((await db.query(`SELECT count(*)::int n FROM perfume.catalog_values WHERE kind = 'product_type' AND value = 'Tester Man' AND archived_at IS NULL`)).rows[0].n).toBe(0);
    expect((await db.query(`SELECT count(*)::int n FROM perfume.catalog_values WHERE kind = 'product_type' AND value IN ('Regular', 'Kids', 'Dupe', 'Sample', 'Vial') AND archived_at IS NULL`)).rows[0].n).toBe(5);
    expect((await db.query(`SELECT detail->>'via' AS via FROM perfume.item_events WHERE item_id = $1::uuid ORDER BY created_at DESC LIMIT 1`, [item])).rows[0].via).toBe("catalog_cleanup");
    expect((await previewCleanup(db)).rows.find((x) => x.key === "product_type:Tester Man")!.done).toBe(true);
    // Business type slug → English name (owner 17:35 CT "type and sub type").
    await db.query(`INSERT INTO perfume.catalog_values (kind, value) SELECT 'segment', 'cervezas' WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values WHERE kind = 'segment' AND value = 'cervezas' AND archived_at IS NULL)`);
    const beer = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source, segment) VALUES ('Zqc Cervezas', 'test', 'cervezas') RETURNING id::text`)).rows[0]!.id;
    expect((await applyCleanup(db as unknown as pg.PoolClient, TEST_OWNER_USER_ID, ["segment:cervezas"])).applied).toBe(1);
    expect((await db.query(`SELECT segment FROM perfume.contact_companies WHERE id = $1::uuid`, [beer])).rows[0].segment).toBe("Beer depot");
  });
});
