// OB-01 — Opening Balance Register routes. Autoloaded via accounting/index.ts (*.routes.ts).
//
// Every route is entity-scoped through withCompanyScope (sets app.operating_company_id, which the
// FORCE-RLS policies on accounting.ob_* read) and membership-checked before that. Finance roles
// only. No route here posts a journal entry and no route writes to QuickBooks.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import {
  commitObRegister,
  getObRegisterView,
  importObRegisterFromQbo,
  listObRegisterAudit,
  ObRegisterError,
  setObSourceFinality,
  upsertObRegisterLine,
} from "./opening-balance-register.service.js";

const financeRoles = new Set(["Owner", "Administrator", "Accountant"]);

/** Marking a source period FINAL is the accountant's call (Martin) or the owner's. */
const finalityRoles = new Set(["Owner", "Administrator", "Accountant"]);

function ensureRole(req: FastifyRequest, reply: FastifyReply, roles: Set<string>) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!roles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { uuid: string; role: string };
}

async function ensureMembership(reply: FastifyReply, userId: string, companyId: string) {
  try {
    await assertCompanyMembership(userId, companyId);
    return true;
  } catch {
    reply.code(403).send({ error: "forbidden_company_membership" });
    return false;
  }
}

function sendObError(reply: FastifyReply, error: unknown) {
  if (error instanceof ObRegisterError) {
    return reply.code(error.status).send({ error: error.code, message: error.message, ...error.detail });
  }
  throw error;
}

const lineBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  account_id: z.string().uuid(),
  amount_cents: z.number().int(),
  note: z.string().max(2000).nullish(),
});

const finalityBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  is_final: z.boolean(),
  note: z.string().max(2000).nullish(),
});

const commitBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

async function registerOpeningBalanceRegisterRoutes(app: FastifyInstance) {
  // Register view: staged lines + live posted values + finality + every commit blocker.
  app.get("/api/v1/accounting/opening-balance-register", async (req, reply) => {
    const user = ensureRole(req, reply, financeRoles);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    if (!(await ensureMembership(reply, user.uuid, query.data.operating_company_id))) return;

    try {
      return await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        getObRegisterView(client, query.data.operating_company_id, user.uuid)
      );
    } catch (error) {
      return sendObError(reply, error);
    }
  });

  app.get("/api/v1/accounting/opening-balance-register/audit", async (req, reply) => {
    const user = ensureRole(req, reply, financeRoles);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    if (!(await ensureMembership(reply, user.uuid, query.data.operating_company_id))) return;

    try {
      const events = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        listObRegisterAudit(client, query.data.operating_company_id)
      );
      return { events };
    } catch (error) {
      return sendObError(reply, error);
    }
  });

  // Edit / enter one account's opening balance in STAGING. Never touches catalogs.accounts.
  app.patch("/api/v1/accounting/opening-balance-register/line", async (req, reply) => {
    const user = ensureRole(req, reply, financeRoles);
    if (!user) return;
    const body = lineBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    if (!(await ensureMembership(reply, user.uuid, body.data.operating_company_id))) return;

    try {
      const line = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
        upsertObRegisterLine(client, body.data.operating_company_id, user.uuid, {
          account_id: body.data.account_id,
          amount_cents: body.data.amount_cents,
          note: body.data.note ?? null,
        })
      );
      return { line };
    } catch (error) {
      return sendObError(reply, error);
    }
  });

  // Read-only QBO BalanceSheet pull → staging. USMCA (no realm) is refused, not faked.
  app.post("/api/v1/accounting/opening-balance-register/import-from-qbo", async (req, reply) => {
    const user = ensureRole(req, reply, financeRoles);
    if (!user) return;
    const body = commitBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    if (!(await ensureMembership(reply, user.uuid, body.data.operating_company_id))) return;

    try {
      return await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
        importObRegisterFromQbo(client, body.data.operating_company_id, user.uuid)
      );
    } catch (error) {
      return sendObError(reply, error);
    }
  });

  // Martin's gate: the QBO cleanup for this entity/period is final. Audited both directions.
  app.post("/api/v1/accounting/opening-balance-register/finality", async (req, reply) => {
    const user = ensureRole(req, reply, finalityRoles);
    if (!user) return;
    const body = finalityBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    if (!(await ensureMembership(reply, user.uuid, body.data.operating_company_id))) return;

    try {
      const finality = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
        setObSourceFinality(client, body.data.operating_company_id, user.uuid, {
          is_final: body.data.is_final,
          note: body.data.note ?? null,
        })
      );
      return { finality };
    } catch (error) {
      return sendObError(reply, error);
    }
  });

  // The only write to catalogs.accounts. Refuses unless the source period is FINAL, the checker is
  // not a maker, the entry balances, and OBE has been reclassed. A refusal writes nothing.
  app.post("/api/v1/accounting/opening-balance-register/commit", async (req, reply) => {
    const user = ensureRole(req, reply, financeRoles);
    if (!user) return;
    const body = commitBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    if (!(await ensureMembership(reply, user.uuid, body.data.operating_company_id))) return;

    try {
      // A refusal RETURNS (it does not throw) so its `commit_refused` audit row commits with the
      // transaction — withCompanyScope would roll a thrown refusal, and its audit trail, straight
      // back. 409 is still what the caller sees.
      const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
        commitObRegister(client, body.data.operating_company_id, user.uuid)
      );
      if (!result.committed) {
        return reply.code(409).send({
          error: "commit_refused",
          message: `opening balance commit refused: ${result.blockers.join(", ")}`,
          ...result,
        });
      }
      return result;
    } catch (error) {
      return sendObError(reply, error);
    }
  });
}

export default fp(async (app) => {
  await registerOpeningBalanceRegisterRoutes(app);
}, { name: "accounting.registerOpeningBalanceRegisterRoutes" });
