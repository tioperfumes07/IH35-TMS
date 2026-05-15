import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import {
  coerceQuietTime,
  DEFAULT_NOTIFICATION_CHANNELS,
  mergeNotificationPreferencesRow,
  normalizeChannelMap,
  type NotificationChannelKey,
  type NotificationEventOverrides,
} from "./notification-prefs.service.js";
import { NOTIFICATION_PREFERENCE_EVENT_TYPES, isPreferenceEventType, type NotificationPreferenceEventType } from "../notifications/event-types.js";

const channelShape = z
  .object({
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
    in_app: z.boolean().optional(),
  })
  .strict()
  .optional();

const eventOverrideEntry = z
  .object({
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
    in_app: z.boolean().optional(),
  })
  .strict();

const patchBodySchema = z
  .object({
    channels: channelShape,
    event_overrides: z.record(z.string(), eventOverrideEntry.partial()).optional(),
    quiet_hours_start: z.string().nullable().optional(),
    quiet_hours_end: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
    reset_to_defaults: z.boolean().optional(),
  })
  .strict();

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sanitizeOverrides(raw: Record<string, z.infer<typeof eventOverrideEntry>> | undefined): NotificationEventOverrides {
  if (!raw) return {};
  const out: NotificationEventOverrides = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isPreferenceEventType(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function registerNotificationPreferenceRoutes(app: FastifyInstance) {
  app.get("/api/v1/identity/me/notification-preferences", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const row = await withCurrentUser(user.uuid, async (client) => {
      const reg = await client.query(`SELECT to_regclass('identity.user_notification_preferences') AS r`);
      if (!(reg.rows[0] as { r?: unknown } | undefined)?.r) {
        return null;
      }
      const res = await client.query<{
        channels: unknown;
        event_overrides: unknown;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        timezone: string | null;
        email_enabled?: unknown;
        sms_enabled?: unknown;
        whatsapp_enabled?: unknown;
      }>(
        `
          SELECT channels, event_overrides, quiet_hours_start::text, quiet_hours_end::text, timezone,
                 email_enabled, sms_enabled, whatsapp_enabled
          FROM identity.user_notification_preferences
          WHERE user_uuid = $1::uuid
          LIMIT 1
        `,
        [user.uuid]
      );
      return res.rows[0] ?? null;
    }).catch(() => null);

    const merged = mergeNotificationPreferencesRow(row);

    return {
      events: [...NOTIFICATION_PREFERENCE_EVENT_TYPES],
      ...merged,
      quiet_hours_start: merged.quiet_hours_start,
      quiet_hours_end: merged.quiet_hours_end,
    };
  });

  app.patch("/api/v1/identity/me/notification-preferences", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const parsed = patchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const body = parsed.data;
    if (body.reset_to_defaults) {
      await withCurrentUser(user.uuid, async (client) => {
        const reg = await client.query(`SELECT to_regclass('identity.user_notification_preferences') AS r`);
        if (!(reg.rows[0] as { r?: unknown } | undefined)?.r) return;
        await client.query(`DELETE FROM identity.user_notification_preferences WHERE user_uuid = $1::uuid`, [user.uuid]);
      });
      const merged = mergeNotificationPreferencesRow(null);
      return {
        events: [...NOTIFICATION_PREFERENCE_EVENT_TYPES],
        ...merged,
      };
    }

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const reg = await client.query(`SELECT to_regclass('identity.user_notification_preferences') AS r`);
      if (!(reg.rows[0] as { r?: unknown } | undefined)?.r) {
        return null;
      }

      const existing = await client.query<{
        channels: unknown;
        event_overrides: unknown;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        timezone: string | null;
        email_enabled?: unknown;
        sms_enabled?: unknown;
        whatsapp_enabled?: unknown;
      }>(
        `
          SELECT channels, event_overrides, quiet_hours_start::text, quiet_hours_end::text, timezone,
                 email_enabled, sms_enabled, whatsapp_enabled
          FROM identity.user_notification_preferences
          WHERE user_uuid = $1::uuid
          LIMIT 1
        `,
        [user.uuid]
      );

      const baseRow = existing.rows[0] ?? null;
      const baseMerged = mergeNotificationPreferencesRow(baseRow);

      let channels = baseMerged.channels;
      if (body.channels) {
        channels = normalizeChannelMap({
          ...DEFAULT_NOTIFICATION_CHANNELS,
          ...baseMerged.channels,
          ...body.channels,
        });
      }

      let event_overrides = baseMerged.event_overrides;
      if (body.event_overrides !== undefined) {
        event_overrides = sanitizeOverrides(
          body.event_overrides as Record<string, z.infer<typeof eventOverrideEntry>>
        );
      }

      let quiet_hours_start = baseMerged.quiet_hours_start;
      let quiet_hours_end = baseMerged.quiet_hours_end;
      let timezone = baseMerged.timezone;

      if (body.quiet_hours_start !== undefined) {
        quiet_hours_start = body.quiet_hours_start === null ? null : coerceQuietTime(body.quiet_hours_start);
      }
      if (body.quiet_hours_end !== undefined) {
        quiet_hours_end = body.quiet_hours_end === null ? null : coerceQuietTime(body.quiet_hours_end);
      }
      if (body.timezone !== undefined) {
        timezone = body.timezone === null || body.timezone === "" ? null : body.timezone.trim();
      }

      await client.query(
        `
          INSERT INTO identity.user_notification_preferences (
            user_uuid, channels, event_overrides, quiet_hours_start, quiet_hours_end, timezone, updated_at,
            email_enabled, sms_enabled, whatsapp_enabled
          )
          VALUES ($1::uuid, $2::jsonb, $3::jsonb, $4::time, $5::time, $6, now(), $7, $8, $9)
          ON CONFLICT (user_uuid) DO UPDATE SET
            channels = EXCLUDED.channels,
            event_overrides = EXCLUDED.event_overrides,
            quiet_hours_start = EXCLUDED.quiet_hours_start,
            quiet_hours_end = EXCLUDED.quiet_hours_end,
            timezone = EXCLUDED.timezone,
            email_enabled = EXCLUDED.email_enabled,
            sms_enabled = EXCLUDED.sms_enabled,
            whatsapp_enabled = EXCLUDED.whatsapp_enabled,
            updated_at = now()
        `,
        [
          user.uuid,
          JSON.stringify(channels),
          JSON.stringify(event_overrides),
          quiet_hours_start,
          quiet_hours_end,
          timezone,
          channels.email,
          channels.sms,
          channels.whatsapp,
        ]
      );

      return mergeNotificationPreferencesRow({
        channels,
        event_overrides,
        quiet_hours_start,
        quiet_hours_end,
        timezone,
      });
    });

    if (!updated) {
      return reply.code(503).send({ error: "notification_preferences_schema_missing" });
    }

    return {
      events: [...NOTIFICATION_PREFERENCE_EVENT_TYPES],
      ...updated,
    };
  });
}
