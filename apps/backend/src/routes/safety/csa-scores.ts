import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function withCompany<T>(userId: string, role: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    await client.query(`SELECT set_config('app.user_role', $1, true)`, [role]);
    return fn(client);
  });
}

async function computeAndUpsertScore(client: any, companyId: string, actorId: string) {
  const res = await client.query(
    `
      SELECT
        COALESCE(SUM(csa_points), 0)::int AS total_points,
        COUNT(*)::int AS total_inspections,
        COUNT(*) FILTER (WHERE outcome = 'OOS')::int AS total_oos,
        COALESCE(SUM(CASE WHEN 'unsafe_driving' = ANY(csa_basic_categories) THEN csa_points ELSE 0 END), 0)::numeric(5,2) AS basic_unsafe_driving,
        COALESCE(SUM(CASE WHEN 'hos_compliance' = ANY(csa_basic_categories) THEN csa_points ELSE 0 END), 0)::numeric(5,2) AS basic_hos_compliance,
        COALESCE(SUM(CASE WHEN 'driver_fitness' = ANY(csa_basic_categories) THEN csa_points ELSE 0 END), 0)::numeric(5,2) AS basic_driver_fitness,
        COALESCE(SUM(CASE WHEN 'controlled_substances' = ANY(csa_basic_categories) THEN csa_points ELSE 0 END), 0)::numeric(5,2) AS basic_controlled_substances,
        COALESCE(SUM(CASE WHEN 'vehicle_maintenance' = ANY(csa_basic_categories) THEN csa_points ELSE 0 END), 0)::numeric(5,2) AS basic_vehicle_maintenance,
        COALESCE(SUM(CASE WHEN 'crash_indicator' = ANY(csa_basic_categories) THEN csa_points ELSE 0 END), 0)::numeric(5,2) AS basic_crash_indicator
      FROM safety.dot_inspections
      WHERE operating_company_id = $1
        AND voided_at IS NULL
        AND inspection_date >= (CURRENT_DATE - INTERVAL '180 days')
    `,
    [companyId]
  );
  const row = res.rows[0];
  const upsert = await client.query(
    `
      INSERT INTO safety.csa_scores (
        operating_company_id, period_start, period_end, basic_unsafe_driving, basic_hos_compliance, basic_driver_fitness,
        basic_controlled_substances, basic_vehicle_maintenance, basic_hazmat, basic_crash_indicator,
        total_inspections, total_violations, total_oos, computed_by
      )
      VALUES (
        $1, CURRENT_DATE - INTERVAL '180 days', CURRENT_DATE, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10, 'dot_inspections_rollup'
      )
      ON CONFLICT (operating_company_id, period_start, period_end)
      DO UPDATE SET
        basic_unsafe_driving = EXCLUDED.basic_unsafe_driving,
        basic_hos_compliance = EXCLUDED.basic_hos_compliance,
        basic_driver_fitness = EXCLUDED.basic_driver_fitness,
        basic_controlled_substances = EXCLUDED.basic_controlled_substances,
        basic_vehicle_maintenance = EXCLUDED.basic_vehicle_maintenance,
        basic_hazmat = NULL,
        basic_crash_indicator = EXCLUDED.basic_crash_indicator,
        total_inspections = EXCLUDED.total_inspections,
        total_violations = EXCLUDED.total_violations,
        total_oos = EXCLUDED.total_oos,
        computed_by = EXCLUDED.computed_by,
        computed_at = now()
      RETURNING *
    `,
    [
      companyId,
      row.basic_unsafe_driving,
      row.basic_hos_compliance,
      row.basic_driver_fitness,
      row.basic_controlled_substances,
      row.basic_vehicle_maintenance,
      row.basic_crash_indicator,
      row.total_inspections,
      row.total_points,
      row.total_oos,
    ]
  );
  await appendCrudAudit(
    client,
    actorId,
    "safety.csa_score.computed",
    { csa_score_id: upsert.rows[0].id, total_violations: upsert.rows[0].total_violations },
    "info",
    "P3-T11.17.2-SAFETY-V6.4"
  );
  return upsert.rows[0];
}

export async function registerSafetyCsaScoresRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/csa-scores", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.csa_scores WHERE operating_company_id = $1 ORDER BY period_end DESC LIMIT 50`,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { csa_scores: rows };
  });

  app.get("/api/v1/safety/csa-scores/current", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const row = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.csa_scores WHERE operating_company_id = $1 ORDER BY period_end DESC LIMIT 1`,
        [query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    return { current: row };
  });

  app.post("/api/v1/safety/csa-scores/compute", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const score = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) =>
      computeAndUpsertScore(client, query.data.operating_company_id, user.uuid)
    );
    return { csa_score: score };
  });

  app.post("/api/v1/safety/csa-scores/pull-from-safer", async (_req, reply) => {
    return reply.code(501).send({ error: "not_implemented", message: "FMCSA SAFER pull ships in Phase 6." });
  });
}
