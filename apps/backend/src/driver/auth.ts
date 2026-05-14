import type { FastifyReply, FastifyRequest } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { tryAttachDriverJwt } from "./auth-middleware.js";

export type DriverSession = {
  id: string;
  full_name: string;
  status: string;
  preferred_language: "en" | "es";
};

declare module "fastify" {
  interface FastifyRequest {
    driver: DriverSession | null;
  }
}

function isDriverRole(role: string): boolean {
  return role === "Driver";
}

export async function requireDriverSession(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!req.user) {
    tryAttachDriverJwt(req);
  }
  if (!requireAuth(req, reply)) return false;
  if (!req.user) return false;
  if (!isDriverRole(req.user.role)) {
    reply.code(403).send({
      error: "drivers_only",
      message: "This app is for drivers only. Office staff please use app.ih35dispatch.com",
    });
    return false;
  }
  const driver = await withCurrentUser(req.user.uuid, async (client) => {
    const result = await client.query<{ id: string; full_name: string; status: string; preferred_language: "en" | "es" | null }>(
      `
        SELECT
          d.id,
          concat_ws(' ', d.first_name, d.last_name) AS full_name,
          d.status::text AS status,
          COALESCE(iu.preferred_language, 'en')::text AS preferred_language
        FROM mdata.drivers d
        LEFT JOIN identity.users iu ON iu.id = d.identity_user_id
        WHERE d.identity_user_id = $1
          AND d.deactivated_at IS NULL
        LIMIT 1
      `,
      [req.user?.uuid]
    );
    return result.rows[0] ?? null;
  });
  if (!driver) {
    reply.code(403).send({ error: "driver_profile_not_found" });
    return false;
  }
  req.driver = {
    ...driver,
    preferred_language: driver.preferred_language === "es" ? "es" : "en",
  };
  return true;
}
