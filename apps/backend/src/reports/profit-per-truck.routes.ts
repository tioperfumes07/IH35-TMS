import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, parseMonthWindow, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  unit_id: z.string().uuid().optional(),
});

export async function registerProfitPerTruckRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/profit-per-truck", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const { start, end } = parseMonthWindow(query.data.month);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id, start, end];
      let unitFilter = "";
      if (query.data.unit_id) {
        values.push(query.data.unit_id);
        unitFilter = ` AND u.id = $${values.length}`;
      }
      const res = await client.query(
        `
          SELECT
            u.id AS unit_id,
            u.unit_number,
            COALESCE(SUM(CASE WHEN l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz THEN l.rate_total_cents ELSE 0 END), 0)::bigint AS revenue_cents,
            COALESCE(
              SUM(
                CASE
                  WHEN COALESCE(wo.updated_at, wo.opened_at) >= $2::timestamptz
                   AND COALESCE(wo.updated_at, wo.opened_at) < $3::timestamptz
                  THEN ROUND(COALESCE(wo.total_actual_cost, wo.total_cost, 0)::numeric * 100)
                  ELSE 0
                END
              ),
              0
            )::bigint AS wo_cost_cents
          FROM mdata.units u
          LEFT JOIN mdata.loads l
            ON l.assigned_unit_id = u.id
            AND l.operating_company_id = $1
            AND l.soft_deleted_at IS NULL
          LEFT JOIN maintenance.work_orders wo
            ON wo.unit_id = u.id
            AND wo.operating_company_id = $1
          WHERE u.deactivated_at IS NULL
            AND u.operating_company_id = $1
            ${unitFilter}
          GROUP BY u.id, u.unit_number
          ORDER BY (
            COALESCE(SUM(CASE WHEN l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz THEN l.rate_total_cents ELSE 0 END), 0)
            -
            COALESCE(
              SUM(
                CASE
                  WHEN COALESCE(wo.updated_at, wo.opened_at) >= $2::timestamptz
                   AND COALESCE(wo.updated_at, wo.opened_at) < $3::timestamptz
                  THEN ROUND(COALESCE(wo.total_actual_cost, wo.total_cost, 0)::numeric * 100)
                  ELSE 0
                END
              ),
              0
            )
          ) DESC
        `,
        values
      );
      return res.rows.map((row: any) => ({
        unit_id: row.unit_id,
        unit_number: row.unit_number,
        revenue_cents: Number(row.revenue_cents ?? 0),
        wo_cost_cents: Number(row.wo_cost_cents ?? 0),
        profit_cents: Number(row.revenue_cents ?? 0) - Number(row.wo_cost_cents ?? 0),
      }));
    });

    return {
      month: query.data.month,
      notes:
        "v1 = revenue minus work-order costs only. T11.16.1.1 will subtract driver pay and fuel costs for full profitability.",
      rows,
    };
  });
}
