import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { lucia } from "./lucia.js";

declare module "fastify" {
  interface FastifyRequest {
    user: { uuid: string; email: string | null; role: string } | null;
    session: { id: string } | null;
  }
}

export async function registerSessionMiddleware(app: FastifyInstance) {
  app.decorateRequest("user", null);
  app.decorateRequest("session", null);

  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const sessionId = req.cookies["ih35_session"];
    if (!sessionId) {
      req.user = null;
      req.session = null;
      return;
    }
    const result = await lucia.validateSession(sessionId);
    if (result.session && result.session.fresh) {
      const fresh = lucia.createSessionCookie(result.session.id);
      reply.setCookie(fresh.name, fresh.value, fresh.attributes);
    }
    if (!result.session) {
      reply.clearCookie("ih35_session", { path: "/" });
      req.user = null;
      req.session = null;
      return;
    }
    if (result.user) {
      // Phase 1 identity RLS uses this UUID as the request auth context source.
      req.user = {
        uuid: String(result.user.id),
        email: ((result.user as unknown as Record<string, unknown>)["email"] as string | null) ?? null,
        role: String((result.user as unknown as Record<string, unknown>)["role"] || ""),
      };
    }
    req.session = { id: result.session.id };
  });
}

export function requireAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!req.user || !req.session) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}
