import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { PoolClient } from "pg";
import { z } from "zod";
import { buildPatchChanges } from "../audit/crud-audit.js";
import { appendBulkCrudAudit, registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";
import { enqueueTmsInvoicePushRequested } from "../qbo/tms-invoice-push-chain.service.js";
import { recomputeInvoiceTotals } from "./shared.js";

const invoiceStatusSchema = z.enum(["draft", "sent", "paid", "void", "factored"]);

const setStatusPayloadSchema = z.object({
  status: invoiceStatusSchema,
});

const markSentPayloadSchema = z.object({
  sent_at: z.string().datetime().optional(),
});

const markFactoredPayloadSchema = z.object({
  batch_id: z.string().uuid(),
});

const emptyPayloadSchema = z.object({}).default({});

type InvoiceBulkPayload =
  | z.infer<typeof setStatusPayloadSchema>
  | z.infer<typeof markSentPayloadSchema>
  | z.infer<typeof markFactoredPayloadSchema>
  | z.infer<typeof emptyPayloadSchema>;

type InvoiceDbClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

async function handleInvoiceBulk(ctx: BulkPerEntityContext<InvoiceBulkPayload>): Promise<BulkPerEntityResult> {
  const { id, action, payload, reason, operatingCompanyId, actorUserId, bulkCallId, client } = ctx;
  const invoiceClient = client as unknown as InvoiceDbClient;
  const pushClient = client as unknown as PoolClient;

  const oldRes = await client.query(
    `
      SELECT *
      FROM accounting.invoices
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [id, operatingCompanyId]
  );
  const oldRow = oldRes.rows[0] as Record<string, unknown> | undefined;
  if (!oldRow) {
    return { ok: false, code: "E_NOT_FOUND", message: "Invoice not found" };
  }

  const auditPayload: Record<string, unknown> = {
    resource_id: id,
    resource_type: "accounting.invoices",
    operating_company_id: operatingCompanyId,
    reason: reason ?? null,
  };

  if (action === "set_status") {
    const statusPayload = payload as z.infer<typeof setStatusPayloadSchema>;
    if (statusPayload.status === "void") {
      if (String(oldRow.status) === "paid") {
        return { ok: false, code: "E_STATE_INVALID", message: "Paid invoice cannot be voided" };
      }
      if (String(oldRow.status) === "void") {
        return { ok: false, code: "E_ALREADY_VOID", message: "Invoice is already void" };
      }
    }

    const updateRes = await client.query(
      `
        UPDATE accounting.invoices
        SET status = $3,
            voided_at = CASE WHEN $3 = 'void' THEN COALESCE(voided_at, now()) ELSE voided_at END,
            void_reason = CASE WHEN $3 = 'void' THEN $4 ELSE void_reason END,
            updated_at = now(),
            updated_by_user_id = $5
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, statusPayload.status, reason ?? null, actorUserId]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Invoice status update failed" };
    }
    auditPayload.changes = buildPatchChanges({ status: statusPayload.status }, oldRow, updateRes.rows[0] as Record<string, unknown>);
    await enqueueTmsInvoicePushRequested(pushClient, {
      operating_company_id: operatingCompanyId,
      invoice_id: id,
      operation: "update",
    });
  } else if (action === "mark_sent") {
    if (String(oldRow.status) !== "draft") {
      return { ok: false, code: "E_STATE_INVALID", message: "Only draft invoices can be marked sent" };
    }
    await recomputeInvoiceTotals(invoiceClient, id);
    const updateRes = await client.query(
      `
        UPDATE accounting.invoices
        SET status = 'sent',
            sent_at = COALESCE($3::timestamptz, now()),
            updated_at = now(),
            updated_by_user_id = $4
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, (payload as z.infer<typeof markSentPayloadSchema>).sent_at ?? null, actorUserId]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Invoice mark sent failed" };
    }
    auditPayload.changes = buildPatchChanges({ status: "sent" }, oldRow, updateRes.rows[0] as Record<string, unknown>);
    await enqueueTmsInvoicePushRequested(pushClient, {
      operating_company_id: operatingCompanyId,
      invoice_id: id,
      operation: "update",
    });
  } else if (action === "mark_factored") {
    const factoredPayload = payload as z.infer<typeof markFactoredPayloadSchema>;
    if (String(oldRow.factoring_status ?? "not_factored") !== "not_factored") {
      return { ok: false, code: "E_ALREADY_FACTORED", message: "Invoice is already factored" };
    }

    const advanceRes = await client.query(
      `
        SELECT id::text
        FROM accounting.factoring_advances
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [factoredPayload.batch_id, operatingCompanyId]
    );
    if (!advanceRes.rows[0]) {
      return { ok: false, code: "E_NOT_FOUND", message: "Factoring batch not found" };
    }

    const updateRes = await client.query(
      `
        UPDATE accounting.invoices
        SET factoring_advance_id = $3,
            factoring_status = 'submitted',
            status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
            sent_at = COALESCE(sent_at, now()),
            updated_at = now(),
            updated_by_user_id = $4
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, factoredPayload.batch_id, actorUserId]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Invoice mark factored failed" };
    }
    auditPayload.changes = buildPatchChanges(
      { factoring_status: "submitted", factoring_advance_id: factoredPayload.batch_id },
      oldRow,
      updateRes.rows[0] as Record<string, unknown>
    );
    await enqueueTmsInvoicePushRequested(pushClient, {
      operating_company_id: operatingCompanyId,
      invoice_id: id,
      operation: "update",
    });
  } else {
    return { ok: false, code: "E_UNKNOWN_ACTION", message: `Unknown action: ${action}` };
  }

  await appendBulkCrudAudit(client, actorUserId, "invoice", action, bulkCallId, auditPayload);
  return { ok: true };
}

export async function registerInvoiceBulkRoutes(app: FastifyInstance) {
  registerBulkRoute({
    app,
    path: "/api/v1/accounting/invoices/bulk-update",
    domain: "accounting",
    resource: "invoices",
    entityType: "invoice",
    requireReasonActions: ["set_status"],
    actionMap: {
      set_status: setStatusPayloadSchema,
      mark_sent: markSentPayloadSchema,
      mark_factored: markFactoredPayloadSchema,
    },
    perEntityHandler: handleInvoiceBulk,
  });
}

export default fp(async (app) => {
  await registerInvoiceBulkRoutes(app);
}, { name: "accounting.registerInvoiceBulkRoutes" });
