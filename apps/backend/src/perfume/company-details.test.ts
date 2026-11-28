/** Owner 18:21 CT: the company Edit pop-up — fields saved with one history row; list values must be in their own catalog. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { companyDetailsSchema, updateCompanyDetails } from "./company-details.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("company details (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("saves fields + lists with one history row; a value not in its list is refused", async () => {
    for (const [k, v] of [["category", "Zqd Customer"], ["industry", "Zqd Perfume"], ["review_tag", "Zqd Check"]]) {
      await db.query(`INSERT INTO perfume.catalog_values (kind, value) VALUES ($1, $2)`, [k, v]);
    }
    const id = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source, city) VALUES ('Zqd Co', 'test', 'Laredo') RETURNING id::text`)).rows[0]!.id;
    const u = (x: unknown) => updateCompanyDetails(db as unknown as pg.PoolClient, TEST_OWNER_USER_ID, id, companyDetailsSchema.parse(x));
    expect(await u({ city: "Nuevo Laredo", main_category: "Zqd Customer", categories: ["Zqd Perfume"], review_tags: ["Zqd Check"] })).toEqual({ changed: 4 });
    expect((await db.query(`SELECT city, main_category, categories, review_tags FROM perfume.contact_companies WHERE id = $1::uuid`, [id])).rows[0])
      .toEqual({ city: "Nuevo Laredo", main_category: "Zqd Customer", categories: ["Zqd Perfume"], review_tags: ["Zqd Check"] });
    const ev = (await db.query(`SELECT detail FROM perfume.lead_events WHERE entity_id = $1::uuid AND action = 'details_edited'`, [id])).rows;
    expect(ev).toHaveLength(1);
    expect(ev[0].detail.city).toEqual({ from: "Laredo", to: "Nuevo Laredo" });
    await expect(u({ categories: ["Not A Real Industry"] })).rejects.toThrow(/not in the Industry list/);
    expect(await u({ city: "Nuevo Laredo" })).toEqual({ changed: 0 });
  });

  it("owner 14:58 CT: Relationship and Business type take several values; the first is the primary single column", async () => {
    for (const [k, v] of [["category", "Zqm Supplier"], ["category", "Zqm Customer"], ["segment", "Zqm Retail"], ["segment", "Zqm Wholesale"]]) {
      await db.query(`INSERT INTO perfume.catalog_values (kind, value) VALUES ($1, $2)`, [k, v]);
    }
    const id = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Zqm Co', 'test') RETURNING id::text`)).rows[0]!.id;
    const u = (x: unknown) => updateCompanyDetails(db as unknown as pg.PoolClient, TEST_OWNER_USER_ID, id, companyDetailsSchema.parse(x));
    expect(await u({ relationships: ["Zqm Supplier", "Zqm Customer"], business_types: ["Zqm Wholesale", "Zqm Retail"] })).toEqual({ changed: 2 });
    expect((await db.query(`SELECT relationships, main_category, business_types, segment FROM perfume.contact_companies WHERE id = $1::uuid`, [id])).rows[0])
      .toEqual({ relationships: ["Zqm Supplier", "Zqm Customer"], main_category: "Zqm Supplier", business_types: ["Zqm Wholesale", "Zqm Retail"], segment: "Zqm Wholesale" });
    await expect(u({ business_types: ["Zqm Retail", "Not A Business Type"] })).rejects.toThrow(/not in the Business types list/);
  });
});
