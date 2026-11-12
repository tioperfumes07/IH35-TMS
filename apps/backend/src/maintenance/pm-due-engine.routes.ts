import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { computePmDueEngineForCompany } from "./pm-due-engine.service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });

/** HTTP adapter only: services consume the canonical reader without importing auth/routes. */
export async function registerPmDueEngineRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/pm-due-engine", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    await assertCompanyMembership(user.uuid, parsed.data.operating_company_id);
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [parsed.data.operating_company_id]);
      return computePmDueEngineForCompany(client, parsed.data.operating_company_id);
    });
    return { rows, computed_from: "telematics.unit_stop_events -> telematics.odometer_readings -> ABSENT", never: "fleet_average" };
  });
}
