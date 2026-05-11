import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  finalizeAttachmentUpload,
  generateAttachmentDownloadUrl,
  generateAttachmentUploadUrl,
  listAttachments,
  softDeleteAttachment,
} from "./attachments.service.js";

const uploadUrlBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_type: z.enum([
    "load",
    "work_order",
    "bill",
    "expense",
    "invoice",
    "payment",
    "estimate",
    "driver_charge",
    "vendor_chargeback",
    "customer_adjustment",
    "damage_report",
    "severe_repair",
    "dispute",
    "transfer",
    "journal_entry",
    "driver",
    "customer",
    "vendor",
    "unit",
    "equipment",
    "manual",
  ]),
  entity_id: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  content_type: z.string().trim().min(1).max(120),
  size_bytes: z.number().int().positive(),
});

const finalizeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  sha256_hash: z.string().trim().regex(/^[A-Fa-f0-9]{64}$/),
  category: z.enum([
    "bol",
    "pod",
    "rate_confirmation",
    "dispatch_instructions",
    "accident_report",
    "damage_photo",
    "dvir",
    "dot_inspection",
    "antidoping_result",
    "medical_card",
    "cdl",
    "permit",
    "insurance_policy",
    "claim",
    "signed_acknowledgment",
    "vendor_invoice",
    "bank_statement",
    "tax_form",
    "legal_doc",
    "check_image",
    "ach_confirmation",
    "wire_confirmation",
    "deposit_slip",
    "vendor_estimate",
    "vendor_ro",
    "receipt",
    "other",
  ]),
});

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_type: uploadUrlBodySchema.shape.entity_type,
  entity_id: z.string().uuid(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerAttachmentsRoutes(app: FastifyInstance) {
  app.post("/api/v1/attachments/upload-url", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = uploadUrlBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const result = await generateAttachmentUploadUrl(user.uuid, {
        operatingCompanyId: body.data.operating_company_id,
        entityType: body.data.entity_type,
        entityId: body.data.entity_id,
        filename: body.data.filename,
        contentType: body.data.content_type,
        sizeBytes: body.data.size_bytes,
      });
      return reply.code(201).send(result);
    } catch (error) {
      const message = String((error as Error).message ?? "upload_url_failed");
      if (["unsupported_content_type", "invalid_file_size", "file_too_large"].includes(message)) {
        return reply.code(400).send({ error: message });
      }
      if (message.startsWith("r2_not_configured")) return reply.code(503).send({ error: "r2_not_configured" });
      return reply.code(500).send({ error: "upload_url_failed" });
    }
  });

  app.post("/api/v1/attachments/:id/finalize", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = finalizeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const result = await finalizeAttachmentUpload(user.uuid, {
        attachmentId: params.data.id,
        operatingCompanyId: body.data.operating_company_id,
        sha256Hash: body.data.sha256_hash,
        category: body.data.category,
      });
      return result;
    } catch (error) {
      const message = String((error as Error).message ?? "attachment_finalize_failed");
      if (message === "uploaded_object_not_found") return reply.code(409).send({ error: message });
      if (message === "attachment_not_found") return reply.code(404).send({ error: message });
      return reply.code(500).send({ error: "attachment_finalize_failed" });
    }
  });

  app.get("/api/v1/attachments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const rows = await listAttachments(user.uuid, {
      operatingCompanyId: query.data.operating_company_id,
      entityType: query.data.entity_type,
      entityId: query.data.entity_id,
    });
    return { rows };
  });

  app.get("/api/v1/attachments/:id/download-url", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    try {
      const result = await generateAttachmentDownloadUrl(user.uuid, {
        attachmentId: params.data.id,
        operatingCompanyId: query.data.operating_company_id,
      });
      return result;
    } catch (error) {
      const message = String((error as Error).message ?? "attachment_download_url_failed");
      if (message === "attachment_not_found") return reply.code(404).send({ error: message });
      if (message.startsWith("r2_not_configured")) return reply.code(503).send({ error: "r2_not_configured" });
      return reply.code(500).send({ error: "attachment_download_url_failed" });
    }
  });

  app.delete("/api/v1/attachments/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    try {
      const result = await softDeleteAttachment(user.uuid, {
        attachmentId: params.data.id,
        operatingCompanyId: query.data.operating_company_id,
      });
      return result;
    } catch (error) {
      const message = String((error as Error).message ?? "attachment_delete_failed");
      if (message === "attachment_not_found") return reply.code(404).send({ error: message });
      return reply.code(500).send({ error: "attachment_delete_failed" });
    }
  });
}
