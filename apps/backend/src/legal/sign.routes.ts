import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  completePublicSigning,
  confirmPublicSigningVerification,
  contractSchemas,
  getPublicSigningDetails,
  startPublicSigningVerification,
} from "./contracts.service.js";

const tokenParamSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function requestAudit(req: FastifyRequest) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
  };
}

export async function registerLegalSignRoutes(app: FastifyInstance) {
  app.get("/api/v1/legal/sign/:token", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const details = await getPublicSigningDetails(params.data.token, requestAudit(req));
    if (!details) return reply.code(404).send({ error: "legal_sign_token_invalid_or_expired" });
    return details;
  });

  app.post("/api/v1/legal/sign/:token/verify/start", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = contractSchemas.verifyStartSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const started = await startPublicSigningVerification(params.data.token, body.data, requestAudit(req));
      return started;
    } catch (error) {
      const message = String((error as Error).message ?? "legal_sign_verify_start_failed");
      if (
        [
          "legal_sign_token_invalid_or_expired",
          "legal_signer_email_required",
          "legal_signer_phone_required",
        ].includes(message)
      ) {
        return reply.code(409).send({ error: message });
      }
      return reply.code(500).send({ error: "legal_sign_verify_start_failed" });
    }
  });

  app.post("/api/v1/legal/sign/:token/verify/confirm", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = contractSchemas.verifyConfirmSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const confirmed = await confirmPublicSigningVerification(params.data.token, body.data, requestAudit(req));
      return confirmed;
    } catch (error) {
      const message = String((error as Error).message ?? "legal_sign_verify_confirm_failed");
      if (
        [
          "legal_sign_token_invalid_or_expired",
          "legal_verification_code_not_started",
          "legal_verification_code_expired",
          "legal_verification_code_invalid",
        ].includes(message)
      ) {
        return reply.code(409).send({ error: message });
      }
      return reply.code(500).send({ error: "legal_sign_verify_confirm_failed" });
    }
  });

  app.post("/api/v1/legal/sign/:token/complete", async (req, reply) => {
    const params = tokenParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = contractSchemas.signatureCompleteSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const result = await completePublicSigning(params.data.token, body.data, requestAudit(req));
      return result;
    } catch (error) {
      const message = String((error as Error).message ?? "legal_sign_complete_failed");
      if (
        [
          "legal_sign_token_invalid_or_expired",
          "legal_contract_not_signable",
          "legal_verification_required_before_sign",
          "r2_not_configured",
        ].includes(message)
      ) {
        return reply.code(409).send({ error: message });
      }
      return reply.code(500).send({ error: "legal_sign_complete_failed" });
    }
  });
}
