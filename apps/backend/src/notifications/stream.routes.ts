import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getCorsAllowedOrigins } from "../config/cors-allowed-origins.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** Raw SSE writes bypass Fastify's normal reply path; mirror CORS on Node ServerResponse. */
function applySseCorsHeaders(req: FastifyRequest, reply: FastifyReply) {
  const origin = req.headers.origin;
  if (!origin || !getCorsAllowedOrigins().includes(origin)) return;
  reply.raw.setHeader("Access-Control-Allow-Origin", origin);
  reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
  reply.raw.setHeader("Vary", "Origin");
}

async function notificationsTableReady(client: Queryable): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('notifications.user_notifications') IS NOT NULL AS ok`
  );
  return Boolean(res.rows[0]?.ok);
}

export async function registerNotificationStreamRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications/stream", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    applySseCorsHeaders(req, reply);
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders?.();

    let closed = false;
    let lastSeenAt = new Date().toISOString();

    const writeKeepalive = () => {
      if (closed) return;
      reply.raw.write(": keepalive\n\n");
    };

    const pollNotifications = async () => {
      if (closed) return;
      try {
        const rows = await withCurrentUser(user.uuid, async (client) => {
          if (!(await notificationsTableReady(client))) return [];
          const res = await client.query(
            `
              SELECT id::text, type, severity, title, body, action_link, created_at
              FROM notifications.user_notifications
              WHERE user_id = $1::uuid
                AND dismissed_at IS NULL
                AND created_at > $2::timestamptz
              ORDER BY created_at ASC
              LIMIT 20
            `,
            [user.uuid, lastSeenAt]
          );
          return res.rows;
        });

        for (const row of rows) {
          if (closed) break;
          reply.raw.write(`data: ${JSON.stringify(row)}\n\n`);
          lastSeenAt = String(row.created_at);
        }
        writeKeepalive();
      } catch (error) {
        req.log.warn({ err: error }, "notifications stream poll failed; keepalive only");
        writeKeepalive();
      }
    };

    const interval = setInterval(() => {
      void pollNotifications();
    }, 5000);

    req.raw.on("close", () => {
      closed = true;
      clearInterval(interval);
    });

    await pollNotifications();
    return reply;
  });
}
