import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getBalanceSheetReport } from "./balance-sheet.service.js";

const balanceSheetQuerySchema = companyQuerySchema.extend({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function canAccessBalanceSheet(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function registerBalanceSheetRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/balance-sheet", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessBalanceSheet(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = balanceSheetQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const report = await getBalanceSheetReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: query.data.as_of_date ?? todayIsoDate(),
    });

    return reply.code(200).send(report);
  });
}
