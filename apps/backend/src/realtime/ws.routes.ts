import type { FastifyInstance } from "fastify";
import { lucia } from "../auth/lucia.js";
import { verifyDriverAccessToken } from "../driver/driver-jwt.js";
import { realtimeSubscribe, realtimeUnsubscribeAll } from "./hub.js";
import type { WebSocket } from "ws";

function parseAllowedOrigins(): string[] {
  const raw = process.env.WEBSOCKET_ALLOWED_ORIGINS ?? process.env.CORS_ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function originAllowed(origin: string | undefined) {
  if (!origin) return true;
  const list = parseAllowedOrigins();
  if (list.length === 0) return true;
  return list.includes(origin);
}

export async function registerRealtimeWsRoutes(app: FastifyInstance) {
  const allowed = parseAllowedOrigins();
  if (allowed.length > 0) {
    app.log.info({ websocket_allowed_origins: allowed }, "websocket origins");
  }

  app.get(
    "/api/v1/realtime/ws",
    { websocket: true },
    async (socketConn, req) => {
      if (!originAllowed(req.headers.origin)) {
        socketConn.close(4003, "origin_not_allowed");
        return;
      }

      const url = new URL(req.url, "http://localhost");
      const qTok = url.searchParams.get("driver_access_token");
      let userId: string | null = null;
      let role: string | null = null;
      let companyId: string | null = null;

      if (qTok) {
        const claims = verifyDriverAccessToken(qTok);
        if (claims) {
          userId = claims.sub;
          role = claims.role;
        }
      } else {
        const sessionId = req.cookies?.ih35_session;
        if (sessionId) {
          const res = await lucia.validateSession(sessionId);
          if (res.user) {
            userId = String(res.user.id);
            role = String((res.user as unknown as Record<string, unknown>)["role"] ?? "");
          }
        }
      }

      if (!userId) {
        socketConn.close(4401, "unauthorized");
        return;
      }

      let driverProfileId: string | null = null;

      if (role === "Driver") {
        const { withLuciaBypass } = await import("../auth/db.js");
        const row = await withLuciaBypass(async (client) => {
          const res = await client.query(
            `SELECT id::text AS driver_id, operating_company_id::text AS oc FROM mdata.drivers WHERE identity_user_id = $1::uuid LIMIT 1`,
            [userId]
          );
          return res.rows[0] as { driver_id?: string; oc?: string } | undefined;
        });
        driverProfileId = row?.driver_id ?? null;
        companyId = row?.oc ?? null;
      } else {
        const { withLuciaBypass } = await import("../auth/db.js");
        companyId = await withLuciaBypass(async (client) => {
          const res = await client.query(
            `
              SELECT c.id::text
              FROM identity.users u
              JOIN org.companies c ON c.id = u.default_company_id
              WHERE u.id = $1::uuid AND c.deactivated_at IS NULL
              UNION
              SELECT c.id::text
              FROM org.companies c
              WHERE c.id IN (SELECT org.user_accessible_company_ids())
              ORDER BY id
              LIMIT 1
            `,
            [userId]
          );
          return (res.rows[0] as { id?: string } | undefined)?.id ?? null;
        });
      }

      const socket = socketConn as unknown as WebSocket;

      if (role === "Driver" && driverProfileId) {
        realtimeSubscribe(`driver:${driverProfileId}`, socket);
      }

      function allowTopic(topic: string): boolean {
        if (topic.startsWith("load:")) return true;
        if (topic.startsWith("driver:") && role === "Driver" && driverProfileId) {
          return topic === `driver:${driverProfileId}` || topic.startsWith(`driver:${driverProfileId}:`);
        }
        if (companyId && topic === `company:${companyId}:notifications`) return true;
        if (companyId && topic === `company:${companyId}:reconcile`) return true;
        return false;
      }

      socket.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as { op?: string; topic?: string };
          if (msg.op === "sub" && typeof msg.topic === "string") {
            if (!allowTopic(msg.topic)) return;
            realtimeSubscribe(msg.topic, socket);
            socket.send(JSON.stringify({ ok: true, subscribed: msg.topic }));
          }
          if (msg.op === "ping") {
            socket.send(JSON.stringify({ pong: true }));
          }
        } catch {
          /* invalid */
        }
      });

      socket.on("close", () => {
        realtimeUnsubscribeAll(socket);
      });

      socket.send(JSON.stringify({ ok: true, hello: true, company_id: companyId }));
    }
  );
}
