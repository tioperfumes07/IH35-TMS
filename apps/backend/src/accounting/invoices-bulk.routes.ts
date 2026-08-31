import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { PoolClient } from "pg";
import { z } from "zod";
import { buildPatchChanges, appendCrudAudit } from "../audit/crud-audit.js";
import { postInvoiceGlIfEnabled } from "./invoice-gl.service.js";
import { fireRevrecLatchOnInvoiceIssued } from "./revrec-delivery-posting/poster.service.js";
import { appendBulkCrudAudit, registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";
import { enqueueTmsInvoicePushRequested } from "../qbo/tms-invoice-push-chain.service.js";
import { recomputeInvoiceTotals } from "./shared.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import { BATCH_VOID_ACTION, voidInvoiceInBulk } from "./bulk-void.service.js";

const invoiceStatusSchema = z.enum(["draft", "sent", "paid", "void", "factored"]);

/** Statuses that represent a real A/R obligation. 'draft' is not one yet; 'void' never is. */
const POSTABLE_INVOICE_STATUSES = new Set(["sent", "paid", "factored"]);

/**
 * ACCT-F100: post the invoice's DR ar_control / CR revenue JE and record a LOUD audit row if the
 * poster refuses. Never throws into the caller — an invoice that has already been issued must not be
 * rolled back because its GL leg could not resolve an account; that is retriable, and silence is not.
 */
async function postInvoiceGlAndAudit(
  client: Parameters<typeof appendCrudAudit>[0],
  args: { invoiceId: string; operatingCompanyId: string; actorUserId: string }
): Promise<void> {
  const res = await postInvoiceGlIfEnabled(client as never, args.operatingCompanyId, args.invoiceId, {
    userId: args.actorUserId,
  });
  if (!res.posted && res.reason === "post_failed") {
    await appendCrudAudit(
      client,
      args.actorUserId,
      "accounting.invoice.gl_post_failed",
      {
        resource_type: "accounting.invoices",
        resource_id: args.invoiceId,
        operating_company_id: args.operatingCompanyId,
        code: res.code,
        message: res.message,
      },
      "warning",
      "ACCT-F100-INVOICE-AR-GL"
    );
  }
}

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
    // INV-BULK-VOID-01 / owner 2026-09-01 — set_status status=void CLOSED.
    // That path flipped status without a reversing JE whenever VOID_ENFORCEMENT_ENABLED was OFF
    // (orphaned A/R — $3,600 class). Bulk void MUST use action "void" → void.service.
    if (statusPayload.status === "void") {
      return {
        ok: false,
        code: "E_USE_BULK_VOID",
        message: "Use bulk action 'void' (calls void.service). set_status status=void is closed.",
      };
    }

    const updateRes = await client.query(
      `
        UPDATE accounting.invoices
        SET status = $3,
            updated_at = now(),
            updated_by_user_id = $4
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, statusPayload.status, actorUserId]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_UPDATE_FAILED", message: "Invoice status update failed" };
    }
    auditPayload.changes = buildPatchChanges({ status: statusPayload.status }, oldRow, updateRes.rows[0] as Record<string, unknown>);
    // ACCT-F100 — post on the FIRST transition into a real A/R state. Owner ruling 2026-08-03:
    // Finalize/Post OR Send, whichever comes first. Deliberately NOT on 'draft' (not yet an
    // obligation) and NOT on 'void' (posting a void would be the opposite of the intent). 'paid' and
    // 'factored' can only be reached from a sent invoice, but they are included because a status jump
    // straight to them must not leave A/R unrecorded — the poster's idempotency key makes the
    // already-posted case a no-op rather than a double-post.
    if (POSTABLE_INVOICE_STATUSES.has(String(statusPayload.status))) {
      await postInvoiceGlAndAudit(client, {
        invoiceId: id,
        operatingCompanyId,
        actorUserId,
      });
      // GO-0014 event2-silent-on-issued-invoices — this branch can land an invoice DIRECTLY on
      // sent/paid/factored (a status jump, same reasoning as the postInvoiceGlAndAudit call right
      // above it), but never called the revrec latch's Event 2 trigger at all: a load-linked invoice
      // bulk-set to an issued status here got its OTHER poster (postInvoiceGlAndAudit) but never its
      // Event 2 DR A/R / CR Unbilled JE, silently. Reuses the SAME helper invoice-send.service.ts's
      // single-invoice /send path already fires — no second A/R poster invented.
      if (oldRow.source_load_id) {
        await fireRevrecLatchOnInvoiceIssued(client as object, {
          operating_company_id: operatingCompanyId,
          source_load_id: String(oldRow.source_load_id),
          actor_user_id: actorUserId,
          invoice_id: id,
        });
      }
    }
    await enqueueTmsInvoicePushRequested(pushClient, {
      operating_company_id: operatingCompanyId,
      invoice_id: id,
      operation: "update",
    });
  } else if (action === "void") {
    return voidInvoiceInBulk(ctx as BulkPerEntityContext<Record<string, unknown>>, ctx.actorRole);
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
    // ACCT-F100 — the SEND arm of the same ruling. Same idempotent poster as the single-invoice send
    // path (invoice-send.service.ts), so a bulk mark-sent of already-finalized invoices posts each
    // exactly once.
    await postInvoiceGlAndAudit(client, { invoiceId: id, operatingCompanyId, actorUserId });
    // GO-0014 event2-silent-on-issued-invoices — this is the bulk counterpart of
    // invoice-send.service.ts's single-invoice /send path, which already fires revrec Event 2 on
    // issuance (OWNER DECISION B). This action reaches the exact same draft->sent transition through
    // a separate writer and never called it, so a bulk-marked-sent, load-linked invoice's Event 2
    // (DR A/R / CR Unbilled) JE never posted. Reuses the SAME helper -- no second A/R poster.
    if (oldRow.source_load_id) {
      await fireRevrecLatchOnInvoiceIssued(client as object, {
        operating_company_id: operatingCompanyId,
        source_load_id: String(oldRow.source_load_id),
        actor_user_id: actorUserId,
        invoice_id: id,
      });
    }
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
    requireReasonActions: ["set_status", BATCH_VOID_ACTION],
    atomicFailStopActions: [BATCH_VOID_ACTION],
    actionRoleGate: (role, action) => {
      if (action !== BATCH_VOID_ACTION) return { ok: true };
      if (!canVoidCancel(role)) {
        return { ok: false, code: "E_FORBIDDEN", message: "Owner, Administrator, or Accountant required to void" };
      }
      return { ok: true };
    },
    actionMap: {
      set_status: setStatusPayloadSchema,
      mark_sent: markSentPayloadSchema,
      mark_factored: markFactoredPayloadSchema,
      [BATCH_VOID_ACTION]: emptyPayloadSchema,
    },
    perEntityHandler: handleInvoiceBulk,
  });
}

export default fp(async (app) => {
  await registerInvoiceBulkRoutes(app);
}, { name: "accounting.registerInvoiceBulkRoutes" });
