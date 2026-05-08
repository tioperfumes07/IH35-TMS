import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function registerFuelSavingsRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/fuel-savings", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            s.driver_id,
            CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
            COALESCE(s.savings_ytd, 0)::numeric(14,2) AS recommended_savings_dollars,
            COALESCE(s.lost_savings_ytd, 0)::numeric(14,2) AS missed_savings_dollars
          FROM views.fuel_savings_summary s
          LEFT JOIN mdata.drivers d ON d.id = s.driver_id
          WHERE s.operating_company_id = $1
          ORDER BY COALESCE(s.savings_ytd, 0) DESC
        `,
        [query.data.operating_company_id]
      );
      return res.rows.map((row: any) => {
        const recommended = Number(row.recommended_savings_dollars ?? 0);
        const missed = Number(row.missed_savings_dollars ?? 0);
        const actual = recommended - missed;
        const variancePct = recommended <= 0 ? 0 : Number(((actual / recommended) * 100).toFixed(1));
        return {
          driver_id: row.driver_id,
          driver_name: row.driver_name,
          recommended_savings_dollars: recommended,
          actual_savings_dollars: actual,
          missed_savings_dollars: missed,
          variance_pct: variancePct,
        };
      });
    });

    return {
      period: query.data.period ?? "ytd",
      rows,
    };
  });
}
