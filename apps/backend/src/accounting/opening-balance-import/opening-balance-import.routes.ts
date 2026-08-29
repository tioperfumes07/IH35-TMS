// STMT-2 — TRANSP opening-balance importer routes. READ-ONLY: returns a reviewable JE preview + unmapped
// accounts. Never posts (no createJournalEntry call anywhere in this module — opening balances are
// owner-entered only, constitution §1.4/§1.6). Behind OPENING_BALANCE_IMPORT_ENABLED (default OFF).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { buildTransp20241231OpeningBalanceImportPreview } from "./opening-balance-import.service.js";

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

async function registerOpeningBalanceImportRoutes(app: FastifyInstance) {
  // The TRANSP 12/31/2024 opening-balance preview: maps the QBO Balance Sheet to catalogs.accounts,
  // flags unmapped accounts, and (only when every line maps AND the entry balances) returns a
  // reviewable JE preview. Nothing here writes to accounting.journal_entries.
  app.get("/api/v1/accounting/opening-balance-import/transp-2024-12-31/preview", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try { await assertCompanyMembership(user.uuid, query.data.operating_company_id); }
    catch { return reply.code(403).send({ error: "forbidden_company_membership" }); }

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      buildTransp20241231OpeningBalanceImportPreview(client, query.data.operating_company_id)
    );
    return payload;
  });
}

export default fp(async (app) => {
  await registerOpeningBalanceImportRoutes(app);
}, { name: "accounting.registerOpeningBalanceImportRoutes" });
