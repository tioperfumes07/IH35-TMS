import { runReportQuery, type QueryContext, type ReportDataEnvelope } from "./shared.js";

type ProfitPerTruckWeeklyRow = {
  unit_id: string;
  unit_number: string;
  revenue_cents: number;
  wo_cost_cents: number;
  profit_cents: number;
};

type ProfitPerTruckWeeklyData = {
  rows: ProfitPerTruckWeeklyRow[];
};

export async function profitPerTruckWeeklyQuery(context: QueryContext): Promise<ReportDataEnvelope<ProfitPerTruckWeeklyData>> {
  return runReportQuery(context, async (client) => {
    const result = await client.query(
      `
        SELECT
          u.id AS unit_id,
          COALESCE(u.unit_number, u.id::text) AS unit_number,
          COALESCE(
            SUM(
              CASE
                WHEN l.created_at >= now() - interval '7 days'
                THEN COALESCE(l.rate_total_cents, 0)
                ELSE 0
              END
            ),
            0
          )::bigint AS revenue_cents,
          COALESCE(
            SUM(
              CASE
                WHEN COALESCE(wo.updated_at, wo.opened_at) >= now() - interval '7 days'
                THEN ROUND(COALESCE(wo.total_actual_cost, wo.total_cost, 0)::numeric * 100)
                ELSE 0
              END
            ),
            0
          )::bigint AS wo_cost_cents
        FROM mdata.units u
        LEFT JOIN mdata.loads l
          ON l.operating_company_id = $1
          AND l.assigned_unit_id = u.id
          AND l.soft_deleted_at IS NULL
        LEFT JOIN maintenance.work_orders wo
          ON wo.operating_company_id = $1
          AND wo.unit_id = u.id
        WHERE u.operating_company_id = $1
          AND u.deactivated_at IS NULL
        GROUP BY u.id, u.unit_number
        HAVING
          COALESCE(
            SUM(
              CASE
                WHEN l.created_at >= now() - interval '7 days'
                THEN COALESCE(l.rate_total_cents, 0)
                ELSE 0
              END
            ),
            0
          ) > 0
          OR
          COALESCE(
            SUM(
              CASE
                WHEN COALESCE(wo.updated_at, wo.opened_at) >= now() - interval '7 days'
                THEN ROUND(COALESCE(wo.total_actual_cost, wo.total_cost, 0)::numeric * 100)
                ELSE 0
              END
            ),
            0
          ) > 0
        ORDER BY (
          COALESCE(
            SUM(
              CASE
                WHEN l.created_at >= now() - interval '7 days'
                THEN COALESCE(l.rate_total_cents, 0)
                ELSE 0
              END
            ),
            0
          )
          -
          COALESCE(
            SUM(
              CASE
                WHEN COALESCE(wo.updated_at, wo.opened_at) >= now() - interval '7 days'
                THEN ROUND(COALESCE(wo.total_actual_cost, wo.total_cost, 0)::numeric * 100)
                ELSE 0
              END
            ),
            0
          )
        ) DESC
      `,
      [context.operatingCompanyId]
    );

    const rows: ProfitPerTruckWeeklyRow[] = result.rows.map((row: any) => {
      const revenueCents = Number(row.revenue_cents ?? 0);
      const woCostCents = Number(row.wo_cost_cents ?? 0);
      return {
        unit_id: String(row.unit_id),
        unit_number: String(row.unit_number),
        revenue_cents: revenueCents,
        wo_cost_cents: woCostCents,
        profit_cents: revenueCents - woCostCents,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      summary: `Units with activity: ${rows.length}`,
      data: { rows },
    };
  });
}

