import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { lucia } from "./lucia.js";

declare module "fastify" {
  interface FastifyRequest {
    user: { uuid: string; email: string; role: string } | null;
    session: { id: string } | null;
  }
}

export async function registerSessionMiddleware(app: FastifyInstance) {
  app.decorateRequest("user", null);
  app.decorateRequest("session", null);

  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const cookieHeader = (req.headers["cookie"] as string | undefined) || "";
    const sessionId = lucia.readSessionCookie(cookieHeader);
    if (!sessionId) {
      req.user = null;
      req.session = null;
      return;
    }
    const result = await lucia.validateSession(sessionId);
    if (result.session && result.session.fresh) {
      const fresh = lucia.createSessionCookie(result.session.id);
      reply.header("Set-Cookie", fresh.serialize());
    }
    if (!result.session) {
      const blank = lucia.createBlankSessionCookie();
      reply.header("Set-Cookie", blank.serialize());
      req.user = null;
      req.session = null;
      return;
    }
    if (result.user) {
      req.user = {
        uuid: String(result.user.id),
        email: String((result.user as unknown as Record<string, unknown>)["email"] || ""),
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
