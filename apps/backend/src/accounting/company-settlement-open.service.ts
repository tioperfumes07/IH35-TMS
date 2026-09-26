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
  const header = existingRes.rows[0];

  if (!header) {
    // R-200 (owner, 2026-09-25): company settlements are one per driver settlement and carry its AlwaysTrack
    // (or P-) number; they are created when that driver settlement closes. This path may no longer create a
    // header or mint a number — it only returns an existing one.
    throw Object.assign(new Error("company_settlement_not_found_for_period"), {
      code: "company_settlement_not_found_for_period",
      message_for_user: "Company settlements are created with their driver settlement, under the same AlwaysTrack number.",
    });
  }

  // R-200: never link other driver settlements into a header by shared dates (that is the merge the owner
  // rejected). The header's own driver settlement link is written where it is created.

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
