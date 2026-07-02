import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  coiRequestIdParamsSchema,
  createCoiRequestBodySchema,
  listCoiRequestsQuerySchema,
  operatingCompanySchema,
  updateCoiRequestBodySchema,
} from "./coi.shared.js";
import { createCoiRequest, listCoiRequests, updateCoiRequest } from "./coi.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

type Queryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[]; rowCount?: number }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerInsuranceCoiRequestRoutes(app: FastifyInstance) {
  app.get("/api/v1/insurance/coi-requests", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = listCoiRequestsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) =>
      listCoiRequests(client, parsed.data)
    );
    return { requests: rows };
  });

  app.post("/api/v1/insurance/coi-requests", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = createCoiRequestBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const body = parsed.data;

    const created = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
      const result = await createCoiRequest(client, {
        ...body,
        requested_by: user.uuid,
      });
      if (result.kind !== "ok") return result;

      await appendCrudAudit(client, user.uuid, "insurance.coi_request.created", {
        resource_id: result.row?.id,
        operating_company_id: body.operating_company_id,
        customer_id: body.customer_id,
      });

      return result;
    });

    if (created.kind === "customer_not_found") return reply.code(404).send({ error: "customer_not_found" });
    if (created.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });

    return reply.code(201).send(created.row);
  });

  app.patch("/api/v1/insurance/coi-requests/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = coiRequestIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = operatingCompanySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = updateCoiRequestBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const result = await updateCoiRequest(client, {
        operating_company_id: query.data.operating_company_id,
        id: params.data.id,
        ...body.data,
      });
      if (result.kind !== "ok") return result;

      await appendCrudAudit(client, user.uuid, "insurance.coi_request.updated", {
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
      });

      return result;
    });

    if (updated.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (updated.kind === "coi_request_not_found") return reply.code(404).send({ error: "coi_request_not_found" });

    return updated.row;
  });
}
