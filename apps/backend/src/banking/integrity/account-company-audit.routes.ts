import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  applyCompanyReassignment,
  auditBankAccountCompanyAssignment,
} from "./account-company-audit.service.js";

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerBankAccountCompanyAuditRoutes(app: FastifyInstance) {
  app.get("/api/banking/integrity/account-company-audit", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    const findings = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) =>
      auditBankAccountCompanyAssignment(client as PoolClient, q.data.operating_company_id)
    );
    return { findings };
  });

  app.post("/api/banking/integrity/account-company-audit/reassign", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (String(user.role ?? "") !== "Owner") {
      return reply.code(403).send({ error: "owner_only" });
    }
    const body = z
      .object({
        account_uuid: z.string().uuid(),
        new_operating_company_id: z.string().uuid(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.new_operating_company_id, async (client) =>
      applyCompanyReassignment(
        client as PoolClient,
        body.data.account_uuid,
        body.data.new_operating_company_id,
        user.uuid
      )
    );
    if (!result.updated) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });
}
