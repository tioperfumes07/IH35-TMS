import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const QBO_SYNC_SENTINEL_ID = "00000000-0000-0000-0000-000000000000";

const actionCodeSchema = z.enum([
  "WF-064-CATAL-001",
  "WF-064-CATAL-002",
  "WF-064-CATAL-003",
  "WF-064-CATAL-004",
]);

const statusSchema = z.enum(["Pending", "Approved", "Rejected"]);
const resourceTypeSchema = z.enum(["account_role_binding", "posting_template", "account", "qbo_sync"]);
const roleKeySchema = z.enum([
  "ar_clearing",
  "ap_clearing",
  "cash_dip",
  "cash_payroll",
  "cash_petty",
  "fuel_expense",
  "maintenance_expense",
  "driver_payroll_clearing",
  "factor_advances_receivable",
  "factor_chargebacks_payable",
  "undeposited_funds",
]);

const listQuerySchema = z.object({
  status: statusSchema.optional(),
  action_code: actionCodeSchema.optional(),
  target_resource_type: resourceTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const workflowIdParamSchema = z.object({ id: z.string().uuid() });

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
  "WF-064-CATAL-001": "account_role_binding",
  "WF-064-CATAL-002": "posting_template",
  "WF-064-CATAL-003": "account",
  "WF-064-CATAL-004": "qbo_sync",
};

const actionPayloadSchemas = {
  "WF-064-CATAL-001": z.object({
    role_key: roleKeySchema,
    new_account_id: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  "WF-064-CATAL-002": z
    .object({
      template_id: z.string().uuid(),
      debit_account_id: z.string().uuid().optional(),
      credit_account_id: z.string().uuid().optional(),
      default_class_id: z.string().uuid().nullable().optional(),
      default_memo: z.string().trim().max(1000).optional(),
    })
    .refine(
      (v) =>
        "debit_account_id" in v ||
        "credit_account_id" in v ||
        "default_class_id" in v ||
        "default_memo" in v,
      { message: "at least one updatable field is required" }
    ),
  "WF-064-CATAL-003": z.object({
    account_id: z.string().uuid(),
    force: z.boolean().default(false),
  }),
  "WF-064-CATAL-004": z.object({
    sync_scope: z.enum(["accounts", "classes", "items", "payment_terms", "all"]),
    dry_run: z.boolean(),
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
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
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
  eventClass:
    | "workflow.requested"
    | "workflow.approved"
    | "workflow.rejected"
    | "workflow.approved.force_deactivation_with_references",
  actorUserId: string,
  payload: Record<string, unknown>,
  severity: "info" | "warning" = "info"
) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
    eventClass,
    severity,
    JSON.stringify(payload),
    actorUserId,
    "BT-1-CATAL-03",
  ]);
}

async function resourceExists(
  client: { query: (query: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  targetResourceType: z.infer<typeof resourceTypeSchema>,
  targetResourceId: string
) {
  if (targetResourceType === "account_role_binding") {
    const res = await client.query(`SELECT id FROM catalogs.account_role_bindings WHERE id = $1 LIMIT 1`, [targetResourceId]);
    return res.rows.length > 0;
  }
  if (targetResourceType === "posting_template") {
    const res = await client.query(`SELECT id FROM catalogs.posting_templates WHERE id = $1 LIMIT 1`, [targetResourceId]);
    return res.rows.length > 0;
  }
  if (targetResourceType === "account") {
    const res = await client.query(`SELECT id FROM catalogs.accounts WHERE id = $1 LIMIT 1`, [targetResourceId]);
    return res.rows.length > 0;
  }
  return targetResourceId === QBO_SYNC_SENTINEL_ID;
}

async function checkAccountReferences(
  client: { query: (query: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  accountId: string
) {
  const postingTemplatesRes = await client.query(
    `
      SELECT count(*)::int AS cnt
      FROM catalogs.posting_templates
      WHERE is_active = true
        AND (debit_account_id = $1 OR credit_account_id = $1)
    `,
    [accountId]
  );
  const roleBindingsRes = await client.query(
    `
      SELECT count(*)::int AS cnt
      FROM catalogs.account_role_bindings
      WHERE account_id = $1
    `,
    [accountId]
  );
  const postingTemplatesCount = Number(postingTemplatesRes.rows[0]?.cnt ?? 0);
  const roleBindingsCount = Number(roleBindingsRes.rows[0]?.cnt ?? 0);
  return {
    posting_templates: postingTemplatesCount,
    account_role_bindings: roleBindingsCount,
    total: postingTemplatesCount + roleBindingsCount,
  };
}

function parsePayloadForAction(
  actionCode: z.infer<typeof actionCodeSchema>,
  targetResourceId: string,
  payload: Record<string, unknown>
) {
  if (actionCode === "WF-064-CATAL-001") {
    const parsed = actionPayloadSchemas["WF-064-CATAL-001"].safeParse(payload ?? {});
    if (!parsed.success) return { success: false as const, error: parsed.error };
    return { success: true as const, payload: parsed.data };
  }

  if (actionCode === "WF-064-CATAL-002") {
    const parsed = actionPayloadSchemas["WF-064-CATAL-002"].safeParse(payload ?? {});
    if (!parsed.success) return { success: false as const, error: parsed.error };
    if (parsed.data.template_id !== targetResourceId) {
      return { success: false as const, error: "payload_template_id_must_match_target_resource_id" };
    }
    return { success: true as const, payload: parsed.data };
  }

  if (actionCode === "WF-064-CATAL-003") {
    const parsed = actionPayloadSchemas["WF-064-CATAL-003"].safeParse(payload ?? {});
    if (!parsed.success) return { success: false as const, error: parsed.error };
    if (parsed.data.account_id !== targetResourceId) {
      return { success: false as const, error: "payload_account_id_must_match_target_resource_id" };
    }
    return { success: true as const, payload: parsed.data };
  }

  const parsed = actionPayloadSchemas["WF-064-CATAL-004"].safeParse(payload ?? {});
  if (!parsed.success) return { success: false as const, error: parsed.error };
  if (targetResourceId !== QBO_SYNC_SENTINEL_ID) {
    return { success: false as const, error: "qbo_sync_requires_sentinel_target_resource_id" };
  }
  return { success: true as const, payload: parsed.data };
}

export async function registerCatalogsWorkflowRoutes(app: FastifyInstance) {
  app.post("/api/v1/catalogs/workflow-requests", async (req, reply) => {
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
      if (parsedPayload.error instanceof z.ZodError) return sendValidationError(reply, parsedPayload.error);
      return reply.code(400).send({ error: parsedPayload.error });
    }

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      const exists = await resourceExists(client, targetResourceType, targetResourceId);
      if (!exists) return { error: "target_resource_not_found" as const };

      if (actionCode === "WF-064-CATAL-001") {
        const payload001 = actionPayloadSchemas["WF-064-CATAL-001"].parse(parsedPayload.payload);
        const bindingRes = await client.query(`SELECT role_key FROM catalogs.account_role_bindings WHERE id = $1 LIMIT 1`, [
          targetResourceId,
        ]);
        const row = bindingRes.rows[0];
        if (!row || String(row.role_key) !== payload001.role_key) {
          return { error: "payload_role_key_must_match_target_binding" as const };
        }
      }

      if (actionCode === "WF-064-CATAL-003") {
        const payload003 = actionPayloadSchemas["WF-064-CATAL-003"].parse(parsedPayload.payload);
        if (!payload003.force) {
          const references = await checkAccountReferences(client, payload003.account_id);
          if (references.total > 0) {
            return { error: "account_still_referenced" as const, references };
          }
        }
      }

      const inserted = await client.query<WorkflowRequestRow>(
        `
          INSERT INTO catalogs.workflow_requests (
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
      if (created.error === "target_resource_not_found") return reply.code(404).send({ error: created.error });
      if (created.error === "account_still_referenced") {
        return reply.code(409).send({ error: created.error, references: created.references });
      }
      return reply.code(400).send({ error: created.error });
    }

    return reply.code(201).send(mapWorkflowRequest(created.row));
  });

  app.get("/api/v1/catalogs/workflow-requests", async (req, reply) => {
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
          FROM catalogs.workflow_requests
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

  app.get("/api/v1/catalogs/workflow-requests/:id", async (req, reply) => {
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
          FROM catalogs.workflow_requests
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "catalog_workflow_request_not_found" });
    return mapWorkflowRequest(row);
  });

  app.post("/api/v1/catalogs/workflow-requests/:id/approve", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isAdminRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = workflowIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = decideBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const requestRes = await client.query<WorkflowRequestRow>(
        `
          SELECT
            id, action_code, status, requested_by, target_resource_type, target_resource_id, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
          FROM catalogs.workflow_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [parsedParams.data.id]
      );
      const workflow = requestRes.rows[0];
      if (!workflow) return { error: "catalog_workflow_request_not_found" as const };
      if (workflow.status !== "Pending") return { error: "catalog_workflow_request_not_pending" as const };
      if (workflow.requested_by === authUser.uuid) return { error: "cannot_decide_own_request" as const };

      if (workflow.action_code === "WF-064-CATAL-001") {
        const payload001 = actionPayloadSchemas["WF-064-CATAL-001"].parse(workflow.payload ?? {});
        const updateRes = await client.query(
          `
            UPDATE catalogs.account_role_bindings
            SET account_id = $2, updated_by_user_id = $3
            WHERE role_key = $1
            RETURNING id
          `,
          [payload001.role_key, payload001.new_account_id, authUser.uuid]
        );
        if (updateRes.rows.length === 0) return { error: "catalog_account_role_binding_not_found_for_role_key" as const };
      } else if (workflow.action_code === "WF-064-CATAL-002") {
        const payload002 = actionPayloadSchemas["WF-064-CATAL-002"].parse(workflow.payload ?? {});
        const templateRes = await client.query(
          `
            SELECT debit_account_id, credit_account_id
            FROM catalogs.posting_templates
            WHERE id = $1
            LIMIT 1
          `,
          [payload002.template_id]
        );
        const template = templateRes.rows[0];
        if (!template) return { error: "catalog_posting_template_not_found" as const };
        const nextDebit = payload002.debit_account_id ?? String(template.debit_account_id);
        const nextCredit = payload002.credit_account_id ?? String(template.credit_account_id);
        if (nextDebit === nextCredit) return { error: "debit_credit_must_differ" as const };

        const setParts: string[] = [];
        const values: unknown[] = [];
        const add = (col: string, val: unknown) => {
          values.push(val);
          setParts.push(`${col} = $${values.length}`);
        };
        if ("debit_account_id" in payload002) add("debit_account_id", payload002.debit_account_id ?? null);
        if ("credit_account_id" in payload002) add("credit_account_id", payload002.credit_account_id ?? null);
        if ("default_class_id" in payload002) add("default_class_id", payload002.default_class_id ?? null);
        if ("default_memo" in payload002) add("default_memo", payload002.default_memo ?? null);
        add("updated_by_user_id", authUser.uuid);
        values.push(payload002.template_id);
        const idIdx = values.length;
        await client.query(`UPDATE catalogs.posting_templates SET ${setParts.join(", ")} WHERE id = $${idIdx}`, values);
      } else if (workflow.action_code === "WF-064-CATAL-003") {
        const payload003 = actionPayloadSchemas["WF-064-CATAL-003"].parse(workflow.payload ?? {});
        const references = await checkAccountReferences(client, payload003.account_id);
        if (!payload003.force && references.total > 0) {
          return { error: "account_still_referenced", references } as const;
        }
        await client.query(
          `UPDATE catalogs.accounts SET deactivated_at = now(), updated_by_user_id = $2 WHERE id = $1`,
          [payload003.account_id, authUser.uuid]
        );
        if (payload003.force && references.total > 0) {
          await appendWorkflowAudit(
            client,
            "workflow.approved.force_deactivation_with_references",
            authUser.uuid,
            {
              workflow_id: workflow.id,
              action_code: workflow.action_code,
              target_resource_type: workflow.target_resource_type,
              target_resource_id: workflow.target_resource_id,
              references,
            },
            "warning"
          );
        }
      } else if (workflow.action_code === "WF-064-CATAL-004") {
        // Phase 1 no-op: approval records intent; QBO side effects land in Phase 5.
      }

      const updatedRes = await client.query<WorkflowRequestRow>(
        `
          UPDATE catalogs.workflow_requests
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
      if (result.error === "catalog_workflow_request_not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "cannot_decide_own_request") return reply.code(403).send({ error: result.error });
      if (result.error === "account_still_referenced") {
        return reply.code(409).send({ error: result.error, references: result.references });
      }
      return reply.code(400).send({ error: result.error });
    }

    return mapWorkflowRequest(result.row);
  });

  app.post("/api/v1/catalogs/workflow-requests/:id/reject", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isAdminRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = workflowIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = decideBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const requestRes = await client.query<WorkflowRequestRow>(
        `
          SELECT
            id, action_code, status, requested_by, target_resource_type, target_resource_id, payload,
            decided_by, decided_at, decision_reason, created_at, updated_at
          FROM catalogs.workflow_requests
          WHERE id = $1
          FOR UPDATE
        `,
        [parsedParams.data.id]
      );
      const workflow = requestRes.rows[0];
      if (!workflow) return { error: "catalog_workflow_request_not_found" as const };
      if (workflow.status !== "Pending") return { error: "catalog_workflow_request_not_pending" as const };
      if (workflow.requested_by === authUser.uuid) return { error: "cannot_decide_own_request" as const };

      const updatedRes = await client.query<WorkflowRequestRow>(
        `
          UPDATE catalogs.workflow_requests
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
      if (result.error === "catalog_workflow_request_not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "cannot_decide_own_request") return reply.code(403).send({ error: result.error });
      return reply.code(400).send({ error: result.error });
    }

    return mapWorkflowRequest(result.row);
  });
}
