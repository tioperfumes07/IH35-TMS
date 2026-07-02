import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";

export const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().min(1).max(120).optional(),
  is_active: z.enum(["true", "false", "all"]).default("true"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
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

export async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}
