import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * E1-SMOKE-SERVICE-TOKEN-AUTH
 *
 * Guards service-to-service / cron endpoints with a shared secret.
 * Callers must send:  Authorization: Bearer <SERVICE_TOKEN_SECRET>
 *
 * The secret is read from process.env.SERVICE_TOKEN_SECRET.
 * If the env var is absent (e.g. in local dev without the var set),
 * the middleware rejects all requests — set the var or use a session-authed
 * user path instead.
 *
 * Usage:
 *   if (!requireServiceToken(req, reply)) return;
 */
export function requireServiceToken(
  req: FastifyRequest,
  reply: FastifyReply
): boolean {
  const secret = process.env.SERVICE_TOKEN_SECRET;

  if (!secret) {
    req.log.warn({ path: req.url }, "SERVICE_TOKEN_SECRET not configured — rejecting internal request");
    reply.code(503).send({ error: "service_token_not_configured" });
    return false;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || token !== secret) {
    req.log.warn({ path: req.url, ip: req.ip }, "Service-token auth failed — invalid or missing token");
    reply.code(401).send({ error: "invalid_service_token" });
    return false;
  }

  return true;
}
