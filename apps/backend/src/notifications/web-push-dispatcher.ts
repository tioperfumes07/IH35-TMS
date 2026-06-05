import webpush from "web-push";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireDriverSession } from "../driver/auth.js";

let vapidReady = false;

function ensureWebPushConfigured(): boolean {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@ih35dispatch.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  vapidReady = true;
  return true;
}

export async function dispatchDriverWebPush(input: {
  operatingCompanyId: string;
  driverId: string;
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, string>;
}): Promise<{ sent: number; error?: string }> {
  if (!ensureWebPushConfigured()) {
    return { sent: 0, error: "vapid_not_configured" };
  }

  const subs = await withLuciaBypass(async (client) => {
    const res = await client.query<{ endpoint: string; p256dh_key: string; auth_key: string }>(
      `
        SELECT endpoint, p256dh_key, auth_key
        FROM driver_pwa.push_subscriptions
        WHERE operating_company_id = $1
          AND driver_id = $2
          AND (expires_at IS NULL OR expires_at > now())
      `,
      [input.operatingCompanyId, input.driverId]
    );
    return res.rows;
  });

  let sent = 0;
  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    tag: input.tag ?? "ih35-driver",
    data: { ...(input.data ?? {}), endpoint: subs[0]?.endpoint ?? "" },
  });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
        },
        payload,
        { TTL: 60 * 60 }
      );
      sent += 1;
      await withLuciaBypass(async (client) => {
        await client.query(
          `
            UPDATE driver_pwa.push_subscriptions
            SET last_sent_at = now(), last_active_at = now()
            WHERE endpoint = $1
          `,
          [sub.endpoint]
        );
      }).catch(() => undefined);
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await withLuciaBypass(async (client) => {
          await client.query(`DELETE FROM driver_pwa.push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
        }).catch(() => undefined);
      }
    }
  }

  return { sent };
}

const ackBodySchema = z.object({
  endpoint: z.string().url(),
  tag: z.string().nullable().optional(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerWebPushAckRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver/push-subscription/ack", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const parsed = ackBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(
        `
          UPDATE driver_pwa.push_subscriptions
          SET last_received_ack_at = now(), last_active_at = now()
          WHERE driver_id = $1 AND endpoint = $2
        `,
        [driver.id, parsed.data.endpoint]
      );
    });

    return reply.code(204).send();
  });
}
