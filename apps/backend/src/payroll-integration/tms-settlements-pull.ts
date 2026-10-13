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
      -- ACCT-F4431379: the canonical header stores DOLLARS (gross_pay / deductions_total / net_pay);
      -- gross_pay_cents / total_deductions_cents / net_pay_cents never existed and threw on first
      -- query. Cents via ROUND(x * 100), the same conversion payroll/aggregated.routes.ts uses.
      ROUND(ds.gross_pay * 100)::bigint::text AS gross_cents,
      ROUND(ds.deductions_total * 100)::bigint::text AS deductions_cents,
      ROUND(ds.net_pay * 100)::bigint::text AS net_cents,
      ds.period_start::text,
      ds.period_end::text
    FROM driver_finance.driver_settlements ds
    LEFT JOIN mdata.drivers d ON d.id = ds.driver_id
                              AND d.operating_company_id = $1::uuid
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
