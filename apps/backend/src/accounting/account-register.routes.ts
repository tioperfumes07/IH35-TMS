import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import {
  AccountRegisterToggleError,
  getAccountRegister,
  toggleAccountRegisterCleared,
} from "./account-register.service.js";

const accountRegisterQuerySchema = companyQuerySchema.extend({
  account_id: z.string().uuid("account_id must be a uuid"),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from_date must be YYYY-MM-DD"),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to_date must be YYYY-MM-DD"),
  search: z.string().max(200).optional(),
  type: z.string().max(64).optional(),
});

const toggleClearedBodySchema = companyQuerySchema.extend({
  posting_id: z.string().uuid("posting_id must be a uuid"),
  cleared: z.boolean(),
});

function canAccessAccountRegister(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

async function registerAccountRegisterRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/account-register", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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

  // B-1b — ✓ blank↔C. R locked; bank-match C refuses blank (unmatch first).
  app.post(
    "/api/v1/accounting/account-register/toggle-cleared",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessAccountRegister(String(user.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const body = toggleClearedBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          toggleAccountRegisterCleared(client, {
            operating_company_id: body.data.operating_company_id,
            posting_id: body.data.posting_id,
            cleared: body.data.cleared,
            actor_user_id: user.uuid,
          })
        );
        return reply.code(200).send(result);
      } catch (error) {
        if (error instanceof AccountRegisterToggleError) {
          return reply.code(error.httpStatus).send({ error: error.code });
        }
        throw error;
      }
    }
  );
}

export default fp(registerAccountRegisterRoutes, {
  name: "accounting.registerAccountRegisterRoutes",
});
