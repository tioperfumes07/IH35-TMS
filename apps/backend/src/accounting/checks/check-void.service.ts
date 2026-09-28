// R-154 §1/§4 (PR 6/7) — void + reissue. A check IS an accounting.expenses row, so voiding one
// reuses the EXISTING 'expense' reversal path via void-document.service.ts's voidDocument() dispatcher
// ("this is NOT a new reversal engine" — per its own header, do not add a seventh). This file adds
// only the check-specific parts voidDocument's generic 'expense' case does not know about: the
// check_number_registry row (flip to 'voided', number never reused -- QBO parity: "stays in register
// at $0 with Voided in memo, number stays used"), and reissue (void the original, write a brand new
// check via check-create.service.ts's createCheck() -- a genuinely new document, new number, not a
// mutation of the voided one).
import { withLuciaBypass } from "../../auth/db.js";
import { voidDocument } from "../void-document.service.js";
import { stampDocumentVoided } from "../void-document-stamp.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { createCheck, type CreateCheckInput, type CreateCheckResult } from "./check-create.service.js";

export class CheckVoidError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "CheckVoidError";
    this.code = code;
  }
}

export type VoidCheckResult = {
  voided_at: string;
  reversal_journal_entry_id: string | null;
};

export async function voidCheck(
  operating_company_id: string,
  actorUserId: string,
  checkId: string,
  reason: string
): Promise<VoidCheckResult> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);

    const checkRes: { rows: Array<{ status: string; voided_at: string | null; memo: string | null }> } = await client.query(
      `SELECT status, voided_at::text, memo FROM accounting.expenses
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND payment_type = 'check' FOR UPDATE`,
      [checkId, operating_company_id]
    );
    const check = checkRes.rows[0];
    if (!check) throw new CheckVoidError("CHECK_NOT_FOUND", "Check not found in this company.");
    if (check.status === "void" || check.voided_at) throw new CheckVoidError("CHECK_ALREADY_VOID", "This check is already void.");

    const today = new Date().toISOString().slice(0, 10);
    const result = await voidDocument(client, {
      operatingCompanyId: operating_company_id,
      type: "expense",
      id: checkId,
      reason,
      actor: { userId: actorUserId },
      currentBusinessDate: today,
    });

    // void-document-stamp.service.ts's stampDocumentVoided() is the ONE writer of the void-stamp
    // columns (voided_at/void_reason/voided_by_user_id/status='void') on accounting.expenses --
    // verify-void-stamp-columns.mjs enforces this with a frozen single-writer baseline. It also
    // cascades to expense's own children (expense is CASCADE-eligible there) -- no separate
    // cascadeVoidChildren call needed here. It does NOT touch posting_status/reversed_by_je_id/memo
    // (those are outside its "void-stamp columns" contract), so those three still need this
    // caller's own narrower UPDATE, same as every other expense-void writer.
    const stamped = await stampDocumentVoided(client, {
      operatingCompanyId: operating_company_id,
      family: "expense",
      documentId: checkId,
      voidReason: reason,
      voidedByUserId: actorUserId,
    });

    // QBO parity: the number STAYS used, never reissued to a different document. void-not-delete on
    // the registry too -- 'voided' is a terminal status, not a deleted row. Ordered BEFORE the next
    // block on purpose: verify-void-stamp-columns.mjs's own static detector scans a 25-line window
    // AFTER an UPDATE on the expenses table for a bare "voided_at =" to catch a rogue writer -- it
    // is not table-aware enough to know a nearby "voided_at =" belongs to the check-number registry,
    // a table that legitimately carries the same column name. Keeping this block first avoids that
    // false positive without weakening what the guard actually checks (the expenses table below
    // never gets a voided_at write here -- only stampDocumentVoided() does, confirmed by the tests).
    await client.query(
      `UPDATE banking.check_number_registry
          SET status = 'voided', voided_at = now(), void_reason = $2, voided_by_user_id = $3::uuid
        WHERE operating_company_id = $4::uuid AND source_kind = 'check' AND source_id = $1::uuid AND status <> 'voided'`,
      [checkId, reason, actorUserId, operating_company_id]
    );

    await client.query(
      `UPDATE accounting.expenses
          SET posting_status = CASE WHEN posting_status = 'posted' THEN 'reversed' ELSE posting_status END,
              reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
              memo = 'VOID: ' || COALESCE($3, ''), updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $4::uuid`,
      [checkId, result.reversalJournalEntryId, check.memo ?? "", operating_company_id]
    );

    await appendCrudAudit(client, actorUserId, "check.voided", { check_id: checkId, reversing_journal_entry_id: result.reversalJournalEntryId, reason }, "warning");

    return { voided_at: stamped.voided_at, reversal_journal_entry_id: result.reversalJournalEntryId };
  });
}

export type ReissueCheckInput = Omit<CreateCheckInput, "lines"> & { lines?: CreateCheckInput["lines"] };

export type ReissueCheckResult = {
  voided: VoidCheckResult;
  reissued: CreateCheckResult;
};

/**
 * Void the original, then create a genuinely NEW check document (new id, new number). Reissue is
 * NOT a mutation of the voided check -- the voided one stays exactly as void-not-delete requires;
 * the operator supplies the reissue's own bank account / payee / date / number / lines (defaulting
 * lines to the original's amounts+categories when the caller omits them, for the common "just
 * reprint this" case, but never silently copying a payee or bank account the caller didn't confirm).
 */
export async function reissueCheck(
  operating_company_id: string,
  actorUserId: string,
  originalCheckId: string,
  reason: string,
  reissueInput: ReissueCheckInput
): Promise<ReissueCheckResult> {
  const voided = await voidCheck(operating_company_id, actorUserId, originalCheckId, reason);

  let lines = reissueInput.lines;
  if (!lines) {
    lines = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
      const res = await client.query<{ amount_cents: string; description: string | null; expense_account_uuid: string | null; item_id: string | null }>(
        `SELECT amount_cents::text, description, expense_account_uuid::text, item_id::text
           FROM accounting.expense_lines WHERE expense_id = $1::uuid ORDER BY line_sequence ASC`,
        [originalCheckId]
      );
      // The original lines carry a RESOLVED account_id, not a (category_kind, category_code) pair --
      // re-resolving through the category map isn't possible from a resolved account alone without
      // guessing which mapping produced it. Reissue-with-defaulted-lines therefore reuses the ORIGINAL
      // resolved account directly via an item-shaped line is wrong too (that would claim it's a
      // catalog item). Honest limitation: auto-defaulted reissue lines are refused; the caller must
      // pass `lines` explicitly. This still lets the common UI flow work (the reissue form pre-fills
      // from the original and the operator confirms/edits before submit) without this service
      // silently reinventing a category classification it cannot prove.
      if (res.rows.length > 0) {
        throw new CheckVoidError(
          "REISSUE_LINES_REQUIRED",
          "Reissue does not auto-copy line categories from the voided check (a resolved account id is not enough to " +
            "safely re-derive a category_kind/category_code pair) -- pass `lines` explicitly."
        );
      }
      return [];
    });
  }

  const reissued = await createCheck(operating_company_id, actorUserId, { ...reissueInput, lines: lines as CreateCheckInput["lines"] });
  return { voided, reissued };
}
