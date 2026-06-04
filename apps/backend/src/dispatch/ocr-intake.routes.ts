import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  createOcrIntakeFromEmail,
  getOcrIntakeConvertPrefill,
  listOcrIntakeQueue,
  processOcrIntakeQueueItem,
} from "./ocr-processor.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const itemParamsSchema = z.object({
  id: z.string().uuid(),
});

const emailWebhookBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().min(1),
  subject: z.string().optional().default(""),
  received_at: z.string().datetime({ offset: true }).optional(),
  attachment: z.object({
    filename: z.string().min(1),
    content_base64: z.string().min(1),
  }),
});

const convertBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function verifyInboundWebhook(req: FastifyRequest, rawBody: Buffer): boolean {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) return process.env.NODE_ENV !== "production";
  const signature = req.headers["x-ih35-ocr-webhook-signature"];
  const header = Array.isArray(signature) ? signature[0] : signature;
  if (!header || typeof header !== "string") return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(header, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function registerDispatchOcrIntakeRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/ocr-intake/queue", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listOcrIntakeQueue(user.uuid, query.data.operating_company_id);
  });

  app.post("/api/v1/dispatch/ocr-intake/items/:id/reprocess", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = itemParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const item = await processOcrIntakeQueueItem(params.data.id, query.data.operating_company_id);
    if (!item) return reply.code(404).send({ error: "not_found" });
    return item;
  });

  app.post("/api/v1/dispatch/ocr-intake/items/:id/convert", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = itemParamsSchema.safeParse(req.params ?? {});
    const body = convertBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const result = await getOcrIntakeConvertPrefill(user.uuid, body.data.operating_company_id, params.data.id);
    if (!result.ok) {
      if (result.error === "not_found") return reply.code(404).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return result;
  });

  await app.register(async (scoped) => {
    scoped.removeContentTypeParser("application/json");
    scoped.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    scoped.post("/api/v1/dispatch/ocr-intake/webhook/email", async (req, reply) => {
      const rawBody = req.body as Buffer;
      if (!Buffer.isBuffer(rawBody)) return reply.code(400).send({ error: "invalid_body" });
      if (!verifyInboundWebhook(req, rawBody)) return reply.code(401).send({ error: "webhook_signature_invalid" });

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return reply.code(400).send({ error: "invalid_json" });
      }

      const body = emailWebhookBodySchema.safeParse(parsed);
      if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

      try {
        const item = await createOcrIntakeFromEmail(body.data.operating_company_id, {
          email_from: body.data.from,
          email_subject: body.data.subject ?? "",
          attachment_filename: body.data.attachment.filename,
          attachment_base64: body.data.attachment.content_base64,
          received_at: body.data.received_at,
        });
        return reply.code(201).send({ item });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "intake_failed";
        if (message === "r2_not_configured") return reply.code(503).send({ error: message });
        if (message === "attachment_empty") return reply.code(400).send({ error: message });
        return reply.code(500).send({ error: "intake_failed" });
      }
    });
  });
}
