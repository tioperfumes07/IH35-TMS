import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getCorsAllowedOrigins } from "../config/cors-allowed-origins.js";
import { onLoadChanged, type LoadChangedEvent } from "../realtime/load-change-bus.js";

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

/** LEAD 443.208R — pure: fold load-change events (250ms window) into one payload per company the user may see. */
export function foldLoadChanges(events: LoadChangedEvent[], accessible: ReadonlySet<string>): { company_id: string; load_ids: string[]; tables: string[] }[] {
  const by = new Map<string, { ids: Set<string>; tables: Set<string> }>();
  for (const e of events) {
    if (!e.company_id || !accessible.has(e.company_id)) continue;
    const slot = by.get(e.company_id) ?? { ids: new Set<string>(), tables: new Set<string>() };
    for (const id of e.load_ids) slot.ids.add(id);
    slot.tables.add(e.table);
    by.set(e.company_id, slot);
  }
  return [...by.entries()].map(([company_id, v]) => ({ company_id, load_ids: [...v.ids].slice(0, 200), tables: [...v.tables] }));
}

export const LOAD_CHANGED_COALESCE_MS = 250;

export async function registerNotificationStreamRoutes(app: FastifyInstance) {
  app.get("/api/v1/notifications/stream", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
    // LEAD 443.208R: ?channels=loads is the app-wide realtime bus (load.changed only, no notification polling); the bell's
    // own connection (no channels param) keeps its messages and also receives load.changed.
    const channels = String((req.query as Record<string, unknown> | undefined)?.channels ?? "notifications,loads").split(",");
    const wantsNotifications = channels.includes("notifications");
    const wantsLoads = channels.includes("loads");

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
          // BUG (live, firing every 5s in prod): String(row.created_at) called Date.prototype.toString()
          // on the pg driver's native Date object for a timestamptz column — "Mon Sep 21 2026
          // 20:28:23 GMT+0000 (Coordinated Universal Time)" — which the NEXT poll then bound as
          // $2::timestamptz and Postgres rejected (22007), degrading this stream to keepalive-only.
          // new Date(...).toISOString() round-trips correctly whether pg handed back a Date object
          // (the normal case) or, defensively, an already-ISO string.
          lastSeenAt = new Date(row.created_at as string | number | Date).toISOString();
        }
        writeKeepalive();
      } catch (error) {
        req.log.warn({ err: error }, "notifications stream poll failed; keepalive only");
        writeKeepalive();
      }
    };

    // LEAD 443.208R — load.changed: the companies this user may see (org.user_accessible_company_ids, same rule as RLS),
    // events folded per 250ms window, written as a NAMED event so the bell's onmessage never sees them.
    let unsubscribe: (() => void) | null = null;
    let flushTimer: NodeJS.Timeout | null = null;
    const pending: LoadChangedEvent[] = [];
    if (wantsLoads) {
      try {
        const accessible = new Set(
          (await withCurrentUser(user.uuid, async (client) =>
            (await client.query<{ cid: string }>(`SELECT org.user_accessible_company_ids()::text AS cid`)).rows.map((r) => r.cid)
          ))
        );
        unsubscribe = onLoadChanged((event) => {
          if (closed || !event.company_id || !accessible.has(event.company_id)) return;
          pending.push(event);
          if (flushTimer) return;
          flushTimer = setTimeout(() => {
            flushTimer = null;
            const batch = pending.splice(0, pending.length);
            for (const payload of foldLoadChanges(batch, accessible)) {
              if (closed) break;
              reply.raw.write(`event: load.changed\ndata: ${JSON.stringify(payload)}\n\n`);
            }
          }, LOAD_CHANGED_COALESCE_MS);
        });
      } catch (error) {
        req.log.warn({ err: error }, "notifications stream: load.changed subscription failed");
      }
    }

    const interval = setInterval(() => {
      if (wantsNotifications) void pollNotifications();
      else writeKeepalive();
    }, wantsNotifications ? 5000 : 25000);

    req.raw.on("close", () => {
      closed = true;
      clearInterval(interval);
      if (flushTimer) clearTimeout(flushTimer);
      unsubscribe?.();
    });

    if (wantsNotifications) await pollNotifications();
    else writeKeepalive();
    return reply;
  });
}
