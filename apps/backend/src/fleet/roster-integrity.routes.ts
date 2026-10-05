// Roster-integrity HTTP routes, split out of roster-integrity.service.ts (CC-2 2026-10-04) so the service — and the cron
// that imports it — stays free of the auth middleware and session provider.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { ROSTER_RULES, runRosterIntegrityForTenant, type DbClient } from "./roster-integrity.service.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid(), include_closed: z.coerce.boolean().optional().default(false) });
const voidBody = z.object({ operating_company_id: z.string().uuid(), reason: z.string().trim().min(3).max(500) });
const idParams = z.object({ id: z.string().uuid() });

export async function registerRosterIntegrityRoutes(app: FastifyInstance) {
  app.get("/api/v1/fleet/roster-integrity", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
      const rows = await (client as DbClient).query(
        `SELECT f.id::text, f.rule_code, f.severity, f.detail, f.evidence, f.first_detected_at, f.last_detected_at, f.resolved_at, f.voided_at, f.void_reason,
                f.unit_id::text, u.unit_number, f.samsara_vehicle_id, f.policy_id::text, p.policy_number, p.vendor_id::text AS insurer_vendor_id, f.asset_id::text
           FROM fleet.roster_findings f
           LEFT JOIN mdata.units u ON u.id = f.unit_id
           LEFT JOIN insurance.policy p ON p.id = f.policy_id
          WHERE f.operating_company_id = $1::uuid AND ($2::boolean OR (f.resolved_at IS NULL AND f.voided_at IS NULL))
          ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, u.unit_number NULLS LAST, f.rule_code`,
        [q.data.operating_company_id, q.data.include_closed]
      );
      const last = await (client as DbClient).query<{ at: string | null }>(
        `SELECT max(last_detected_at)::text AS at FROM fleet.roster_findings WHERE operating_company_id = $1::uuid`,
        [q.data.operating_company_id]
      );
      return { rules: ROSTER_RULES, last_run_at: last.rows[0]?.at ?? null, findings: rows.rows };
    });
  });

  app.post("/api/v1/fleet/roster-integrity/run", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.data.operating_company_id]);
      return runRosterIntegrityForTenant(client as DbClient, q.data.operating_company_id);
    });
  });

  app.post("/api/v1/fleet/roster-integrity/:id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    const p = idParams.safeParse(req.params ?? {});
    const b = voidBody.safeParse(req.body ?? {});
    if (!p.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    await assertCompanyMembership(user.uuid, b.data.operating_company_id);
    const out = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [b.data.operating_company_id]);
      return (await (client as DbClient).query(
        `UPDATE fleet.roster_findings SET voided_at = now(), void_reason = $3, voided_by_user_id = $4::uuid, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL RETURNING id::text`,
        [p.data.id, b.data.operating_company_id, b.data.reason, user.uuid]
      )).rows[0];
    });
    if (!out) return reply.code(404).send({ error: "finding_not_found_or_already_void" });
    return { voided: out.id };
  });
}
