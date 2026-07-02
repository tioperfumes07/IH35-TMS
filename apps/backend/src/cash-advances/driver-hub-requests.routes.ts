import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  approveHubCashAdvanceRequest,
  denyHubCashAdvanceRequest,
  hubApproveBodySchema,
  hubDenyBodySchema,
  listPendingHubCashAdvanceRequests,
} from "./driver-hub-requests.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const uuidParamsSchema = z.object({
  id: z.string().uuid(),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

// Driver Hub Requests review is Manager/Owner only (Administrator inherits Owner reach).
function canReviewDriverHubRequest(role: string): boolean {
  return ["Owner", "Administrator", "Manager"].includes(role);
}

async function withCompany<T>(userUuid: string, companyId: string, fn: (client: Parameters<Parameters<typeof withCurrentUser>[1]>[0]) => Promise<T>) {
  await assertCompanyMembership(userUuid, companyId);
  return withCurrentUser(userUuid, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

export async function registerDriverHubRequestRoutes(app: FastifyInstance) {
  app.get("/api/v1/cash-advances/hub/requests/pending", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canReviewDriverHubRequest(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, (client) =>
      listPendingHubCashAdvanceRequests(client, parsed.data.operating_company_id)
    );
    return { requests: rows };
  });

  app.post("/api/v1/cash-advances/hub/requests/:id/approve", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canReviewDriverHubRequest(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsedParams = uuidParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = hubApproveBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCompany(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      approveHubCashAdvanceRequest(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        requestId: parsedParams.data.id,
        actorUserId: user.uuid,
        body: parsedBody.data,
      })
    );

    if (!result.ok) {
      if (result.error === "not_found") return reply.code(404).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }
    return { request: result.request, deduction: result.deduction };
  });

  app.post("/api/v1/cash-advances/hub/requests/:id/deny", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canReviewDriverHubRequest(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsedParams = uuidParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = hubDenyBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCompany(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      denyHubCashAdvanceRequest(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        requestId: parsedParams.data.id,
        actorUserId: user.uuid,
        body: parsedBody.data,
      })
    );

    if (!result.ok) {
      const code = result.error === "not_found" ? 404 : 409;
      return reply.code(code).send({ error: result.error });
    }
    return { request: result.request };
  });
}
