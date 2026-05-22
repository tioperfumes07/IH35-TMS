import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";

const describeIntegration = describe.skipIf(!process.env.DATABASE_URL);

describeIntegration("reconciliation findings migration", () => {
  let operatingCompanyId = "";
  let otherCompanyId = "";
  const insertedIds: string[] = [];

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    operatingCompanyId = getOperatingCompanyId();
    otherCompanyId = await withLuciaBypass(async (client) => {
      const res = await client.query<{ id: string }>(
        `
          SELECT id::text
          FROM org.companies
          WHERE id <> $1::uuid
          ORDER BY code ASC
          LIMIT 1
        `,
        [operatingCompanyId]
      );
      return res.rows[0]?.id ?? "";
    });
    if (!otherCompanyId) {
      throw new Error("requires at least two companies to validate RLS tenant isolation");
    }
  });

  afterAll(async () => {
    if (insertedIds.length === 0) return;
    await withLuciaBypass(async (client) => {
      await client.query(`DELETE FROM _system.reconciliation_findings WHERE id = ANY($1::uuid[])`, [insertedIds]);
    });
  });

  it("creates _system.reconciliation_findings table", async () => {
    const exists = await withLuciaBypass(async (client) => {
      const res = await client.query<{ regclass: string | null }>(
        `SELECT to_regclass('_system.reconciliation_findings')::text AS regclass`
      );
      return res.rows[0]?.regclass ?? null;
    });
    expect(exists).toBe("_system.reconciliation_findings");
  });

  it("rejects invalid enum values for integration, finding_type, and status", async () => {
    await expect(
      withCurrentUser(TEST_OWNER_USER_ID, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
        await client.query(
          `
            INSERT INTO _system.reconciliation_findings (
              operating_company_id,
              integration,
              mirror_category,
              finding_type,
              severity,
              status,
              resource_scope,
              local_value,
              threshold_snapshot,
              first_seen_at,
              last_seen_at
            ) VALUES (
              $1::uuid,
              'invalid_integration',
              'refdata_static',
              'invalid_finding_type',
              'important',
              'invalid_status',
              $2::jsonb,
              $3::jsonb,
              $4::jsonb,
              now(),
              now()
            )
          `,
          [operatingCompanyId, JSON.stringify({}), JSON.stringify({}), JSON.stringify({})]
        );
      })
    ).rejects.toThrow();
  });

  it("allows scoped insert under matching tenant context", async () => {
    const id = await withCurrentUser(TEST_OWNER_USER_ID, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const res = await client.query<{ id: string }>(
        `
          INSERT INTO _system.reconciliation_findings (
            operating_company_id,
            integration,
            mirror_category,
            finding_type,
            severity,
            resource_scope,
            local_value,
            threshold_snapshot,
            first_seen_at,
            last_seen_at
          ) VALUES (
            $1::uuid,
            'qbo',
            'refdata_static',
            'count_drift',
            'important',
            $2::jsonb,
            $3::jsonb,
            $4::jsonb,
            now(),
            now()
          )
          RETURNING id::text
        `,
        [operatingCompanyId, JSON.stringify({ table: "mdata.qbo_items" }), JSON.stringify({ local: 5 }), JSON.stringify({ abs: 0 })]
      );
      return res.rows[0].id;
    });
    insertedIds.push(id);
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("rejects insert when row company does not match tenant context", async () => {
    await expect(
      withCurrentUser(TEST_OWNER_USER_ID, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
        await client.query(
          `
            INSERT INTO _system.reconciliation_findings (
              operating_company_id,
              integration,
              mirror_category,
              finding_type,
              severity,
              resource_scope,
              local_value,
              threshold_snapshot,
              first_seen_at,
              last_seen_at
            ) VALUES (
              $1::uuid,
              'qbo',
              'refdata_static',
              'count_drift',
              'important',
              $2::jsonb,
              $3::jsonb,
              $4::jsonb,
              now(),
              now()
            )
          `,
          [otherCompanyId, JSON.stringify({ table: "mdata.qbo_items" }), JSON.stringify({ local: 1 }), JSON.stringify({ abs: 0 })]
        );
      })
    ).rejects.toThrow();
  });

  it("defaults status to open on insert", async () => {
    const row = await withCurrentUser(TEST_OWNER_USER_ID, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const res = await client.query<{ id: string; status: string }>(
        `
          INSERT INTO _system.reconciliation_findings (
            operating_company_id,
            integration,
            mirror_category,
            finding_type,
            severity,
            resource_scope,
            local_value,
            threshold_snapshot,
            first_seen_at,
            last_seen_at
          ) VALUES (
            $1::uuid,
            'samsara',
            'telematics_numeric',
            'value_drift',
            'cleanup',
            $2::jsonb,
            $3::jsonb,
            $4::jsonb,
            now(),
            now()
          )
          RETURNING id::text, status
        `,
        [operatingCompanyId, JSON.stringify({ vehicle_id: randomUUID() }), JSON.stringify({ odometer: 10 }), JSON.stringify({ max_abs: 10 })]
      );
      return res.rows[0];
    });
    insertedIds.push(row.id);
    expect(row.status).toBe("open");
  });
});
