import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { listMaintenanceShopHub } from "./maintenance-shop.service.js";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

const listHubQuerySchema = companyQuerySchema.extend({
  work_order_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function canAccessAccounting(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

/** Accounting Maintenance & shop hub — WO↔bill/expense reverse drill list (read-only). */
export async function registerMaintenanceShopRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/accounting/maintenance-shop/hub",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const query = listHubQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);

      const { total, items } = await listMaintenanceShopHub(String(user.uuid), query.data.operating_company_id, {
        workOrderId: query.data.work_order_id,
        limit: query.data.limit,
        offset: query.data.offset,
      });

      return { total, limit: query.data.limit, offset: query.data.offset, items };
    }
  );
}

export default fp(async (app) => {
  await registerMaintenanceShopRoutes(app);
}, { name: "accounting.registerMaintenanceShopRoutes" });
