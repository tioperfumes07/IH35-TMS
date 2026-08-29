/**
 * Settlement Approval Routes (D1)
 * 
 * API endpoints for:
 * - Getting settlement summary and line items
 * - Approving/rejecting line items
 * - Trip link queue management
 * - PDF generation (gated by approval status)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import * as approvalService from "./approval.service.js";
import * as tripLinkEngine from "./trip-link.engine.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";

// Validation schemas
const approveLineSchema = z.object({
  line_item_id: z.string().uuid(),
});

const rejectLineSchema = z.object({
  line_item_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

const approveSettlementSchema = z.object({
  settlement_id: z.string().uuid(),
});

const finalizeSettlementSchema = z.object({
  settlement_id: z.string().uuid(),
});

const assignTripLinkSchema = z.object({
  queue_id: z.string().uuid(),
  load_id: z.string().uuid(),
  load_number: z.string().min(1),
  // ACCT-R-13 (2026-07-25): previously absent entirely — assignTripLink took no company predicate
  // at all, so any authenticated user could reassign ANY entity's queued trip-link row by queue_id.
  operating_company_id: z.string().uuid().optional(),
});

const generatePdfSchema = z.object({
  settlement_id: z.string().uuid(),
  pdf_type: z.enum(['driver', 'company']),
});

// Auth helper
function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  const role = String(req.user?.role ?? "");
  if (!["Owner", "Administrator", "Manager", "Accountant", "Payroll"].includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return req.user!;
}

export async function registerSettlementApprovalRoutes(app: FastifyInstance) {
  
  // GET /api/v1/settlements/:id/approval-summary
  app.get("/api/v1/settlements/:id/approval-summary", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const query = req.query as Record<string, unknown>;
    const requestedCompanyId = String(query.operating_company_id || "") || null;

    return withCurrentUser(user.uuid, async (client) => {
      // ACCT-R-13 (2026-07-25): membership-checked, not raw-trusted — a Manager/Payroll user at one
      // entity could otherwise read another entity's settlement summary by swapping this param.
      const operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId);
      if (!operatingCompanyId) {
        return reply.code(400).send({ error: "operating_company_id required" });
      }
      const summary = await approvalService.getSettlementSummary(client, id, operatingCompanyId);
      if (!summary) {
        return reply.code(404).send({ error: "settlement not found" });
      }
      return summary;
    });
  });

  // GET /api/v1/settlements/:id/line-items
  app.get("/api/v1/settlements/:id/line-items", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const query = req.query as Record<string, unknown>;
    const requestedCompanyId = String(query.operating_company_id || "") || null;

    return withCurrentUser(user.uuid, async (client) => {
      // IDOR fix (xe-fin): resolve the caller's entity (explicit param or their default company)
      // and bind it as a scope predicate on the financial read, so a foreign settlement id can
      // only ever return THIS operating company's line items.
      const operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId);
      if (!operatingCompanyId) {
        return reply.code(400).send({ error: "operating_company_id required" });
      }
      const items = await approvalService.getSettlementLineItems(client, id, operatingCompanyId);
      return { items };
    });
  });

  // POST /api/v1/settlements/approve-line
  app.post("/api/v1/settlements/approve-line", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = approveLineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const query = req.query as Record<string, unknown>;
    const requestedCompanyId = String(query.operating_company_id || "") || null;

    return withCurrentUser(user.uuid, async (client) => {
      // ACCT-R-13 (2026-07-25): financial write (settlement_lines + escrow ledger) — membership
      // check is load-bearing, not defense-in-depth.
      const operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId);
      if (!operatingCompanyId) {
        return reply.code(400).send({ error: "operating_company_id required" });
      }
      await approvalService.approveLineItem(client, {
        lineItemId: parsed.data.line_item_id,
        approvedBy: user.uuid,
        approvedByEmail: user.email || ""
      }, operatingCompanyId);
      return { success: true };
    });
  });

  // POST /api/v1/settlements/reject-line
  app.post("/api/v1/settlements/reject-line", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = rejectLineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const query = req.query as Record<string, unknown>;
    const requestedCompanyId = String(query.operating_company_id || "") || null;

    return withCurrentUser(user.uuid, async (client) => {
      // ACCT-R-13 (2026-07-25): financial write — membership check is load-bearing.
      const operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId);
      if (!operatingCompanyId) {
        return reply.code(400).send({ error: "operating_company_id required" });
      }
      await approvalService.rejectLineItem(client, {
        lineItemId: parsed.data.line_item_id,
        rejectedBy: user.uuid,
        rejectedByEmail: user.email || "",
        reason: parsed.data.reason
      }, operatingCompanyId);
      return { success: true };
    });
  });

  // POST /api/v1/settlements/approve
  app.post("/api/v1/settlements/approve", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = approveSettlementSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const query = req.query as Record<string, unknown>;
    const requestedCompanyId = String(query.operating_company_id || "") || null;

    return withCurrentUser(user.uuid, async (client) => {
      // ACCT-R-13 (2026-07-25): flips settlement status that downstream posting reads —
      // membership check is load-bearing.
      const operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId);
      if (!operatingCompanyId) {
        return reply.code(400).send({ error: "operating_company_id required" });
      }
      await approvalService.approveSettlement(client, parsed.data.settlement_id, user.uuid, operatingCompanyId);
      return { success: true, status: 'approved' };
    });
  });

  // POST /api/v1/settlements/finalize
  app.post("/api/v1/settlements/finalize", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = finalizeSettlementSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const query = req.query as Record<string, unknown>;
    const requestedCompanyId = String(query.operating_company_id || "") || null;

    return withCurrentUser(user.uuid, async (client) => {
      // ACCT-R-13 (2026-07-25): gates PDF generation eligibility — membership check is load-bearing.
      const operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId);
      if (!operatingCompanyId) {
        return reply.code(400).send({ error: "operating_company_id required" });
      }
      await approvalService.finalizeSettlement(client, parsed.data.settlement_id, operatingCompanyId);
      return { success: true, status: 'finalized' };
    });
  });

  // GET /api/v1/trip-link-queue
  app.get("/api/v1/trip-link-queue", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const query = req.query as Record<string, unknown>;
    const operatingCompanyId = String(query.operating_company_id || "");
    if (!operatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id required" });
    }

    return withCurrentUser(user.uuid, async (client) => {
      const scopedCompanyId = await resolveOperatingCompanyId(client, user.uuid, operatingCompanyId);
      const result = await client.query(`
        SELECT
          q.id,
          q.expense_id,
          q.expense_table,
          q.expense_type,
          q.unit_id,
          u.unit_number,
          q.expense_date,
          q.suggested_load_id,
          q.suggested_load_number,
          q.suggested_reason,
          q.assigned_load_id,
          q.status,
          q.created_at
        FROM driver_finance.trip_link_queue q
        LEFT JOIN mdata.units u ON u.id = q.unit_id AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = q.operating_company_id
        WHERE q.operating_company_id = $1::uuid AND q.status != 'linked'
        ORDER BY q.created_at DESC
      `, [scopedCompanyId]);
      return { items: result.rows };
    });
  });

  // POST /api/v1/trip-link-queue/assign
  app.post("/api/v1/trip-link-queue/assign", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = assignTripLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    return withCurrentUser(user.uuid, async (client) => {
      // ACCT-R-13 (2026-07-25): membership-checked before the queue row can be reassigned — the
      // resolved id is passed as a WHERE predicate inside assignTripLink, not just logged.
      const operatingCompanyId = await resolveOperatingCompanyId(
        client,
        user.uuid,
        parsed.data.operating_company_id ?? null
      );
      if (!operatingCompanyId) {
        return reply.code(400).send({ error: "operating_company_id required" });
      }
      const updated = await tripLinkEngine.assignTripLink(
        client,
        parsed.data.queue_id,
        parsed.data.load_id,
        parsed.data.load_number,
        user.uuid,
        operatingCompanyId
      );
      if (!updated) {
        return reply.code(404).send({ error: "trip_link_queue_row_not_found" });
      }
      return { success: true };
    });
  });

  // POST /api/v1/settlements/generate-pdf
  app.post("/api/v1/settlements/generate-pdf", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = generatePdfSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const query = req.query as Record<string, unknown>;
    const operatingCompanyId = String(query.operating_company_id || "");
    if (!operatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id required" });
    }

    return withCurrentUser(user.uuid, async (client) => {
      const scopedCompanyId = await resolveOperatingCompanyId(client, user.uuid, operatingCompanyId);
      if (!scopedCompanyId) return reply.code(403).send({ error: "forbidden" });
      // Check if settlement is finalized
      const check = await approvalService.checkAllLinesApproved(client, parsed.data.settlement_id, scopedCompanyId);

      // Get settlement status — canonical header (driver_finance.driver_settlements), P2.4a repoint.
      const statusResult = await client.query<{ approval_status: string }>(`
        SELECT approval_status FROM driver_finance.driver_settlements
        WHERE id = $1 AND operating_company_id = $2::uuid
      `, [parsed.data.settlement_id, scopedCompanyId]);
      
      if (statusResult.rows.length === 0) {
        return reply.code(404).send({ error: "settlement not found" });
      }
      
      const status = statusResult.rows[0].approval_status;
      
      // PDF generation is gated until finalized
      if (status !== 'finalized') {
        return reply.code(403).send({ 
          error: "pdf_generation_blocked", 
          reason: `Settlement must be finalized before PDF generation. Current status: ${status}`,
          pending_lines: check.pendingCount,
          rejected_lines: check.rejectedCount
        });
      }

      // Record PDF generation (actual PDF generation would be implemented separately)
      await approvalService.recordPdfGenerated(
        client,
        parsed.data.settlement_id,
        user.uuid,
        parsed.data.pdf_type,
        operatingCompanyId
      );
      
      return { 
        success: true, 
        pdf_type: parsed.data.pdf_type,
        message: "PDF generation recorded. Actual PDF generation to be implemented."
      };
    });
  });
}
