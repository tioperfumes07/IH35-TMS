import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { realtimePublish } from "../realtime/hub.js";

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerInAppNotificationRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = z
      .object({
        unread_only: z.enum(["true", "false"]).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(10),
        operating_company_id: z.string().uuid(),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
    });

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('identity.in_app_notifications') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return [];
      const unreadOnly = q.data.unread_only === "true";
      const res = await client.query(
        `
          SELECT id, title, body, href, read_at, created_at
          FROM identity.in_app_notifications
          WHERE user_id = $1
            AND operating_company_id = $2
            ${unreadOnly ? "AND read_at IS NULL" : ""}
          ORDER BY created_at DESC
          LIMIT $3
        `,
        [user.uuid, q.data.operating_company_id, q.data.limit]
      );
      return res.rows;
    });

    const unread = await withCurrentUser(user.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('identity.in_app_notifications') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return 0;
      const res = await client.query<{ c: string }>(
        `
          SELECT count(*)::text AS c
          FROM identity.in_app_notifications
          WHERE user_id = $1 AND operating_company_id = $2 AND read_at IS NULL
        `,
        [user.uuid, q.data.operating_company_id]
      );
      return Number(res.rows[0]?.c ?? 0);
    });

    return { notifications: rows, unread_count: unread };
  });

  app.post("/api/v1/notifications/:id/mark-read", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      await client.query(
        `
          UPDATE identity.in_app_notifications
          SET read_at = now()
          WHERE id = $1 AND user_id = $2 AND operating_company_id = $3
        `,
        [params.data.id, user.uuid, q.data.operating_company_id]
      );
    });

    realtimePublish(`company:${q.data.operating_company_id}:notifications`, { type: "notifications_read" });
    return { ok: true };
  });

  app.post("/api/v1/notifications/mark-all-read", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      await client.query(
        `
          UPDATE identity.in_app_notifications
          SET read_at = now()
          WHERE user_id = $1 AND operating_company_id = $2 AND read_at IS NULL
        `,
        [user.uuid, q.data.operating_company_id]
      );
    });

    realtimePublish(`company:${q.data.operating_company_id}:notifications`, { type: "notifications_read_all" });
    return { ok: true };
  });
}
