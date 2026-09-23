import type { FastifyInstance } from "fastify";
import { requireDriverSession } from "../../driver/auth.js";
import { withCurrentUser } from "../../auth/db.js";
import { setScopedCompanyContext } from "../../_helpers/scoped-company-context.js";
import { closeTourForDriver, resolveTourCloseEligibility, TourCloseError } from "./tour-close.service.js";
import { postLoadBookendedSettlementGlAfterClose } from "../../driver-finance/settlement-payrun-close.service.js";

const RL = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

/**
 * TOUR CLOSE + GEOFENCE (owner direct instruction, 2026-09-02). See tour-close.service.ts for the
 * full design rationale. Driver-facing only (requireDriverSession) — this is the driver's own
 * "close my tour" action, distinct from the office-side CloseTripPanel.tsx re-check control.
 */
export async function registerTourCloseRoutes(app: FastifyInstance) {
  // GET eligibility — read-only, side-effect-free. The driver-pwa polls this to decide whether to
  // show the Close Tour button (can_close=true) or the "head to the yard" deadhead prompt
  // (should_prompt_deadhead_to_yard=true). Never mutates anything.
  app.get("/api/v1/driver-pwa/tour/close-eligibility", RL, async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver) return;

    const result = await withCurrentUser(req.user!.uuid, async (client) => {
      await setScopedCompanyContext(client, req.user!.uuid, driver.operating_company_id);
      return resolveTourCloseEligibility(client, {
        operatingCompanyId: driver.operating_company_id,
        driverId: driver.id,
      });
    });
    return result;
  });

  // POST close — re-validates eligibility server-side inside the same transaction before closing;
  // a client-supplied "I'm eligible" is never trusted.
  app.post("/api/v1/driver-pwa/tour/close", RL, async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver) return;

    try {
      const result = await withCurrentUser(req.user!.uuid, async (client) => {
        await setScopedCompanyContext(client, req.user!.uuid, driver.operating_company_id);
        return closeTourForDriver(client, {
          operatingCompanyId: driver.operating_company_id,
          driverId: driver.id,
          actorUserId: req.user!.uuid,
        });
      });
      // ROUND 137 fix (USMCA-LOAD-BOOKENDED-SETTLEMENTS-NEVER-POST-GL): the trip-close write above
      // has already committed (withCurrentUser resolved) -- posting the settlement's GL now, in a
      // separate call/connection, is the correct post-commit sequencing (closeSettlementPayRun
      // reads the settlement's own current status; calling it INSIDE the still-open transaction
      // above would see pre-commit state). Fail-soft by design: the driver's tour is closed either
      // way, a posting hiccup here must never block that response -- see
      // postLoadBookendedSettlementGlAfterClose's own doc comment.
      if (result.closed && result.settlement_id) {
        await postLoadBookendedSettlementGlAfterClose({
          operatingCompanyId: driver.operating_company_id,
          settlementId: result.settlement_id,
          actorUserId: req.user!.uuid,
        });
      }
      return result;
    } catch (e) {
      if (e instanceof TourCloseError) {
        return reply.code(409).send({ error: e.code, message: e.message });
      }
      throw e;
    }
  });
}
