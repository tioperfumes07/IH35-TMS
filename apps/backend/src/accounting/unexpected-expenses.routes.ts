import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getUnexpectedExpensesReport } from "./unexpected-expenses.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const unexpectedQuerySchema = companyQuerySchema.extend({
  as_of_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function canAccessUnexpected(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

export async function registerUnexpectedExpensesRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/accounting/unexpected-expenses",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessUnexpected(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const query = unexpectedQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);
      await assertCompanyMembership(user.uuid, query.data.operating_company_id);

      const report = await getUnexpectedExpensesReport({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        as_of_date: query.data.as_of_date,
      });

      return reply.code(200).send(report);
    }
  );
}

export default fp(async (app) => {
  await registerUnexpectedExpensesRoutes(app);
}, { name: "accounting.registerUnexpectedExpensesRoutes" });
