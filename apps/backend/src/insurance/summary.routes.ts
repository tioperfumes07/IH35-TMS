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
      // Coverage gap = active UNITS (the authoritative fleet, ~87) with NO active policy coverage.
      // Previously this counted mdata.assets (a PARTIAL mirror, ~43, linked to units by
      // unit_code = unit_number), so units with no asset row were silently invisible (GUARD #40:
      // dashboard showed 43 = asset count, not the unit count). Count over mdata.units LEFT of the
      // asset→policy_unit chain so an active unit with no asset row OR no active policy surfaces as a
      // gap. Unit↔company scoping uses COALESCE(leased_to, owner) like the telematics/fleet reads.
      const coverage_gap_count = await count(
        `SELECT count(*)::int AS count
           FROM mdata.units u
           WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
             AND u.deactivated_at IS NULL
             AND NOT EXISTS (
               SELECT 1
               FROM mdata.assets a
               JOIN insurance.policy_unit pu ON pu.asset_id = a.id AND pu.removed_at IS NULL
               JOIN insurance.policy p ON p.id = pu.policy_id AND p.tenant_id = pu.tenant_id AND p.status = 'active'
               WHERE a.tenant_id = $1::uuid AND a.unit_code = u.unit_number
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
