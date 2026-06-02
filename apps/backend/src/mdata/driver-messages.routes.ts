import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const driverParamsSchema = z.object({ id: z.string().uuid() });

const messageBodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  channel: z.enum(["sms", "email", "in_app"]),
  urgency: z.string().trim().max(40).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDriverMessagesRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/drivers/:id/messages", async (req, reply) => {
    const authUser = authed(req, reply);
    if (!authUser) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = messageBodySchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const res = await client.query(
        `
          INSERT INTO mdata.driver_profile_messages (
            operating_company_id, driver_id, message, channel, urgency, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id::text, channel, urgency, created_at::text
        `,
        [
          query.data.operating_company_id,
          params.data.id,
          body.data.message,
          body.data.channel,
          body.data.urgency ?? null,
          authUser.uuid,
        ]
      );
      await appendCrudAudit(client, authUser.uuid, "mdata.driver_profile_message.recorded", {
        resource_type: "mdata.driver_profile_messages",
        resource_id: (res.rows[0] as { id?: string })?.id ?? null,
        operating_company_id: query.data.operating_company_id,
        driver_id: params.data.id,
        channel: body.data.channel,
      });
      return res.rows[0];
    });
    return reply.code(201).send(row);
  });
}
