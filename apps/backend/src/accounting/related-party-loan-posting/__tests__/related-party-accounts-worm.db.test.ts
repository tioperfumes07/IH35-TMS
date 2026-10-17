/**
 * LEAD 443.136 #2 — accounting.related_party_accounts is WORM (void-not-delete): the link from a related party to its one
 * running "Due to / from <party>" account can never be deleted, so a second account can never be created for the same party
 * by deleting the first link. Old code (migration 202615900910 only): the DELETE succeeded.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "../../../../test-helpers/isolated-company.js";
import { ensureRelatedPartyAccount } from "../party-account.service.js";

const describeIntegration = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL ? describe : describe.skip;

describeIntegration("accounting.related_party_accounts is WORM (443.136 #2, real Postgres)", () => {
  it("a link row cannot be deleted by any role; ensure stays idempotent after the refusal", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `RPW${Date.now().toString(36).toUpperCase()}`;
    const opco = (await createIsolatedOperatingCompany({ client: db, codePrefix: tag, legalNamePrefix: "Related party WORM test" })).companyId;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const parent = (await one(
        `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1, '2410', 'Owner / Related-Party Loan Payable', 'Liability', true) RETURNING id::text AS id`,
        [opco]
      )).id;
      // LEAD 443.189 — the writer resolves the parent by ROLE (related_party_loan_parent), never by number.
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id)
         SELECT $1::uuid, 'related_party_loan_parent', $2::uuid
          WHERE NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'related_party_loan_parent')`,
        [opco, parent]
      );
      const vendor = (await one(
        `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, 'WORM Party', 'other') RETURNING id::text AS id`,
        [opco]
      )).id;
      const first = await ensureRelatedPartyAccount(db as never, {
        operatingCompanyId: opco, partyType: "vendor", partyId: vendor, actorUserId: TEST_OWNER_USER_ID, dryRun: false,
      } as never);
      const accountId = (first as { account_id: string }).account_id;
      expect(accountId).toBeTruthy();

      // The database refuses the delete — the connecting role is the migration owner, so no grant is in the way.
      await db.query("SAVEPOINT del");
      await expect(
        db.query(`DELETE FROM accounting.related_party_accounts WHERE operating_company_id = $1::uuid AND party_vendor_id = $2::uuid`, [opco, vendor])
      ).rejects.toThrow();
      await db.query("ROLLBACK TO SAVEPOINT del");
      expect((await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM accounting.related_party_accounts WHERE operating_company_id = $1::uuid AND party_vendor_id = $2::uuid`,
        [opco, vendor]
      )).n).toBe(1);

      // The ensure read path is unchanged: a second call returns the same account.
      const again = await ensureRelatedPartyAccount(db as never, {
        operatingCompanyId: opco, partyType: "vendor", partyId: vendor, actorUserId: TEST_OWNER_USER_ID, dryRun: false,
      } as never);
      expect((again as { account_id: string }).account_id).toBe(accountId);
    } finally {
      await db.query("ROLLBACK");
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await deactivateIsolatedOperatingCompany(db, opco);
      await db.query("COMMIT");
      await db.end();
    }
  });
});
