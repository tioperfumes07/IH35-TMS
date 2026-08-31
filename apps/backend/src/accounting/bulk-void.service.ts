/**
 * Shared bulk-void helpers — VOID LAW center (owner 2026-09-01).
 *
 * MUST call void.service / atomic void writers per row.
 * MUST NOT flip status via set_status without reversal.
 * Fail-stop = entire batch rolls back on first error (atomicFailStop on bulk factory).
 */

import { buildPatchChanges, appendCrudAudit } from "../audit/crud-audit.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import {
  auditVoid,
  pgDateColumnToIsoDay,
  postVoidReversal,
  type VoidReversalResult,
} from "./void.service.js";

export const BATCH_VOID_ACTION = "void" as const;

type VoidQueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export function assertBatchVoidActorRole(role: string | null | undefined): BulkPerEntityResult | null {
  if (!canVoidCancel(String(role ?? ""))) {
    return {
      ok: false,
      code: "E_FORBIDDEN",
      message: "Owner, Administrator, or Accountant required to void",
    };
  }
  return null;
}

/**
 * Invoice bulk void — always posts reversing JE via postVoidReversal (never bare status flip).
 */
export async function voidInvoiceInBulk(
  ctx: BulkPerEntityContext<Record<string, unknown>>,
  actorRole: string | null | undefined
): Promise<BulkPerEntityResult> {
  const denied = assertBatchVoidActorRole(actorRole);
  if (denied) return denied;

  const { id, reason, operatingCompanyId, actorUserId, bulkCallId, client } = ctx;
  if (!reason || reason.trim().length < 10) {
    return { ok: false, code: "E_REASON_REQUIRED", message: "reason must be at least 10 characters" };
  }

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
  if (!oldRow) return { ok: false, code: "E_NOT_FOUND", message: "Invoice not found" };
  if (String(oldRow.status) === "paid") {
    return { ok: false, code: "E_STATE_INVALID", message: "Paid invoice cannot be voided" };
  }
  if (String(oldRow.status) === "void" || oldRow.voided_at) {
    return { ok: false, code: "E_ALREADY_VOID", message: "Invoice is already void" };
  }

  const voidClient = client as unknown as VoidQueryableClient;
  const originalDate = pgDateColumnToIsoDay(oldRow.issue_date);
  let reversal: VoidReversalResult;
  try {
    reversal = await postVoidReversal(
      voidClient,
      {
        operatingCompanyId,
        entityType: "invoice",
        entityId: id,
        originalDate,
        memo: `Void reversal of invoice ${id}: ${reason.trim()}`,
      },
      { userId: actorUserId }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "void_reversal_failed";
    return { ok: false, code: "E_VOID_REVERSAL", message };
  }

  const updateRes = await client.query(
    `
      UPDATE accounting.invoices
      SET status = 'void',
          voided_at = COALESCE(voided_at, now()),
          void_reason = $3,
          updated_at = now(),
          updated_by_user_id = $4
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      RETURNING *
    `,
    [id, operatingCompanyId, reason.trim(), actorUserId]
  );
  if (updateRes.rows.length === 0) {
    return { ok: false, code: "E_UPDATE_FAILED", message: "Invoice void update failed" };
  }

  await auditVoid(voidClient, actorUserId, "invoice", {
    operatingCompanyId,
    entityId: id,
    reason: reason.trim(),
    reversal,
  });

  const auditPayload: Record<string, unknown> = {
    resource_id: id,
    resource_type: "accounting.invoices",
    operating_company_id: operatingCompanyId,
    reason: reason.trim(),
    reversal_journal_entry_id: reversal.reversal_journal_entry_id,
    changes: buildPatchChanges({ status: "void" }, oldRow, updateRes.rows[0] as Record<string, unknown>),
  };
  await appendCrudAudit(client, actorUserId, "invoice.bulk_void", { ...auditPayload, bulk_call_id: bulkCallId }, "warning");

  return { ok: true };
}

/**
 * Customer payment bulk void — same writes as POST /payments/:id/void (FOR UPDATE + unapply + postVoidReversal).
 */
export async function voidCustomerPaymentInBulk(
  ctx: BulkPerEntityContext<Record<string, unknown>>,
  actorRole: string | null | undefined,
  opts: {
    emitSpine: (args: {
      client: VoidQueryableClient;
      operatingCompanyId: string;
      actorUserId: string;
      paymentId: string;
      voidReason: string;
    }) => Promise<void>;
  }
): Promise<BulkPerEntityResult> {
  const denied = assertBatchVoidActorRole(actorRole);
  if (denied) return denied;

  const { id, reason, operatingCompanyId, actorUserId, bulkCallId, client } = ctx;
  if (!reason || reason.trim().length < 10) {
    return { ok: false, code: "E_REASON_REQUIRED", message: "reason must be at least 10 characters" };
  }

  const voidClient = client as unknown as VoidQueryableClient;
  const paymentRes = await voidClient.query(
    `
      SELECT *,
             payment_date::text AS payment_date_iso
      FROM accounting.payments
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [id, operatingCompanyId]
  );
  const payment = paymentRes.rows[0] as Record<string, unknown> | undefined;
  if (!payment) return { ok: false, code: "E_NOT_FOUND", message: "Payment not found" };
  if (payment.voided_at) return { ok: false, code: "E_ALREADY_VOID", message: "Payment is already void" };

  const flipped = await voidClient.query(
    `
      UPDATE accounting.payments
      SET voided_at = now(),
          voided_by_user_id = $2::uuid,
          void_reason = $3
      WHERE id = $1::uuid
        AND voided_at IS NULL
      RETURNING id
    `,
    [id, actorUserId, reason.trim()]
  );
  if (flipped.rows.length === 0) {
    return { ok: false, code: "E_ALREADY_VOID", message: "Payment is already void" };
  }

  await voidClient.query(
    `UPDATE accounting.payment_applications
     SET unapplied_at = now(), unapplied_by_user_id = $2::uuid
     WHERE payment_id = $1::uuid AND unapplied_at IS NULL`,
    [id, actorUserId]
  );

  let reversal: VoidReversalResult;
  try {
    reversal = await postVoidReversal(
      voidClient,
      {
        operatingCompanyId,
        entityType: "customer_payment",
        entityId: id,
        originalDate: pgDateColumnToIsoDay(
          (payment.payment_date_iso as string | null | undefined) ?? payment.payment_date
        ),
        memo: `Void reversal: payment ${String(payment.display_id ?? id)}`,
      },
      { userId: actorUserId }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "void_reversal_failed";
    return { ok: false, code: "E_VOID_REVERSAL", message };
  }

  await appendCrudAudit(
    client,
    actorUserId,
    "accounting.payment_voided",
    {
      resource_type: "accounting.payments",
      resource_id: id,
      operating_company_id: operatingCompanyId,
      void_reason: reason.trim(),
      reversal_journal_entry_id: reversal.reversal_journal_entry_id,
      reversal_date: reversal.reversal_date,
      closed_period_reversal: reversal.closed_period_reversal,
      reversed_line_count: reversal.reversed_line_count,
      bulk_call_id: bulkCallId,
    },
    "warning",
    "P3-T11.20.3-PAYMENT-RECORDING"
  );

  await opts.emitSpine({
    client: voidClient,
    operatingCompanyId,
    actorUserId,
    paymentId: id,
    voidReason: reason.trim(),
  });

  return { ok: true };
}

/**
 * Bill payment bulk void — voidBillInClientTx sibling (voidBillPaymentInClientTx).
 */
export async function voidBillPaymentInBulk(
  ctx: BulkPerEntityContext<Record<string, unknown>>,
  actorRole: string | null | undefined,
  voidBillPaymentInClientTx: (
    client: unknown,
    input: {
      operatingCompanyId: string;
      paymentId: string;
      reason: string;
      userId: string;
      currentBusinessDate: string;
    }
  ) => Promise<{ reversal_journal_entry_id?: string | null }>,
  currentBusinessDate: string
): Promise<BulkPerEntityResult> {
  const denied = assertBatchVoidActorRole(actorRole);
  if (denied) return denied;

  const { id, reason, operatingCompanyId, actorUserId, client } = ctx;
  if (!reason || reason.trim().length < 10) {
    return { ok: false, code: "E_REASON_REQUIRED", message: "reason must be at least 10 characters" };
  }

  try {
    await voidBillPaymentInClientTx(client, {
      operatingCompanyId,
      paymentId: id,
      reason: reason.trim(),
      userId: actorUserId,
      currentBusinessDate,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "bill_payment_void_failed";
    if (message === "bill_payment_not_found") return { ok: false, code: "E_NOT_FOUND", message: "Bill payment not found" };
    if (message === "bill_payment_already_voided") {
      return { ok: false, code: "E_ALREADY_VOID", message: "Bill payment is already void" };
    }
    if (message === "bill_not_found") return { ok: false, code: "E_NOT_FOUND", message: "Bill not found" };
    return { ok: false, code: "E_VOID_FAILED", message };
  }
}
