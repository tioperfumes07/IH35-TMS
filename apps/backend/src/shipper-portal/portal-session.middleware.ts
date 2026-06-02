import type { FastifyReply, FastifyRequest } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { luciaSessionCookieBaseAttributes } from "../auth/session-cookie-policy.js";

export const PORTAL_SESSION_COOKIE = "portal_session";
export const PORTAL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PortalSessionUser = {
  id: string;
  email: string;
  full_name: string | null;
  customer_id: string;
  operating_company_id: string;
  notify_on_dispatch: boolean;
  notify_on_arrival: boolean;
  notify_on_delivery: boolean;
  notify_on_pod: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    portalUser: PortalSessionUser | null;
  }
}

export function portalSessionCookieOptions(maxAgeSeconds: number) {
  const base = luciaSessionCookieBaseAttributes();
  return {
    httpOnly: true,
    path: "/",
    secure: base.secure ?? false,
    sameSite: base.sameSite ?? ("lax" as const),
    maxAge: maxAgeSeconds,
    ...(base.domain ? { domain: base.domain } : {}),
  };
}

export function clearPortalSessionCookie(reply: FastifyReply) {
  const opts = portalSessionCookieOptions(0);
  reply.clearCookie(PORTAL_SESSION_COOKIE, {
    path: opts.path,
    secure: opts.secure,
    sameSite: opts.sameSite,
    ...(opts.domain ? { domain: opts.domain } : {}),
  });
}

export async function resolvePortalUser(sessionId: string | undefined): Promise<PortalSessionUser | null> {
  if (!sessionId?.trim()) return null;
  return withLuciaBypass(async (client) => {
    const res = await client.query<PortalSessionUser>(
      `
        SELECT
          u.id,
          u.email,
          u.full_name,
          u.customer_id::text AS customer_id,
          u.operating_company_id::text AS operating_company_id,
          u.notify_on_dispatch,
          u.notify_on_arrival,
          u.notify_on_delivery,
          u.notify_on_pod
        FROM shipper_portal.portal_sessions s
        JOIN shipper_portal.portal_users u ON u.id = s.portal_user_id
        WHERE s.id = $1
          AND s.expires_at > NOW()
          AND u.active = TRUE
          AND u.archived_at IS NULL
        LIMIT 1
      `,
      [sessionId]
    );
    return res.rows[0] ?? null;
  });
}

export async function requirePortalSession(req: FastifyRequest, reply: FastifyReply): Promise<PortalSessionUser | null> {
  const sessionId = req.cookies[PORTAL_SESSION_COOKIE];
  const user = await resolvePortalUser(sessionId);
  if (!user) {
    await reply.code(401).send({ error: "portal_session_required" });
    return null;
  }
  req.portalUser = user;
  return user;
}

export function rejectInternalSessionOnPortalRoute(req: FastifyRequest, reply: FastifyReply): boolean {
  const internalSession = req.cookies["ih35_session"];
  if (internalSession && !req.cookies[PORTAL_SESSION_COOKIE]) {
    void reply.code(403).send({ error: "internal_session_not_valid_for_portal" });
    return true;
  }
  return false;
}
