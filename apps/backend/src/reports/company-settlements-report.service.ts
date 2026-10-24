import type { PoolClient } from "pg";

/**
 * 443.281-B endpoint 4: paged company settlements report.
 * Returns one row per company settlement with period, status, driver settlement
 * count, and net_revenue_cents from the load revenue rollup. No waterfall call
 * (too expensive at report scale) — uses inline revenue aggregation from
 * accounting.company_settlement_driver_settlements → driver_finance.driver_settlements.
 */

export type CompanySettlementsQuery = {
  operatingCompanyId: string;
  from: string;
  to: string;
  status?: string;
  limit: number;
  offset: number;
};

export type CompanySettlementsRow = {
  company_settlement_id: string;
  display_id: string;
  period_start: string;
  period_end: string;
  status: string;
  closed_at: string | null;
  voided_at: string | null;
  driver_settlement_count: number;
  gross_driver_pay_cents: number;
  net_revenue_cents: number | null;
};

export type CompanySettlementsTotals = {
  settlement_count: number;
  gross_driver_pay_cents: number;
};

export type CompanySettlementsPayload = {
  period: { start: string; end: string };
  pagination: { limit: number; offset: number; total: number };
  totals: CompanySettlementsTotals;
  rows: CompanySettlementsRow[];
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getCompanySettlementsReport(
  client: PoolClient,
  query: CompanySettlementsQuery
): Promise<CompanySettlementsPayload> {
  const { operatingCompanyId, from, to, limit, offset } = query;

  const values: unknown[] = [operatingCompanyId, from, to];
  const filters: string[] = [
    `cs.operating_company_id = $1::uuid`,
    `cs.period_start >= $2::date`,
    `cs.period_end <= $3::date`,
  ];

  if (query.status) {
    values.push(query.status);
    filters.push(`cs.status = $${values.length}`);
  }

  const limitIdx = values.length + 1;
  const offsetIdx = values.length + 2;
  values.push(limit, offset);

  const res = await client.query(
    `
      SELECT
        cs.id::text AS company_settlement_id,
        cs.display_id,
        cs.period_start::text AS period_start,
        cs.period_end::text AS period_end,
        cs.status,
        cs.closed_at::text AS closed_at,
        cs.voided_at::text AS voided_at,
        COUNT(DISTINCT csds.driver_settlement_id)::int AS driver_settlement_count,
        COALESCE(SUM(
          COALESCE(ROUND(ds.gross_pay::numeric * 100), 0)
        ), 0)::bigint AS gross_driver_pay_cents,
        -- net_revenue_cents: sum of load revenue from loads linked to this company settlement's
        -- driver settlements, via presettlement_link. NULL for voided settlements.
        CASE WHEN cs.voided_at IS NOT NULL THEN NULL
          ELSE COALESCE((
            SELECT SUM(lcr.revenue_cents)
            FROM driver_finance.presettlement_link psl
            JOIN accounting.company_settlement_driver_settlements csds2
              ON csds2.driver_settlement_id = psl.settlement_id
            JOIN mdata.loads l ON l.id = psl.load_id
            LEFT JOIN LATERAL (
              SELECT
                COALESCE(SUM(il.amount_cents), 0)::bigint AS revenue_cents
              FROM accounting.invoices inv
              JOIN accounting.invoice_lines il ON il.invoice_id = inv.id
              WHERE inv.load_id = l.id
                AND inv.operating_company_id = $1::uuid
                AND inv.voided_at IS NULL
            ) lcr ON true
            WHERE csds2.company_settlement_id = cs.id
          ), 0)
        END AS net_revenue_cents,
        COUNT(*) OVER () AS _total_count
      FROM accounting.company_settlements cs
      LEFT JOIN accounting.company_settlement_driver_settlements csds ON csds.company_settlement_id = cs.id
      LEFT JOIN driver_finance.driver_settlements ds ON ds.id = csds.driver_settlement_id
      WHERE ${filters.join("\n        AND ")}
      GROUP BY cs.id, cs.display_id, cs.period_start, cs.period_end, cs.status, cs.closed_at, cs.voided_at
      ORDER BY cs.period_start DESC, cs.display_id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const total = res.rows.length > 0 ? num((res.rows[0] as Record<string, unknown>)._total_count) : 0;

  const rows: CompanySettlementsRow[] = (res.rows as Array<Record<string, unknown>>).map((row) => ({
    company_settlement_id: String(row.company_settlement_id),
    display_id: String(row.display_id ?? ""),
    period_start: String(row.period_start ?? "").slice(0, 10),
    period_end: String(row.period_end ?? "").slice(0, 10),
    status: String(row.status ?? ""),
    closed_at: row.closed_at != null ? String(row.closed_at).slice(0, 10) : null,
    voided_at: row.voided_at != null ? String(row.voided_at).slice(0, 10) : null,
    driver_settlement_count: num(row.driver_settlement_count),
    gross_driver_pay_cents: num(row.gross_driver_pay_cents),
    net_revenue_cents: row.net_revenue_cents != null ? num(row.net_revenue_cents) : null,
  }));

  const totals: CompanySettlementsTotals = {
    settlement_count: total,
    gross_driver_pay_cents: rows.reduce((s, r) => s + r.gross_driver_pay_cents, 0),
  };

  return {
    period: { start: from, end: to },
    pagination: { limit, offset, total },
    totals,
    rows,
  };
}
