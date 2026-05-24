import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getComparisonReport } from "./comparison-report.service.js";

const comparisonReportQuerySchema = companyQuerySchema.extend({
  type: z.enum(["pl", "bs"]),
  periods: z.string().min(3),
  basis: z.enum(["accrual", "cash"]).optional(),
});

const comparisonReadRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

function comparisonReader(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!comparisonReadRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export async function registerComparisonReportRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/comparison-report", async (req, reply) => {
    const user = comparisonReader(req, reply);
    if (!user) return;

    const query = comparisonReportQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
      const report = await getComparisonReport({
        userId: user.uuid,
        operatingCompanyId: query.data.operating_company_id,
        type: query.data.type,
        basis: query.data.basis ?? "accrual",
        periods: query.data.periods,
      });
      return report;
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (message === "invalid_periods") return reply.code(400).send({ error: "invalid_periods" });
      throw error;
    }
  });
}


export default fp(async (app) => {
  await registerComparisonReportRoutes(app);
}, { name: "accounting.registerComparisonReportRoutes" });
