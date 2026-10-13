/**
 * LEAD 443.134 AJK-13 — real Postgres: preparing IFTA for a quarter that is already owner-approved / FILED creates a NEW draft
 * version (version + 1, supersedes the filed one); the filed return keeps its status, filed_at and confirmation number, and
 * the database refuses any direct change to it. On main the re-prepare UPSERT reset the filed return to draft. Fixtures live in
 * ONE transaction that is rolled back.
 */
import pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import { markFilingFiled, ownerApproveFiling, prepareFiling } from "../quarterly-preparer.service.js";

// The miles source (Samsara IFTA report) is external; the versioning rule is what is under test (same mock as quarterly-preparer.test.ts).
vi.mock("../../../telematics/ifta-miles.service.js", () => ({
  samsaraIftaReportFetcher: () => async () => ({ vehicles: [] }),
  computeIftaMiles: async () => ({ status: "ok", linked_unit_miles: [{ jurisdiction: "TX", total_miles: 12450, taxable_miles: 12450 }] }),
}));

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("IFTA re-prepare never touches a filed return (443.134 AJK-13, real Postgres)", () => {
  it("v1 draft -> approved -> filed; re-prepare = v2 draft superseding v1; v1 untouched; the DB refuses changing v1", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const tag = `IFTA${Date.now().toString(36).toUpperCase()}`;
      const opco = (await db.query<{ id: string }>(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, 'AJK-13 IFTA test', 'operating_carrier') RETURNING id::text AS id`, [tag])).rows[0]!.id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const quarter = "2026-Q3";

      const v1 = await prepareFiling(db as never, opco, quarter, TEST_OWNER_USER_ID) as { uuid: string; version: number; status: string };
      expect(v1).toMatchObject({ version: 1, status: "draft" });
      // Re-preparing an OPEN draft updates it in place (nothing was approved) — still one row.
      const v1again = await prepareFiling(db as never, opco, quarter, TEST_OWNER_USER_ID) as { uuid: string; version: number };
      expect(v1again.uuid).toBe(v1.uuid);

      await ownerApproveFiling(db as never, opco, v1.uuid, TEST_OWNER_USER_ID);
      await markFilingFiled(db as never, opco, v1.uuid, `CONF-${tag}`, TEST_OWNER_USER_ID);

      const v2 = await prepareFiling(db as never, opco, quarter, TEST_OWNER_USER_ID) as { uuid: string; version: number; status: string; supersedes_filing_uuid: string | null };
      expect(v2.uuid).not.toBe(v1.uuid);
      expect(v2).toMatchObject({ version: 2, status: "draft", supersedes_filing_uuid: v1.uuid });

      const filed = (await db.query<{ status: string; confirmation_number: string | null; filed_at: string | null; approved_at: string | null }>(
        `SELECT status, confirmation_number, filed_at::text, approved_at::text FROM reports.ifta_filings WHERE uuid = $1::uuid`, [v1.uuid])).rows[0]!;
      expect(filed.status).toBe("filed");
      expect(filed.confirmation_number).toBe(`CONF-${tag}`);
      expect(filed.filed_at).toBeTruthy();
      expect(filed.approved_at).toBeTruthy();

      // The database refuses changing a filed return (any writer).
      await db.query("SAVEPOINT probe");
      await expect(db.query(`UPDATE reports.ifta_filings SET status = 'draft' WHERE uuid = $1::uuid`, [v1.uuid])).rejects.toThrow(/ifta_filing_immutable/);
      await db.query("ROLLBACK TO SAVEPOINT probe");
      // Re-preparing while v2 is open updates v2 — never a third version, never v1.
      const v2again = await prepareFiling(db as never, opco, quarter, TEST_OWNER_USER_ID) as { uuid: string; version: number };
      expect(v2again).toMatchObject({ uuid: v2.uuid, version: 2 });
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
