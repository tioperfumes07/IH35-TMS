import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isOwnerOrAdmin } from "../bulk/bulk-update.factory.js";
import { postSourceTransaction } from "../accounting/posting-engine.service.js";
import { emitDriverRequestSpineEvent } from "../driver-finance/driver-request-spine-emit.js";

type PostingResult = Awaited<ReturnType<typeof postSourceTransaction>>;

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
 * Two phases on purpose: the disbursed flip must COMMIT before the posting reads the row,
 * so buildDriverAdvanceLines (a separate pooled connection) sees disbursement_status='disbursed'.
 * The post is idempotent (posting-engine idempotency key), so a retry never double-posts.
 */
export async function disburseDriverAdvanceCore(
  actorUserUuid: string,
  actorRole: string,
  companyId: string,
  input: DisburseDriverAdvanceInput
): Promise<DriverAdvanceMutationResult> {
  if (!isOwnerOrAdmin(actorRole)) return FORBIDDEN;

  const phase1 = await withCurrentUser(actorUserUuid, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    const cur = await client.query(
      `
        SELECT id::text, disbursement_status::text, posting_date::text
        FROM driver_finance.driver_advances
        WHERE operating_company_id = $1::uuid AND id::text = $2
        LIMIT 1
        FOR UPDATE
      `,
      [companyId, input.advance_id]
    );
    const row = cur.rows[0] as { disbursement_status?: string; posting_date?: string | null } | undefined;
    if (!row) return { ok: false as const, code: 404, error: "advance_not_found" };
    if (String(row.disbursement_status ?? "") !== "approved") {
      return {
        ok: false as const,
        code: 409,
        error: "advance_not_in_approved_state",
        message: `disbursement_status=${row.disbursement_status}`,
      };
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

    return { ok: true as const, postingDate: postingDateNew };
  });

  if (!phase1.ok) return phase1;

  const posting = await postSourceTransaction(
    {
      operating_company_id: companyId,
      source_transaction_type: "driver_advance",
      source_transaction_id: input.advance_id,
      credit_account_id: input.credit_account_id ?? null,
    },
    { userId: actorUserUuid }
  );

  // B4: timeline 'posted' step — if this advance originated from a cash-advance request, link
  // the money event back to that request. Best-effort: the disbursement + GL post already
  // committed, so a timeline emit failure must not surface as a disbursement error.
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
          payload: { driver_advance_id: input.advance_id, journal_entry_id: posting.journal_entry_id },
        });
      }
    });
  } catch {
    // swallow — money already moved; timeline is best-effort post-commit.
  }

  return { ok: true, advanceId: input.advance_id, postingDate: phase1.postingDate, posting };
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
