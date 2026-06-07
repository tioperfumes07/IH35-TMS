import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  aggregateLateArrivals,
  getCustomerLateArrivalDetail,
  getDriverLateArrivalDetail,
  type LateArrivalGroupBy,
} from "./late-arrival.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  by: z.enum(["driver", "customer", "lane"]),
});

const entityQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerLateArrivalAnalyticsRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/analytics/late-arrivals", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return aggregateLateArrivals(
      user.uuid,
      query.data.operating_company_id,
      query.data.from,
      query.data.to,
      query.data.by as LateArrivalGroupBy
    );
  });

  app.get("/api/v1/dispatch/analytics/late-arrivals/driver/:uuid", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ uuid: z.string().uuid() }).safeParse(req.params ?? {});
    const query = entityQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const detail = await getDriverLateArrivalDetail(
      user.uuid,
      query.data.operating_company_id,
      params.data.uuid,
      query.data.from,
      query.data.to
    );
    if (!detail) return reply.code(404).send({ error: "not_found" });
    return detail;
  });

  app.get("/api/v1/dispatch/analytics/late-arrivals/customer/:uuid", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ uuid: z.string().uuid() }).safeParse(req.params ?? {});
    const query = entityQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const detail = await getCustomerLateArrivalDetail(
      user.uuid,
      query.data.operating_company_id,
      params.data.uuid,
      query.data.from,
      query.data.to
    );
    if (!detail) return reply.code(404).send({ error: "not_found" });
    return detail;
  });
}
