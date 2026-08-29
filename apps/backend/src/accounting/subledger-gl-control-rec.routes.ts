import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getSubledgerGlControlRecReport } from "./subledger-gl-control-rec.service.js";

const subledgerGlControlRecQuerySchema = companyQuerySchema.extend({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "as_of_date must be YYYY-MM-DD").optional(),
});

function canAccessSubledgerGlControlRec(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

async function registerSubledgerGlControlRecRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/subledger-gl-control-rec", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessSubledgerGlControlRec(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const query = subledgerGlControlRecQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const report = await getSubledgerGlControlRecReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: query.data.as_of_date,
    });

    return reply.code(200).send(report);
  });
}

export default fp(registerSubledgerGlControlRecRoutes, {
  name: "accounting.registerSubledgerGlControlRecRoutes",
});
