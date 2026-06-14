import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../reports/shared.js";
import { getInboxReportingData } from "./inbox-reporting.service.js";

// B7 — read-only driver-inbox reporting. Role-gated to the reviewer set; date-range scoped.
const REVIEW_ROLES = ["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"];

const reportingQuerySchema = companyQuerySchema.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function registerDriverInboxReportingRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver-finance/inbox-reporting", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!REVIEW_ROLES.includes(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = reportingQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      getInboxReportingData(client, parsed.data.operating_company_id, parsed.data.from, parsed.data.to)
    );
  });
}
