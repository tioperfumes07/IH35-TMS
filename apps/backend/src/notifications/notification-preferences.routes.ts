import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const patchPrefsSchema = z.object({
  channels_per_type: z.record(z.string(), z.array(z.enum(["in_app", "email", "sms"]))).optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  email_digest_enabled: z.boolean().optional(),
  email_digest_frequency: z.enum(["daily", "weekly"]).nullable().optional(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerNotificationPreferencesRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications/preferences", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const prefs = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT id::text, user_id::text, channels_per_type, quiet_hours_start, quiet_hours_end,
                 email_digest_enabled, email_digest_frequency, updated_at
          FROM notifications.user_notification_preferences
          WHERE user_id = $1::uuid
          LIMIT 1
        `,
        [user.uuid]
      );
      if (res.rows[0]) return res.rows[0];
      const insert = await client.query(
        `
          INSERT INTO notifications.user_notification_preferences (user_id)
          VALUES ($1::uuid)
          ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
          RETURNING id::text, user_id::text, channels_per_type, quiet_hours_start, quiet_hours_end,
                    email_digest_enabled, email_digest_frequency, updated_at
        `,
        [user.uuid]
      );
      return insert.rows[0];
    });
    return reply.send({ preferences: prefs });
  });

  app.patch("/api/v1/notifications/preferences", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const body = patchPrefsSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const prefs = await withCurrentUser(user.uuid, async (client) => {
      await client.query(
        `
          INSERT INTO notifications.user_notification_preferences (user_id)
          VALUES ($1::uuid)
          ON CONFLICT (user_id) DO NOTHING
        `,
        [user.uuid]
      );

      const updates: string[] = ["updated_at = NOW()"];
      const values: unknown[] = [user.uuid];
      if (body.data.channels_per_type !== undefined) {
        values.push(JSON.stringify(body.data.channels_per_type));
        updates.push(`channels_per_type = $${values.length}::jsonb`);
      }
      if (body.data.quiet_hours_start !== undefined) {
        values.push(body.data.quiet_hours_start);
        updates.push(`quiet_hours_start = $${values.length}::time`);
      }
      if (body.data.quiet_hours_end !== undefined) {
        values.push(body.data.quiet_hours_end);
        updates.push(`quiet_hours_end = $${values.length}::time`);
      }
      if (body.data.email_digest_enabled !== undefined) {
        values.push(body.data.email_digest_enabled);
        updates.push(`email_digest_enabled = $${values.length}`);
      }
      if (body.data.email_digest_frequency !== undefined) {
        values.push(body.data.email_digest_frequency);
        updates.push(`email_digest_frequency = $${values.length}`);
      }

      const res = await client.query(
        `
          UPDATE notifications.user_notification_preferences
          SET ${updates.join(", ")}
          WHERE user_id = $1::uuid
          RETURNING id::text, user_id::text, channels_per_type, quiet_hours_start, quiet_hours_end,
                    email_digest_enabled, email_digest_frequency, updated_at
        `,
        values
      );
      return res.rows[0];
    });
    return reply.send({ preferences: prefs });
  });
}
