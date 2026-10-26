import type { PoolClient } from "pg";

/**
 * 443.281-B endpoint 3: paged driver settlements report.
 * Returns one row per settlement with gross/deductions/advances/escrow/net,
 * linked load count, and pagination. Scope: USMCA operating_company_id only.
 */

export type DriversSettlementsQuery = {
  operatingCompanyId: string;
  from: string;
  to: string;
  driverId?: string;
  status?: string;
  limit: number;
  offset: number;
};

export type DriversSettlementsRow = {
  settlement_id: string;
  settlement_number: string | null;
  driver_id: string;
  driver_name: string;
  period_start: string;
  period_end: string;
  status: string;
  gross_cents: number;
  deductions_cents: number;
  advances_cents: number;
  escrow_withheld_cents: number;
  net_cents: number;
  load_count: number;
};

export type DriversSettlementsTotals = {
  settlement_count: number;
  gross_cents: number;
  deductions_cents: number;
  advances_cents: number;
  escrow_withheld_cents: number;
  net_cents: number;
};

export type DriversSettlementsPayload = {
  period: { start: string; end: string };
  pagination: { limit: number; offset: number; total: number };
  totals: DriversSettlementsTotals;
  rows: DriversSettlementsRow[];
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getDriversSettlementsReport(
  client: PoolClient,
  query: DriversSettlementsQuery
): Promise<DriversSettlementsPayload> {
  const { operatingCompanyId, from, to, limit, offset } = query;

  const values: unknown[] = [operatingCompanyId, from, to];
  const filters: string[] = [
    `s.period_start >= $2::date`,
    `s.period_end <= $3::date`,
    `s.voided_at IS NULL`,
  ];

  if (query.driverId) {
    values.push(query.driverId);
    filters.push(`s.driver_id = $${values.length}::uuid`);
  }
  if (query.status) {
    values.push(query.status);
    filters.push(`s.status = $${values.length}`);
  }

  const limitIdx = values.length + 1;
  const offsetIdx = values.length + 2;
  values.push(limit, offset);

  const res = await client.query(
    `
      SELECT
        s.id AS settlement_id,
        s.source_document_ref AS settlement_number,
        s.driver_id,
        COALESCE(CONCAT_WS(' ', d.first_name, d.last_name), 'Unknown') AS driver_name,
        s.period_start,
        s.period_end,
        s.status,
        COALESCE(ROUND(s.gross_pay::numeric * 100), 0)::bigint AS gross_cents,
        COALESCE(ROUND(s.deductions_total::numeric * 100), 0)::bigint AS deductions_cents,
        COALESCE(ROUND(s.reimbursements_total::numeric * 100), 0)::bigint AS advances_cents,
        COALESCE((
          SELECT SUM(el.amount_cents)
          FROM driver_finance.escrow_ledger el
          WHERE el.driver_id = s.driver_id
            AND el.operating_company_id = $1::uuid
            AND el.settlement_id = s.id
            AND el.transaction_type = 'hold'
        ), 0)::bigint AS escrow_withheld_cents,
        COALESCE(ROUND(s.net_pay::numeric * 100), 0)::bigint AS net_cents,
        COALESCE((
          SELECT COUNT(DISTINCT l.id)
          FROM mdata.loads l
          WHERE l.presettlement_link_id = s.id
            AND l.operating_company_id = $1::uuid
        ), 0)::int AS load_count,
        COUNT(*) OVER () AS _total_count
      FROM driver_finance.driver_settlements s
      LEFT JOIN mdata.drivers d ON d.id = s.driver_id AND d.operating_company_id = s.operating_company_id
      WHERE s.operating_company_id = $1::uuid
        AND ${filters.join("\n        AND ")}
      ORDER BY s.period_end DESC, s.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const total = res.rows.length > 0 ? num(res.rows[0]._total_count) : 0;

  const rows: DriversSettlementsRow[] = (res.rows as Array<Record<string, unknown>>).map((row) => ({
    settlement_id: String(row.settlement_id),
    settlement_number: row.settlement_number != null ? String(row.settlement_number) : null,
    driver_id: String(row.driver_id),
    driver_name: String(row.driver_name),
    period_start: String(row.period_start).slice(0, 10),
    period_end: String(row.period_end).slice(0, 10),
    status: String(row.status),
    gross_cents: num(row.gross_cents),
    deductions_cents: num(row.deductions_cents),
    advances_cents: num(row.advances_cents),
    escrow_withheld_cents: num(row.escrow_withheld_cents),
    net_cents: num(row.net_cents),
    load_count: num(row.load_count),
  }));

  const totals: DriversSettlementsTotals = {
    settlement_count: total,
    gross_cents: rows.reduce((s, r) => s + r.gross_cents, 0),
    deductions_cents: rows.reduce((s, r) => s + r.deductions_cents, 0),
    advances_cents: rows.reduce((s, r) => s + r.advances_cents, 0),
    escrow_withheld_cents: rows.reduce((s, r) => s + r.escrow_withheld_cents, 0),
    net_cents: rows.reduce((s, r) => s + r.net_cents, 0),
  };

  return {
    period: { start: from, end: to },
    pagination: { limit, offset, total },
    totals,
    rows,
  };
}
