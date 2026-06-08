import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../../accounting/shared.js";
import {
  applyCompanyReassignment,
  auditBankAccountCompanyAssignment,
} from "./account-company-audit.service.js";

export async function registerBankAccountCompanyAuditRoutes(app: FastifyInstance) {
  app.get("/api/banking/integrity/account-company-audit", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);

    const findings = await withCompanyScope(user.uuid, q.data.operating_company_id, async (client) =>
      auditBankAccountCompanyAssignment(client, q.data.operating_company_id)
    );
    return { findings };
  });

  app.post("/api/banking/integrity/account-company-audit/reassign", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
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
        client,
        body.data.account_uuid,
        body.data.new_operating_company_id,
        user.uuid
      )
    );
    if (!result.updated) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });
}
