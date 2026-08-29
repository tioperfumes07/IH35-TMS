import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { requireDriverSession } from "../driver/auth.js";
import {
  assignTempCover,
  assignTempCoverSchema,
  attachLeaveRequestDocumentation,
  attachLeaveDocumentationSchema,
  cancelDriverLeaveRequest,
  cancelTempCover,
  createDriverLeaveRequest,
  createLeaveRequestSchema,
  getFleetSchedule,
  getLeaveBalance,
  getLeavePolicy,
  getLeaveRequestDetail,
  getMySchedule,
  listAllLeaveRequests,
  listLeaveBalances,
  listMyLeaveRequests,
  listPendingLeaveRequests,
  listTempAssignments,
  reviewLeaveRequest,
  reviewLeaveRequestSchema,
  updateLeavePolicy,
  updateLeavePolicySchema,
} from "./driver-scheduler.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

function companyBusinessYear(): number {
  return Number(companyBusinessDate().slice(0, 4));
}

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const tempAssignmentsQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(300).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const dateRangeQuerySchema = companyQuerySchema.extend({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const driverDateRangeQuerySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const driverRequestListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isSchedulerOfficeRole(role: string): boolean {
  return ["Owner", "Administrator", "Safety", "Dispatcher"].includes(role);
}

function isPolicyAdminRole(role: string): boolean {
  return ["Owner", "Administrator"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await assertCompanyMembership(client, userId, operatingCompanyId);
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

async function fetchDriverCompanyId(userUuid: string, driverId: string): Promise<string | null> {
  return withCurrentUser(userUuid, async (client) => {
    const r = await client.query(
      `SELECT operating_company_id::text AS oc FROM mdata.drivers WHERE id = $1 LIMIT 1`,
      [driverId]
    );
    return (r.rows[0]?.oc as string) ?? null;
  });
}

export async function registerDriverSchedulerRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/driver/scheduler/my-requests",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsed = driverRequestListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const rows = await withCurrentUser(req.user!.uuid, async (client) => {
      // membership-scope-exempt: principal-derived
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [oc]);
      return listMyLeaveRequests(client, oc, d.id, parsed.data.limit, parsed.data.offset);
    });
      return { requests: rows.requests, total_count: rows.totalCount };
    },
  );

  app.get("/api/v1/driver/scheduler/my-schedule", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsed = driverDateRangeQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const payload = await withCurrentUser(req.user!.uuid, async (client) => {
      // membership-scope-exempt: principal-derived
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [oc]);
      return getMySchedule(client, {
        operatingCompanyId: oc,
        driverId: d.id,
        startDate: parsed.data.start_date,
        endDate: parsed.data.end_date,
      });
    });
    return payload;
  });

  app.post("/api/v1/driver/scheduler/request", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsedBody = createLeaveRequestSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const result = await withCurrentUser(req.user!.uuid, async (client) => {
      // membership-scope-exempt: principal-derived
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [oc]);
      return createDriverLeaveRequest(client, {
        operatingCompanyId: oc,
        driverId: d.id,
        actorUserId: req.user!.uuid,
        body: parsedBody.data,
      });
    });
    if ("error" in result) {
      return reply.code(409).send(result);
    }
    return reply.code(201).send(result.request);
  });

  app.patch("/api/v1/driver/scheduler/request/:id/cancel", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsedParams = uuidParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const row = await withCurrentUser(req.user!.uuid, async (client) => {
      // membership-scope-exempt: principal-derived
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [oc]);
      return cancelDriverLeaveRequest(client, {
        operatingCompanyId: oc,
        driverId: d.id,
        requestId: parsedParams.data.id,
        actorUserId: req.user!.uuid,
      });
    });
    if (!row) return reply.code(409).send({ error: "leave_request_not_cancellable" });
    return row;
  });

  app.post(
    "/api/v1/driver/scheduler/request/:id/documentation",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsedParams = uuidParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = attachLeaveDocumentationSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const result = await withCurrentUser(req.user!.uuid, async (client) => {
      // membership-scope-exempt: principal-derived
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [oc]);
      return attachLeaveRequestDocumentation(client, {
        operatingCompanyId: oc,
        driverId: d.id,
        requestId: parsedParams.data.id,
        attachmentId: parsedBody.data.documentation_attachment_id,
        actorUserId: req.user!.uuid,
      });
    });
    if ("error" in result) return reply.code(409).send(result);
    return result.request;
    }
  );

  // Driver-facing self balance (GAP 2): returns ONLY the authenticated driver's own leave balance.
  // Driver self-resolution comes from requireDriverSession → req.driver (never list-and-take-first, never
  // an arbitrary :driver_id). Reuses the office getLeaveBalance computation, scoped to the driver's own id.
  app.get(
    "/api/v1/driver/scheduler/balance",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsedQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const year = parsedQuery.data.year ?? companyBusinessYear();
    const bal = await withCurrentUser(req.user!.uuid, async (client) => {
      // membership-scope-exempt: principal-derived
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [oc]);
      return getLeaveBalance(client, oc, d.id, year);
    });
    return { balance: bal, year };
    }
  );

  app.get("/api/v1/safety/scheduler/grid", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = dateRangeQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const grid = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      getFleetSchedule(client, {
        operatingCompanyId: parsed.data.operating_company_id,
        startDate: parsed.data.start_date,
        endDate: parsed.data.end_date,
      })
    );
    return grid;
  });

  app.get(
    "/api/v1/safety/scheduler/requests",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      listAllLeaveRequests(client, parsed.data.operating_company_id)
    );
    return { requests: rows };
    },
  );

  app.get(
    "/api/v1/safety/scheduler/requests/pending",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.extend({
      limit: z.coerce.number().int().min(1).max(300).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      listPendingLeaveRequests(client, parsed.data.operating_company_id, parsed.data.limit, parsed.data.offset)
    );
    return {
      requests: result.requests,
      total_count: result.totalCount,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };
    },
  );

  app.get("/api/v1/safety/scheduler/requests/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = uuidParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const detail = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      getLeaveRequestDetail(client, parsedQuery.data.operating_company_id, parsedParams.data.id)
    );
    if (!detail) return reply.code(404).send({ error: "leave_request_not_found" });
    return detail;
  });

  app.post("/api/v1/safety/scheduler/requests/:id/review", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = uuidParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = reviewLeaveRequestSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const result = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      reviewLeaveRequest(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        requestId: parsedParams.data.id,
        actorUserId: user.uuid,
        body: parsedBody.data,
      })
    );
    if ("error" in result) return reply.code(409).send(result);
    return result.request;
  });

  app.post("/api/v1/safety/scheduler/requests/:id/assign-cover", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = uuidParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = assignTempCoverSchema
      .extend({ related_leave_request_id: z.string().uuid().optional() })
      .safeParse({ ...(req.body as object), related_leave_request_id: parsedParams.data.id });
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const result = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      assignTempCover(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        actorUserId: user.uuid,
        body: parsedBody.data,
      })
    );
    if ("error" in result) return reply.code(409).send(result);
    return result.assignment;
  });

  app.get("/api/v1/safety/scheduler/balance/:driver_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = z.object({ driver_id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.extend({ year: z.coerce.number().int().optional() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const year = parsedQuery.data.year ?? companyBusinessYear();
    const result = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const parent = await client.query(
        `SELECT 1 FROM mdata.drivers d
          WHERE d.id = $1::uuid
            AND d.archived_at IS NULL
            AND (
              d.operating_company_id = $2::uuid
              OR EXISTS (
                SELECT 1 FROM mdata.driver_company_authorizations dca
                 WHERE dca.driver_id = d.id
                   AND dca.company_id = $2::uuid
                   AND dca.is_authorized = true
                   AND dca.deactivated_at IS NULL
              )
            )
          LIMIT 1`,
        [parsedParams.data.driver_id, parsedQuery.data.operating_company_id]
      );
      if (!parent.rows[0]) return { found: false, balance: null };
      const balance = await getLeaveBalance(client, parsedQuery.data.operating_company_id, parsedParams.data.driver_id, year);
      return { found: true, balance };
    });
    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { balance: result.balance, year };
  });

  // Office Leave Balances tab — per-driver allocated/used/remaining for the plan year.
  // CodeQL js/missing-rate-limiting: auth + company-scoped write/seed must be rate-limited.
  app.get(
    "/api/v1/safety/scheduler/balances",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const parsed = companyQuerySchema
        .extend({ year: z.coerce.number().int().min(2000).max(2100).optional() })
        .safeParse(req.query ?? {});
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const year = parsed.data.year ?? companyBusinessYear();
      return withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
        listLeaveBalances(client, parsed.data.operating_company_id, year)
      );
    }
  );

  app.get("/api/v1/safety/scheduler/policy/:op_company_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = z.object({ op_company_id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const policy = await withCompanyScope(user.uuid, parsedParams.data.op_company_id, (client) =>
      getLeavePolicy(client, parsedParams.data.op_company_id)
    );
    if (!policy) return reply.code(404).send({ error: "leave_policy_not_found" });
    return policy;
  });

  app.patch("/api/v1/safety/scheduler/policy/:op_company_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isPolicyAdminRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsedParamsFixed = z.object({ op_company_id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!parsedParamsFixed.success) return sendValidationError(reply, parsedParamsFixed.error);
    const parsedBody = updateLeavePolicySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const result = await withCompanyScope(user.uuid, parsedParamsFixed.data.op_company_id, (client) =>
      updateLeavePolicy(client, {
        operatingCompanyId: parsedParamsFixed.data.op_company_id,
        actorUserId: user.uuid,
        updates: parsedBody.data,
      })
    );
    if ("error" in result) return reply.code(409).send(result);
    return result.policy;
  });

  app.get("/api/v1/safety/scheduler/temp-assignments", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = tempAssignmentsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const result = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      if (parsed.data.driver_id) {
        const parent = await client.query(
          `SELECT 1 FROM mdata.drivers d
            WHERE d.id = $1::uuid
              AND d.archived_at IS NULL
              AND (
                d.operating_company_id = $2::uuid
                OR EXISTS (
                  SELECT 1 FROM mdata.driver_company_authorizations dca
                   WHERE dca.driver_id = d.id
                     AND dca.company_id = $2::uuid
                     AND dca.is_authorized = true
                     AND dca.deactivated_at IS NULL
                )
              )
            LIMIT 1`,
          [parsed.data.driver_id, parsed.data.operating_company_id]
        );
        if (!parent.rows[0]) return { found: false, assignments: [], totalCount: 0 };
      }
      const page = await listTempAssignments(client, parsed.data.operating_company_id, {
        driverId: parsed.data.driver_id,
        unitId: parsed.data.unit_id,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
      return { found: true, ...page };
    });
    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return {
      assignments: result.assignments,
      total_count: result.totalCount,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    };
  });

  app.post("/api/v1/safety/scheduler/temp-assignments", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = assignTempCoverSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const result = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      assignTempCover(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        actorUserId: user.uuid,
        body: parsedBody.data,
      })
    );
    if ("error" in result) return reply.code(409).send(result);
    return reply.code(201).send(result.assignment);
  });

  app.post("/api/v1/safety/scheduler/temp-assignments/:id/cancel", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = uuidParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const body = z.object({ reason: z.string().trim().max(500).optional() }).safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const row = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      cancelTempCover(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        assignmentId: parsedParams.data.id,
        actorUserId: user.uuid,
        reason: body.data.reason,
      })
    );
    if (!row) return reply.code(404).send({ error: "temp_assignment_not_found" });
    return row;
  });
}
