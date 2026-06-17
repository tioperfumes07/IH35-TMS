import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

// Insurance dashboard aggregate — the 6 KPI counts for /safety/insurance computed
// server-side in ONE call (replacing the old 6-query / per-unit-coverage fan-out that
// left the dashboard fragile and showed "Failed to load widgets"). Read-only, no posting.
// TRANSP/operating_company scoped via the same RLS set_config the other insurance routes use.

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

const querySchema = z.object({ operating_company_id: z.string().uuid() });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: Queryable) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    // operatingCompanyId is a validated uuid (zod) — safe to interpolate, matching the
    // existing insurance routes' RLS scoping.
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client as Queryable);
  });
}

export async function registerInsuranceSummaryRoutes(app: FastifyInstance) {
  app.get("/api/v1/insurance/summary", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const tenantId = parsed.data.operating_company_id;

    const summary = await withCompanyScope(user.uuid, tenantId, async (client) => {
      const count = async (sql: string) => {
        const res = await client.query<{ count: number }>(sql, [tenantId]);
        return Number(res.rows[0]?.count ?? 0);
      };

      const total_active_policies = await count(
        `SELECT count(*)::int AS count FROM insurance.policy WHERE tenant_id = $1::uuid AND status = 'active'`
      );
      const policies_expiring_30d = await count(
        `SELECT count(*)::int AS count FROM insurance.policy
           WHERE tenant_id = $1::uuid AND status = 'active'
             AND expiry_date BETWEEN now()::date AND (now() + interval '30 days')::date`
      );
      const open_claims = await count(
        `SELECT count(*)::int AS count FROM insurance.claim WHERE tenant_id = $1::uuid AND status IN ('open', 'investigating')`
      );
      const open_lawsuits = await count(
        `SELECT count(*)::int AS count FROM insurance.lawsuit WHERE tenant_id = $1::uuid AND status IN ('filed', 'active')`
      );
      const recent_coi_requests = await count(
        `SELECT count(*)::int AS count FROM insurance.coi_request
           WHERE tenant_id = $1::uuid AND requested_at >= now() - interval '30 days'`
      );
      // Coverage gap = active insured assets with NO active policy coverage (uninsured units).
      const coverage_gap_count = await count(
        `SELECT count(*)::int AS count FROM mdata.assets a
           WHERE a.tenant_id = $1::uuid
             AND NOT EXISTS (
               SELECT 1 FROM insurance.policy_unit pu
               JOIN insurance.policy p ON p.id = pu.policy_id AND p.tenant_id = pu.tenant_id
               WHERE pu.asset_id = a.id AND pu.removed_at IS NULL AND p.status = 'active'
             )`
      );

      return {
        total_active_policies,
        policies_expiring_30d,
        coverage_gap_count,
        recent_coi_requests,
        open_claims,
        open_lawsuits,
      };
    });

    return { summary };
  });
}
