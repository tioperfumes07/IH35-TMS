/**
 * One ScentsX vendor, many price lists (owner 2026-11-27 18:38 CT: "fix that rule a vendor can have multiple lists").
 * Migration 202617190100: a ScentsX A/P vendor links to several perfume lists of the SAME company; never to two companies.
 * Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createLink } from "./links.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("ScentsX vendor ↔ several lists of one company (real Postgres, rolled back)", () => {
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
  const company = async (name: string) => (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, role, source) VALUES ($1, 'vendor', 'test') RETURNING id::text`, [name])).rows[0]!.id;
  const list = async (name: string, companyId: string | null) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.vendors (name, kind, company_id) VALUES ($1, 'buy', $2) RETURNING id::text`, [name, companyId])).rows[0]!.id;

  it("two lists of one company share one ScentsX vendor; a list of another company is refused; a list keeps one vendor", async () => {
    const eleg = await company("Zqmany Elegance");
    const other = await company("Zqmany Other");
    const main = await list("Zqmany Elegance", eleg), arabic = await list("Zqmany Elegance — ARABIC list", eleg), stranger = await list("Zqmany Other", other);
    const mv = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES (scentsx.company_id(), 'Zqmany Elegance', 'Other') RETURNING id::text`)).rows[0]!.id;
    await createLink(db, TEST_OWNER_USER_ID, "vendor", main, mv);
    await createLink(db, TEST_OWNER_USER_ID, "vendor", arabic, mv);
    const n = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM scentsx.vendor_links WHERE vendor_id = $1 AND voided_at IS NULL`, [mv])).rows[0]!.n;
    expect(n).toBe(2);
    await db.query("SAVEPOINT s1");
    await expect(createLink(db, TEST_OWNER_USER_ID, "vendor", stranger, mv)).rejects.toThrow(/another company/);
    await db.query("ROLLBACK TO SAVEPOINT s1");
    const mv2 = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES (scentsx.company_id(), 'Zqmany second', 'Other') RETURNING id::text`)).rows[0]!.id;
    await db.query("SAVEPOINT s2");
    await expect(createLink(db, TEST_OWNER_USER_ID, "vendor", main, mv2)).rejects.toThrow(/already linked/);
    await db.query("ROLLBACK TO SAVEPOINT s2");
  });

  it("a list with no company cannot share a ScentsX vendor", async () => {
    const a = await list("Zqmany loose A", null), b = await list("Zqmany loose B", null);
    const mv = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES (scentsx.company_id(), 'Zqmany loose', 'Other') RETURNING id::text`)).rows[0]!.id;
    await createLink(db, TEST_OWNER_USER_ID, "vendor", a, mv);
    await db.query("SAVEPOINT s3");
    await expect(createLink(db, TEST_OWNER_USER_ID, "vendor", b, mv)).rejects.toThrow(/another company/);
    await db.query("ROLLBACK TO SAVEPOINT s3");
  });
});
