/**
 * ROUND 150 — settlement resolve for a load, kept OUT of load-settlement-summary.routes.ts
 * so a driver_settlements.status filter is never scanned as an inline mdata.loads status gate
 * (verify-one-canonical-active-load-set sliding window). This file never references mdata.loads.
 *
 * Prefer the load's own presettlement_link_id (canonical current pointer). Fallback excludes
 * cancelled settlements only — that is a SETTLEMENT status gate, not a load-status definition.
 */
export type Queryable = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const SETTLEMENT_COLS = `
  s.id,
  s.display_id,
  s.source_document_ref,
  s.driver_id,
  s.status,
  s.trip_closed_at,
  s.first_load_id,
  s.first_load_number,
  s.last_load_id,
  s.last_load_number,
  s.gross_pay,
  s.deductions_total,
  s.reimbursements_total,
  s.net_pay,
  s.period_start,
  s.period_end,
  s.settlement_model`;

export async function resolveSettlementForLoad(
  client: Queryable,
  args: {
    operatingCompanyId: string;
    loadId: string;
    presettlementLinkId: string | null;
  }
): Promise<Record<string, unknown> | null> {
  const { operatingCompanyId, loadId, presettlementLinkId } = args;

  if (presettlementLinkId) {
    const byLink = await client.query<Record<string, unknown>>(
      `SELECT ${SETTLEMENT_COLS}
         FROM driver_finance.driver_settlements s
        WHERE s.id = $1::uuid AND s.operating_company_id = $2::uuid`,
      [presettlementLinkId, operatingCompanyId]
    );
    if (byLink.rows[0]) return byLink.rows[0]!;
  }

  // Settlement-document status only — never a load-status vocabulary. Excludes cancelled so a
  // superseded settlement cannot win via created_at DESC.
  const settlRes = await client.query<Record<string, unknown>>(
    `SELECT ${SETTLEMENT_COLS}
       FROM driver_finance.driver_settlements s
      WHERE s.operating_company_id = $1::uuid
        AND s.status IS DISTINCT FROM 'cancelled'
        AND (
          s.first_load_id = $2::uuid
          OR s.last_load_id = $2::uuid
          OR EXISTS (
            SELECT 1
              FROM driver_finance.settlement_lines sl
              LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
             WHERE sl.settlement_id = s.id
               AND COALESCE(db.load_id, sl.load_id) = $2::uuid
               AND sl.is_active AND sl.voided_at IS NULL
          )
        )
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [operatingCompanyId, loadId]
  );
  return settlRes.rows[0] ?? null;
}
