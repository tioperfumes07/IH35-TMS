import { withCurrentUser } from "../auth/db.js";
import { recordLumperAdvanceExpenseInClientTx } from "./lumper-advance-expense.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isOwnerOrAdmin } from "../lib/authz/roles.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { updateBankBalance } from "../accounting/bills.service.js";
import { emitDriverRequestSpineEvent } from "../driver-finance/driver-request-spine-emit.js";
import { logger } from "../observability/structured-logger.js";
import { isEnabled } from "../lib/feature-flags/service.js";

export const DRIVER_ADVANCE_GL_POSTING_FLAG_KEY = "DRIVER_ADVANCE_GL_POSTING_ENABLED";

type PostingResult = Awaited<ReturnType<typeof postSourceTransactionInClientTx>>;

export type DisburseDriverAdvanceInput = {
  advance_id: string;
  // User-settable book date (YYYY-MM-DD). Drives the journal entry's date — cash given
  // May 25 but entered today posts with posting_date = 2026-05-25. Defaults to today.
  posting_date?: string | null;
  // Operator-chosen source/bank account credited for the cash-out. Defaults (in the engine)
  // to the company cash-like account when omitted.
  credit_account_id?: string | null;
};

export type DriverAdvanceMutationResult =
  | { ok: true; advanceId: string; postingDate: string; posting?: PostingResult }
  | { ok: false; code: number; error: string; message?: string };

const FORBIDDEN: DriverAdvanceMutationResult = { ok: false, code: 403, error: "owner_admin_only" };
const AUDIT_TAG = "B3-EMPLOYEE-LOAN-LEDGER";

/**
 * B3 — disburse a driver advance / employee loan.
 * Transitions disbursement_status 'approved' -> 'disbursed', stamps disbursed_at and the
 * user-settable posting_date, then posts the GL entry via the 'driver_advance' source type
 * (DEBIT QBO-149 receivable / CREDIT source cash). Role-gated to Owner/Administrator
 * (reuses isOwnerOrAdmin); the posting_date set is audited (old/new) via appendCrudAudit.
 *
 * GL-posting is gated per entity by DRIVER_ADVANCE_GL_POSTING_ENABLED (default OFF). When the
 * flag is OFF for the entity/user, the advance is still disbursed but the GL post is skipped
 * (no-op), leaving the advance unposted until the flag is enabled. This mirrors the expense and
 * other money-posting kill-switches.
 *
 * BCF-01: the disbursement UPDATE and the GL post run in ONE atomic transaction — disburse + post
 * or nothing. buildDriverAdvanceLines uses the same client (see ACCT-F2026092584 comment in
 * posting-engine.service.ts), so it sees the UPDATE within the same transaction without a
 * separate committed read. Retry is idempotent: the advance must be in 'approved' state to
 * proceed; a prior failed attempt that rolled back leaves the row in 'approved' and a retry
 * will succeed cleanly.
 */
