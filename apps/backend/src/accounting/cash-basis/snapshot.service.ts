type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type ClosedPeriodRow = { id: string };
type SnapshotRow = { snapshot_payload: Record<string, unknown> | null };

export async function findClosedPeriodForDate(client: DbClient, input: { operatingCompanyId: string; anchorDate: string }) {
  const res = await client.query<ClosedPeriodRow>(
    `
      SELECT id::text AS id
      FROM accounting.periods
      WHERE operating_company_id = $1::uuid
        AND status = 'closed'
        AND $2::date BETWEEN period_start AND period_end
      ORDER BY period_end DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, input.anchorDate],
  );
  return res.rows[0]?.id ?? null;
}

export async function readPeriodCashBasisSnapshot(client: DbClient, input: { operatingCompanyId: string; periodId: string }) {
  const res = await client.query<SnapshotRow>(
    `
      SELECT snapshot_payload
      FROM accounting.period_cash_basis_snapshot
      WHERE operating_company_id = $1::uuid
        AND period_id = $2::uuid
      LIMIT 1
    `,
    [input.operatingCompanyId, input.periodId],
  );
  return (res.rows[0]?.snapshot_payload as Record<string, unknown> | null | undefined) ?? null;
}

export async function upsertPeriodCashBasisSnapshot(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    periodId: string;
    snapshotPayload: Record<string, unknown>;
    computedByUserUuid: string;
  },
) {
  await client.query(
    `
      INSERT INTO accounting.period_cash_basis_snapshot (
        operating_company_id,
        period_id,
        snapshot_payload,
        computed_by_user_uuid
      )
      VALUES ($1::uuid, $2::uuid, $3::jsonb, $4::uuid)
      ON CONFLICT (operating_company_id, period_id)
      DO UPDATE
        SET snapshot_payload = EXCLUDED.snapshot_payload,
            computed_by_user_uuid = EXCLUDED.computed_by_user_uuid,
            computed_at = now()
    `,
    [input.operatingCompanyId, input.periodId, JSON.stringify(input.snapshotPayload), input.computedByUserUuid],
  );
}
