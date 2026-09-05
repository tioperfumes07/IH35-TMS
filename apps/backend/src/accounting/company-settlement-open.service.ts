// M.3 (STANDING-DIRECTIVES-2026-09-05.md §CC-1, owner-numbered sequence): "open = pre-settlement
// (many loads, one number, start/end)". The existing find-or-create-by-period logic
// (company-settlement-close.service.ts's closeCompanySettlementAlongsideDriverSettlement) only ever
// creates a company_settlements row as a SIDE EFFECT of one specific driver settlement's tour-close
// -- there was no way to see/open a company settlement's period grouping BEFORE any driver
// settlement in it closes. This is that missing "open" half: given a period, find-or-create the
// header and link every driver settlement that shares that EXACT period (any status) -- same grain
// convention the close path already established (exact period_start/period_end match, never merging
// overlapping-but-different periods). Read-only in effect on driver_finance.driver_settlements
// (never mutates them); the only write is the company_settlements header + the junction table.

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type OpenCompanySettlementResult = {
  company_settlement_id: string;
  display_id: string;
  status: string;
  linked_driver_settlement_count: number;
};

export async function openOrGetCompanySettlementForPeriod(
  client: DbClient,
  input: { operatingCompanyId: string; periodStart: string; periodEnd: string; actorUserId: string }
): Promise<OpenCompanySettlementResult> {
  const existingRes = await client.query<{ id: string; display_id: string; status: string }>(
    `
      SELECT id::text, display_id, status
      FROM accounting.company_settlements
      WHERE operating_company_id = $1::uuid
        AND period_start = $2::date
        AND period_end = $3::date
        AND voided_at IS NULL
      LIMIT 1
    `,
    [input.operatingCompanyId, input.periodStart, input.periodEnd]
  );
  let header = existingRes.rows[0];

  if (!header) {
    const displayIdRes = await client.query<{ display_id: string }>(
      `SELECT accounting.next_company_settlement_display_id($1::uuid, $2::date) AS display_id`,
      [input.operatingCompanyId, input.periodStart]
    );
    const displayId = displayIdRes.rows[0]?.display_id;
    const insertRes = await client.query<{ id: string; display_id: string; status: string }>(
      `
        INSERT INTO accounting.company_settlements
          (operating_company_id, display_id, period_start, period_end, status, created_by_user_id)
        VALUES ($1::uuid, $2, $3::date, $4::date, 'open', $5::uuid)
        RETURNING id::text, display_id, status
      `,
      [input.operatingCompanyId, displayId, input.periodStart, input.periodEnd, input.actorUserId]
    );
    header = insertRes.rows[0];
  }

  // Link every driver settlement sharing this EXACT period -- idempotent (the junction's own
  // uq_driver_settlement_one_company_settlement refuses a second link for an already-linked driver
  // settlement, so a driver settlement belonging to a DIFFERENT company settlement is silently
  // skipped here rather than stolen into this one).
  const dsRes = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND period_start = $2::date
        AND period_end = $3::date
    `,
    [input.operatingCompanyId, input.periodStart, input.periodEnd]
  );
  for (const ds of dsRes.rows) {
    await client.query(
      `
        INSERT INTO accounting.company_settlement_driver_settlements (company_settlement_id, driver_settlement_id)
        VALUES ($1::uuid, $2::uuid)
        ON CONFLICT DO NOTHING
      `,
      [header.id, ds.id]
    );
  }

  const countRes = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM accounting.company_settlement_driver_settlements WHERE company_settlement_id = $1::uuid`,
    [header.id]
  );

  return {
    company_settlement_id: header.id,
    display_id: header.display_id,
    status: header.status,
    linked_driver_settlement_count: Number(countRes.rows[0]?.n ?? 0),
  };
}
