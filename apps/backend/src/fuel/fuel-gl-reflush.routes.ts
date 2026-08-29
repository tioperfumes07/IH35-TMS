/**
 * FUEL-01 — owner/accountant-gated re-flush for unposted fuel GL.
 * Default dry_run=true. Never enables EXPENSE_GL_POSTING_ENABLED.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { reflushUnpostedFuelGlExpenses } from "../accounting/fuel-posting/reflush-unposted-fuel-gl.service.js";

const bodySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  dry_run: z.boolean().default(true),
  limit: z.number().int().positive().max(50_000).optional(),
});

const ALLOWED = new Set(["Owner", "Administrator", "Accountant"]);

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerFuelGlReflushRoutes(app: FastifyInstance) {
  app.post("/api/v1/fuel/gl/reflush-unposted", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    if (!ALLOWED.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    if (parsed.data.operating_company_id) {
      await assertCompanyMembership(user.uuid, parsed.data.operating_company_id);
    }

    try {
      const result = await reflushUnpostedFuelGlExpenses({
        operating_company_id: parsed.data.operating_company_id ?? null,
        actor_user_id: user.uuid,
        dry_run: parsed.data.dry_run,
        limit: parsed.data.limit ?? null,
        log: req.log,
      });
      return result;
    } catch (err) {
      req.log.error({ err }, "[FUEL-01] reflush-unposted failed");
      return reply.code(500).send({
        error: "fuel_gl_reflush_failed",
        message: String((err as Error)?.message ?? err),
      });
    }
  });
}

export default fp(registerFuelGlReflushRoutes);
