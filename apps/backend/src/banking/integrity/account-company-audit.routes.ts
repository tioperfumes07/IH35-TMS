import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
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

export async function registerBankAccountCompanyAuditRoutes(app: FastifyInstance) {
  app.get("/api/banking/integrity/account-company-audit", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid().optional() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });

    const findings = await withCurrentUser(user.uuid, async (client) => {
      if (q.data.operating_company_id) {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      }
      return auditBankAccountCompanyAssignment(client, q.data.operating_company_id);
    });
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
    if (!body.success) return reply.code(400).send({ error: "validation_error" });

    const result = await withCurrentUser(user.uuid, async (client) => {
      return applyCompanyReassignment(
        client,
        body.data.account_uuid,
        body.data.new_operating_company_id,
        user.uuid
      );
    });
    if (!result.updated) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });
}
