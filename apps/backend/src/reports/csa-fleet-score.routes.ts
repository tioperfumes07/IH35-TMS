import type { FastifyInstance } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { computeAndUpsertScore } from "../routes/safety/csa-scores.js";

export async function registerCsaFleetScoreRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/csa-fleet-score", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const score = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      computeAndUpsertScore(client, query.data.operating_company_id, user.uuid)
    );

    const totalInspections = Number(score.total_inspections ?? 0);
    const totalViolations = Number(score.total_violations ?? 0);
    const ratio = totalInspections <= 0 ? 0 : totalViolations / totalInspections;
    const thresholdStatus = ratio >= 3 ? "red" : ratio >= 1.5 ? "yellow" : "green";

    return {
      total_points: Number(score.total_violations ?? 0),
      total_inspections: totalInspections,
      total_oos: Number(score.total_oos ?? 0),
      basic_unsafe_driving: Number(score.basic_unsafe_driving ?? 0),
      basic_hos_compliance: Number(score.basic_hos_compliance ?? 0),
      basic_drug_alcohol: Number(score.basic_controlled_substances ?? 0),
      basic_vehicle_maintenance: Number(score.basic_vehicle_maintenance ?? 0),
      basic_hazmat: Number(score.basic_hazmat ?? 0),
      basic_crash_indicator: Number(score.basic_crash_indicator ?? 0),
      basic_driver_fitness: Number(score.basic_driver_fitness ?? 0),
      threshold_status: thresholdStatus,
      computed_at: score.computed_at,
    };
  });
}
