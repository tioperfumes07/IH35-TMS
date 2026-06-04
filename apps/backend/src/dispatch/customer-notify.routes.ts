import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  getCustomerNotifyPreferences,
  listCustomerNotifyLog,
  syncCustomerNotifyFromEvents,
  upsertCustomerNotifyPreferences,
} from "./customer-notify.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const customerParamsSchema = z.object({
  customerId: z.string().uuid(),
});

const preferencesBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  opt_in: z.boolean().optional(),
  notify_sms: z.boolean().optional(),
  notify_email: z.boolean().optional(),
  notify_on_departed: z.boolean().optional(),
  notify_on_arrived: z.boolean().optional(),
  notify_on_near_arrival: z.boolean().optional(),
  notify_on_delayed: z.boolean().optional(),
});

const companyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDispatchCustomerNotifyRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/customer-notify/log", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listCustomerNotifyLog(user.uuid, query.data.operating_company_id, {
      customerId: query.data.customer_id,
      limit: query.data.limit,
    });
  });

  app.get("/api/v1/dispatch/customer-notify/preferences/:customerId", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = customerParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    return getCustomerNotifyPreferences(user.uuid, query.data.operating_company_id, params.data.customerId);
  });

  app.put("/api/v1/dispatch/customer-notify/preferences/:customerId", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = customerParamsSchema.safeParse(req.params ?? {});
    const body = preferencesBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error", details: body.error?.flatten() });
    }
    const { operating_company_id, ...patch } = body.data;
    return upsertCustomerNotifyPreferences(user.uuid, operating_company_id, params.data.customerId, patch);
  });

  app.post("/api/v1/dispatch/customer-notify/sync", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    return syncCustomerNotifyFromEvents(user.uuid, body.data.operating_company_id);
  });
}
