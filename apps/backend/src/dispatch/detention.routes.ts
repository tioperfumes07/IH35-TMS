import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  bridgeDetentionToBilling,
  closeDetentionEvent,
  listDetentionBoard,
  listDetentionEventsForLoad,
  notifyCustomerDetentionThreshold,
  syncDetentionEventsFromStopArrivals,
} from "./detention.service.js";
import { dispatchAlertDateRangeIsValid, dispatchAlertQueryFields } from "./dispatch-alert-query.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  ...dispatchAlertQueryFields,
});

const loadEventsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid(),
});

const eventParamsSchema = z.object({ id: z.string().uuid() });

const closeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  stopped_at: z.string().datetime({ offset: true }).optional(),
});

const companyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDispatchDetentionRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/detention/board", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    if (!dispatchAlertDateRangeIsValid(query.data)) return reply.code(400).send({ error: "invalid_date_range" });
    return listDetentionBoard(user.uuid, query.data.operating_company_id, query.data);
  });

  // DISP-F6470 — LINK-F5171 reverse-link: a load's own detail view can ask "what detention
  // happened on me" without inheriting the operational board's accruing/closed-only scope.
  app.get(
    "/api/v1/dispatch/detention/events",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const query = loadEventsQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
      return listDetentionEventsForLoad(user.uuid, query.data.operating_company_id, query.data.load_id);
    }
  );

  app.post("/api/v1/dispatch/detention/sync", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    return syncDetentionEventsFromStopArrivals(user.uuid, body.data.operating_company_id);
  });

  app.post("/api/v1/dispatch/detention/events/:id/close", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = eventParamsSchema.safeParse(req.params ?? {});
    const body = closeBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const result = await closeDetentionEvent(
      user.uuid,
      body.data.operating_company_id,
      params.data.id,
      body.data.stopped_at
    );
    if (!result.ok) {
      if (result.error === "not_found") return reply.code(404).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return result.event;
  });

  app.post("/api/v1/dispatch/detention/events/:id/bridge-billing", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = eventParamsSchema.safeParse(req.params ?? {});
    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const result = await bridgeDetentionToBilling(user.uuid, body.data.operating_company_id, params.data.id);
    if (!result.ok) {
      if (result.error === "not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "zero_accrual") return reply.code(422).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return { event: result.event, bridge: result.bridge };
  });

  app.post("/api/v1/dispatch/detention/events/:id/notify-customer", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = eventParamsSchema.safeParse(req.params ?? {});
    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const result = await notifyCustomerDetentionThreshold(
      user.uuid,
      body.data.operating_company_id,
      params.data.id
    );
    if (!result.ok) {
      if (result.error === "not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "no_customer_email") return reply.code(422).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return result;
  });
}
