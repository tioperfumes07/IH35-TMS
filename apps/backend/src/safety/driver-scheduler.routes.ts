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
  listMyLeaveRequests,
  listPendingLeaveRequests,
  listTempAssignments,
  reviewLeaveRequest,
  reviewLeaveRequestSchema,
  updateLeavePolicy,
  updateLeavePolicySchema,
} from "./driver-scheduler.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const dateRangeQuerySchema = companyQuerySchema.extend({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const driverDateRangeQuerySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
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
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
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
  app.get("/api/v1/driver/scheduler/my-requests", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const rows = await withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [oc]);
      return listMyLeaveRequests(client, oc, d.id);
    });
    return { requests: rows };
  });

  app.get("/api/v1/driver/scheduler/my-schedule", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsed = driverDateRangeQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const payload = await withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [oc]);
      return getMySchedule(client, {
        operatingCompanyId: oc,
        driverId: d.id,
        startDate: parsed.data.start_date,
        endDate: parsed.data.end_date,
      });
    });
    return payload;
  });

  app.post("/api/v1/driver/scheduler/request", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsedBody = createLeaveRequestSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const result = await withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [oc]);
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

  app.patch("/api/v1/driver/scheduler/request/:id/cancel", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsedParams = uuidParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const row = await withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [oc]);
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

  app.post("/api/v1/driver/scheduler/request/:id/documentation", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const parsedParams = uuidParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = attachLeaveDocumentationSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const d = req.driver!;
    const oc = await fetchDriverCompanyId(req.user!.uuid, d.id);
    if (!oc) return reply.code(403).send({ error: "driver_company_not_found" });
    const result = await withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [oc]);
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
  });

  app.get("/api/v1/safety/scheduler/grid", async (req, reply) => {
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

  app.get("/api/v1/safety/scheduler/requests", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      listAllLeaveRequests(client, parsed.data.operating_company_id)
    );
    return { requests: rows };
  });

  app.get("/api/v1/safety/scheduler/requests/pending", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      listPendingLeaveRequests(client, parsed.data.operating_company_id)
    );
    return { requests: rows };
  });

  app.get("/api/v1/safety/scheduler/requests/:id", async (req, reply) => {
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

  app.post("/api/v1/safety/scheduler/requests/:id/review", async (req, reply) => {
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

  app.post("/api/v1/safety/scheduler/requests/:id/assign-cover", async (req, reply) => {
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

  app.get("/api/v1/safety/scheduler/balance/:driver_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = z.object({ driver_id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.extend({ year: z.coerce.number().int().optional() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const year = parsedQuery.data.year ?? new Date().getUTCFullYear();
    const bal = await withCompanyScope(user.uuid, parsedQuery.data.operating_company_id, (client) =>
      getLeaveBalance(client, parsedQuery.data.operating_company_id, parsedParams.data.driver_id, year)
    );
    return { balance: bal, year };
  });

  app.get("/api/v1/safety/scheduler/policy/:op_company_id", async (req, reply) => {
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

  app.patch("/api/v1/safety/scheduler/policy/:op_company_id", async (req, reply) => {
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

  app.get("/api/v1/safety/scheduler/temp-assignments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSchedulerOfficeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, (client) =>
      listTempAssignments(client, parsed.data.operating_company_id)
    );
    return { assignments: rows };
  });

  app.post("/api/v1/safety/scheduler/temp-assignments", async (req, reply) => {
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

  app.post("/api/v1/safety/scheduler/temp-assignments/:id/cancel", async (req, reply) => {
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
