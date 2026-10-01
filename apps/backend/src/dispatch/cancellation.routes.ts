import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  approveCancellation,
  cancelLoad,
  getCancellationPreview,
  listCancellationReasons,
  listCancellations,
} from "./cancellation.service.js";
import { reverseLoadCancellationInClientTx } from "./cancellation-reversal.service.js";
import { withCurrentUser } from "../auth/db.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { DISPATCH_WORK_LOAD_STATUSES } from "./canonical-active-load-set.js";

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
const cancellationReasonsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
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
  if (code === "E_CANCELLATION_CHARGE_REQUIRED_WHEN_BILLABLE") return { status: 400, payload: { error: code } };
  if (code === "E_CANCELLATION_RECORD_WRITE_FAILED" || code === "E_CANCELLATION_LOAD_WRITE_FAILED") {
    return { status: 409, payload: { error: code } };
  }
  if (code === "E_LOAD_NOT_FOUND" || code === "E_NOT_FOUND") return { status: 404, payload: { error: code } };
  if (code === "E_REASON_NOT_FOUND") return { status: 400, payload: { error: code } };
  if (code === "E_OWNER_ONLY") return { status: 403, payload: { error: code } };
  if (code === "E_REVERSAL_REASON_MIN_10" || code === "E_RESTORE_STATUS_REQUIRED") return { status: 400, payload: { error: code } };
  if (code === "E_NO_ACTIVE_CANCELLATION" || code === "E_CANCEL_STAMP_NOT_CLEARED") return { status: 409, payload: { error: code } };
  return null;
}

const previewQuerySchema = z.object({ operating_company_id: z.string().uuid() });

export async function registerDispatchCancellationRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/cancellation-reasons", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = cancellationReasonsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listCancellationReasons(user.uuid, query.data.operating_company_id);
  });

  // ROUND 125-126 (owner, via the Lead) — VOID-A-LOAD CASCADE PREVIEW. Read-only: every artifact
  // the cancel cascade is a candidate to touch, named with its own number and amount (never a
  // count), plus the driver bill KEEP/VOID split. No GL math, no write path — CC-1 owns cascade
  // execution; this describes what exists today, so CancelLoadModal.tsx can show the dispatcher
  // the real picture before they confirm.
  app.get(
    "/api/v1/dispatch/loads/:id/cancellation-preview",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const params = loadIdParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
      const query = previewQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
      try {
        return await getCancellationPreview(user.uuid, query.data.operating_company_id, params.data.id);
      } catch (error) {
        const mapped = mapServiceError(error);
        if (mapped) return reply.code(mapped.status).send(mapped.payload);
        throw error;
      }
    }
  );

  app.post("/api/v1/dispatch/loads/:id/cancel", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = cancelBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    try {
      const result = await cancelLoad(user.uuid, user.role, {
        ...body.data,
        load_id: params.data.id,
      });
      return result;
    } catch (error) {
      const mapped = mapServiceError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.get("/api/v1/dispatch/load-cancellations", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listCancellations(user.uuid, query.data);
  });

  // ROUND 313 — the canonical undo of a wrong cancellation (Owner only). :id is the LOAD.
  app.post("/api/v1/dispatch/loads/:id/cancellation/reverse", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "E_OWNER_ONLY" });
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    const body = z.object({
      operating_company_id: z.string().uuid(),
      reason: z.string().trim().min(10),
      restore_status: z.enum(DISPATCH_WORK_LOAD_STATUSES).optional(),
    }).safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });
    try {
      return await withCurrentUser(user.uuid, async (client) => {
        await setScopedCompanyContext(client, user.uuid, body.data.operating_company_id);
        return reverseLoadCancellationInClientTx(client as never, user.uuid, { load_id: params.data.id, ...body.data });
      });
    } catch (error) {
      const mapped = mapServiceError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.post("/api/v1/dispatch/load-cancellations/:id/approve", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = cancellationIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = approveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    try {
      const result = await approveCancellation(user.uuid, user.role, {
        operating_company_id: body.data.operating_company_id,
        cancellation_id: params.data.id,
      });
      return result;
    } catch (error) {
      const mapped = mapServiceError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });
}
