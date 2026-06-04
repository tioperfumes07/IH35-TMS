import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { getPlannerWeek, reschedulePlannerLoad } from "./planner.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const loadParamsSchema = z.object({ id: z.string().uuid() });

const rescheduleBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  start_at: z.string().datetime({ offset: true }),
  driver_id: z.string().uuid().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDispatchPlannerRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/planner/week", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return getPlannerWeek(user.uuid, query.data.operating_company_id, query.data.week_start);
  });

  app.patch("/api/v1/dispatch/planner/loads/:id/start_at", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadParamsSchema.safeParse(req.params ?? {});
    const body = rescheduleBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error", details: body.success ? undefined : body.error.flatten() });
    }
    const result = await reschedulePlannerLoad(
      user.uuid,
      body.data.operating_company_id,
      params.data.id,
      body.data.start_at,
      body.data.driver_id
    );
    if (!result.ok) {
      if (result.error === "load_not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "conflict") return reply.code(409).send({ error: result.error, details: result.details });
      if (result.error === "hos_blocked") return reply.code(422).send({ error: result.error, details: result.details });
      return reply.code(400).send({ error: result.error, details: result.details });
    }
    return result.load;
  });
}