export async function disburseDriverAdvanceCore(
  actorUserUuid: string,
  actorRole: string,
  companyId: string,
  input: DisburseDriverAdvanceInput
): Promise<DriverAdvanceMutationResult> {
  // B5: the role gate applies to BACK-DATING only. Any authorized approver (the approve route
  // already gates who may approve) may disburse at today's date; setting an explicit
  // posting_date (back-dating) requires Owner/Administrator.
  if (input.posting_date != null && !isOwnerOrAdmin(actorRole)) return FORBIDDEN;

  // BCF-01: single atomic transaction — disburse + post or nothing.
  const result = await withCurrentUser(actorUserUuid, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    const cur = await client.query(
      `
        SELECT id::text, disbursement_status::text, posting_date::text, amount::text, from_bank_account_id::text, purpose::text AS purpose
        FROM driver_finance.driver_advances
        WHERE operating_company_id = $1::uuid AND id::text = $2
        LIMIT 1
        FOR UPDATE
      `,
      [companyId, input.advance_id]
    );
    const row = cur.rows[0] as
      | { disbursement_status?: string; posting_date?: string | null; amount?: string; from_bank_account_id?: string | null; purpose?: string | null }
      | undefined;
    if (!row) return { ok: false as const, code: 404, error: "advance_not_found" };
    if (String(row.disbursement_status ?? "") !== "approved") {
      return {
        ok: false as const,
        code: 409,
        error: "advance_not_in_approved_state",
        message: `disbursement_status=${row.disbursement_status}`,
      };
    }
    // LEAD 443.184 G15 — a lumper advance IS the load's lumper expense at disbursement; with GL posting off it would be
    // disbursed with no expense (the old silent skip). Refused before anything is written.
    if (String(row.purpose ?? "") === "lumper") {
      const gl = await isEnabled(client, DRIVER_ADVANCE_GL_POSTING_FLAG_KEY, { operating_company_id: companyId, user_uuid: actorUserUuid });
      if (!gl) {
        return {
          ok: false as const,
          code: 409,
          error: "lumper_advance_requires_gl_posting",
          message: "A lumper advance posts as the load's lumper expense when disbursed — turn on DRIVER_ADVANCE_GL_POSTING_ENABLED for this company.",
        };
      }
    }
    const postingDateOld = (row.posting_date as string | null) ?? null;

    const upd = await client.query(
      `
        UPDATE driver_finance.driver_advances
        SET disbursement_status = 'disbursed',
            disbursed_at = now(),
            posting_date = COALESCE($3::date, CURRENT_DATE),
            updated_at = now()
        WHERE operating_company_id = $1::uuid AND id::text = $2
        RETURNING posting_date::text AS posting_date
      `,
      [companyId, input.advance_id, input.posting_date ?? null]
    );
    const postingDateNew = String((upd.rows[0] as { posting_date?: string })?.posting_date ?? "");

    await appendCrudAudit(
      client,
      actorUserUuid,
      "driver_advance.posting_date_set",
      {
        resource_type: "driver_finance.driver_advances",
        resource_id: input.advance_id,
        operating_company_id: companyId,
        posting_date_old: postingDateOld,
        posting_date_new: postingDateNew,
      },
      "info",
      AUDIT_TAG
    );

    const glPostingEnabled = await isEnabled(client, DRIVER_ADVANCE_GL_POSTING_FLAG_KEY, {
      operating_company_id: companyId,
      user_uuid: actorUserUuid,
    });

    if (!glPostingEnabled) {
      // Flag OFF: disbursement committed with this tx, GL post is a no-op.
      return { ok: true as const, postingDate: postingDateNew, posting: undefined as PostingResult | undefined, fromBankAccountId: row.from_bank_account_id ?? null, amountCents: Math.round(Number(row.amount ?? "0") * 100) };
    }

    // ACCT-F358 — bank-cache decrement is ATOMIC with the JE post, same shape as payBill's
    // "GUARD 2026-07-11" comment: the bank-balance cache and the GL cash account are separate
    // stores, so recording -amount in both is cache coherence, not double counting, and a
    // posting failure rolls back the decrement with it — bank and GL can never diverge.
    // Only decrement when the advance names its own bank AND the caller did not override the
    // credit account at disbursement time.
    if (!input.credit_account_id && row.from_bank_account_id) {
      await updateBankBalance(client, companyId, row.from_bank_account_id, -Math.abs(Math.round(Number(row.amount ?? "0") * 100)));
    }

    const posting = await postSourceTransactionInClientTx(
      client,
      {
        operating_company_id: companyId,
        source_transaction_type: "driver_advance",
        source_transaction_id: input.advance_id,
        credit_account_id: input.credit_account_id ?? null,
      },
      { userId: actorUserUuid }
    );
    // LEAD 443.128 A — a lumper advance is the load's lumper expense (and, billable, its invoice line), in this transaction.
    await recordLumperAdvanceExpenseInClientTx(client, { operatingCompanyId: companyId, advanceId: input.advance_id, actorUserId: actorUserUuid });

    return { ok: true as const, postingDate: postingDateNew, posting, fromBankAccountId: row.from_bank_account_id ?? null, amountCents: Math.round(Number(row.amount ?? "0") * 100) };
  });

  if (!result.ok) return result;

  // B4: timeline 'posted' step — if this advance originated from a cash-advance request, link
  // the money event back to that request. Best-effort: the disbursement + GL post already
  // committed, so a timeline emit failure must not surface as a disbursement error.
  const committedPosting = result.posting;
  if (committedPosting) {
    try {
      await withCurrentUser(actorUserUuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
        const reqRes = await client.query(
          `
            SELECT id::text
            FROM driver_finance.cash_advance_requests
            WHERE operating_company_id = $1::uuid AND linked_advance_id = $2::uuid
            LIMIT 1
          `,
          [companyId, input.advance_id]
        );
        const requestId = (reqRes.rows[0] as { id?: string } | undefined)?.id;
        if (requestId) {
          await emitDriverRequestSpineEvent(client, "posted", {
            operating_company_id: companyId,
            request_id: requestId,
            request_type: "cash_advance",
            source_table: "driver_finance.cash_advance_requests",
            actor_type: "user",
            actor_user_id: actorUserUuid,
            actor_role: actorRole,
            payload: {
              driver_advance_id: input.advance_id,
              journal_entry_id: committedPosting.journal_entry_id,
              gl_posting_enabled: true,
            },
          });
        }
      });
    } catch (err) {
      // Money already moved; the timeline emit is best-effort post-commit, so a failure must NOT
      // surface as a disbursement error. But it must NOT vanish silently either (SWL-1) — log it
      // with context so a lost audit-spine event is visible/alertable.
      logger.warn("spine_emit_driver_advance_posted_failed", {
        err: err instanceof Error ? err.message : String(err),
        company_id: companyId,
        driver_advance_id: input.advance_id,
        journal_entry_id: committedPosting.journal_entry_id,
      });
    }
  }

  return { ok: true, advanceId: input.advance_id, postingDate: result.postingDate, posting: committedPosting };
}

