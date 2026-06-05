import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, reportBasisSchema, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({
  cycle_start: z.string().optional(),
  cycle_end: z.string().optional(),
  basis: reportBasisSchema,
});

function previousCycleWindow() {
  const now = new Date();
  const currentDay = now.getUTCDay();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - currentDay, 0, 0, 0, 0));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function registerDriverSettlementSummaryRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/driver-settlement-summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const cycle = previousCycleWindow();
    const cycleStart = query.data.cycle_start ?? cycle.start;
    const cycleEnd = query.data.cycle_end ?? cycle.end;

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            s.driver_id,
            CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
            COALESCE(ROUND(s.gross_pay::numeric * 100), 0)::bigint AS gross_cents,
            COALESCE(ROUND(s.deductions_total::numeric * 100), 0)::bigint AS deductions_cents,
            COALESCE(ROUND(s.reimbursements_total::numeric * 100), 0)::bigint AS advances_cents,
            COALESCE(ROUND(COALESCE(v.escrow_withheld, 0)::numeric * 100), 0)::bigint AS escrow_cents,
            COALESCE(ROUND(s.net_pay::numeric * 100), 0)::bigint AS net_cents,
            s.status
          FROM driver_finance.driver_settlements s
          LEFT JOIN views.driver_settlement_with_debt v ON v.id = s.id
          LEFT JOIN mdata.drivers d ON d.id = s.driver_id
          WHERE s.operating_company_id = $1
            AND s.period_start >= $2::date
            AND s.period_end <= $3::date
          ORDER BY s.period_start DESC
        `,
        [query.data.operating_company_id, cycleStart, cycleEnd]
      );
      return res.rows;
    });

    return {
      cycle_start: cycleStart,
      cycle_end: cycleEnd,
      basis: query.data.basis,
      rows,
    };
  });
}
