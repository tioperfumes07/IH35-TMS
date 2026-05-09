import { runReportQuery, type QueryContext, type ReportDataEnvelope } from "./shared.js";

type DispatchBoardDailyData = {
  by_status: Array<{ status: string; count: number }>;
  total_open: number;
};

export async function dispatchBoardDailyQuery(context: QueryContext): Promise<ReportDataEnvelope<DispatchBoardDailyData>> {
  return runReportQuery(context, async (client) => {
    const result = await client.query(
      `
        SELECT status::text AS status, count(*)::int AS count
        FROM mdata.loads
        WHERE operating_company_id = $1
          AND soft_deleted_at IS NULL
          AND status NOT IN ('delivered', 'invoiced', 'paid', 'closed', 'cancelled')
        GROUP BY status
        ORDER BY count(*) DESC, status::text
      `,
      [context.operatingCompanyId]
    );

    const rows: Array<{ status: string; count: number }> = result.rows.map((row: any) => ({
      status: String(row.status ?? "unknown"),
      count: Number(row.count ?? 0),
    }));
    const totalOpen = rows.reduce((sum: number, row: { status: string; count: number }) => sum + row.count, 0);

    return {
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      summary: `Open loads: ${totalOpen}`,
      data: { by_status: rows, total_open: totalOpen },
    };
  });
}

