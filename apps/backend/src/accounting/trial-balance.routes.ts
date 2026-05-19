import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getTrialBalanceReport } from "./trial-balance.service.js";

const trialBalanceQuerySchema = companyQuerySchema.extend({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function canAccessTrialBalance(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

export async function registerTrialBalanceRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/trial-balance", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessTrialBalance(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = trialBalanceQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const report = await getTrialBalanceReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      from_date: query.data.from_date,
      to_date: query.data.to_date,
    });

    return reply.code(200).send(report);
  });
}
