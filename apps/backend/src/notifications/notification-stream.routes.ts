import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerNotificationStreamRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications/stream", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let closed = false;
    req.raw.on("close", () => {
      closed = true;
    });

    let lastSeenAt = new Date().toISOString();

    while (!closed) {
      const rows = await withCurrentUser(user.uuid, async (client) => {
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

      if (!closed) {
        reply.raw.write(": keepalive\n\n");
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  });
}
