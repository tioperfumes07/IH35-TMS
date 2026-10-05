import webpush from "web-push";
import { withLuciaBypass } from "../auth/db.js";

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
        WHERE operating_company_id = $1::uuid
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
