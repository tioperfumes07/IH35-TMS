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
  it("a TRANSP reconcile is REFUSED BY NAME: USMCA rows untouched and no native account materialized from QBO", async () => {
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

    // ACCT-F4431380 (Lead 443.137 item 9e; QuickBooks is a READ-ONLY ARCHIVE).
    //   OLD: the reconcile ran and this test asserted it materialized the TRANSP mirror row into
    //        catalogs.accounts under TRANSP (createMissingFromMirror) without touching USMCA.
    //   NEW: the reconciler refuses by name and writes NOTHING native — for either entity. The entity-
    //        isolation half (USMCA sentinel untouched) is kept; the "materialized under TRANSP" half is
    //        inverted, because materializing a native account from QBO is exactly what is now forbidden.
    await expect(reconcileChartOfAccounts(transp)).rejects.toMatchObject({
      code: "QBO_NATIVE_WRITE_REFUSED",
      nativeTables: ["catalogs.accounts"],
    });

    await withLuciaBypass(async (client) => {
      // 1) USMCA sentinel UNTOUCHED — still 'synced' (markLocalOnlyDrift was TRANSP-scoped).
      const sentinel = await client.query<AcctRow>(
        `SELECT id, operating_company_id, qbo_sync_status, account_name
           FROM catalogs.accounts WHERE account_number = $1 AND operating_company_id = $2::uuid`,
        [usmcaSentinelAcctNum, usmca]
      );
      expect(sentinel.rows).toHaveLength(1);
      expect(sentinel.rows[0]?.qbo_sync_status).toBe("synced");

      // 2) NOTHING was materialized from the mirror — no catalogs.accounts row carries this qbo_id in any
      //    entity (the mirror row itself is kept: QuickBooks data stays in the archive).
      const created = await client.query<AcctRow>(
        `SELECT id, operating_company_id, qbo_sync_status, account_name
           FROM catalogs.accounts WHERE qbo_account_id = $1`,
        [transpQboId]
      );
      expect(created.rows).toHaveLength(0);
      const mirror = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM mdata.qbo_accounts WHERE operating_company_id = $1::uuid AND qbo_id = $2`,
        [transp, transpQboId]
      );
      expect(mirror.rows[0]?.n).toBe(1);
    });
  });
});
