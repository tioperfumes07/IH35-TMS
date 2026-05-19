import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getProfitLossReport } from "./profit-loss.service.js";

const profitLossQuerySchema = companyQuerySchema.extend({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function canAccessProfitLoss(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

export async function registerProfitLossRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/profit-loss", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessProfitLoss(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = profitLossQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const report = await getProfitLossReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      from_date: query.data.from_date,
      to_date: query.data.to_date,
    });

    return reply.code(200).send(report);
  });
}
