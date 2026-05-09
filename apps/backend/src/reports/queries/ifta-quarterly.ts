import { runReportQuery, type QueryContext, type ReportDataEnvelope } from "./shared.js";

type IftaQuarterlyRow = {
  state: string;
  stop_events: number;
  estimated_miles: number;
  estimated_gallons: number;
};

type IftaQuarterlyData = {
  quarter_label: string;
  rows: IftaQuarterlyRow[];
  total_estimated_miles: number;
  total_estimated_gallons: number;
};

export async function iftaQuarterlyQuery(context: QueryContext): Promise<ReportDataEnvelope<IftaQuarterlyData>> {
  return runReportQuery(context, async (client) => {
    const quarterStartRes = await client.query(
      `SELECT date_trunc('quarter', now())::date AS quarter_start, (date_trunc('quarter', now()) + interval '3 months')::date AS quarter_end`
    );
    const quarterStart = quarterStartRes.rows[0]?.quarter_start as string;
    const quarterEnd = quarterStartRes.rows[0]?.quarter_end as string;

    const result = await client.query(
      `
        SELECT
          UPPER(COALESCE(NULLIF(ls.state, ''), 'UNKNOWN')) AS state,
          count(*)::int AS stop_events
        FROM mdata.load_stops ls
        JOIN mdata.loads l ON l.id = ls.load_id
        WHERE l.operating_company_id = $1
          AND l.soft_deleted_at IS NULL
          AND l.created_at >= $2::date
          AND l.created_at < $3::date
          AND ls.state IS NOT NULL
        GROUP BY UPPER(COALESCE(NULLIF(ls.state, ''), 'UNKNOWN'))
        ORDER BY stop_events DESC, state
      `,
      [context.operatingCompanyId, quarterStart, quarterEnd]
    );

    const rows: IftaQuarterlyRow[] = result.rows.map((row: any) => ({
      state: String(row.state),
      stop_events: Number(row.stop_events ?? 0),
      // Placeholder estimates until full IFTA mileage/fuel tables ship.
      estimated_miles: Number(row.stop_events ?? 0) * 0,
      estimated_gallons: Number(row.stop_events ?? 0) * 0,
    }));

    const totalMiles = rows.reduce((sum, row) => sum + row.estimated_miles, 0);
    const totalGallons = rows.reduce((sum, row) => sum + row.estimated_gallons, 0);
    const quarterLabel = `${quarterStart} to ${new Date(new Date(quarterEnd).getTime() - 86400000).toISOString().slice(0, 10)}`;

    return {
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      summary: `States with activity: ${rows.length}`,
      data: {
        quarter_label: quarterLabel,
        rows,
        total_estimated_miles: totalMiles,
        total_estimated_gallons: totalGallons,
      },
    };
  });
}

