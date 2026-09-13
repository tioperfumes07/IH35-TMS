// A/R INVOICE-LEVEL DISPUTE ROUTES (owner ruling 2026-09-12).
//
//   POST /api/v1/accounting/invoices/:id/disputes        open a dispute (keeps invoice + balance open)
//   GET  /api/v1/accounting/invoices/:id/disputes        disputes on one invoice
//   GET  /api/v1/accounting/invoice-disputes             the open-dispute queue for a company
//   POST /api/v1/accounting/invoice-disputes/:id/resolve resolve (invoice_corrected / credit_memo / ...)
//   POST /api/v1/accounting/invoice-disputes/:id/cancel  opened in error
//
// Gated by the INVOICE_DISPUTE_ENABLED flag (USMCA override ON per Rule 50). No GL posting here.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  INVOICE_DISPUTE_REASONS,
  INVOICE_DISPUTE_RESOLUTIONS,
  cancelInvoiceDispute,
  listInvoiceDisputeQueue,
  listInvoiceDisputes,
  openInvoiceDispute,
  resolveInvoiceDispute,
} from "./invoice-disputes.service.js";

const idParamsSchema = z.object({ id: z.string().uuid() });
const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const queueQuerySchema = companyQuerySchema.extend({
  status: z.enum(["open", "resolved", "cancelled", "all"]).optional(),
});

const openBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  disputed_amount_cents: z.number().int().positive(),
  expected_amount_cents: z.number().int().min(0).optional(),
  reason_code: z.enum(INVOICE_DISPUTE_REASONS),
  reason_text: z.string().trim().max(2000).optional(),
});

const resolveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  resolution_type: z.enum(INVOICE_DISPUTE_RESOLUTIONS),
  resolution_text: z.string().trim().max(2000).optional(),
  resolution_amount_cents: z.number().int().min(0).optional(),
  resolution_ref_id: z.string().uuid().optional(),
});

const cancelBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
});

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

const READ_ROLES = new Set(["Owner", "Administrator", "Accountant", "Manager", "Dispatcher"]);
const WRITE_ROLES = new Set(["Owner", "Administrator", "Accountant"]);

const ERROR_CODES: Record<string, number> = {
  invoice_dispute_disabled: 409,
  invoice_not_found: 404,
  invoice_not_disputable: 409,
  invalid_disputed_amount: 400,
  dispute_exceeds_invoice_face: 400,
  open_dispute_exists: 409,
  dispute_not_found: 404,
  dispute_not_open: 409,
};

function sendServiceResult(reply: FastifyReply, result: Record<string, unknown>, okCode = 200) {
  if (result && typeof result === "object" && "error" in result) {
    const code = ERROR_CODES[String(result.error)] ?? 400;
    return reply.code(code).send(result);
  }
  return reply.code(okCode).send(result);
}

export async function registerInvoiceDisputeRoutes(app: FastifyInstance) {
  // Open a dispute on an invoice.
  app.post("/api/v1/accounting/invoices/:id/disputes", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = openBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    if (!WRITE_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const result = await openInvoiceDispute({
      userId: user.uuid,
      operatingCompanyId: body.data.operating_company_id,
      invoiceId: params.data.id,
      disputedAmountCents: body.data.disputed_amount_cents,
      expectedAmountCents: body.data.expected_amount_cents,
      reasonCode: body.data.reason_code,
      reasonText: body.data.reason_text,
      sourceSystem: "api",
    });
    return sendServiceResult(reply, result as Record<string, unknown>, 201);
  });

  // Disputes on a single invoice.
  app.get("/api/v1/accounting/invoices/:id/disputes", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    if (!READ_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const result = await listInvoiceDisputes(user.uuid, query.data.operating_company_id, params.data.id);
    return reply.code(200).send(result);
  });

  // Company-wide dispute queue (defaults to open).
  app.get("/api/v1/accounting/invoice-disputes", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const query = queueQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    if (!READ_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const result = await listInvoiceDisputeQueue(
      user.uuid,
      query.data.operating_company_id,
      query.data.status ?? "open"
    );
    return reply.code(200).send(result);
  });

  // Resolve a dispute (routes to existing posters for the actual money move; this only records how).
  app.post("/api/v1/accounting/invoice-disputes/:id/resolve", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = resolveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    if (!WRITE_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const result = await resolveInvoiceDispute({
      userId: user.uuid,
      operatingCompanyId: body.data.operating_company_id,
      disputeId: params.data.id,
      resolutionType: body.data.resolution_type,
      resolutionText: body.data.resolution_text,
      resolutionAmountCents: body.data.resolution_amount_cents,
      resolutionRefId: body.data.resolution_ref_id,
    });
    return sendServiceResult(reply, result as Record<string, unknown>, 200);
  });

  // Cancel a dispute opened in error.
  app.post("/api/v1/accounting/invoice-disputes/:id/cancel", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = cancelBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    if (!WRITE_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const result = await cancelInvoiceDispute({
      userId: user.uuid,
      operatingCompanyId: body.data.operating_company_id,
      disputeId: params.data.id,
      reason: body.data.reason,
    });
    return sendServiceResult(reply, result as Record<string, unknown>, 200);
  });
}

export default fp(async (app) => {
  await registerInvoiceDisputeRoutes(app);
}, { name: "accounting.registerInvoiceDisputeRoutes" });
