import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { computeLoadProfitability, computeTripProfitabilityReport } from "./load-profitability.service.js";

const loadParamsSchema = z.object({ loadId: z.string().uuid() });
const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const tripQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerLoadProfitabilityRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/dispatch/loads/:loadId/profitability
   * Per-load profitability breakdown. Read-only; all from existing tables.
   */
  app.get("/api/v1/dispatch/loads/:loadId/profitability", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = loadParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const { loadId } = params.data;
    const { operating_company_id } = query.data;

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);
      return computeLoadProfitability(client, operating_company_id, loadId);
    });

    if (!result) {
      return reply.code(404).send({ error: "load_not_found" });
    }
    return reply.send(result);
  });

  /**
   * GET /api/v1/reports/trip-profitability
   * Company Settlement / Trip Profitability report. Aggregates NB+SB per settlement.
   */
  app.get("/api/v1/reports/trip-profitability", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const parsed = tripQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const { operating_company_id, from, to } = parsed.data;

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);
      return computeTripProfitabilityReport(client, operating_company_id, from, to);
    });

    return reply.send(result);
  });
}
