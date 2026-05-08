import type { FastifyInstance } from "fastify";
import { companyQuerySchema, currentAuthUser, getCurrentQuarterInfo, validationError } from "./shared.js";

export async function registerIftaStatusRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/ifta-status", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
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
    };
  });
}
