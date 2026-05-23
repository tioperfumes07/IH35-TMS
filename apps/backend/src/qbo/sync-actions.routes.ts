import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { appendQboSyncActionAuditEvent } from "../integrations/qbo/sync-action-audit.js";
import { dismissTerminalRun, transitionTerminalToPending } from "./sync-state-machine.js";

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
      const ok = await transitionTerminalToPending(client, {
        syncRunId: params.data.id,
        operatingCompanyId: body.data.operating_company_id,
      });
      if (ok) return { code: "ok" as const };
      const exists = await client.query(
        `
          SELECT id::text
          FROM qbo.sync_runs
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, body.data.operating_company_id],
      );
      const existsRow = exists.rows[0] as { id?: string } | undefined;
      if (!existsRow?.id) return { code: "not_found" as const };
      return { code: "not_dead_letter" as const };
    });

    if (updated.code === "not_found") return reply.code(404).send({ error: "sync_run_not_found" });
    if (updated.code === "not_dead_letter") return reply.code(409).send({ error: "retry_not_dead_letter" });

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
      const ok = await dismissTerminalRun(client, {
        syncRunId: params.data.id,
        operatingCompanyId: body.data.operating_company_id,
      });
      return ok ? params.data.id : null;
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
