import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";

export const listQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  is_active: z.enum(["true", "false", "all"]).default("true"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}
