import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, parseMonthWindow, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function registerMaintenanceCostPerUnitRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/maintenance-cost-per-unit", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const { start, end } = parseMonthWindow(query.data.period);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            u.id AS unit_id,
            u.unit_number,
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
            )::bigint AS total_cost_cents,
            COUNT(wo.id)::int AS wo_count,
            COALESCE(
              AVG(
                CASE
                  WHEN COALESCE(wo.updated_at, wo.opened_at) >= $2::timestamptz
                   AND COALESCE(wo.updated_at, wo.opened_at) < $3::timestamptz
                  THEN ROUND(COALESCE(wo.total_actual_cost, wo.total_cost, 0)::numeric * 100)
                  ELSE NULL
                END
              ),
              0
            )::numeric(14,2) AS avg_cost_per_wo_cents
          FROM mdata.units u
          LEFT JOIN maintenance.work_orders wo
            ON wo.unit_id = u.id
            AND wo.operating_company_id = $1
          WHERE u.deactivated_at IS NULL
            AND u.operating_company_id = $1
          GROUP BY u.id, u.unit_number
          ORDER BY total_cost_cents DESC
        `,
        [query.data.operating_company_id, start, end]
      );
      return res.rows.map((row: any) => ({
        unit_id: row.unit_id,
        unit_number: row.unit_number,
        total_cost_cents: Number(row.total_cost_cents ?? 0),
        wo_count: Number(row.wo_count ?? 0),
        avg_cost_per_wo_cents: Number(row.avg_cost_per_wo_cents ?? 0),
      }));
    });

    return { period: query.data.period, rows };
  });
}
