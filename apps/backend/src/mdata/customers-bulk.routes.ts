import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPatchChanges } from "../audit/crud-audit.js";
import { appendBulkCrudAudit, registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";

const customerStatusPayloadSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

const customerClassifyPayloadSchema = z.object({
  classification: z.enum(["preferred", "standard", "caution", "avoid"]),
});

const emptyPayloadSchema = z.object({}).default({});

type CustomerBulkPayload =
  | z.infer<typeof customerStatusPayloadSchema>
  | z.infer<typeof customerClassifyPayloadSchema>
  | z.infer<typeof emptyPayloadSchema>;

async function handleCustomerBulk(ctx: BulkPerEntityContext<CustomerBulkPayload>): Promise<BulkPerEntityResult> {
  const { id, action, payload, reason, operatingCompanyId, actorUserId, bulkCallId, client } = ctx;

  const oldRes = await client.query(
    `
      SELECT *
      FROM mdata.customers
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [id, operatingCompanyId]
  );
  const oldRow = oldRes.rows[0] as Record<string, unknown> | undefined;
  if (!oldRow) {
    return { ok: false, code: "E_NOT_FOUND", message: "Customer not found" };
  }

  let updateRes: { rows: unknown[] };
  const auditPayload: Record<string, unknown> = {
    resource_id: id,
    resource_type: "mdata.customers",
    operating_company_id: operatingCompanyId,
    reason: reason ?? null,
  };

  if (action === "set_status") {
    const statusPayload = payload as z.infer<typeof customerStatusPayloadSchema>;
    const nextStatus = statusPayload.status;
    updateRes = await client.query(
      `
        UPDATE mdata.customers
        SET status = $3,
            deactivated_at = CASE WHEN $3 = 'inactive' THEN COALESCE(deactivated_at, now()) ELSE NULL END,
            updated_by_user_id = $4,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, nextStatus, actorUserId]
    );
    auditPayload.changes = buildPatchChanges({ status: nextStatus }, oldRow, updateRes.rows[0] as Record<string, unknown>);
  } else if (action === "archive") {
    updateRes = await client.query(
      `
        UPDATE mdata.customers
        SET archived_at = COALESCE(archived_at, now()),
            updated_by_user_id = $3,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND archived_at IS NULL
        RETURNING *
      `,
      [id, operatingCompanyId, actorUserId]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_ALREADY_ARCHIVED", message: "Customer is already archived" };
    }
    auditPayload.changes = buildPatchChanges({ archived_at: "now" }, oldRow, updateRes.rows[0] as Record<string, unknown>);
  } else if (action === "classify") {
    const classifyPayload = payload as z.infer<typeof customerClassifyPayloadSchema>;
    updateRes = await client.query(
      `
        UPDATE mdata.customers
        SET quality_overall_flag = $3,
            updated_by_user_id = $4,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, classifyPayload.classification, actorUserId]
    );
    auditPayload.changes = buildPatchChanges(
      { quality_overall_flag: classifyPayload.classification },
      oldRow,
      updateRes.rows[0] as Record<string, unknown>
    );
  } else {
    return { ok: false, code: "E_UNKNOWN_ACTION", message: `Unknown action: ${action}` };
  }

  if (updateRes.rows.length === 0) {
    return { ok: false, code: "E_UPDATE_FAILED", message: "Customer update failed" };
  }

  await appendBulkCrudAudit(client, actorUserId, "customer", action, bulkCallId, auditPayload);
  return { ok: true };
}

export async function registerCustomerBulkRoutes(app: FastifyInstance) {
  registerBulkRoute({
    app,
    path: "/api/v1/mdata/customers/bulk-update",
    domain: "mdata",
    resource: "customers",
    entityType: "customer",
    requireReasonActions: ["set_status", "archive"],
    destructiveActions: ["archive"],
    actionMap: {
      set_status: customerStatusPayloadSchema,
      archive: emptyPayloadSchema,
      classify: customerClassifyPayloadSchema,
    },
    perEntityHandler: handleCustomerBulk,
  });
}
