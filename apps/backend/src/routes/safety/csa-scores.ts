import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});
const historyQuerySchema = companyQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const INTERNAL_CSA_SOURCE_METADATA = {
  system: "ih35_safety",
  dataset: "safety.csa_scores",
  metric_kind: "internal_inspection_point_rollup",
  is_fmcsa_basic_measure: false,
  is_fmcsa_percentile: false,
  hazmat: {
    availability: "requires_authenticated_carrier_sms",
    source: "fmcsa_sms_authenticated_carrier_profile",
  },
} as const;

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
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1::text, true)`, [role]);
    return fn(client);
  });
}

export async function computeAndUpsertScore(client: any, companyId: string, actorId: string) {
  const res = await client.query(
    `
      WITH inspection_points AS (
        SELECT
          outcome,
          csa_points,
          CASE
            WHEN jsonb_typeof(violations_jsonb -> 'csa_point_breakdown' -> 'unsafe_driving') = 'number'
            THEN (violations_jsonb -> 'csa_point_breakdown' ->> 'unsafe_driving')::numeric
          END AS unsafe_driving_points,
          CASE
            WHEN jsonb_typeof(violations_jsonb -> 'csa_point_breakdown' -> 'hos_compliance') = 'number'
            THEN (violations_jsonb -> 'csa_point_breakdown' ->> 'hos_compliance')::numeric
          END AS hos_compliance_points,
          CASE
            WHEN jsonb_typeof(violations_jsonb -> 'csa_point_breakdown' -> 'driver_fitness') = 'number'
            THEN (violations_jsonb -> 'csa_point_breakdown' ->> 'driver_fitness')::numeric
          END AS driver_fitness_points,
          CASE
            WHEN jsonb_typeof(violations_jsonb -> 'csa_point_breakdown' -> 'controlled_substances') = 'number'
            THEN (violations_jsonb -> 'csa_point_breakdown' ->> 'controlled_substances')::numeric
          END AS controlled_substances_points,
          CASE
            WHEN jsonb_typeof(violations_jsonb -> 'csa_point_breakdown' -> 'vehicle_maintenance') = 'number'
            THEN (violations_jsonb -> 'csa_point_breakdown' ->> 'vehicle_maintenance')::numeric
          END AS vehicle_maintenance_points,
          CASE
            WHEN jsonb_typeof(violations_jsonb -> 'csa_point_breakdown' -> 'crash_indicator') = 'number'
            THEN (violations_jsonb -> 'csa_point_breakdown' ->> 'crash_indicator')::numeric
          END AS crash_indicator_points
        FROM safety.dot_inspections
        WHERE operating_company_id = $1::uuid
          AND voided_at IS NULL
          AND inspection_date >= (CURRENT_DATE - INTERVAL '180 days')
      )
      SELECT
        SUM(csa_points)::int AS total_points,
        COUNT(*)::int AS total_inspections,
        COUNT(*) FILTER (WHERE outcome = 'OOS')::int AS total_oos,
        SUM(unsafe_driving_points)::numeric(5,2) AS basic_unsafe_driving,
        SUM(hos_compliance_points)::numeric(5,2) AS basic_hos_compliance,
        SUM(driver_fitness_points)::numeric(5,2) AS basic_driver_fitness,
        SUM(controlled_substances_points)::numeric(5,2) AS basic_controlled_substances,
        SUM(vehicle_maintenance_points)::numeric(5,2) AS basic_vehicle_maintenance,
        SUM(crash_indicator_points)::numeric(5,2) AS basic_crash_indicator
      FROM inspection_points
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
    {
      csa_score_id: upsert.rows[0].id,
      operating_company_id: companyId,
      total_violations: upsert.rows[0].total_violations,
    },
    "info",
    "P3-T11.17.2-SAFETY-V6.4"
  );
  return upsert.rows[0];
}

export async function registerSafetyCsaScoresRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/csa-scores", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = historyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const countRes = await client.query(
        `SELECT count(*)::int AS total_count FROM safety.csa_scores WHERE operating_company_id = $1::uuid`,
        [query.data.operating_company_id]
      );
      const res = await client.query(
        `SELECT * FROM safety.csa_scores WHERE operating_company_id = $1::uuid ORDER BY period_end DESC LIMIT $2 OFFSET $3`,
        [query.data.operating_company_id, query.data.limit, query.data.offset]
      );
      return {
        rows: res.rows.map((row: Record<string, unknown>) => ({ ...row, basic_hazmat: null })),
        total_count: Number(countRes.rows[0]?.total_count ?? 0),
      };
    });
    return { csa_scores: rows.rows, total_count: rows.total_count, source: INTERNAL_CSA_SOURCE_METADATA };
  });

  app.get("/api/v1/safety/csa-scores/current", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const row = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.csa_scores WHERE operating_company_id = $1::uuid ORDER BY period_end DESC LIMIT 1`,
        [query.data.operating_company_id]
      );
      const current = res.rows[0] ?? null;
      return current ? { ...current, basic_hazmat: null } : null;
    });
    return { current: row, source: INTERNAL_CSA_SOURCE_METADATA };
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
    return { csa_score: { ...score, basic_hazmat: null }, source: INTERNAL_CSA_SOURCE_METADATA };
  });

  app.post("/api/v1/safety/csa-scores/pull-from-safer", async (_req, reply) => {
    return reply.code(409).send({
      error: "source_not_authoritative",
      message:
        "Public SAFER does not provide the Hazmat BASIC percentile. Use an explicitly authorized carrier SMS integration; no authenticated scraping is performed.",
      source: INTERNAL_CSA_SOURCE_METADATA.hazmat,
    });
  });
}
