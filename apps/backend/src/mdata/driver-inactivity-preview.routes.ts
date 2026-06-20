// Driver 21-day inactivity preview endpoint — READ ONLY. Returns the candidate deactivation list (drivers with
// no app login in > 21 days) for Jorge to approve BEFORE any write. There is intentionally no deactivation
// endpoint here — the mass status write (status='Inactive' + deactivated_at) is a separate, Jorge-approved step.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { previewDriverInactivity } from "./driver-inactivity-preview.service.js";

const querySchema = z.object({ operating_company_id: z.string().uuid() });

function currentOfficeAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (!["Owner", "Administrator"].includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export async function registerDriverInactivityPreviewRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/drivers/inactivity-preview", async (req, reply) => {
    const user = currentOfficeAdmin(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const oc = parsed.data.operating_company_id;

    const preview = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      return previewDriverInactivity(client, oc);
    });
    return reply.send(preview);
  });
}
