/**
 * Expenses bulk void — always reverses via posting-engine + header flip (same as single /void).
 * Fail-stop. Never set_status.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { appendBulkCrudAudit, registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";
import { PostingEngineError, reversePostedSourceTransactionInClientTx } from "./posting-engine.service.js";
import { BATCH_VOID_ACTION } from "./bulk-void.service.js";
import { todayIso } from "./void.service.js";

const emptyPayloadSchema = z.object({}).default({});

async function handleExpenseBulk(ctx: BulkPerEntityContext<Record<string, unknown>>): Promise<BulkPerEntityResult> {
  const { id, action, reason, operatingCompanyId, actorUserId, bulkCallId, client, actorRole } = ctx;
  if (action !== BATCH_VOID_ACTION) {
    return { ok: false, code: "E_UNKNOWN_ACTION", message: `Unknown action: ${action}` };
  }
  if (!canVoidCancel(String(actorRole ?? ""))) {
    return { ok: false, code: "E_FORBIDDEN", message: "Owner, Administrator, or Accountant required to void" };
  }
  if (!reason || reason.trim().length < 10) {
    return { ok: false, code: "E_REASON_REQUIRED", message: "reason must be at least 10 characters" };
  }

  const oldRes = await client.query(
    `
      SELECT id::text, status, posting_status
      FROM accounting.expenses
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [id, operatingCompanyId]
  );
  const old = oldRes.rows[0] as { id: string; status: string; posting_status: string } | undefined;
  if (!old) return { ok: false, code: "E_NOT_FOUND", message: "Expense not found" };
  if (old.status === "void" || old.posting_status === "reversed") {
    return { ok: false, code: "E_ALREADY_VOID", message: "Expense is already void" };
  }

  let reversingJeId: string | null = null;
  try {
    if (old.posting_status === "posted") {
      const rev = await reversePostedSourceTransactionInClientTx(
        client as never,
        {
          operating_company_id: operatingCompanyId,
          source_transaction_type: "expense",
          source_transaction_id: id,
        },
        { userId: actorUserId },
        todayIso()
      );
      reversingJeId = rev.journal_entry_id;
    }
  } catch (err) {
    if (err instanceof PostingEngineError) {
      return { ok: false, code: err.code, message: err.message };
    }
    const message = err instanceof Error ? err.message : "expense_void_failed";
    return { ok: false, code: "E_VOID_REVERSAL", message };
  }

  await client.query(
    `
      UPDATE accounting.expenses
      SET status = 'void',
          posting_status = CASE WHEN posting_status = 'posted' THEN 'reversed' ELSE posting_status END,
          reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
          voided_at = now(),
          voided_by_user_id = $3::uuid,
          void_reason = $4,
          updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $5::uuid
    `,
    [id, reversingJeId, actorUserId, reason.trim(), operatingCompanyId]
  );

  await appendCrudAudit(
    client,
    actorUserId,
    "expense.voided",
    {
      expense_id: id,
      reversing_journal_entry_id: reversingJeId,
      reason: reason.trim(),
      bulk_call_id: bulkCallId,
    },
    "warning"
  );
  await appendBulkCrudAudit(client, actorUserId, "expense", BATCH_VOID_ACTION, bulkCallId, {
    resource_id: id,
    resource_type: "accounting.expenses",
    operating_company_id: operatingCompanyId,
    reason: reason.trim(),
    reversing_journal_entry_id: reversingJeId,
  });

  return { ok: true };
}

export async function registerExpenseBulkRoutes(app: FastifyInstance) {
  registerBulkRoute({
    app,
    path: "/api/v1/accounting/expenses/bulk-update",
    domain: "accounting",
    resource: "expenses",
    entityType: "expense",
    requireReasonActions: [BATCH_VOID_ACTION],
    atomicFailStopActions: [BATCH_VOID_ACTION],
    actionRoleGate: (role, action) => {
      if (action !== BATCH_VOID_ACTION) return { ok: true };
      if (!canVoidCancel(role)) {
        return { ok: false, code: "E_FORBIDDEN", message: "Owner, Administrator, or Accountant required to void" };
      }
      return { ok: true };
    },
    actionMap: {
      [BATCH_VOID_ACTION]: emptyPayloadSchema,
    },
    perEntityHandler: handleExpenseBulk,
  });
}

export default fp(
  async (app) => {
    await registerExpenseBulkRoutes(app);
  },
  { name: "accounting.registerExpenseBulkRoutes" }
);
