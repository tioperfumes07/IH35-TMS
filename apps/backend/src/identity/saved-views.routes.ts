import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

const createSchema = z.object({
  table_name: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  view_json: z.record(z.string(), z.unknown()),
});

export async function registerUserSavedViewsRoutes(app: FastifyInstance) {
  app.get("/api/v1/user-saved-views", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = z.object({ table_name: z.string().trim().min(1).max(120) }).safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('identity.user_saved_views') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return [];
      const res = await client.query(
        `
          SELECT id, table_name, name, view_json, created_at, updated_at
          FROM identity.user_saved_views
          WHERE user_id = $1 AND table_name = $2
          ORDER BY name ASC
        `,
        [user.uuid, q.data.table_name]
      );
      return res.rows;
    });
    return { views: rows };
  });

  app.post("/api/v1/user-saved-views", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const row = await withCurrentUser(user.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('identity.user_saved_views') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return null;
      const res = await client.query(
        `
          INSERT INTO identity.user_saved_views (user_id, table_name, name, view_json)
          VALUES ($1, $2, $3, $4::jsonb)
          ON CONFLICT (user_id, table_name, name)
          DO UPDATE SET view_json = EXCLUDED.view_json, updated_at = now()
          RETURNING id, table_name, name, view_json, created_at, updated_at
        `,
        [user.uuid, body.data.table_name, body.data.name, JSON.stringify(body.data.view_json)]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(503).send({ error: "saved_views_unavailable" });
    return row;
  });

  app.delete("/api/v1/user-saved-views/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    await withCurrentUser(user.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('identity.user_saved_views') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return;
      await client.query(`DELETE FROM identity.user_saved_views WHERE id = $1 AND user_id = $2`, [params.data.id, user.uuid]);
    });
    return { ok: true };
  });
}
