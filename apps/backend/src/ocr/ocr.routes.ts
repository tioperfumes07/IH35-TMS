import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { parseRateConfirmation } from "./ocr.service.js";

const paramsSchema = z.object({
  attachment_id: z.string().uuid(),
});

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerOcrRoutes(app: FastifyInstance) {
  app.post("/api/v1/ocr/rate-confirmation/:attachment_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    try {
      const parsed = await parseRateConfirmation(user.uuid, {
        attachmentId: params.data.attachment_id,
        operatingCompanyId: query.data.operating_company_id,
      });
      return { parsed };
    } catch (error) {
      const message = String((error as Error).message ?? "ocr_parse_failed");
      if (message === "attachment_not_found") return reply.code(404).send({ error: message });
      if (message === "attachment_not_rate_confirmation") return reply.code(409).send({ error: message });
      return reply.code(500).send({ error: "ocr_parse_failed" });
    }
  });
}
