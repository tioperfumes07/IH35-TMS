import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPatchChanges } from "../audit/crud-audit.js";
import { appendBulkCrudAudit, registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";
import { dispatchStatusSchema, toMdataStatus, validateLoadStatusTransition } from "./load-state-machine.js";

const setStatusPayloadSchema = z.object({
  transition: dispatchStatusSchema,
});

const markFactoredPayloadSchema = z.object({
  factor_id: z.string().uuid(),
});

const markPaidPayloadSchema = z.object({});

type LoadBulkPayload =
  | z.infer<typeof setStatusPayloadSchema>
  | z.infer<typeof markFactoredPayloadSchema>
  | z.infer<typeof markPaidPayloadSchema>;

const PAID_ELIGIBLE_MDATA_STATUSES = new Set(["invoiced", "completed_docs_received", "delivered_pending_docs", "paid"]);

async function handleLoadBulk(ctx: BulkPerEntityContext<LoadBulkPayload>): Promise<BulkPerEntityResult> {
  const { id, action, payload, reason, operatingCompanyId, actorUserId, bulkCallId, client } = ctx;

  const oldRes = await client.query(
    `
      SELECT *
      FROM mdata.loads
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [id, operatingCompanyId]
  );
  const oldRow = oldRes.rows[0] as Record<string, unknown> | undefined;
  if (!oldRow) {
    return { ok: false, code: "E_NOT_FOUND", message: "Load not found" };
  }

  const auditPayload: Record<string, unknown> = {
    resource_id: id,
    resource_type: "mdata.loads",
    operating_company_id: operatingCompanyId,
    reason: reason ?? null,
  };

  if (action === "set_status") {
    const statusPayload = payload as z.infer<typeof setStatusPayloadSchema>;
    const validation = validateLoadStatusTransition(String(oldRow.status), statusPayload.transition);
    if (!validation.ok) {
      return {
        ok: false,
        code: "E_STATE_INVALID",
        message: `Invalid transition from ${validation.from} to ${validation.to}`,
      };
    }

    const mdataStatus = toMdataStatus(statusPayload.transition);
    const updateRes = await client.query(
      `
        UPDATE mdata.loads
        SET status = $3::mdata.load_status_enum,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, mdataStatus]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Load status update failed" };
    }
    auditPayload.changes = buildPatchChanges(
      { status: mdataStatus, transition: statusPayload.transition },
      oldRow,
      updateRes.rows[0] as Record<string, unknown>
    );
  } else if (action === "mark_factored") {
    const factoredPayload = payload as z.infer<typeof markFactoredPayloadSchema>;
    const factorRes = await client.query(
      `
        SELECT id::text
        FROM mdata.vendors
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [factoredPayload.factor_id, operatingCompanyId]
    );
    if (!factorRes.rows[0]) {
      return { ok: false, code: "E_FACTOR_INVALID", message: "Factoring vendor not found" };
    }

    const invoiceRes = await client.query(
      `
        SELECT id::text, factoring_status, status
        FROM accounting.invoices
        WHERE source_load_id = $1::uuid
          AND operating_company_id = $2::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [id, operatingCompanyId]
    );
    const invoice = invoiceRes.rows[0] as { id: string; factoring_status: string | null; status: string } | undefined;
    if (!invoice) {
      return { ok: false, code: "E_NOT_FOUND", message: "No invoice linked to load" };
    }
    if (String(invoice.factoring_status ?? "not_factored") !== "not_factored") {
      return { ok: false, code: "E_ALREADY_FACTORED", message: "Load invoice is already factored" };
    }

    const updateRes = await client.query(
      `
        UPDATE accounting.invoices
        SET factoring_status = 'submitted',
            updated_at = now(),
            updated_by_user_id = $3
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [invoice.id, operatingCompanyId, actorUserId]
    );
    auditPayload.changes = buildPatchChanges(
      { factoring_status: "submitted", factor_id: factoredPayload.factor_id, invoice_id: invoice.id },
      oldRow,
      updateRes.rows[0] as Record<string, unknown>
    );
  } else if (action === "mark_paid") {
    const currentStatus = String(oldRow.status);
    if (!PAID_ELIGIBLE_MDATA_STATUSES.has(currentStatus)) {
      return {
        ok: false,
        code: "E_STATE_INVALID",
        message: `Load status ${currentStatus} cannot be marked paid`,
      };
    }

    const updateRes = await client.query(
      `
        UPDATE mdata.loads
        SET status = 'paid'::mdata.load_status_enum,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Load mark paid failed" };
    }
    auditPayload.changes = buildPatchChanges({ status: "paid" }, oldRow, updateRes.rows[0] as Record<string, unknown>);
  } else {
    return { ok: false, code: "E_UNKNOWN_ACTION", message: `Unknown action: ${action}` };
  }

  await appendBulkCrudAudit(client, actorUserId, "load", action, bulkCallId, auditPayload);
  return { ok: true };
}

export async function registerLoadsBulkRoutes(app: FastifyInstance) {
  registerBulkRoute({
    app,
    path: "/api/v1/dispatch/loads/bulk-update",
    domain: "dispatch",
    resource: "loads",
    entityType: "load",
    requireReasonActions: ["set_status", "mark_paid"],
    destructiveActions: ["mark_paid"],
    actionMap: {
      set_status: setStatusPayloadSchema,
      mark_factored: markFactoredPayloadSchema,
      mark_paid: markPaidPayloadSchema,
    },
    perEntityHandler: handleLoadBulk,
  });
}
