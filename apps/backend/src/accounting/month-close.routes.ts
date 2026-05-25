import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getMonthCloseStatus, lockMonthClose } from "./month-close.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const monthCloseRoles = new Set(["Owner", "Administrator", "Accountant"]);

const monthPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const monthCloseStatusQuerySchema = companyQuerySchema.extend({
  period: monthPeriodSchema,
});

const monthCloseBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  period: monthPeriodSchema,
  closing_notes: z.string().trim().max(1000).optional(),
});

function monthCloser(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!monthCloseRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export async function registerMonthCloseRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/month-close-status", async (req, reply) => {
    const user = monthCloser(req, reply);
    if (!user) return;
    const query = monthCloseStatusQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    try {
      const status = await getMonthCloseStatus({
        userId: user.uuid,
        operatingCompanyId: query.data.operating_company_id,
        period: query.data.period,
      });
      return status;
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (message === "invalid_period") return reply.code(400).send({ error: "invalid_period" });
      throw error;
    }
  });

  app.post("/api/v1/accounting/month-close", async (req, reply) => {
    const user = monthCloser(req, reply);
    if (!user) return;
    const body = monthCloseBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      return await lockMonthClose({
        userId: user.uuid,
        operatingCompanyId: body.data.operating_company_id,
        period: body.data.period,
        closingNotes: body.data.closing_notes,
      });
    } catch (error) {
      const message = String((error as Error).message ?? "");
      if (message === "invalid_period") return reply.code(400).send({ error: "invalid_period" });
      if (message === "period_not_found") return reply.code(404).send({ error: "period_not_found" });
      if (message === "period_not_open") return reply.code(409).send({ error: "period_not_open" });
      if (message === "checklist_incomplete") return reply.code(409).send({ error: "checklist_incomplete" });
      if (message.includes("IH35_CLOSED_PERIOD")) return reply.code(423).send({ error: "period_locked", message });
      throw error;
    }
  });
}


export default fp(async (app) => {
  await registerMonthCloseRoutes(app);
}, { name: "accounting.registerMonthCloseRoutes" });
