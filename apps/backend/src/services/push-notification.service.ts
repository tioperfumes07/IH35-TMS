import webpush from "web-push";
import { withLuciaBypass } from "../auth/db.js";

let vapidReady = false;

export function ensureWebPushConfigured(): boolean {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@ih35dispatch.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  vapidReady = true;
  return true;
}

const hosWarnCooldown = new Map<string, number>();
const HOS_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export async function notifyDriverWebPush(input: {
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
    data: input.data ?? {},
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

export async function notifyLoadAssigned(input: {
  operatingCompanyId: string;
  driverId: string;
  loadId: string;
  loadLabel?: string | null;
}) {
  const label = input.loadLabel ? String(input.loadLabel) : input.loadId.slice(0, 8);
  return notifyDriverWebPush({
    operatingCompanyId: input.operatingCompanyId,
    driverId: input.driverId,
    title: "New load assigned",
    body: `You were assigned load ${label}.`,
    tag: `load-assign-${input.loadId}`,
    data: { kind: "load_assigned", load_id: input.loadId },
  });
}

export async function notifyLoadReassignedAway(input: {
  operatingCompanyId: string;
  driverId: string;
  loadId: string;
  loadLabel?: string | null;
}) {
  const label = input.loadLabel ? String(input.loadLabel) : input.loadId.slice(0, 8);
  return notifyDriverWebPush({
    operatingCompanyId: input.operatingCompanyId,
    driverId: input.driverId,
    title: "Load reassigned",
    body: `Load ${label} was reassigned to another driver.`,
    tag: `load-reassign-${input.loadId}`,
    data: { kind: "load_reassigned_away", load_id: input.loadId },
  });
}

export async function notifySettlementAvailable(input: {
  operatingCompanyId: string;
  driverId: string;
  settlementId: string;
  displayId?: string | null;
}) {
  const label = input.displayId ? String(input.displayId) : input.settlementId.slice(0, 8);
  return notifyDriverWebPush({
    operatingCompanyId: input.operatingCompanyId,
    driverId: input.driverId,
    title: "Settlement ready",
    body: `Settlement ${label} is available to review.`,
    tag: `settlement-${input.settlementId}`,
    data: { kind: "settlement_available", settlement_id: input.settlementId },
  });
}

export async function notifySettlementDisputeDecided(input: {
  operatingCompanyId: string;
  driverId: string;
  settlementId: string;
  disputeId: string;
  decision: string;
  displayId?: string | null;
}) {
  const label = input.displayId ? String(input.displayId) : input.settlementId.slice(0, 8);
  return notifyDriverWebPush({
    operatingCompanyId: input.operatingCompanyId,
    driverId: input.driverId,
    title: "Settlement dispute update",
    body: `Dispute on settlement ${label} was ${input.decision}.`,
    tag: `dispute-${input.disputeId}`,
    data: { kind: "dispute_decided", dispute_id: input.disputeId, settlement_id: input.settlementId },
  });
}

export function maybeNotifyHosShiftWarning(input: {
  operatingCompanyId: string;
  driverId: string;
  shiftRemainingMinutes: number;
}) {
  if (input.shiftRemainingMinutes > 15 || input.shiftRemainingMinutes <= 0) return;

  const now = Date.now();
  const last = hosWarnCooldown.get(input.driverId) ?? 0;
  if (now - last < HOS_COOLDOWN_MS) return;
  hosWarnCooldown.set(input.driverId, now);

  void notifyDriverWebPush({
    operatingCompanyId: input.operatingCompanyId,
    driverId: input.driverId,
    title: "HOS shift window",
    body: "Your 14-hour shift window is ending in under 15 minutes.",
    tag: `hos-warning-${input.driverId}`,
    data: { kind: "hos_warning" },
  });
}
