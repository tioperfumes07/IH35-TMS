import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { appendQboSyncActionAuditEvent } from "../integrations/qbo/sync-action-audit.js";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const bodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export async function registerQboSyncActionsRoutes(app: FastifyInstance) {
  app.post("/api/v1/qbo/sync/runs/:id/retry", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = bodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE qbo.sync_runs
          SET status = 'pending',
              retry_count = 0,
              error_message = NULL,
              next_retry_at = NULL,
              dead_letter_at = NULL
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          RETURNING id
        `,
        [params.data.id, body.data.operating_company_id]
      );
      return res.rows[0]?.id ? String(res.rows[0].id) : null;
    });

    if (!updated) return reply.code(404).send({ error: "sync_run_not_found" });

    await appendQboSyncActionAuditEvent(
      "qbo.sync_run_retried_manual",
      "info",
      {
        sync_run_id: params.data.id,
        operating_company_id: body.data.operating_company_id,
      },
      user.uuid
    );

    return { ok: true as const };
  });

  app.post("/api/v1/qbo/sync/runs/:id/dismiss", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = bodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE qbo.sync_runs
          SET status = 'cancelled',
              dead_letter_at = NULL
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND status = 'dead_letter'
          RETURNING id
        `,
        [params.data.id, body.data.operating_company_id]
      );
      return res.rows[0]?.id ? String(res.rows[0].id) : null;
    });

    if (!updated) return reply.code(409).send({ error: "dismiss_not_dead_letter" });

    await appendQboSyncActionAuditEvent(
      "qbo.sync_run_dismissed",
      "info",
      {
        sync_run_id: params.data.id,
        operating_company_id: body.data.operating_company_id,
      },
      user.uuid
    );

    return { ok: true as const };
  });
}
