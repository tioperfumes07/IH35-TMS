import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";

const describeIntegration = describe.skipIf(!process.env.DATABASE_URL);

describeIntegration("reconciliation state migration", () => {
  let operatingCompanyId = "";
  const createdKeys: Array<{ companyId: string; integration: string; mirrorCategory: string }> = [];

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    operatingCompanyId = getOperatingCompanyId();
  });

  afterAll(async () => {
    if (createdKeys.length === 0) return;
    await withLuciaBypass(async (client) => {
      for (const key of createdKeys) {
        await client.query(
          `
            DELETE FROM _system.reconciliation_state
            WHERE operating_company_id = $1::uuid
              AND integration = $2
              AND mirror_category = $3
          `,
          [key.companyId, key.integration, key.mirrorCategory]
        );
      }
    });
  });

  it("creates _system.reconciliation_state table", async () => {
    const regclass = await withLuciaBypass(async (client) => {
      const res = await client.query<{ regclass: string | null }>(
        `SELECT to_regclass('_system.reconciliation_state')::text AS regclass`
      );
      return res.rows[0]?.regclass ?? null;
    });
    expect(regclass).toBe("_system.reconciliation_state");
  });

  it("allows tenant-scoped insert and enforces non-negative failure streak", async () => {
    const key = await withCurrentUser(TEST_OWNER_USER_ID, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      await client.query(
        `
          INSERT INTO _system.reconciliation_state (
            operating_company_id,
            integration,
            mirror_category,
            consecutive_failure_count,
            last_run_status
          )
          VALUES ($1::uuid, 'qbo', 'refdata_static', 0, 'ok')
        `,
        [operatingCompanyId]
      );
      await expect(
        client.query(
          `
            UPDATE _system.reconciliation_state
            SET consecutive_failure_count = -1
            WHERE operating_company_id = $1::uuid
              AND integration = 'qbo'
              AND mirror_category = 'refdata_static'
          `,
          [operatingCompanyId]
        )
      ).rejects.toThrow();
      return { companyId: operatingCompanyId, integration: "qbo", mirrorCategory: "refdata_static" };
    });
    createdKeys.push(key);
  });
});