/**
 * B3 — correct a driver advance's posting_date BEFORE disbursement. Role-gated to
 * Owner/Administrator; audited (old/new). Locked once disbursed (the posted journal entry's
 * date is immutable without a reversal), returning 409 rather than letting the books diverge.
 */
export async function editDriverAdvancePostingDate(
  actorUserUuid: string,
  actorRole: string,
  companyId: string,
  input: { advance_id: string; posting_date: string }
): Promise<DriverAdvanceMutationResult> {
  if (!isOwnerOrAdmin(actorRole)) return FORBIDDEN;

  return withCurrentUser(actorUserUuid, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    const cur = await client.query(
      `
        SELECT disbursement_status::text, posting_date::text
        FROM driver_finance.driver_advances
        WHERE operating_company_id = $1::uuid AND id::text = $2
        LIMIT 1
        FOR UPDATE
      `,
      [companyId, input.advance_id]
    );
    const row = cur.rows[0] as { disbursement_status?: string; posting_date?: string | null } | undefined;
    if (!row) return { ok: false, code: 404, error: "advance_not_found" };
    if (String(row.disbursement_status ?? "") !== "approved") {
      return {
        ok: false,
        code: 409,
        error: "posting_date_locked_after_disbursement",
        message: `disbursement_status=${row.disbursement_status}`,
      };
    }
    const postingDateOld = (row.posting_date as string | null) ?? null;

    const upd = await client.query(
      `
        UPDATE driver_finance.driver_advances
        SET posting_date = $3::date, updated_at = now()
        WHERE operating_company_id = $1::uuid AND id::text = $2
        RETURNING posting_date::text AS posting_date
      `,
      [companyId, input.advance_id, input.posting_date]
    );
    const postingDateNew = String((upd.rows[0] as { posting_date?: string })?.posting_date ?? "");

    await appendCrudAudit(
      client,
      actorUserUuid,
      "driver_advance.posting_date_changed",
      {
        resource_type: "driver_finance.driver_advances",
        resource_id: input.advance_id,
        operating_company_id: companyId,
        posting_date_old: postingDateOld,
        posting_date_new: postingDateNew,
      },
      "info",
      AUDIT_TAG
    );

    return { ok: true, advanceId: input.advance_id, postingDate: postingDateNew };
  });
}
