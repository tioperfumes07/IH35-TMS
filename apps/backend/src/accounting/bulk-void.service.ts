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
