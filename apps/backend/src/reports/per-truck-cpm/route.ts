import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import { calculatePerTruckCpm } from "./cpm-calculator.service.js";

const querySchema = companyQuerySchema.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function registerPerTruckCpmRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/per-truck-cpm", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id: companyId, from, to } = parsed.data;
    const rows = await withCompanyScope(user.uuid, companyId, async (client) =>
      calculatePerTruckCpm(client, companyId, from, to)
    );

    const cpms = rows.map((r) => r.cpm_cents).filter((v) => v > 0);
    const median = cpms.length > 0 ? cpms.sort((a, b) => a - b)[Math.floor(cpms.length / 2)] : 0;

    return reply.send({
      operating_company_id: companyId,
      period: { from, to },
      fleet_median_cpm_cents: median,
      rows: rows.map((row) => ({
        ...row,
        outlier: median > 0 && row.cpm_cents > median * 2,
      })),
    });
  });
}
