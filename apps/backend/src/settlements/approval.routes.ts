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
});

const generatePdfSchema = z.object({
  settlement_id: z.string().uuid(),
  pdf_type: z.enum(['driver', 'company']),
});

// Auth helper
function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const role = String(req.user?.role ?? "");
  if (!["Owner", "Administrator", "Manager", "Accountant", "Payroll"].includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return req.user!;
}

export async function registerSettlementApprovalRoutes(app: FastifyInstance) {
  
  // GET /api/v1/settlements/:id/approval-summary
  app.get("/api/v1/settlements/:id/approval-summary", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };
    const query = req.query as Record<string, unknown>;
    const operatingCompanyId = String(query.operating_company_id || "");
    if (!operatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id required" });
    }

    return withCurrentUser(user.uuid, async (client) => {
      const summary = await approvalService.getSettlementSummary(client, id, operatingCompanyId);
      if (!summary) {
        return reply.code(404).send({ error: "settlement not found" });
      }
      return summary;
    });
  });

  // GET /api/v1/settlements/:id/line-items
  app.get("/api/v1/settlements/:id/line-items", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const { id } = req.params as { id: string };

    return withCurrentUser(user.uuid, async (client) => {
      const items = await approvalService.getSettlementLineItems(client, id);
      return { items };
    });
  });

  // POST /api/v1/settlements/approve-line
  app.post("/api/v1/settlements/approve-line", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = approveLineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const query = req.query as Record<string, unknown>;
    const operatingCompanyId = String(query.operating_company_id || "");
    if (!operatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id required" });
    }

    return withCurrentUser(user.uuid, async (client) => {
      await approvalService.approveLineItem(client, {
        lineItemId: parsed.data.line_item_id,
        approvedBy: user.uuid,
        approvedByEmail: user.email || ""
      }, operatingCompanyId);
      return { success: true };
    });
  });

  // POST /api/v1/settlements/reject-line
  app.post("/api/v1/settlements/reject-line", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = rejectLineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const query = req.query as Record<string, unknown>;
    const operatingCompanyId = String(query.operating_company_id || "");
    if (!operatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id required" });
    }

    return withCurrentUser(user.uuid, async (client) => {
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
  app.post("/api/v1/settlements/approve", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = approveSettlementSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const query = req.query as Record<string, unknown>;
    const operatingCompanyId = String(query.operating_company_id || "");
    if (!operatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id required" });
    }

    return withCurrentUser(user.uuid, async (client) => {
      await approvalService.approveSettlement(client, parsed.data.settlement_id, user.uuid, operatingCompanyId);
      return { success: true, status: 'approved' };
    });
  });

  // POST /api/v1/settlements/finalize
  app.post("/api/v1/settlements/finalize", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = finalizeSettlementSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const query = req.query as Record<string, unknown>;
    const operatingCompanyId = String(query.operating_company_id || "");
    if (!operatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id required" });
    }

    return withCurrentUser(user.uuid, async (client) => {
      await approvalService.finalizeSettlement(client, parsed.data.settlement_id, operatingCompanyId);
      return { success: true, status: 'finalized' };
    });
  });

  // GET /api/v1/trip-link-queue
  app.get("/api/v1/trip-link-queue", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const query = req.query as Record<string, unknown>;
    const operatingCompanyId = String(query.operating_company_id || "");
    if (!operatingCompanyId) {
      return reply.code(400).send({ error: "operating_company_id required" });
    }

    return withCurrentUser(user.uuid, async (client) => {
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
        LEFT JOIN mdata.units u ON u.id = q.unit_id
        WHERE q.operating_company_id = $1 AND q.status != 'linked'
        ORDER BY q.created_at DESC
      `, [operatingCompanyId]);
      return { items: result.rows };
    });
  });

  // POST /api/v1/trip-link-queue/assign
  app.post("/api/v1/trip-link-queue/assign", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = assignTripLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    return withCurrentUser(user.uuid, async (client) => {
      await tripLinkEngine.assignTripLink(
        client,
        parsed.data.queue_id,
        parsed.data.load_id,
        parsed.data.load_number,
        user.uuid
      );
      return { success: true };
    });
  });

  // POST /api/v1/settlements/generate-pdf
  app.post("/api/v1/settlements/generate-pdf", async (req, reply) => {
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
      // Check if settlement is finalized
      const check = await approvalService.checkAllLinesApproved(client, parsed.data.settlement_id);
      
      // Get settlement status
      const statusResult = await client.query<{ approval_status: string }>(`
        SELECT approval_status FROM settlement.settlement 
        WHERE id = $1 AND operating_company_id = $2
      `, [parsed.data.settlement_id, operatingCompanyId]);
      
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
