import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getCashFlowReport } from "./cash-flow.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const cashFlowQuerySchema = companyQuerySchema.extend({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  basis: z.enum(["accrual", "cash"]).optional(),
});

function canAccessCashFlow(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

export async function registerCashFlowRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/cash-flow", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessCashFlow(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = cashFlowQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const report = await getCashFlowReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      from_date: query.data.from_date,
      to_date: query.data.to_date,
    });

    return reply.code(200).send({ ...report, basis: "accrual" });
  });
}


export default fp(async (app) => {
  await registerCashFlowRoutes(app);
}, { name: "accounting.registerCashFlowRoutes" });
