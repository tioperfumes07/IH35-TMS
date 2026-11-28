/**
 * Every catalog kind the database accepts (perfume.catalog_values CHECK) is one the Catalogs list knows — a kind the DB takes but
 * CATALOG_KINDS lacks made GET /api/v1/perfume/catalogs 500 on prod (shipping_method, migration 202617220100). Real Postgres.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { CATALOG_KINDS, listCatalogs } from "./leads.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("catalog kinds match the database (real Postgres, rolled back)", () => {
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

  it("CATALOG_KINDS covers every kind in catalog_values_kind_check, and the list loads with a row of each", async () => {
    const def = (await db.query<{ d: string }>(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'catalog_values_kind_check' AND conrelid = 'perfume.catalog_values'::regclass`)).rows[0]!.d;
    const dbKinds = [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]!);
    expect(dbKinds.length).toBeGreaterThan(5);
    expect(dbKinds.filter((k) => !(CATALOG_KINDS as readonly string[]).includes(k))).toEqual([]);
    for (const k of dbKinds) {
      await db.query(`INSERT INTO perfume.catalog_values (kind, value, sort) VALUES ($1, $2, 999) ON CONFLICT DO NOTHING`, [k, k === "origin_country" ? "ZZ" : `ZZ kind test ${k}`]);
    }
    const list = await listCatalogs(db as never);
    expect(list.kinds.map((k) => k.kind)).toEqual(expect.arrayContaining(dbKinds));
  });
});
