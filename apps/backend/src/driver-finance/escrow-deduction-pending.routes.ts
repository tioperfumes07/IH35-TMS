import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { pool } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  approvePendingDeduction,
  listLoadAbandonments,
  listPendingDeductions,
  processEscrowPendingExpiryReminders,
  rejectPendingDeduction,
} from "./escrow-deduction-pending.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  since_date: z.string().datetime({ offset: true }).optional(),
});

const pendingIdSchema = z.object({ id: z.string().uuid() });

const approveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  override_amount_cents: z.coerce.number().int().positive().optional(),
  review_notes: z.string().trim().max(2000).optional(),
});

const rejectBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  review_notes: z.string().trim().min(10).max(2000),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

export function registerEscrowDeductionPendingRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver-finance/escrow-deductions-pending", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      await processEscrowPendingExpiryReminders(client, user.uuid, query.data.operating_company_id);
      const rows = await listPendingDeductions(client, query.data.operating_company_id);
      return reply.send({ data: rows });
    } finally {
      client.release();
    }
  });

  app.post("/api/v1/driver-finance/escrow-deductions-pending/:id/approve", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = pendingIdSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = approveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await approvePendingDeduction(user.uuid, user.role, {
        pending_id: params.data.id,
        operating_company_id: body.data.operating_company_id,
        override_amount_cents: body.data.override_amount_cents,
        review_notes: body.data.review_notes,
      });
      return reply.send({ data: result });
    } catch (err) {
      const msg = String((err as Error).message ?? "unknown_error");
      if (msg.startsWith("E_OWNER_ONLY")) return reply.code(403).send({ error: msg });
      if (msg.startsWith("E_NOT_FOUND")) return reply.code(404).send({ error: msg });
      if (msg.startsWith("E_INVALID")) return reply.code(409).send({ error: msg });
      if (msg.startsWith("E_EXPIRED")) return reply.code(410).send({ error: msg });
      throw err;
    }
  });

  app.post("/api/v1/driver-finance/escrow-deductions-pending/:id/reject", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = pendingIdSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = rejectBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await rejectPendingDeduction(user.uuid, user.role, {
        pending_id: params.data.id,
        operating_company_id: body.data.operating_company_id,
        review_notes: body.data.review_notes,
      });
      return reply.send({ data: result });
    } catch (err) {
      const msg = String((err as Error).message ?? "unknown_error");
      if (msg.startsWith("E_OWNER_ONLY")) return reply.code(403).send({ error: msg });
      if (msg.startsWith("E_REASON_REQUIRED")) return reply.code(400).send({ error: msg });
      if (msg.startsWith("E_NOT_FOUND")) return reply.code(404).send({ error: msg });
      throw err;
    }
  });

  app.get("/api/v1/dispatch/load-abandonments", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const rows = await listLoadAbandonments(client, query.data.operating_company_id, query.data.since_date);
      return reply.send({ data: rows });
    } finally {
      client.release();
    }
  });
}
