import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getApAgingReport } from "./ap-aging.service.js";

const apAgingQuerySchema = companyQuerySchema.extend({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  basis: z.enum(["accrual", "cash"]).optional(),
});

function canAccessApAging(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function registerApAgingRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/ap-aging", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessApAging(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = apAgingQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const report = await getApAgingReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: query.data.as_of_date ?? todayIsoDate(),
    });

    return reply.code(200).send({ ...report, basis: "accrual" });
  });
}


export default fp(async (app) => {
  await registerApAgingRoutes(app);
}, { name: "accounting.registerApAgingRoutes" });
