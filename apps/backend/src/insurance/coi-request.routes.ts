import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  coiRequestIdParamsSchema,
  createCoiRequestBodySchema,
  listCoiRequestsQuerySchema,
  operatingCompanySchema,
  sendCoiRequestBodySchema,
  updateCoiRequestBodySchema,
} from "./coi.shared.js";
import { createCoiRequest, getDriverScheduleStatus, listCoiRequests, updateCoiRequest } from "./coi.service.js";
import { sendCoiRequest } from "./coi-send.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { z } from "zod";

const driverScheduleStatusQuerySchema = operatingCompanySchema.extend({
  driver_id: z.string().uuid(),
});

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

// LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: "The OWNER is always authorized. The
// ACCOUNTANT is authorized." — the only two roles allowed to force an action past a state most
// roles are blocked from (here: resending an already-sent/acknowledged/issued/declined request).
function canForceOverride(role: string) {
  return ["Owner", "Accountant"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerInsuranceCoiRequestRoutes(app: FastifyInstance) {
  app.get("/api/v1/insurance/coi-requests", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = listCoiRequestsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) =>
      listCoiRequests(client, parsed.data)
    );
    return { requests: rows };
  });

  app.post(
    "/api/v1/insurance/coi-requests",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
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
        request_type: body.request_type,
        customer_id: body.customer_id,
        driver_id: body.driver_id,
        unit_id: body.unit_id,
      });

      return result;
    });

    if (created.kind === "customer_not_found") return reply.code(404).send({ error: "customer_not_found" });
    if (created.kind === "driver_not_found") return reply.code(404).send({ error: "driver_not_found" });
    if (created.kind === "unit_not_found") return reply.code(404).send({ error: "unit_not_found" });
    if (created.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });

      return reply.code(201).send(created.row);
    }
  );

  app.patch("/api/v1/insurance/coi-requests/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = coiRequestIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = operatingCompanySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = updateCoiRequestBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    // `reason` is audit-trail-only (LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01) — the
    // coi_request row itself has no reason column, so it must not be passed into the UPDATE.
    const { reason, ...updateFields } = body.data;

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const result = await updateCoiRequest(client, {
        operating_company_id: query.data.operating_company_id,
        id: params.data.id,
        ...updateFields,
      });
      if (result.kind !== "ok") return result;

      await appendCrudAudit(client, user.uuid, "insurance.coi_request.updated", {
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
        reason: reason ?? null,
      });

      return result;
    });

    if (updated.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (updated.kind === "coi_request_not_found") return reply.code(404).send({ error: "coi_request_not_found" });

    return updated.row;
  });

  // "NOTHING SENDS AUTOMATICALLY. A human presses send. Every send is logged." (owner directive
  // 2026-08-31) — this is the ONLY route that can transition a request to 'sent'; no cron/background
  // job calls sendCoiRequest.
  app.post(
    "/api/v1/insurance/coi-requests/:id/send",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authUser(req, reply);
      if (!user) return;
      if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

      const params = coiRequestIdParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
      const query = operatingCompanySchema.safeParse(req.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
      const body = sendCoiRequestBodySchema.safeParse(req.body ?? {});
      if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

      // LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: force is Owner/Accountant-only —
      // a request already past a plain "sent" refuses everyone else's resend attempt (409 below),
      // never a hard, unfixable wall.
      if (body.data.force && !canForceOverride(user.role)) {
        return reply.code(403).send({ error: "forbidden", reason: "force_resend_requires_owner_or_accountant" });
      }

      const sent = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const result = await sendCoiRequest(client, {
          operating_company_id: query.data.operating_company_id,
          id: params.data.id,
          sent_by_user_id: user.uuid,
          force_resend_reason: body.data.force ? body.data.reason ?? null : null,
        });
        if (result.kind !== "ok") return result;

        await appendCrudAudit(client, user.uuid, result.resent ? "insurance.coi_request.resent" : "insurance.coi_request.sent", {
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          email_queue_id: result.row.email_queue_id,
          forced: Boolean(body.data.force),
          reason: body.data.reason ?? null,
        });

        return result;
      });

      if (sent.kind === "coi_request_not_found") return reply.code(404).send({ error: "coi_request_not_found" });
      if (sent.kind === "already_sent") return reply.code(409).send({ error: "already_sent" });
      if (sent.kind === "r2_not_configured") return reply.code(503).send({ error: "r2_not_configured" });

      return sent.row;
    }
  );

  // "closes the loop": is this driver ISSUED on the insurer's schedule right now. Read-only, no
  // side effects — the actual dispatcher-side warning is a separate, not-yet-built surface (see
  // docs/audit/GUARD-WORKORDERS.md INSURANCE-REQUEST-PIPELINE-DISPATCHER-WARNING-NOT-BUILT); this
  // endpoint is the stable place a future gate reads from.
  app.get(
    "/api/v1/insurance/coi-requests/driver-schedule-status",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authUser(req, reply);
      if (!user) return;
      const query = driverScheduleStatusQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

      const status = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        getDriverScheduleStatus(client, {
          operating_company_id: query.data.operating_company_id,
          driver_id: query.data.driver_id,
        })
      );

      return status;
    }
  );
}
