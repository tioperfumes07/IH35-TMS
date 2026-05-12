import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  getPublicOwnerApprovalDetails,
  notifyOfficeEscalatorOfOwnerDecision,
  ownerTokenApproveCashAdvanceRequest,
  ownerTokenDenyCashAdvanceRequest,
} from "./cash-advance-owner-approval.service.js";

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

export async function registerOwnerApprovalPortalRoutes(app: FastifyInstance) {
  app.get("/api/v1/owner-approval/:token", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const details = await getPublicOwnerApprovalDetails(params.data.token, requestAudit(req));
    if (!details) return reply.code(404).send({ error: "owner_approval_token_invalid_or_expired" });
    return details;
  });

  app.post("/api/v1/owner-approval/:token/approve", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const result = await ownerTokenApproveCashAdvanceRequest(params.data.token, req.body ?? {}, requestAudit(req));
    if ("error" in result) {
      if (result.error === "validation_error") return reply.code(400).send({ error: result.error, details: result.details.flatten() });
      if (result.error === "owner_approval_token_invalid_or_expired") {
        return reply.code(404).send({ error: result.error });
      }
      return reply.code(400).send({ error: result.error, details: result.details });
    }
    const rid = String(result.request.id ?? "");
    void notifyOfficeEscalatorOfOwnerDecision({
      requestId: rid,
      headline: `Owner approved cash advance ${String(result.request.display_id ?? "")}`,
      bodyText: `The Owner approved request ${String(result.request.display_id ?? "")}. Advance booked.`,
    });
    return { request: result.request, advance: result.advance };
  });

  app.post("/api/v1/owner-approval/:token/deny", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const result = await ownerTokenDenyCashAdvanceRequest(params.data.token, req.body ?? {}, requestAudit(req));
    if ("error" in result) {
      if (result.error === "validation_error") return reply.code(400).send({ error: result.error, details: result.details.flatten() });
      return reply.code(404).send({ error: result.error });
    }
    const rid = String(result.request.id ?? "");
    void notifyOfficeEscalatorOfOwnerDecision({
      requestId: rid,
      headline: `Owner denied cash advance ${String(result.request.display_id ?? "")}`,
      bodyText: `The Owner denied request ${String(result.request.display_id ?? "")}.`,
    });
    return { request: result.request };
  });
}
