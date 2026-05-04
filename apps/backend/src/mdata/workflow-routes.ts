import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const actionCodeSchema = z.enum([
  "WF-064-MDATA-001",
  "WF-064-MDATA-002",
  "WF-064-MDATA-003",
  "WF-064-MDATA-004",
  "WF-064-MDATA-005",
]);

const statusSchema = z.enum(["Pending", "Approved", "Rejected"]);
const resourceTypeSchema = z.enum(["driver", "unit", "equipment"]);

const listQuerySchema = z.object({
  status: statusSchema.optional(),
  action_code: actionCodeSchema.optional(),
  target_resource_type: resourceTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const workflowIdParamSchema = z.object({
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  action_code: actionCodeSchema,
  target_resource_type: resourceTypeSchema,
  target_resource_id: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

const decideBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const actionTargetTypeMap: Record<z.infer<typeof actionCodeSchema>, z.infer<typeof resourceTypeSchema>> = {
  "WF-064-MDATA-001": "driver",
  "WF-064-MDATA-002": "driver",
  "WF-064-MDATA-003": "unit",
  "WF-064-MDATA-004": "unit",
  "WF-064-MDATA-005": "equipment",
};

const actionPayloadSchemas = {
  "WF-064-MDATA-001": z.object({}).passthrough(),
  "WF-064-MDATA-002": z.object({}).passthrough(),
  "WF-064-MDATA-003": z.object({
    unit_id: z.string().uuid(),
    acquired_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().trim().max(2000).optional(),
  }),
  "WF-064-MDATA-004": z.object({
    unit_id: z.string().uuid(),
    disposal_type: z.enum(["Sold", "Totaled"]),
    disposed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().trim().max(2000).optional(),
  }),
  "WF-064-MDATA-005": z.object({
    equipment_id: z.string().uuid(),
    disposal_type: z.enum(["Sold", "Lost"]),
    disposed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().trim().max(2000).optional(),
  }),
} as const;

type WorkflowRequestRow = {
  id: string;
  action_code: z.infer<typeof actionCodeSchema>;
  status: z.infer<typeof statusSchema>;
  requested_by: string;
  target_resource_type: z.infer<typeof resourceTypeSchema>;
  target_resource_id: string;
  payload: Record<string, unknown>;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
};

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    error: "validation_error",
    details: error.flatten(),
  });
}

function isAdminRole(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

function mapWorkflowRequest(row: WorkflowRequestRow) {
  return {
    id: row.id,
    action_code: row.action_code,
    status: row.status,
    requested_by: row.requested_by,
    target_resource_type: row.target_resource_type,
    target_resource_id: row.target_resource_id,
    payload: row.payload,
    decided_by: row.decided_by,
    decided_at: row.decided_at,
    decision_reason: row.decision_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function appendWorkflowAudit(
  client: { query: (query: string, values?: unknown[]) => Promise<unknown> },
  eventClass: "workflow.requested" | "workflow.approved" | "workflow.rejected",
  actorUserId: string,
  payload: Record<string, unknown>
) {
  await client.query(
    `SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`,
    [eventClass, "info", JSON.stringify(payload), actorUserId, "BT-1-MDATA-03"]
  );
}

async function resourceExists(
  client: { query: (query: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  targetResourceType: z.infer<typeof resourceTypeSchema>,
  targetResourceId: string
) {
  if (targetResourceType === "driver") {
    const res = await client.query(`SELECT id FROM mdata.drivers WHERE id = $1 LIMIT 1`, [targetResourceId]);
    return res.rows.length > 0;
  }
  if (targetResourceType === "unit") {
    const res = await client.query(`SELECT id FROM mdata.units WHERE id = $1 LIMIT 1`, [targetResourceId]);
    return res.rows.length > 0;
  }
  const res = await client.query(`SELECT id FROM mdata.equipment WHERE id = $1 LIMIT 1`, [targetResourceId]);
  return res.rows.length > 0;
}

function parsePayloadForAction(
  actionCode: z.infer<typeof actionCodeSchema>,
  targetResourceId: string,
  payload: Record<string, unknown>
) {
  if (actionCode === "WF-064-MDATA-003") {
    const parsed = actionPayloadSchemas["WF-064-MDATA-003"].safeParse(payload ?? {});
    if (!parsed.success) return { success: false as const, error: parsed.error };
    if (parsed.data.unit_id !== targetResourceId) {
      return { success: false as const, error: "payload_unit_id_must_match_target_resource_id" };
    }
    return { success: true as const, payload: parsed.data };
  }

  if (actionCode === "WF-064-MDATA-004") {
    const parsed = actionPayloadSchemas["WF-064-MDATA-004"].safeParse(payload ?? {});
    if (!parsed.success) return { success: false as const, error: parsed.error };
    if (parsed.data.unit_id !== targetResourceId) {
      return { success: false as const, error: "payload_unit_id_must_match_target_resource_id" };
    }
    return { success: true as const, payload: parsed.data };
  }

  if (actionCode === "WF-064-MDATA-005") {
    const parsed = actionPayloadSchemas["WF-064-MDATA-005"].safeParse(payload ?? {});
    if (!parsed.success) return { success: false as const, error: parsed.error };
    if (parsed.data.equipment_id !== targetResourceId) {
      return { success: false as const, error: "payload_equipment_id_must_match_target_resource_id" };
    }
    return { success: true as const, payload: parsed.data };
  }

  const parsed = actionPayloadSchemas[actionCode].safeParse(payload ?? {});
  if (!parsed.success) return { success: false as const, error: parsed.error };
  return { success: true as const, payload: parsed.data };
}

export async function registerMdataWorkflowRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/workflow-requests", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const parsedBody = createBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const { action_code: actionCode, target_resource_type: targetResourceType, target_resource_id: targetResourceId, payload } =
      parsedBody.data;

    const expectedType = actionTargetTypeMap[actionCode];
    if (targetResourceType !== expectedType) {
      return reply.code(400).send({ error: "action_code_target_resource_type_mismatch" });
    }

    const parsedPayload = parsePayloadForAction(actionCode, targetResourceId, payload);
    if (!parsedPayload.success) {
      if (parsedPayload.error instanceof z.ZodError) {
        return sendValidationError(reply, parsedPayload.error);
      }
      return reply.code(400).send({ error: parsedPayload.error });
    }

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      const exists = await resourceExists(client, targetResourceType, targetResourceId);
      if (!exists) return { error: "target_resource_not_found" as const };

      const inserted = await client.query<WorkflowRequestRow>(
        `
          INSERT INTO mdata.workflow_requests (
            action_code, requested_by, target_resource_type, target_resource_id, payload
          )
          VALUES ($1, $2, $3, $4, $5::jsonb)
          RETURNING
            id, action_code, status, requested_by, target_resource_type, target_resource_id, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
        `,
        [actionCode, authUser.uuid, targetResourceType, targetResourceId, JSON.stringify(parsedPayload.payload)]
      );
      const row = inserted.rows[0];

      await appendWorkflowAudit(client, "workflow.requested", authUser.uuid, {
        workflow_id: row.id,
        action_code: row.action_code,
        target_resource_type: row.target_resource_type,
        target_resource_id: row.target_resource_id,
        requested_by: row.requested_by,
      });

      return { row };
    });

    if ("error" in created) {
      return reply.code(404).send({ error: created.error });
    }

    return reply.code(201).send(mapWorkflowRequest(created.row));
  });

  app.get("/api/v1/mdata/workflow-requests", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const { status, action_code: actionCode, target_resource_type: targetResourceType, limit, offset } = parsedQuery.data;

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      const filters: string[] = [];
      const values: unknown[] = [];

      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (actionCode) {
        values.push(actionCode);
        filters.push(`action_code = $${values.length}`);
      }
      if (targetResourceType) {
        values.push(targetResourceType);
        filters.push(`target_resource_type = $${values.length}`);
      }

      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query<WorkflowRequestRow>(
        `
          SELECT
            id, action_code, status, requested_by, target_resource_type, target_resource_id, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
          FROM mdata.workflow_requests
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows.map(mapWorkflowRequest);
    });

    return { workflow_requests: rows };
  });

  app.get("/api/v1/mdata/workflow-requests/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = workflowIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query<WorkflowRequestRow>(
        `
          SELECT
            id, action_code, status, requested_by, target_resource_type, target_resource_id, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
          FROM mdata.workflow_requests
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_workflow_request_not_found" });
    return mapWorkflowRequest(row);
  });

  app.post("/api/v1/mdata/workflow-requests/:id/approve", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isAdminRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = workflowIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = decideBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const reqRes = await client.query<WorkflowRequestRow>(
        `
          SELECT
            id, action_code, status, requested_by, target_resource_type, target_resource_id, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
          FROM mdata.workflow_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [parsedParams.data.id]
      );
      const workflow = reqRes.rows[0];
      if (!workflow) return { error: "mdata_workflow_request_not_found" as const };
      if (workflow.status !== "Pending") return { error: "mdata_workflow_request_not_pending" as const };
      if (workflow.requested_by === authUser.uuid) return { error: "cannot_decide_own_request" as const };

      if (workflow.action_code === "WF-064-MDATA-001") {
        await client.query(
          `UPDATE mdata.drivers SET status = 'Active', updated_by_user_id = $2 WHERE id = $1`,
          [workflow.target_resource_id, authUser.uuid]
        );
      } else if (workflow.action_code === "WF-064-MDATA-002") {
        await client.query(
          `UPDATE mdata.drivers SET status = 'Terminated', termination_date = now()::date, updated_by_user_id = $2 WHERE id = $1`,
          [workflow.target_resource_id, authUser.uuid]
        );
      } else if (workflow.action_code === "WF-064-MDATA-003") {
        const payload = actionPayloadSchemas["WF-064-MDATA-003"].parse(workflow.payload ?? {});
        await client.query(
          `
            UPDATE mdata.units
            SET status = 'InService', acquired_date = $2::date, updated_by_user_id = $3
            WHERE id = $1
          `,
          [workflow.target_resource_id, payload.acquired_date, authUser.uuid]
        );
      } else if (workflow.action_code === "WF-064-MDATA-004") {
        const payload = actionPayloadSchemas["WF-064-MDATA-004"].parse(workflow.payload ?? {});
        await client.query(
          `
            UPDATE mdata.units
            SET status = $2, disposed_date = $3::date, updated_by_user_id = $4
            WHERE id = $1
          `,
          [workflow.target_resource_id, payload.disposal_type, payload.disposed_date, authUser.uuid]
        );
      } else if (workflow.action_code === "WF-064-MDATA-005") {
        const payload = actionPayloadSchemas["WF-064-MDATA-005"].parse(workflow.payload ?? {});
        await client.query(
          `
            UPDATE mdata.equipment
            SET status = $2, disposed_date = $3::date, updated_by_user_id = $4
            WHERE id = $1
          `,
          [workflow.target_resource_id, payload.disposal_type, payload.disposed_date, authUser.uuid]
        );
      }

      const updatedRes = await client.query<WorkflowRequestRow>(
        `
          UPDATE mdata.workflow_requests
          SET
            status = 'Approved',
            decided_by = $2,
            decided_at = now(),
            decision_reason = $3
          WHERE id = $1
          RETURNING
            id, action_code, status, requested_by, target_resource_type, target_resource_id, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
        `,
        [workflow.id, authUser.uuid, parsedBody.data.reason ?? null]
      );
      const updated = updatedRes.rows[0];

      await appendWorkflowAudit(client, "workflow.approved", authUser.uuid, {
        workflow_id: updated.id,
        action_code: updated.action_code,
        target_resource_type: updated.target_resource_type,
        target_resource_id: updated.target_resource_id,
        requested_by: updated.requested_by,
        decided_by: updated.decided_by,
        reason: updated.decision_reason,
      });

      return { row: updated };
    });

    if ("error" in result) {
      if (result.error === "mdata_workflow_request_not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "cannot_decide_own_request") return reply.code(403).send({ error: result.error });
      return reply.code(400).send({ error: result.error });
    }

    return mapWorkflowRequest(result.row);
  });

  app.post("/api/v1/mdata/workflow-requests/:id/reject", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isAdminRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = workflowIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = decideBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const reqRes = await client.query<WorkflowRequestRow>(
        `
          SELECT
            id, action_code, status, requested_by, target_resource_type, target_resource_id, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
          FROM mdata.workflow_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [parsedParams.data.id]
      );
      const workflow = reqRes.rows[0];
      if (!workflow) return { error: "mdata_workflow_request_not_found" as const };
      if (workflow.status !== "Pending") return { error: "mdata_workflow_request_not_pending" as const };
      if (workflow.requested_by === authUser.uuid) return { error: "cannot_decide_own_request" as const };

      const updatedRes = await client.query<WorkflowRequestRow>(
        `
          UPDATE mdata.workflow_requests
          SET
            status = 'Rejected',
            decided_by = $2,
            decided_at = now(),
            decision_reason = $3
          WHERE id = $1
          RETURNING
            id, action_code, status, requested_by, target_resource_type, target_resource_id, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
        `,
        [workflow.id, authUser.uuid, parsedBody.data.reason ?? null]
      );
      const updated = updatedRes.rows[0];

      await appendWorkflowAudit(client, "workflow.rejected", authUser.uuid, {
        workflow_id: updated.id,
        action_code: updated.action_code,
        target_resource_type: updated.target_resource_type,
        target_resource_id: updated.target_resource_id,
        requested_by: updated.requested_by,
        decided_by: updated.decided_by,
        reason: updated.decision_reason,
      });

      return { row: updated };
    });

    if ("error" in result) {
      if (result.error === "mdata_workflow_request_not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "cannot_decide_own_request") return reply.code(403).send({ error: result.error });
      return reply.code(400).send({ error: result.error });
    }

    return mapWorkflowRequest(result.row);
  });
}
