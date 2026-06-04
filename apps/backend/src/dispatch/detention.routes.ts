import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  bridgeDetentionToBilling,
  closeDetentionEvent,
  listDetentionBoard,
  notifyCustomerDetentionThreshold,
  syncDetentionEventsFromStopArrivals,
} from "./detention.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
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
  app.get("/api/v1/dispatch/detention/board", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listDetentionBoard(user.uuid, query.data.operating_company_id);
  });

  app.post("/api/v1/dispatch/detention/sync", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    return syncDetentionEventsFromStopArrivals(user.uuid, body.data.operating_company_id);
  });

  app.post("/api/v1/dispatch/detention/events/:id/close", async (req, reply) => {
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

  app.post("/api/v1/dispatch/detention/events/:id/bridge-billing", async (req, reply) => {
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

  app.post("/api/v1/dispatch/detention/events/:id/notify-customer", async (req, reply) => {
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
