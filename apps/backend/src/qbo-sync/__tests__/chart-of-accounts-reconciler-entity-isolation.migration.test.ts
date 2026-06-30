import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withLuciaBypass } from "../../auth/db.js";
import { reconcileChartOfAccounts } from "../chart-of-accounts-reconciler.js";
import { ensureIntegrationPrerequisites, ensureSecondEntityLoad } from "../../../test-helpers/db-fixture.js";

// Real-Postgres integration test (skips without a DB, runs in CI which sets DATABASE_URL).
// Tier-1 RLS regression guard: reconcileChartOfAccounts runs under withLuciaBypass (RLS OFF),
// so the operating_company_id predicates added to its 4 catalogs.accounts queries are the ONLY
// thing keeping a one-entity reconcile from mutating / mis-attributing another entity's rows.
// This proves a SECOND entity's catalogs.accounts rows are untouched by a one-entity reconcile.
const describeIntegration = describe.skipIf(!process.env.DATABASE_URL);

type AcctRow = {
  id: string;
  operating_company_id: string | null;
  qbo_sync_status: string | null;
  account_name: string;
};

describeIntegration("chart-of-accounts reconciler — entity isolation (lucia-bypass write path)", () => {
  it("a TRANSP reconcile does not touch USMCA catalogs.accounts rows, and inserts under the correct entity", async () => {
    const transp = await ensureIntegrationPrerequisites();
    const { companyId: usmca } = await ensureSecondEntityLoad();
    expect(usmca).not.toBe(transp);

    const tag = randomUUID().slice(0, 8);
    // USMCA sentinel: qbo_account_id IS NULL + status 'synced'. markLocalOnlyDrift would flip this
    // to 'drift_detected' if it were NOT entity-scoped — it must stay 'synced' after a TRANSP reconcile.
    const usmcaSentinelAcctNum = `ISO-USMCA-${tag}`;
    // TRANSP mirror row with a fresh qbo_id — createMissingFromMirror must materialize it as a
    // catalogs.accounts row owned by TRANSP (never USMCA).
    const transpQboId = `iso-qbo-${tag}`;

    await withLuciaBypass(async (client) => {
      await client.query(
        `INSERT INTO catalogs.accounts
           (operating_company_id, account_number, account_name, account_type, qbo_account_id, qbo_sync_status)
         VALUES ($1::uuid, $2, $3, 'Expense', NULL, 'synced')`,
        [usmca, usmcaSentinelAcctNum, `Iso USMCA Sentinel ${tag}`]
      );
      await client.query(
        `INSERT INTO mdata.qbo_accounts (operating_company_id, qbo_id, name, account_type, active)
         VALUES ($1::uuid, $2, $3, 'Expense', true)
         ON CONFLICT (operating_company_id, qbo_id) DO NOTHING`,
        [transp, transpQboId, `Iso TRANSP Mirror ${tag}`]
      );
    });

    await reconcileChartOfAccounts(transp);

    await withLuciaBypass(async (client) => {
      // 1) USMCA sentinel UNTOUCHED — still 'synced' (markLocalOnlyDrift was TRANSP-scoped).
      const sentinel = await client.query<AcctRow>(
        `SELECT id, operating_company_id, qbo_sync_status, account_name
           FROM catalogs.accounts WHERE account_number = $1 AND operating_company_id = $2::uuid`,
        [usmcaSentinelAcctNum, usmca]
      );
      expect(sentinel.rows).toHaveLength(1);
      expect(sentinel.rows[0]?.qbo_sync_status).toBe("synced");

      // 2) createMissingFromMirror materialized the TRANSP mirror row under TRANSP — NOT USMCA.
      const created = await client.query<AcctRow>(
        `SELECT id, operating_company_id, qbo_sync_status, account_name
           FROM catalogs.accounts WHERE qbo_account_id = $1`,
        [transpQboId]
      );
      expect(created.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of created.rows) {
        // No row for this qbo_id may be attributed to USMCA, and none may be NULL-entity.
        expect(row.operating_company_id).toBe(transp);
      }
    });
  });
});
