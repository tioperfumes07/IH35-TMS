import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { computeFuelIntegrityVerdicts } from "./fuel-integrity-verdicts.service.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  period_start: z.string().datetime({ offset: true }).optional(),
  period_end: z.string().datetime({ offset: true }).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** ROUND 306 — Fuel page: per-transaction GPS verdict (E-22) and fraud classification (E-21), with why. Read-only. */
export async function registerFuelIntegrityVerdictRoutes(app: FastifyInstance) {
  app.get("/api/v1/fuel/integrity-verdicts", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = querySchema.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const periodEnd = q.data.period_end ?? new Date().toISOString();
    const periodStart = q.data.period_start ?? new Date(new Date(periodEnd).getTime() - 30 * 86_400_000).toISOString();
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [q.data.operating_company_id]);
      return computeFuelIntegrityVerdicts(client, q.data.operating_company_id, periodStart, periodEnd);
    });
    return { period_start: periodStart, period_end: periodEnd, ...result };
  });
}
