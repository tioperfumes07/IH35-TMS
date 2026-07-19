import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { getAccountingHomeData } from "./accounting-home.service.js";
import { getPendingApprovalsGl } from "./pending-approvals-gl.service.js";

const accountingHomeRoles = new Set(["Accountant", "Owner", "Administrator", "Manager"]);

const pendingApprovalsQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerAccountingRoleHomeRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/role-home", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingHomeRoles.has(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const data = await getAccountingHomeData({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
    });

    return data;
  });

  /**
   * 0280-15 — Read-only pending approvals with JE/GL linkage.
   * Reports control_available=false + approval_control_unavailable when no
   * migrated JE approval record exists. No mutations.
   */
  app.get(
    "/api/v1/accounting/role-home/pending-approvals",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!accountingHomeRoles.has(String(user.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const query = pendingApprovalsQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      return getPendingApprovalsGl({
        userId: user.uuid,
        operating_company_id: query.data.operating_company_id,
        limit: query.data.limit,
        offset: query.data.offset,
      });
    }
  );
}
