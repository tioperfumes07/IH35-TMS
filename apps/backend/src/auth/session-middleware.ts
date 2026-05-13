import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { lucia } from "./lucia.js";
import { clearSessionCookieOptions, setLuciaSessionCookie } from "./session-cookie-policy.js";

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
    // CI/Vitest integration only — never enable IH35_TEST_AUTH_BYPASS in production runtimes.
    if (process.env.IH35_TEST_AUTH_BYPASS === "1") {
      const raw = req.headers["x-test-auth"];
      if (typeof raw === "string" && raw.trim().length > 0) {
        try {
          const decoded = Buffer.from(raw, "base64url").toString("utf8");
          const parsed = JSON.parse(decoded) as { id?: unknown; role?: unknown; email?: unknown };
          const id = typeof parsed.id === "string" ? parsed.id : "";
          const role = typeof parsed.role === "string" ? parsed.role : "Owner";
          const email = typeof parsed.email === "string" ? parsed.email : null;
          if (/^[0-9a-f-]{36}$/i.test(id)) {
            req.user = { uuid: id, email, role };
            req.session = { id: "test-session" };
            return;
          }
        } catch {
          // fall through to normal cookie auth
        }
      }
    }

    const sessionId = req.cookies["ih35_session"];
    if (!sessionId) {
      req.user = null;
      req.session = null;
      return;
    }
    const result = await lucia.validateSession(sessionId);
    if (result.session && result.session.fresh) {
      const fresh = lucia.createSessionCookie(result.session.id);
      setLuciaSessionCookie(reply, fresh);
    }
    if (!result.session) {
      reply.clearCookie("ih35_session", clearSessionCookieOptions());
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
