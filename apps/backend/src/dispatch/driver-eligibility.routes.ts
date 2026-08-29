/**
 * driver-eligibility.routes.ts — GET /api/v1/dispatch/drivers/:driverId/eligibility
 *
 * G10-H3 contract build. The dispatch UI (apps/frontend/src/api/safety.ts →
 * getDriverDispatchEligibility) calls this to show whether a driver can currently be dispatched,
 * with human-readable reasons. It was never built (404 → UI silently failed). This is a READ-ONLY,
 * NON-FINANCIAL endpoint: it composes the already-shipped dispatch auth-gates (WF-038 active-driver,
 * WF-044 PM advisory, WF-050 major-DVIR) via the shared gate registry, plus the driver-availability
 * (truck-in-repair) check. No money, no posting, no mutation.
 *
 * Contract (frontend): { eligible: boolean; reasons: string[]; details: Record<string, unknown> }.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { checkGates } from "./auth-gates/gate-registry.service.js";
// Side-effect imports: each gate module self-registers with the gate registry on import.
import "./auth-gates/wf-038-active-driver.gate.js";
import "./auth-gates/wf-044-advisory.gate.js";
import "./auth-gates/wf-050-dvir-major.gate.js";
import { canAssignLoadToDriver } from "./driver-availability.service.js";

const paramsSchema = z.object({ driverId: z.string().uuid() });
const querySchema = z.object({ operating_company_id: z.string().uuid() });

export async function registerDriverDispatchEligibilityRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/drivers/:driverId/eligibility", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const companyId = query.data.operating_company_id;
    const driverId = params.data.driverId;

    // withCompanyScope asserts org membership (403 otherwise) and sets app.operating_company_id
    // so RLS + the gate queries are tenant-scoped.
    return withCompanyScope(user.uuid, companyId, async (client) => {
      const gate = await checkGates(
        {
          operating_company_id: companyId,
          action_slug: "assign_driver",
          driver_uuid: driverId,
          load_uuid: null,
          unit_uuid: null,
          trailer_uuid: null,
        },
        client
      );

      const availability = await canAssignLoadToDriver(driverId, companyId, client);

      const reasons: string[] = [];
      for (const b of gate.blockers) reasons.push(b.message);
      if (!availability.ok && availability.blocker) reasons.push(availability.blocker);

      const eligible = gate.pass && availability.ok;

      return {
        eligible,
        reasons,
        details: {
          blockers: gate.blockers,
          warnings: gate.warnings,
          info: gate.info,
          availability,
        },
      };
    });
  });
}
