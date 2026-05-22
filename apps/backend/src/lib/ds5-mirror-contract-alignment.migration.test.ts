import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withLuciaBypass } from "../auth/db.js";
import { runDs5ContractCheckForCompany } from "../reconciliation/reconciliation-worker.service.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

const EXPECTED_MIRRORS = [
  {
    schema: "mdata",
    table: "qbo_accounts",
    expectedIndex: "ix_qbo_accounts_last_seen_at",
    isQbo: true,
  },
  {
    schema: "mdata",
    table: "qbo_classes",
    expectedIndex: "ix_qbo_classes_last_seen_at",
    isQbo: true,
  },
  {
    schema: "mdata",
    table: "qbo_customers",
    expectedIndex: "ix_qbo_customers_last_seen_at",
    isQbo: true,
  },
  {
    schema: "mdata",
    table: "qbo_items",
    expectedIndex: "ix_qbo_items_last_seen_at",
    isQbo: true,
  },
  {
    schema: "mdata",
    table: "qbo_vendors",
    expectedIndex: "ix_qbo_vendors_last_seen_at",
    isQbo: true,
  },
  {
    schema: "integrations",
    table: "samsara_drivers",
    expectedIndex: "ix_samsara_drivers_last_seen_at",
    isQbo: false,
  },
  {
    schema: "integrations",
    table: "samsara_vehicles",
    expectedIndex: "ix_samsara_vehicles_last_seen_at",
    isQbo: false,
  },
] as const;

