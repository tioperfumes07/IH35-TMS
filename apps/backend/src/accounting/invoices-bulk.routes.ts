import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { PoolClient } from "pg";
import { z } from "zod";
import { buildPatchChanges, appendCrudAudit } from "../audit/crud-audit.js";
import { postInvoiceGlIfEnabled } from "./invoice-gl.service.js";
import { appendBulkCrudAudit, registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";
import { enqueueTmsInvoicePushRequested } from "../qbo/tms-invoice-push-chain.service.js";
import { recomputeInvoiceTotals } from "./shared.js";
import {
  auditVoid,
  isVoidEnforcementEnabled,
  pgDateColumnToIsoDay,
  postVoidReversal,
  type VoidReversalResult,
} from "./void.service.js";

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

// void.service.ts's QueryableClient is a generic `query<T>` (not exported); ctx.client's bulk-factory type
// is non-generic (`rows: unknown[]`), so it isn't structurally assignable without a cast. Mirrors the
// `as unknown as <ClientType>` pattern already used elsewhere in this codebase for the same shape gap
// (e.g. bills-bulk.routes.ts's `client as unknown as BillMutationClient` for ACCT-F5634).
type VoidQueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
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

    // ACCT-F5638 — this branch used to flip an invoice to 'void' with NO GL reversal call at all: the
    // THIRD independent invoice-void writer in the backend (alongside the direct /invoices/:id/void
    // route and governance/void-cancel-executors.ts's executeInvoice, both of which correctly reverse
    // the posted JE behind isVoidEnforcementEnabled) and the only one that didn't. An invoice voided
    // through this bulk endpoint kept its original DR ar_control / CR revenue JE posted forever with no
    // reversing entry, while the invoice record itself read as cleanly voided — a silent GL-vs-subledger
    // tie-out gap (overstated A/R + revenue), not a visible failure. Reuse the SAME primitives the other
    // two writers already call (postVoidReversal / isVoidEnforcementEnabled / auditVoid from
    // void.service.js) instead of reimplementing partial GL logic, so this path can never drift from
    // them again.
    const voidClient = client as unknown as VoidQueryableClient;
    let reversal: VoidReversalResult | null = null;
    if (statusPayload.status === "void") {
      const flagOn = await isVoidEnforcementEnabled(voidClient, operatingCompanyId, actorUserId);
      if (flagOn) {
        const originalDate = pgDateColumnToIsoDay(oldRow.issue_date);
        reversal = await postVoidReversal(
          voidClient,
          {
            operatingCompanyId,
            entityType: "invoice",
            entityId: id,
            originalDate,
            memo: `Void reversal of invoice ${id}: ${reason ?? "Bulk void"}`,
          },
          { userId: actorUserId }
        );
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
    if (statusPayload.status === "void" && reversal) {
      auditPayload.reversal_journal_entry_id = reversal.reversal_journal_entry_id;
      await auditVoid(voidClient, actorUserId, "invoice", {
        operatingCompanyId,
        entityId: id,
        reason: reason ?? "Bulk void",
        reversal,
      });
    }
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
    }
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
    // ACCT-F100 — the SEND arm of the same ruling. Same idempotent poster as the single-invoice send
    // path (invoice-send.service.ts), so a bulk mark-sent of already-finalized invoices posts each
    // exactly once.
    await postInvoiceGlAndAudit(client, { invoiceId: id, operatingCompanyId, actorUserId });
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
