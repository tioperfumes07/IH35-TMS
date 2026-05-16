import type { PoolClient } from "pg";

export async function insertQboSyncConflictRow(
  client: PoolClient,
  input: {
    operating_company_id: string;
    entity_type: string;
    entity_id: string;
    qbo_id: string | null;
    tms_snapshot: unknown;
    qbo_snapshot: unknown;
    conflict_fields: string[];
    severity: "low" | "medium" | "high";
  }
) {
  await client.query(
    `
      INSERT INTO integrations.qbo_sync_conflicts (
        operating_company_id,
        entity_type,
        entity_id,
        qbo_id,
        tms_snapshot,
        qbo_snapshot,
        conflict_fields,
        severity
      )
      VALUES ($1,$2,$3::uuid,$4,$5::jsonb,$6::jsonb,$7,$8)
    `,
    [
      input.operating_company_id,
      input.entity_type,
      input.entity_id,
      input.qbo_id,
      JSON.stringify(input.tms_snapshot ?? {}),
      JSON.stringify(input.qbo_snapshot ?? {}),
      input.conflict_fields,
      input.severity,
    ]
  );
}
