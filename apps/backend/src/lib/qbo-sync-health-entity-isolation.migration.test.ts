import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites, ensureSecondEntityLoad, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";

// Real-Postgres integration test (skips without a DB, runs in CI which sets DATABASE_URL —
// the repo convention for these migration tests, e.g. qbo-remote-counts.migration.test.ts).
const describeIntegration = describe.skipIf(!process.env.DATABASE_URL);

type Health = { local: number; pending: number };

// Read views.qbo_sync_health for the 'vendors' row, under a given entity's RLS context
// (role ih35_app, app.operating_company_id = opco, NO bypass) — the exact mechanism the
// /api/v1/lists/qbo-sync-health route uses. security_invoker=true means the view's
// mdata.qbo_* + outbox.queue subqueries run under THIS scope.
async function readVendorsHealth(opco: string): Promise<Health> {
  return withCurrentUser(TEST_OWNER_USER_ID, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opco]);
    const res = await client.query<{ local_count: number; pending_count: number }>(
      `SELECT local_count, pending_count FROM views.qbo_sync_health WHERE entity = 'vendors'`
    );
    const row = res.rows[0];
    return { local: Number(row?.local_count ?? -1), pending: Number(row?.pending_count ?? -1) };
  });
}

describeIntegration("qbo_sync_health per-entity isolation (outbox.queue + mdata.qbo_*)", () => {
  it("scopes vendor local_count AND pending_count to the SELECTED entity — no cross-entity blend", async () => {
    const transp = await ensureIntegrationPrerequisites();
    const { companyId: usmca } = await ensureSecondEntityLoad();
    expect(usmca).not.toBe(transp);
    expect(getOperatingCompanyId()).toBe(transp);

    // Distinct, non-equal deltas so a blend would be detectable in BOTH directions.
    const D_TRANSP_VENDORS = 3;
    const D_TRANSP_PENDING = 2;
    const D_USMCA_VENDORS = 1;
    const D_USMCA_PENDING = 4;

    const seedVendor = async (client: { query: (sql: string, v?: unknown[]) => Promise<unknown> }, opco: string) => {
      await client.query(
        `INSERT INTO mdata.qbo_vendors (operating_company_id, qbo_id, display_name)
         VALUES ($1::uuid, $2, $3)`,
        [opco, `iso-${randomUUID()}`, `Iso Vendor ${randomUUID().slice(0, 8)}`]
      );
    };
    const seedPending = async (client: { query: (sql: string, v?: unknown[]) => Promise<unknown> }, opco: string) => {
      await client.query(
        `INSERT INTO outbox.queue (operating_company_id, target_system, operation, entity_type, entity_uuid, idempotency_key, payload, status)
         VALUES ($1::uuid, 'qbo', 'force_full_sync', 'vendors', gen_random_uuid(), $2, '{}'::jsonb, 'pending')`,
        [opco, `iso-pending-${randomUUID()}`]
      );
    };

    // Baseline BEFORE seeding (view counts ALL rows for the opco; measure the increment, so
    // the assertion is robust to any pre-existing rows other fixtures may have left).
    const baseT = await readVendorsHealth(transp);
    const baseU = await readVendorsHealth(usmca);

    await withLuciaBypass(async (client) => {
      // Give TEST_OWNER access to BOTH entities. This is what makes the test meaningful: the
      // mdata.qbo_vendors SELECT policy scopes by user MEMBERSHIP, so without the explicit
      // app.operating_company_id predicate this user would see BOTH companies' vendors blended.
      await client.query(
        `INSERT INTO org.user_company_access (user_id, company_id)
         VALUES ($1::uuid, $2::uuid)
         ON CONFLICT (user_id, company_id) DO UPDATE SET deactivated_at = NULL`,
        [TEST_OWNER_USER_ID, usmca]
      );
      await client.query(
        `INSERT INTO org.user_company_access (user_id, company_id)
         VALUES ($1::uuid, $2::uuid)
         ON CONFLICT (user_id, company_id) DO UPDATE SET deactivated_at = NULL`,
        [TEST_OWNER_USER_ID, transp]
      );

      for (let i = 0; i < D_TRANSP_VENDORS; i += 1) await seedVendor(client, transp);
      for (let i = 0; i < D_TRANSP_PENDING; i += 1) await seedPending(client, transp);
      for (let i = 0; i < D_USMCA_VENDORS; i += 1) await seedVendor(client, usmca);
      for (let i = 0; i < D_USMCA_PENDING; i += 1) await seedPending(client, usmca);
    });

    const afterT = await readVendorsHealth(transp);
    const afterU = await readVendorsHealth(usmca);

    // TRANSP view moved by EXACTLY its own seeded rows — NOT TRANSP+USMCA. If the counts
    // blended, the TRANSP delta would include USMCA's rows (vendors: 3 vs 3+1; pending: 2 vs 2+4).
    expect(afterT.local - baseT.local).toBe(D_TRANSP_VENDORS);
    expect(afterT.pending - baseT.pending).toBe(D_TRANSP_PENDING);

    // USMCA view moved by EXACTLY its own seeded rows — proving the reverse direction too.
    expect(afterU.local - baseU.local).toBe(D_USMCA_VENDORS);
    expect(afterU.pending - baseU.pending).toBe(D_USMCA_PENDING);
  });
});
