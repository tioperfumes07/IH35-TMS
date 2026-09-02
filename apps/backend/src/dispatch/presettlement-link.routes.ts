// GO-22 pre-settlement (owner direct instruction 2026-09-02) — the human-confirm side of the
// suggest-then-confirm queue. "A load never joins a settlement silently."
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  PresettlementLinkError,
  confirmPresettlementLink,
  listPendingPresettlementSuggestions,
  type DbClient,
} from "./presettlement-link.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const confirmBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  action: z.enum(["create_new", "link_existing", "reject"]),
  override_settlement_id: z.string().uuid().nullable().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function mapPresettlementLinkHttpError(error: unknown) {
  if (error instanceof PresettlementLinkError) {
    if (error.code === "suggestion_not_found") return { statusCode: 404 as const, body: { error: error.code } };
    return { statusCode: 409 as const, body: { error: error.code, message: error.message } };
  }
  return null;
}

export async function registerPresettlementLinkRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/driver-finance/presettlement-suggestions",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return sendValidationError(reply, query.error);

      const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
        listPendingPresettlementSuggestions(client, query.data.operating_company_id)
      );
      return { rows };
    }
  );

  app.post(
    "/api/v1/driver-finance/presettlement-suggestions/:id/confirm",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = confirmBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          confirmPresettlementLink(client, {
            operating_company_id: body.data.operating_company_id,
            suggestion_id: params.data.id,
            action: body.data.action,
            actor_user_id: user.uuid,
            override_settlement_id: body.data.override_settlement_id,
          })
        );
        return result;
      } catch (error) {
        const mapped = mapPresettlementLinkHttpError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    }
  );
}
