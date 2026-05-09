import { runReportQuery, type QueryContext, type ReportDataEnvelope } from "./shared.js";

type DriverSettlementsWeeklyRow = {
  driver_id: string;
  driver_name: string;
  status: string;
  net_cents: number;
};

type DriverSettlementsWeeklyData = {
  rows: DriverSettlementsWeeklyRow[];
  total_open_cents: number;
};

export async function driverSettlementsWeeklyQuery(context: QueryContext): Promise<ReportDataEnvelope<DriverSettlementsWeeklyData>> {
  return runReportQuery(context, async (client) => {
    const result = await client.query(
      `
        SELECT
          s.driver_id,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          s.status::text AS status,
          COALESCE(ROUND(s.net_pay::numeric * 100), 0)::bigint AS net_cents
        FROM driver_finance.driver_settlements s
        LEFT JOIN mdata.drivers d ON d.id = s.driver_id
        WHERE s.operating_company_id = $1
          AND s.status IN ('draft', 'ready', 'approved')
          AND s.period_end >= CURRENT_DATE - interval '14 days'
        ORDER BY s.period_end DESC, driver_name ASC
      `,
      [context.operatingCompanyId]
    );

    const rows: DriverSettlementsWeeklyRow[] = result.rows.map((row: any) => ({
      driver_id: String(row.driver_id),
      driver_name: String(row.driver_name ?? "Unknown Driver"),
      status: String(row.status ?? "unknown"),
      net_cents: Number(row.net_cents ?? 0),
    }));
    const totalOpenCents = rows.reduce((sum, row) => sum + row.net_cents, 0);

    return {
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      summary: `Open settlements: ${rows.length} · ${totalOpenCents}c`,
      data: {
        rows,
        total_open_cents: totalOpenCents,
      },
    };
  });
}

