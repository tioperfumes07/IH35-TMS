import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

function ownerAdministrator(role: string) {
  return ["Owner", "Administrator"].includes(role);
}

const retryBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export async function registerEmailQueueAdminRoutes(app: FastifyInstance) {
  app.post("/api/v1/admin/email-queue/:id/retry", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ownerAdministrator(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = retryBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const row = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE email.email_queue
          SET status = 'queued',
              error_code = NULL,
              error_message = NULL,
              next_retry_at = NULL,
              retry_count = 0,
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND status = 'failed'
          RETURNING *
        `,
        [params.data.id, body.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "queue_item_not_found_or_not_failed" });
    return { row };
  });
}
