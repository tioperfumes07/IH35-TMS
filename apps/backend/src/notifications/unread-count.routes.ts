import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function notificationsTableReady(client: Queryable): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('notifications.user_notifications') IS NOT NULL AS ok`
  );
  return Boolean(res.rows[0]?.ok);
}

export async function registerNotificationUnreadCountRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications/unread-count", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    try {
      const count = await withCurrentUser(user.uuid, async (client) => {
        if (!(await notificationsTableReady(client))) return 0;

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
    } catch (error) {
      req.log.warn({ err: error }, "notifications unread-count degraded to zero");
      return reply.send({ unread_count: 0 });
    }
  });
}
