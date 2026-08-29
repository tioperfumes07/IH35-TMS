// HOLD — QBO live OB preview routes as_of 2026-03-31. READ-ONLY preview pull; never posts.
// Autoloaded via accounting/index.ts (@fastify/autoload *.routes.ts). Roles mirror
// opening-balance-import.routes.ts (Owner|Administrator|Accountant).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { pullQboOb20260331LivePreview } from "./qbo-ob-2026-03-31-live-pull.service.js";

const financeRoles = new Set(["Owner", "Administrator", "Accountant"]);

function ensureFinanceUser(req: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!financeRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { uuid: string; role: string };
}

async function registerQboOb20260331LivePullRoutes(app: FastifyInstance) {
  // Live QBO BalanceSheet + TrialBalance as_of 2026-03-31 Accrual — preview + mdata map + JE assemble.
  // No createJournalEntry / no GL writes. Unmapped lines surfaced; never claim balanced if unmapped remain.
  app.get(
    "/api/v1/accounting/opening-balance-import/qbo-live/2026-03-31/preview",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = ensureFinanceUser(req, reply);
      if (!user) return;
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      try {
        await assertCompanyMembership(user.uuid, query.data.operating_company_id);
      } catch {
        return reply.code(403).send({ error: "forbidden_company_membership" });
      }

      const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        pullQboOb20260331LivePreview(client, query.data.operating_company_id)
      );
      return payload;
    }
  );
}

export default fp(async (app) => {
  await registerQboOb20260331LivePullRoutes(app);
}, { name: "accounting.registerQboOb20260331LivePullRoutes" });
