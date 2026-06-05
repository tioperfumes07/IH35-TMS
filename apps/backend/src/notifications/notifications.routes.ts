import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { registerNotificationListRoutes } from "./list.routes.js";
import { registerNotificationPreferencesRoutes } from "./notification-preferences.routes.js";
import { registerNotificationStreamRoutes } from "./stream.routes.js";
import { registerNotificationUnreadCountRoutes } from "./unread-count.routes.js";

const idParams = z.object({ id: z.string().uuid() });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerNotificationRoutes(app: FastifyInstance) {
  await registerNotificationListRoutes(app);
  await registerNotificationUnreadCountRoutes(app);
  await registerNotificationStreamRoutes(app);
  await registerNotificationPreferencesRoutes(app);

  app.post("/api/v1/notifications/:id/read", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = idParams.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE notifications.user_notifications
          SET read_at = COALESCE(read_at, NOW())
          WHERE id = $1::uuid AND user_id = $2::uuid
          RETURNING id::text, read_at
        `,
        [params.data.id, user.uuid]
      );
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "notification_not_found" });
    return updated;
  });

  app.post("/api/v1/notifications/:id/dismiss", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const params = idParams.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE notifications.user_notifications
          SET dismissed_at = COALESCE(dismissed_at, NOW()),
              read_at = COALESCE(read_at, NOW())
          WHERE id = $1::uuid AND user_id = $2::uuid
          RETURNING id::text, dismissed_at
        `,
        [params.data.id, user.uuid]
      );
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "notification_not_found" });
    return updated;
  });

  app.post("/api/v1/notifications/mark-all-read", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const result = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query<{ count: string }>(
        `
          UPDATE notifications.user_notifications
          SET read_at = NOW()
          WHERE user_id = $1::uuid
            AND read_at IS NULL
            AND dismissed_at IS NULL
          RETURNING id::text
        `,
        [user.uuid]
      );
      return res.rowCount ?? res.rows.length;
    });
    return reply.send({ marked_read: result });
  });
}
