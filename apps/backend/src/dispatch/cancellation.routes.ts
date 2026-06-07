import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  approveCancellation,
  cancelLoad,
  getLoadCancellationsAnalytics,
  listCancellationReasons,
  listCancellations,
} from "./cancellation.service.js";

const loadIdParamsSchema = z.object({ id: z.string().uuid() });
const cancellationIdParamsSchema = z.object({ id: z.string().uuid() });
const cancelBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason_code: z.string().trim().min(1).max(100),
  cancellation_notes: z.string().trim().min(20),
  billable_to_customer: z.boolean().optional(),
  cancellation_charge_cents: z.number().int().min(0).optional(),
});
const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  since: z.string().datetime({ offset: true }).optional(),
});
const analyticsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  group_by: z.enum(["reason", "driver", "customer", "date"]),
});
const approveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function mapServiceError(error: unknown) {
  const code = String((error as Error)?.message ?? "");
  if (code === "E_CANCELLATION_NOTES_MIN_20") return { status: 400, payload: { error: code } };
  if (code === "E_LOAD_NOT_FOUND" || code === "E_NOT_FOUND") return { status: 404, payload: { error: code } };
  if (code === "E_REASON_NOT_FOUND") return { status: 400, payload: { error: code } };
  if (code === "E_OWNER_ONLY") return { status: 403, payload: { error: code } };
  return null;
}

export async function registerDispatchCancellationRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/cancellation-reasons", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    return listCancellationReasons(user.uuid);
  });

  app.post("/api/v1/dispatch/loads/:id/cancel", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = cancelBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    try {
      return await cancelLoad(user.uuid, user.role, {
        ...body.data,
        load_id: params.data.id,
      });
    } catch (error) {
      const mapped = mapServiceError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.get("/api/v1/dispatch/load-cancellations", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listCancellations(user.uuid, query.data);
  });

  app.get("/api/v1/dispatch/load-cancellations/analytics", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = analyticsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return getLoadCancellationsAnalytics(user.uuid, query.data);
  });

  app.post("/api/v1/dispatch/load-cancellations/:id/approve", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = cancellationIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = approveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    try {
      return await approveCancellation(user.uuid, user.role, {
        operating_company_id: body.data.operating_company_id,
        cancellation_id: params.data.id,
      });
    } catch (error) {
      const mapped = mapServiceError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });
}
