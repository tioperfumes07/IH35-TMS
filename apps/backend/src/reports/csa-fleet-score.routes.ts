import type { FastifyInstance } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { computeAndUpsertScore } from "../routes/safety/csa-scores.js";

function nullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function registerCsaFleetScoreRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/csa-fleet-score", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const score = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      computeAndUpsertScore(client, query.data.operating_company_id, user.uuid)
    );

    const totalInspections = nullableNumber(score.total_inspections);
    const totalViolations = nullableNumber(score.total_violations);

    return {
      total_points: totalViolations,
      total_inspections: totalInspections,
      total_oos: nullableNumber(score.total_oos),
      basic_unsafe_driving: nullableNumber(score.basic_unsafe_driving),
      basic_hos_compliance: nullableNumber(score.basic_hos_compliance),
      basic_drug_alcohol: nullableNumber(score.basic_controlled_substances),
      basic_vehicle_maintenance: nullableNumber(score.basic_vehicle_maintenance),
      basic_hazmat: null,
      basic_crash_indicator: nullableNumber(score.basic_crash_indicator),
      basic_driver_fitness: nullableNumber(score.basic_driver_fitness),
      threshold_status: "not_applicable",
      source: {
        system: "ih35_safety",
        dataset: "safety.csa_scores",
        metric_kind: "internal_inspection_point_rollup",
        is_fmcsa_percentile: false,
        hazmat_availability: "requires_authenticated_carrier_sms",
      },
      computed_at: score.computed_at,
    };
  });
}