describeIntegration("DS-5 mirror contract alignment migration", () => {
  let operatingCompanyId = "";

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    operatingCompanyId = getOperatingCompanyId();
  });

  for (const mirror of EXPECTED_MIRRORS) {
    it(`aligns columns and index for ${mirror.schema}.${mirror.table}`, async () => {
      await withLuciaBypass(async (client) => {
        const columns = await client.query<{
          column_name: string;
          is_generated: "NEVER" | "ALWAYS";
          is_nullable: "YES" | "NO";
        }>(
          `
            SELECT
              column_name,
              is_generated,
              is_nullable
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = $2
              AND column_name = ANY($3::text[])
          `,
          [
            mirror.schema,
            mirror.table,
            [
              "raw_payload",
              "last_seen_at",
              "created_at",
              "updated_at",
            ],
          ]
        );
        const byName = new Map(columns.rows.map((row) => [row.column_name, row]));
        expect(byName.get("raw_payload")?.is_nullable).toBe("NO");
        expect(byName.get("created_at")?.is_nullable).toBe("NO");
        expect(byName.get("updated_at")?.is_nullable).toBe("NO");
        expect(byName.get("last_seen_at")?.is_nullable).toBe("NO");

        if (mirror.isQbo) {
          expect(byName.get("raw_payload")?.is_generated).toBe("NEVER");
          expect(byName.get("last_seen_at")?.is_generated).toBe("NEVER");
        }

        const idx = await client.query<{ indexname: string }>(
          `
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = $1
              AND tablename = $2
              AND indexname = $3
          `,
          [mirror.schema, mirror.table, mirror.expectedIndex]
        );
        expect(idx.rows[0]?.indexname).toBe(mirror.expectedIndex);

        const nulls = await client.query<{ cnt: string }>(
          `
            SELECT COUNT(*)::text AS cnt
            FROM ${mirror.schema}.${mirror.table}
            WHERE created_at IS NULL
              OR updated_at IS NULL
              OR last_seen_at IS NULL
          `
        );
        expect(Number(nulls.rows[0]?.cnt ?? 0)).toBe(0);
      });
    });
  }

  it("adds qbo_classes RLS, policies, and ih35_app grants", async () => {
    await withLuciaBypass(async (client) => {
      const rls = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `
          SELECT c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'mdata'
            AND c.relname = 'qbo_classes'
        `
      );
      expect(rls.rows[0]?.relrowsecurity).toBe(true);
      expect(rls.rows[0]?.relforcerowsecurity).toBe(true);

      const policies = await client.query<{ cnt: string }>(
        `
          SELECT COUNT(*)::text AS cnt
          FROM pg_policies
          WHERE schemaname = 'mdata'
            AND tablename = 'qbo_classes'
        `
      );
      expect(Number(policies.rows[0]?.cnt ?? 0)).toBeGreaterThan(0);

      const grants = await client.query<{ privilege_type: string }>(
        `
          SELECT privilege_type
          FROM information_schema.role_table_grants
          WHERE table_schema = 'mdata'
            AND table_name = 'qbo_classes'
            AND grantee = 'ih35_app'
        `
      );
      const privilegeSet = new Set(grants.rows.map((row) => row.privilege_type));
      expect(privilegeSet.has("SELECT")).toBe(true);
      expect(privilegeSet.has("INSERT")).toBe(true);
      expect(privilegeSet.has("UPDATE")).toBe(true);
    });
  });

  it("coalesces NULL payload_json to {} during QBO insert trigger sync", async () => {
    const qboId = `DS81-NP-${randomUUID()}`;
    await withLuciaBypass(async (client) => {
      const inserted = await client.query<{ raw_payload: Record<string, unknown>; has_last_seen: boolean }>(
        `
          INSERT INTO mdata.qbo_accounts (
            operating_company_id,
            qbo_id,
            name,
            payload_json
          )
          VALUES ($1::uuid, $2, $3, NULL)
          RETURNING raw_payload, (last_seen_at IS NOT NULL) AS has_last_seen
        `,
        [operatingCompanyId, qboId, "DS-8.1 Null Payload Sync"]
      );
      expect(inserted.rows[0]?.raw_payload ?? {}).toEqual({});
      expect(inserted.rows[0]?.has_last_seen).toBe(true);

      await client.query(
        `
          DELETE FROM mdata.qbo_accounts
          WHERE operating_company_id = $1::uuid
            AND qbo_id = $2
        `,
        [operatingCompanyId, qboId]
      );
    });
  });

  it("syncs canonical columns from legacy insert path for QBO mirrors", async () => {
    const qboId = `DS81-LP-${randomUUID()}`;
    const mirroredAt = "2026-01-01T00:00:00.000Z";
    const payload = { source: "legacy_insert", revision: 1 };
    await withLuciaBypass(async (client) => {
      const inserted = await client.query<{ raw_payload: Record<string, unknown>; last_seen_at: string }>(
        `
          INSERT INTO mdata.qbo_accounts (
            operating_company_id,
            qbo_id,
            name,
            payload_json,
            mirrored_at
          )
          VALUES ($1::uuid, $2, $3, $4::jsonb, $5::timestamptz)
          RETURNING raw_payload, last_seen_at::text
        `,
        [operatingCompanyId, qboId, "DS-8.1 Legacy Insert Sync", JSON.stringify(payload), mirroredAt]
      );
      expect(inserted.rows[0]?.raw_payload).toEqual(payload);
      expect(new Date(inserted.rows[0]?.last_seen_at ?? "").toISOString()).toBe(mirroredAt);

      await client.query(
        `
          DELETE FROM mdata.qbo_accounts
          WHERE operating_company_id = $1::uuid
            AND qbo_id = $2
        `,
        [operatingCompanyId, qboId]
      );
    });
  });

  it("updates raw_payload when payload_json changes on QBO mirrors", async () => {
    const qboId = `DS81-UP-${randomUUID()}`;
    await withLuciaBypass(async (client) => {
      await client.query(
        `
          INSERT INTO mdata.qbo_accounts (
            operating_company_id,
            qbo_id,
            name,
            payload_json
          )
          VALUES ($1::uuid, $2, $3, $4::jsonb)
        `,
        [operatingCompanyId, qboId, "DS-8.1 Update Sync", JSON.stringify({ version: 1 })]
      );

      const updated = await client.query<{ raw_payload: Record<string, unknown> }>(
        `
          UPDATE mdata.qbo_accounts
          SET payload_json = $3::jsonb
          WHERE operating_company_id = $1::uuid
            AND qbo_id = $2
          RETURNING raw_payload
        `,
        [operatingCompanyId, qboId, JSON.stringify({ version: 2, mode: "updated" })]
      );
      expect(updated.rows[0]?.raw_payload).toEqual({ version: 2, mode: "updated" });

      await client.query(
        `
          DELETE FROM mdata.qbo_accounts
          WHERE operating_company_id = $1::uuid
            AND qbo_id = $2
        `,
        [operatingCompanyId, qboId]
      );
    });
  });

  it("emits zero schema_contract_gap findings for all DS-5 mirrors", async () => {
    const runId = randomUUID();
    const tables = EXPECTED_MIRRORS.map((mirror) => `${mirror.schema}.${mirror.table}`);

    await withLuciaBypass(async (client) => {
      await runDs5ContractCheckForCompany(client, operatingCompanyId, runId);
      const schemaGapRows = await client.query<{ cnt: string }>(
        `
          SELECT COUNT(*)::text AS cnt
          FROM _system.reconciliation_findings
          WHERE reconciliation_run_id = $1::uuid
            AND finding_type = 'schema_contract_gap'
            AND (resource_scope->>'table') = ANY($2::text[])
        `,
        [runId, tables]
      );
      expect(Number(schemaGapRows.rows[0]?.cnt ?? 0)).toBe(0);

      await client.query(
        `
          DELETE FROM _system.reconciliation_findings
          WHERE reconciliation_run_id = $1::uuid
        `,
        [runId]
      );
    });
  });
});
