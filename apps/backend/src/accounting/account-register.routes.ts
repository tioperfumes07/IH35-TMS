import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { getAccountRegister } from "./account-register.service.js";

const accountRegisterQuerySchema = companyQuerySchema.extend({
  account_id: z.string().uuid("account_id must be a uuid"),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from_date must be YYYY-MM-DD"),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to_date must be YYYY-MM-DD"),
  search: z.string().max(200).optional(),
  type: z.string().max(64).optional(),
});

function canAccessAccountRegister(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

async function registerAccountRegisterRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/account-register", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccountRegister(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const query = accountRegisterQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
      // withCompanyScope asserts membership + sets RLS context before opening the scoped connection.
      const report = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        getAccountRegister(client, {
          operating_company_id: query.data.operating_company_id,
          account_id: query.data.account_id,
          from_date: query.data.from_date,
          to_date: query.data.to_date,
          search: query.data.search ?? null,
          type: query.data.type ?? null,
        })
      );
      return reply.code(200).send(report);
    } catch (error) {
      if (String((error as Error)?.message) === "account_not_found") {
        return reply.code(404).send({ error: "account_not_found" });
      }
      throw error;
    }
  });
}

export default fp(registerAccountRegisterRoutes, {
  name: "accounting.registerAccountRegisterRoutes",
});
