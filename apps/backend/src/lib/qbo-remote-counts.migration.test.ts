import { describe, expect, it } from "vitest";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("qbo remote counts canonical migration", () => {
  it("creates canonical accounting.qbo_remote_counts table", async () => {
    await ensureIntegrationPrerequisites();
    const exists = await withLuciaBypass(async (client) => {
      const res = await client.query<{ regclass: string | null }>(
        `SELECT to_regclass('accounting.qbo_remote_counts')::text AS regclass`
      );
      return res.rows[0]?.regclass ?? null;
    });
    expect(exists).toBe("accounting.qbo_remote_counts");
  });

  it("keeps lists-hub views queryable after table replacement", async () => {
    await ensureIntegrationPrerequisites();
    const operatingCompanyId = getOperatingCompanyId();

    await withCurrentUser(TEST_OWNER_USER_ID, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      await client.query(
        `
          INSERT INTO accounting.qbo_remote_counts (
            operating_company_id,
            entity_type,
            remote_count,
            collection_run_id
          )
          VALUES ($1::uuid, 'qbo_vendors', 7, gen_random_uuid())
        `,
        [operatingCompanyId]
      );

      const inv = await client.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM views.catalogs_inventory`);
      const health = await client.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM views.qbo_sync_health`);

      expect(Number(inv.rows[0]?.total ?? 0)).toBe(64);
      expect(Number(health.rows[0]?.total ?? 0)).toBeGreaterThan(0);
    });
  });
});
