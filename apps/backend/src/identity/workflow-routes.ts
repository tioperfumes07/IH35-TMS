import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const actionCodeSchema = z.enum([
  "WF-064-IDENT-001",
  "WF-064-IDENT-002",
  "WF-064-IDENT-003",
  "WF-064-IDENT-004",
]);

const statusSchema = z.enum(["Pending", "Approved", "Rejected"]);

const roleSchema = z.enum([
  "Owner",
  "Administrator",
  "Manager",
  "Accountant",
  "Dispatcher",
  "Safety",
  "Driver",
  "Mechanic",
]);

const listQuerySchema = z.object({
  status: statusSchema.optional(),
  action_code: actionCodeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const workflowIdParamSchema = z.object({
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  action_code: actionCodeSchema,
  target_user: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

const decideBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

type WorkflowRequestRow = {
  id: string;
  action_code: string;
  status: string;
  requested_by: string;
  target_user: string;
  payload: Record<string, unknown>;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
};

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) {
    return null;
  }
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
    target_user: row.target_user,
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
    [eventClass, "info", JSON.stringify(payload), actorUserId, "BT-1-IDENT-03"]
  );
}

function extractToRole(payload: Record<string, unknown>): string | null {
  const parsed = roleSchema.safeParse(payload?.["to_role"]);
  return parsed.success ? parsed.data : null;
}

export async function registerWorkflowRoutes(app: FastifyInstance) {
  app.post("/api/v1/identity/workflow-requests", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    const parsedBody = createBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return sendValidationError(reply, parsedBody.error);
    }

    const { action_code: actionCode, target_user: targetUser, payload } = parsedBody.data;

    if (actionCode === "WF-064-IDENT-003" && targetUser !== authUser.uuid) {
      return reply.code(400).send({ error: "target_must_match_requester_for_self_deactivation" });
    }

    if (actionCode === "WF-064-IDENT-002" && !extractToRole(payload)) {
      return reply.code(400).send({ error: "role_change_payload_requires_to_role" });
    }

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      const targetRes = await client.query<{ id: string; deactivated_at: string | null }>(
        `SELECT id, deactivated_at FROM identity.users WHERE id = $1 LIMIT 1`,
        [targetUser]
      );
      const target = targetRes.rows[0];
      if (!target) {
        return { error: "identity_user_not_found" as const };
      }

      if (
        (actionCode === "WF-064-IDENT-001" || actionCode === "WF-064-IDENT-004") &&
        target.deactivated_at === null
      ) {
        return { error: "target_user_not_deactivated" as const };
      }

      const inserted = await client.query<WorkflowRequestRow>(
        `
          INSERT INTO identity.workflow_requests (
            action_code, requested_by, target_user, payload
          )
          VALUES ($1, $2, $3, $4::jsonb)
          RETURNING
            id, action_code, status, requested_by, target_user, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
        `,
        [actionCode, authUser.uuid, targetUser, JSON.stringify(payload)]
      );
      const row = inserted.rows[0];

      await appendWorkflowAudit(client, "workflow.requested", authUser.uuid, {
        workflow_id: row.id,
        action_code: row.action_code,
        target_user: row.target_user,
        requested_by: row.requested_by,
      });

      return { row };
    });

    if ("error" in created) {
      if (created.error === "identity_user_not_found") {
        return reply.code(404).send({ error: created.error });
      }
      return reply.code(400).send({ error: created.error });
    }

    return reply.code(201).send(mapWorkflowRequest(created.row));
  });

  app.get("/api/v1/identity/workflow-requests", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return sendValidationError(reply, parsedQuery.error);
    }
    const { status, action_code: actionCode, limit, offset } = parsedQuery.data;

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      const filters = [];
      const values: unknown[] = [];
      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (actionCode) {
        values.push(actionCode);
        filters.push(`action_code = $${values.length}`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const query = `
        SELECT
          id, action_code, status, requested_by, target_user, payload,
          decided_by, decided_at, decision_reason, created_at, updated_at
        FROM identity.workflow_requests
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `;
      const res = await client.query<WorkflowRequestRow>(query, values);
      return res.rows.map(mapWorkflowRequest);
    });

    return { workflow_requests: rows };
  });

  app.get("/api/v1/identity/workflow-requests/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    const parsedParams = workflowIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return sendValidationError(reply, parsedParams.error);
    }

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query<WorkflowRequestRow>(
        `
          SELECT
            id, action_code, status, requested_by, target_user, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
          FROM identity.workflow_requests
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) {
      return reply.code(404).send({ error: "workflow_request_not_found" });
    }

    return mapWorkflowRequest(row);
  });

  app.post("/api/v1/identity/workflow-requests/:id/approve", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    if (!isAdminRole(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsedParams = workflowIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return sendValidationError(reply, parsedParams.error);
    }
    const parsedBody = decideBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return sendValidationError(reply, parsedBody.error);
    }

    try {
      const result = await withCurrentUser(authUser.uuid, async (client) => {
        const requestRes = await client.query<WorkflowRequestRow>(
          `
            SELECT
              id, action_code, status, requested_by, target_user, payload,
              decided_by, decided_at, decision_reason, created_at, updated_at
            FROM identity.workflow_requests
            WHERE id = $1
            FOR UPDATE
          `,
          [parsedParams.data.id]
        );
        const workflow = requestRes.rows[0];
        if (!workflow) {
          return { error: "workflow_request_not_found" as const };
        }
        if (workflow.status !== "Pending") {
          return { error: "workflow_request_not_pending" as const };
        }
        if (workflow.requested_by === authUser.uuid) {
          return { error: "cannot_decide_own_request" as const };
        }

        if (workflow.action_code === "WF-064-IDENT-001" || workflow.action_code === "WF-064-IDENT-004") {
          await client.query(
            `UPDATE identity.users SET deactivated_at = NULL WHERE id = $1`,
            [workflow.target_user]
          );
        } else if (workflow.action_code === "WF-064-IDENT-002") {
          const toRole = extractToRole(workflow.payload || {});
          if (!toRole) {
            return { error: "role_change_payload_requires_to_role" as const };
          }
          await client.query(
            `UPDATE identity.users SET role = $1 WHERE id = $2`,
            [toRole, workflow.target_user]
          );
        } else if (workflow.action_code === "WF-064-IDENT-003") {
          await client.query(
            `UPDATE identity.users SET deactivated_at = now() WHERE id = $1`,
            [workflow.target_user]
          );
        }

        const updatedRes = await client.query<WorkflowRequestRow>(
          `
            UPDATE identity.workflow_requests
            SET
              status = 'Approved',
              decided_by = $2,
              decided_at = now(),
              decision_reason = $3
            WHERE id = $1
            RETURNING
              id, action_code, status, requested_by, target_user, payload,
              decided_by, decided_at, decision_reason, created_at, updated_at
          `,
          [workflow.id, authUser.uuid, parsedBody.data.reason ?? null]
        );
        const updated = updatedRes.rows[0];

        await appendWorkflowAudit(client, "workflow.approved", authUser.uuid, {
          workflow_id: updated.id,
          action_code: updated.action_code,
          target_user: updated.target_user,
          requested_by: updated.requested_by,
          decided_by: updated.decided_by,
          reason: updated.decision_reason,
        });

        return { row: updated };
      });

      if ("error" in result) {
        if (result.error === "workflow_request_not_found") {
          return reply.code(404).send({ error: result.error });
        }
        if (result.error === "cannot_decide_own_request") {
          return reply.code(403).send({ error: result.error });
        }
        return reply.code(400).send({ error: result.error });
      }

      return mapWorkflowRequest(result.row);
    } catch (err) {
      const msg = String((err as { message?: string })?.message || "");
      if (msg.includes("cannot deactivate the last active Owner")) {
        return reply.code(400).send({ error: "cannot_deactivate_last_owner" });
      }
      throw err;
    }
  });

  app.post("/api/v1/identity/workflow-requests/:id/reject", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) {
      return;
    }
    if (!isAdminRole(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsedParams = workflowIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return sendValidationError(reply, parsedParams.error);
    }
    const parsedBody = decideBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return sendValidationError(reply, parsedBody.error);
    }

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const requestRes = await client.query<WorkflowRequestRow>(
        `
          SELECT
            id, action_code, status, requested_by, target_user, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
          FROM identity.workflow_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [parsedParams.data.id]
      );
      const workflow = requestRes.rows[0];
      if (!workflow) {
        return { error: "workflow_request_not_found" as const };
      }
      if (workflow.status !== "Pending") {
        return { error: "workflow_request_not_pending" as const };
      }
      if (workflow.requested_by === authUser.uuid) {
        return { error: "cannot_decide_own_request" as const };
      }

      const updatedRes = await client.query<WorkflowRequestRow>(
        `
          UPDATE identity.workflow_requests
          SET
            status = 'Rejected',
            decided_by = $2,
            decided_at = now(),
            decision_reason = $3
          WHERE id = $1
          RETURNING
            id, action_code, status, requested_by, target_user, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
        `,
        [workflow.id, authUser.uuid, parsedBody.data.reason ?? null]
      );
      const updated = updatedRes.rows[0];

      await appendWorkflowAudit(client, "workflow.rejected", authUser.uuid, {
        workflow_id: updated.id,
        action_code: updated.action_code,
        target_user: updated.target_user,
        requested_by: updated.requested_by,
        decided_by: updated.decided_by,
        reason: updated.decision_reason,
      });

      return { row: updated };
    });

    if ("error" in result) {
      if (result.error === "workflow_request_not_found") {
        return reply.code(404).send({ error: result.error });
      }
      if (result.error === "cannot_decide_own_request") {
        return reply.code(403).send({ error: result.error });
      }
      return reply.code(400).send({ error: result.error });
    }

    return mapWorkflowRequest(result.row);
  });
}
