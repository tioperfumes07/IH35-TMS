import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid(),
  start: z.string().optional(),
  end: z.string().optional(),
});

export async function registerDriverPayHistoryRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/driver-pay-history", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const start = query.data.start ?? "1900-01-01";
    const end = query.data.end ?? "2999-12-31";

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const settlementsRes = await client.query(
        `
          SELECT
            s.id,
            s.period_start,
            s.period_end,
            s.status,
            COALESCE(ROUND(s.gross_pay::numeric * 100), 0)::bigint AS gross_cents,
            COALESCE(ROUND(s.deductions_total::numeric * 100), 0)::bigint AS deductions_cents,
            COALESCE(ROUND(s.reimbursements_total::numeric * 100), 0)::bigint AS advances_cents,
            COALESCE(ROUND(s.net_pay::numeric * 100), 0)::bigint AS net_cents
          FROM driver_finance.driver_settlements s
          WHERE s.operating_company_id = $1
            AND s.driver_id = $2
            AND s.period_start >= $3::date
            AND s.period_end <= $4::date
          ORDER BY s.period_start DESC
        `,
        [query.data.operating_company_id, query.data.driver_id, start, end]
      );
      const settlementIds = settlementsRes.rows.map((row: any) => row.id);
      const lines =
        settlementIds.length === 0
          ? []
          : (
              await client.query(
                `
                  SELECT settlement_id, line_type, description, amount
                  FROM driver_finance.settlement_lines
                  WHERE settlement_id = ANY($1::uuid[])
                  ORDER BY created_at DESC
                `,
                [settlementIds]
              )
            ).rows;
      return {
        settlements: settlementsRes.rows,
        lines: lines.map((line: any) => ({
          settlement_id: line.settlement_id,
          line_type: line.line_type,
          description: line.description,
          amount_cents: Math.round(Number(line.amount ?? 0) * 100),
        })),
      };
    });

    return payload;
  });
}
