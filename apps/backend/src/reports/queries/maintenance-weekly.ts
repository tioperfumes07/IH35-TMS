import { runReportQuery, type QueryContext, type ReportDataEnvelope } from "./shared.js";

type MaintenanceWeeklyData = {
  by_status: Array<{ status: string; count: number }>;
  open_work_orders: number;
};

export async function maintenanceWeeklyQuery(context: QueryContext): Promise<ReportDataEnvelope<MaintenanceWeeklyData>> {
  return runReportQuery(context, async (client) => {
    const result = await client.query(
      `
        SELECT status::text AS status, count(*)::int AS count
        FROM maintenance.work_orders
        WHERE operating_company_id = $1
          AND status NOT IN ('complete', 'cancelled')
        GROUP BY status
        ORDER BY count(*) DESC, status::text
      `,
      [context.operatingCompanyId]
    );

    const rows: Array<{ status: string; count: number }> = result.rows.map((row: any) => ({
      status: String(row.status ?? "unknown"),
      count: Number(row.count ?? 0),
    }));
    const openCount = rows.reduce((sum: number, row: { status: string; count: number }) => sum + row.count, 0);

    return {
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      summary: `Open work orders: ${openCount}`,
      data: {
        by_status: rows,
        open_work_orders: openCount,
      },
    };
  });
}

