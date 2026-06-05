import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.string().trim().optional(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  unread_only: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => value === "true" || value === "1"),
});

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

export async function registerNotificationListRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = listQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    try {
      const rows = await withCurrentUser(user.uuid, async (client) => {
        if (!(await notificationsTableReady(client))) return [];

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
    } catch (error) {
      req.log.warn({ err: error }, "notifications list degraded to empty");
      return reply.send({ notifications: [] });
    }
  });
}
