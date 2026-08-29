import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getArAgingReport } from "./ar-aging.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

const arAgingQuerySchema = companyQuerySchema.extend({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  basis: z.enum(["accrual", "cash"]).optional(),
});

function canAccessArAging(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function todayIsoDate() {
  return companyBusinessDate();
}

export async function registerArAgingRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/ar-aging", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessArAging(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = arAgingQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const report = await getArAgingReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: query.data.as_of_date ?? todayIsoDate(),
    });

    return reply.code(200).send({ ...report, basis: "accrual" });
  });
}


export default fp(async (app) => {
  await registerArAgingRoutes(app);
}, { name: "accounting.registerArAgingRoutes" });
