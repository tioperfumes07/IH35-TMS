/**
 * The ONE in-transaction expense void (443.136 follow-up). POST /api/v1/expenses/:id/void and the Owner duplicate-purchase
 * repair (fuel/relay-duplicate-purchase.service.ts) both call this, so a voided expense is always: everything live for the
 * document reversed (its own 'expense' lines AND a fuel receipt's 'fuel_event' entry — ACCT-F4431310), then the ONE void
 * stamp (stampDocumentVoided: any bank line naming it released back to For review, voided_at / reason / actor / status
 * 'void', child documents cascaded), its reversing entry linked, and one audit row — atomically on the caller's client.
 * Callers own their own pre-checks (enforcement flag, role, already-void).
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { reverseExpenseDocumentInClientTx } from "./expense-void-reversal.js";
import { stampDocumentVoided } from "./void-document-stamp.service.js";
import { todayIso } from "./void.service.js";

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export async function voidExpenseDocumentInClientTx(
  client: Queryable,
  input: { operatingCompanyId: string; expenseId: string; actorUserId: string; reason: string }
): Promise<{ reversingJeId: string | null }> {
  // ACCT-F4431310 — reverse everything LIVE for this document; any reversal error propagates and the void is refused.
  const rev = await reverseExpenseDocumentInClientTx(client as never, {
    operatingCompanyId: input.operatingCompanyId,
    expenseId: input.expenseId,
    actorUserId: input.actorUserId,
    currentBusinessDate: todayIso(),
    memo: `Void reversal of expense ${input.expenseId}: ${input.reason}`,
    expenseReverser: "source",
  });
  const reversingJeId = rev.reversal_journal_entry_id;
  // R-102.1-A — the one void stamp: releases bank lines naming it (ROUND 368.2(b)), stamps it void, cascades (ROUND 138).
  await stampDocumentVoided(client as never, {
    operatingCompanyId: input.operatingCompanyId,
    family: "expense",
    documentId: input.expenseId,
    voidReason: input.reason,
    voidedByUserId: input.actorUserId,
  });
  // The reversal engine's own linkage on the header (not a void stamp column).
  await client.query(
    `UPDATE accounting.expenses
     SET posting_status = CASE WHEN posting_status='posted' THEN 'reversed' ELSE posting_status END,
         reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id), updated_at = now()
     WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
    [input.expenseId, reversingJeId, input.operatingCompanyId]
  );
  await appendCrudAudit(client as never, input.actorUserId, "expense.voided",
    { expense_id: input.expenseId, reversing_journal_entry_id: reversingJeId, reason: input.reason }, "warning");
  return { reversingJeId };
}
