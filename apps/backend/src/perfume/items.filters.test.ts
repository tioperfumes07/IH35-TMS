/** Owner 17:28 CT: item file filters — stock status, brand, product type, gender (multi), scent family. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { itemFileFacets, listItemFile, listQuery } from "./items.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("item file filters (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("never purchased vs out of stock; brand + gender multi; scent family through the item's family", async () => {
    const fam = (await db.query<{ id: string }>(`INSERT INTO perfume.item_families (name, brand, olfactory_family) VALUES ('ZQF Line', 'ZQF', 'Zqx Woody') RETURNING id::text`)).rows[0]!.id;
    const mk = async (name: string, gender: string, family: string | null) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, product_type, family_id, identity_key, loose_key, display_name)
       VALUES ('ZQF', $1, 100, 'EDT', $2, 'Regular', $3::uuid, 'ZQF|' || $1 || '|100|EDT|' || $2 || '|', 'x', 'ZQF · ' || $1) RETURNING id::text`, [name, gender, family])).rows[0]!.id;
    const bought = await mk("BOUGHT", "M", fam), never = await mk("NEVER", "W", null);
    await db.query(`INSERT INTO perfume.item_costs (item_id, avg_cost_cents) VALUES ($1::uuid, 1500)`, [bought]);
    const ids = async (q: Record<string, string>) => (await listItemFile(db as unknown as pg.PoolClient, listQuery.parse({ brand: "ZQF", ...q }))).rows.map((r) => r.id).sort();
    expect(await ids({})).toEqual([bought, never].sort());
    expect(await ids({ stock: "never_purchased" })).toEqual([never]);
    expect(await ids({ stock: "out_of_stock" })).toEqual([bought]);
    expect(await ids({ stock: "in_stock" })).toEqual([]);
    expect(await ids({ stock: "out_of_stock,never_purchased" })).toEqual([bought, never].sort());
    expect(await ids({ gender: "M,W" })).toEqual([bought, never].sort());
    expect(await ids({ gender: "W" })).toEqual([never]);
    expect(await ids({ scent: "Zqx Woody" })).toEqual([bought]);
    const f = await itemFileFacets(db as unknown as pg.PoolClient);
    expect(f.brand.find((b) => b.value === "ZQF")?.count).toBe(2);
    expect(f.scent.find((b) => b.value === "Zqx Woody")?.count).toBe(1);
    expect(f.stock.never_purchased).toBeGreaterThanOrEqual(1);
  });
});
