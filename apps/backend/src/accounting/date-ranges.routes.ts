import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { listResolvedNamedDateRanges, resolveAccountingPeriodDateRange } from "./date-ranges.service.js";

const dateRangesQuerySchema = companyQuerySchema.extend({
  reference_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period_id: z.string().uuid().optional(),
});

function canAccessDateRanges(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

export async function registerDateRangesRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/date-ranges", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessDateRanges(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = dateRangesQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const base = await listResolvedNamedDateRanges({
      reference_date: query.data.reference_date,
    });

    let accounting_period = null;
    if (query.data.period_id) {
      accounting_period = await resolveAccountingPeriodDateRange({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        period_id: query.data.period_id,
      });
      if (!accounting_period) return reply.code(404).send({ error: "not_found" });
    }

    return reply.code(200).send({
      reference_date: base.reference_date,
      ranges: base.ranges,
      accounting_period,
    });
  });
}


export default fp(async (app) => {
  await registerDateRangesRoutes(app);
}, { name: "accounting.registerDateRangesRoutes" });
