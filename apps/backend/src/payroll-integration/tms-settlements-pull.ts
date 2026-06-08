/**
 * CLOSURE-12 — Pull driver settlements from TMS for a pay period.
 * Uses existing driver_finance.driver_settlements table (no new financial math).
 */

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type TmsSettlementRow = {
  driver_id: string;
  driver_name: string;
  gross_cents: number;
  deductions_cents: number;
  net_cents: number;
  period_start: string;
  period_end: string;
};

export async function pullTmsSettlements(
  client: Queryable,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ rows: TmsSettlementRow[]; total_cents: number }> {
  const result = await client.query<{
    driver_id: string;
    driver_name: string;
    gross_cents: string;
    deductions_cents: string;
    net_cents: string;
    period_start: string;
    period_end: string;
  }>(
    `
    SELECT
      ds.driver_id::text,
      COALESCE(d.first_name || ' ' || d.last_name, 'Unknown') AS driver_name,
      COALESCE(ds.gross_pay_cents, 0)::text AS gross_cents,
      COALESCE(ds.total_deductions_cents, 0)::text AS deductions_cents,
      COALESCE(ds.net_pay_cents, 0)::text AS net_cents,
      ds.period_start::text,
      ds.period_end::text
    FROM driver_finance.driver_settlements ds
    LEFT JOIN mdata.drivers d ON d.id = ds.driver_id
    WHERE ds.operating_company_id = $1::uuid
      AND ds.period_start >= $2::date
      AND ds.period_end <= $3::date
      AND ds.status = 'paid'
    ORDER BY ds.period_start DESC, driver_name ASC
    `,
    [operatingCompanyId, periodStart, periodEnd]
  );

  const rows: TmsSettlementRow[] = result.rows.map((r) => ({
    driver_id: r.driver_id,
    driver_name: r.driver_name,
    gross_cents: Number(r.gross_cents),
    deductions_cents: Number(r.deductions_cents),
    net_cents: Number(r.net_cents),
    period_start: r.period_start,
    period_end: r.period_end,
  }));

  const total_cents = rows.reduce((acc, r) => acc + r.gross_cents, 0);
  return { rows, total_cents };
}
