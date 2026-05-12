import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  attorneyPortalApprove,
  attorneyPortalReject,
  attorneyPortalRequestChanges,
  getPublicAttorneyReviewDetails,
} from "./attorney-review.service.js";

const tokenParamSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function requestAudit(req: FastifyRequest) {
  return {
    ipAddress: req.ip?.trim() || null,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
  };
}

export async function registerLegalAttorneyReviewRoutes(app: FastifyInstance) {
  app.get("/api/v1/legal/attorney-review/:token", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const details = await getPublicAttorneyReviewDetails(params.data.token, requestAudit(req));
    if (!details) return reply.code(404).send({ error: "legal_attorney_review_token_invalid_or_expired" });
    return details;
  });

  app.post("/api/v1/legal/attorney-review/:token/approve", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const result = await attorneyPortalApprove(params.data.token, req.body ?? {}, requestAudit(req));
    if ("error" in result) {
      if (result.error === "validation_error") return reply.code(400).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return result;
  });

  app.post("/api/v1/legal/attorney-review/:token/request-changes", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const result = await attorneyPortalRequestChanges(params.data.token, req.body ?? {}, requestAudit(req));
    if ("error" in result) {
      if (result.error === "validation_error") return reply.code(400).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return result;
  });

  app.post("/api/v1/legal/attorney-review/:token/reject", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const result = await attorneyPortalReject(params.data.token, req.body ?? {}, requestAudit(req));
    if ("error" in result) {
      if (result.error === "validation_error") return reply.code(400).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return result;
  });
}
