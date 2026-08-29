import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, getCurrentQuarterInfo, validationError } from "./shared.js";

const iftaStatusQuerySchema = companyQuerySchema.extend({
  basis: z.enum(["accrual", "cash"]).optional(),
});

export async function registerIftaStatusRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/ifta-status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = iftaStatusQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const status = getCurrentQuarterInfo();
    return {
      currentQuarter: status.quarter,
      filedAt: null,
      nextDueAt: status.dueAt,
      daysUntilDue: status.daysUntilDue,
      step1Ready: false,
      step2Ready: false,
      step3Ready: false,
      step4WaitsClose: true,
      notes: "IFTA real computation ships in P4-IFTA-FILING.",
      basis: "accrual",
    };
  });
}
