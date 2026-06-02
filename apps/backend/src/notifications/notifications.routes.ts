import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { registerNotificationStreamRoutes } from "./notification-stream.routes.js";
import { registerNotificationPreferencesRoutes } from "./notification-preferences.routes.js";

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.string().trim().optional(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  unread_only: z.coerce.boolean().optional(),
});

const idParams = z.object({ id: z.string().uuid() });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerNotificationRoutes(app: FastifyInstance) {
  await registerNotificationStreamRoutes(app);
  await registerNotificationPreferencesRoutes(app);

  app.get("/api/v1/notifications", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = listQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const filters = ["user_id = $1::uuid", "dismissed_at IS NULL"];
      const values: unknown[] = [user.uuid];
      if (query.data.type) {
        values.push(query.data.type);
        filters.push(`type = $${values.length}`);
      }
      if (query.data.severity) {
        values.push(query.data.severity);
        filters.push(`severity = $${values.length}`);
      }
      if (query.data.unread_only) {
        filters.push("read_at IS NULL");
      }
      values.push(query.data.limit, query.data.offset);
      const res = await client.query(
        `
          SELECT id::text, type, severity, title, body, action_link, entity_type, entity_id::text,
                 source_block, read_at, dismissed_at, created_at
          FROM notifications.user_notifications
          WHERE ${filters.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });
    return reply.send({ notifications: rows });
  });

  app.get("/api/v1/notifications/unread-count", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const count = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM notifications.user_notifications
          WHERE user_id = $1::uuid
            AND read_at IS NULL
            AND dismissed_at IS NULL
        `,
        [user.uuid]
      );
      return Number(res.rows[0]?.count ?? 0);
    });
    return reply.send({ unread_count: count });
  });

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
