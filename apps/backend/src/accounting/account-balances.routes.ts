import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { getAccountBalances } from "./account-balances.service.js";
import { DEFAULT_BASIS } from "./cash-basis/engine.js";
import { resolveRoleAccountOptional } from "./coa-roles/resolver.service.js";

const accountBalancesQuerySchema = companyQuerySchema.extend({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "as_of_date must be YYYY-MM-DD"),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from_date must be YYYY-MM-DD").optional(),
  basis: z.enum(["accrual", "cash"]).optional(),
});

function canAccessAccountBalances(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

async function registerAccountBalancesRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/account-balances", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccountBalances(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const query = accountBalancesQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const basis = query.data.basis ?? DEFAULT_BASIS;

    // Enforce company membership and resolve AR/AP role accounts for cash-basis suppression.
    // withCompanyScope calls assertCompanyMembership before opening the scoped connection.
    const roleMatches = await withCompanyScope(
      user.uuid,
      query.data.operating_company_id,
      async (client) => ({
        arControlAccountId: await resolveRoleAccountOptional(
          client,
          query.data.operating_company_id,
          "ar_control"
        ),
        apControlAccountId: await resolveRoleAccountOptional(
          client,
          query.data.operating_company_id,
          "ap_control"
        ),
      })
    );

    const report = await getAccountBalances({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: query.data.as_of_date,
      from_date: query.data.from_date ?? null,
      basis,
      roleMatches,
    });

    return reply.code(200).send(report);
  });
}

export default fp(registerAccountBalancesRoutes, {
  name: "accounting.registerAccountBalancesRoutes",
});
