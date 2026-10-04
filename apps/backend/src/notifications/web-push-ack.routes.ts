// Web-push acknowledgement route, split out of web-push-dispatcher.ts (CC-2 2026-10-04): the dispatcher is called by crons and
// must not drag the driver session (auth middleware, session provider) in with it.
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireDriverSession } from "../driver/auth.js";
import { z } from "zod";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";

const ackBodySchema = z.object({
  endpoint: z.string().url(),
  tag: z.string().nullable().optional(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerWebPushAckRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver/push-subscription/ack", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const parsed = ackBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(
        `
          UPDATE driver_pwa.push_subscriptions
          SET last_received_ack_at = now(), last_active_at = now()
          WHERE driver_id = $1 AND endpoint = $2
        `,
        [driver.id, parsed.data.endpoint]
      );
    });

    return reply.code(204).send();
  });
}
