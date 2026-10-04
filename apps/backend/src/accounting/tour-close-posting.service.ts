// ACC-50 — "Open tour posts nothing" (LAW §2, ROUND 5). Half 2 of the ticket: when a tour closes
// (its settlement leaves the open statuses), every expense/bill that was held for one of the
// tour's loads posts in ONE batch, through the SAME engine the create/manual-post paths already
// use — postSourceTransaction (expenses) and postBillGlIfEnabled (bills). No new posting math is
// introduced here; this only decides WHEN the existing call happens.
//
// postSourceTransaction takes its OWN pool connection and its OWN transaction (documented on the
// function itself) — it must never be called from inside an already-open caller transaction, the
// same reason expenses.routes.ts's create-path calls it only AFTER its own creation transaction
// has committed and returned. This module therefore opens its own withCompanyScope reads rather
// than accepting the settlement-approve handler's client, and is invoked AFTER that handler's own
// transaction has committed.
import { postSourceTransaction, PostingEngineError } from "./posting-engine.service.js";
import { postBillGlIfEnabled } from "./bill-gl.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCompanyScope } from "./shared.js";
import { isLoadTourOpen } from "./tour-open-gate.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { randomUUID } from "node:crypto";

// The one expense GL-posting flag key, shared by every expense-GL call site (accounting/expense-gl-posting-flag.ts).
import { EXPENSE_GL_POSTING_FLAG_KEY } from "./expense-gl-posting-flag.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type TourClosePostingResult = {
  expenses_posted: string[];
  expenses_still_held: string[];
  bills_posted: string[];
  bills_still_held: string[];
};

const EMPTY_RESULT: TourClosePostingResult = { expenses_posted: [], expenses_still_held: [], bills_posted: [], bills_still_held: [] };

/**
 * Called right after a tour's settlement leaves the open statuses (settlements-mvp.routes.ts's
 * approve handler, once its own transaction has committed). `loadIds` is every load
 * driver_finance.driver_bills/settlement_lines bookend to this settlement
 * (tour-open-gate.service.ts's loadIdsForSettlement). Re-checks isLoadTourOpen per load before
 * posting anything — a defensive re-verify, never trusted blindly, in case one of the load's
 * driver_bills is still linked to a DIFFERENT, still-open settlement.
 */
export async function postHeldDocumentsForClosedTour(
  operatingCompanyId: string,
  loadIds: string[],
  actor: { userId: string }
): Promise<TourClosePostingResult> {
  if (loadIds.length === 0) return EMPTY_RESULT;

  const closedLoadIds = await withCompanyScope(actor.userId, operatingCompanyId, async (client: DbClient) => {
    const open = new Set<string>();
    for (const loadId of loadIds) {
      if (await isLoadTourOpen(client, operatingCompanyId, loadId)) open.add(loadId);
    }
    return loadIds.filter((id) => !open.has(id));
  });
  if (closedLoadIds.length === 0) return EMPTY_RESULT;

  const heldExpenses = await withCompanyScope(actor.userId, operatingCompanyId, (client: DbClient) =>
    client.query<{ id: string; payment_account_uuid: string | null; vendor_uuid: string | null }>(
      `
        SELECT id::text, payment_account_uuid::text, vendor_uuid::text
        FROM accounting.expenses
        WHERE operating_company_id = $1::uuid
          AND posting_status = 'unposted'
          AND posting_hold_reason = 'tour_open'
          AND status <> 'void'
          AND load_id = ANY($2::uuid[])
      `,
      [operatingCompanyId, closedLoadIds]
    )
  );

  const result: TourClosePostingResult = { expenses_posted: [], expenses_still_held: [], bills_posted: [], bills_still_held: [] };

  // SETL-GATE-01 — every postSourceTransaction() call site must honor its per-entity posting flag
  // (verify-all-posting-paths-gated.mjs). This batch runs unconditionally once a tour closes, so the
  // flag is checked ONCE up front (it cannot change mid-loop) rather than per expense — matches
  // expenses.routes.ts's own explicit "Post to GL" gate: when OFF, every held expense simply stays
  // held (posting_hold_reason stays 'tour_open'), exactly the flag-OFF no-op every other expense-GL
  // posting call site already implements. Bills are unaffected — postBillGlIfEnabled below already
  // gates itself internally.
  const expensePostingEnabled =
    heldExpenses.rows.length === 0
      ? false
      : await withCompanyScope(actor.userId, operatingCompanyId, (client: DbClient) =>
          isEnabled(client as never, EXPENSE_GL_POSTING_FLAG_KEY, { operating_company_id: operatingCompanyId, user_uuid: actor.userId })
        );

  for (const expense of heldExpenses.rows) {
    if (!expensePostingEnabled) {
      // Flag OFF — no-op, same as every other expense-GL posting call site. Stays held.
      result.expenses_still_held.push(expense.id);
      continue;
    }
    if (!expense.payment_account_uuid && !expense.vendor_uuid) {
      // orphan guard, same as the manual /:id/post gate — never invent a payee to force a post.
      result.expenses_still_held.push(expense.id);
      continue;
    }
    try {
      const posting = await postSourceTransaction(
        { operating_company_id: operatingCompanyId, source_transaction_type: "expense", source_transaction_id: expense.id },
        actor
      );
      await withCompanyScope(actor.userId, operatingCompanyId, async (client: DbClient) => {
        await client.query(
          // ROOT CAUSE FIX (Lead finding, 2026-09-26): status must move with posting_status -- see
          // expenses.routes.ts's sister UPDATEs for the full note. Same defect, same table, third
          // independent writer.
          `UPDATE accounting.expenses
              SET status='posted', posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, posting_hold_reason=NULL, updated_at=now()
            WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
          [expense.id, posting.journal_entry_id, operatingCompanyId]
        );
        await appendCrudAudit(
          client,
          actor.userId,
          "expense.posted",
          { expense_id: expense.id, journal_entry_id: posting.journal_entry_id, source: "tour_close_batch" },
          "info"
        );
      });
      result.expenses_posted.push(expense.id);
    } catch (err) {
      if (!(err instanceof PostingEngineError)) throw err;
      result.expenses_still_held.push(expense.id);
    }
  }

  // BILLS — held rows with at least one line on one of these now-closed loads (and no OTHER line
  // still pointing at a genuinely open tour — postBillGlIfEnabled's own re-check enforces that).
  const heldBills = await withCompanyScope(actor.userId, operatingCompanyId, (client: DbClient) =>
    client.query<{ id: string }>(
      `
        SELECT DISTINCT b.id::text
        FROM accounting.bills b
        JOIN accounting.bill_lines bl ON bl.bill_id = b.id AND bl.voided_at IS NULL
        WHERE b.operating_company_id = $1::uuid
          AND b.posting_hold_reason = 'tour_open'
          AND b.voided_at IS NULL
          AND bl.load_id = ANY($2::uuid[])
      `,
      [operatingCompanyId, closedLoadIds]
    )
  );

  for (const bill of heldBills.rows) {
    const outcome = await postBillGlIfEnabled(operatingCompanyId, bill.id, actor);
    if (outcome.posted) {
      await withCompanyScope(actor.userId, operatingCompanyId, (client: DbClient) =>
        client.query(
          `UPDATE accounting.bills SET posting_hold_reason=NULL, updated_at=now() WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
          [bill.id, operatingCompanyId]
        )
      );
      result.bills_posted.push(bill.id);
    } else {
      result.bills_still_held.push(bill.id);
    }
  }

  return result;
}

export type HeldExpenseRetryOutcome = "posted" | "still_held_orphan" | "still_held_posting_error" | "flag_off";

export type HeldExpenseRetryResult = {
  posting_batch_id: string;
  outcomes: Array<{ expense_id: string; outcome: HeldExpenseRetryOutcome; journal_entry_id: string | null; hold_reason: string | null }>;
};

/**
 * ROUND 260 Part H root cause fix. postHeldDocumentsForClosedTour above only ever retries an
 * expense whose posting_hold_reason is the LITERAL string 'tour_open' -- the one failure mode its
 * own create-time caller (expenses.routes.ts) records. But that same create-time code's OTHER
 * branch -- postSourceTransaction throwing a PostingEngineError when the tour was NOT open and the
 * flag WAS on -- catches the error and leaves the row unposted with posting_hold_reason left NULL
 * (expenses.routes.ts:1423-1426, "leave unposted -- surfaced via posting_status"). A blank hold
 * reason is indistinguishable from "never attempted," so no retry path -- this one included --
 * ever picks that row back up again. MEASURED live 2026-09-30 on USMCA: 257 status='draft' expenses,
 * ALL with posting_hold_reason = '' (never 'tour_open'); 245 of them have a load whose tour is
 * ALREADY closed, and 237 of those already carry both a resolvable category account and a payment
 * account -- fully postable right now, held only because nothing ever retries a blank-hold-reason
 * row. This function is that missing, general retry: it scans every non-voided draft/unposted
 * expense for the company (not scoped to one settlement's loadIds, not filtered by hold_reason).
 * ACC-50 REMOVED (claude/00-SEAT-CONTRACT.md §3 corollary, owner ruling 2026-09-29): no tour-open
 * check runs here any more either -- every candidate with a resolvable account posts through the
 * SAME postSourceTransaction engine every other call site uses. On a genuine
 * posting failure this time the hold reason is RECORDED (not left blank), so a human or a future
 * automated pass can tell "blocked, here is why" apart from "never tried."
 */
export async function retryHeldExpensePostings(
  operatingCompanyId: string,
  actor: { userId: string }
): Promise<HeldExpenseRetryResult> {
  const postingBatchId = randomUUID();
  const outcomes: HeldExpenseRetryResult["outcomes"] = [];

  const expensePostingEnabled = await withCompanyScope(actor.userId, operatingCompanyId, (client: DbClient) =>
    isEnabled(client as never, EXPENSE_GL_POSTING_FLAG_KEY, { operating_company_id: operatingCompanyId, user_uuid: actor.userId })
  );

  const candidates = await withCompanyScope(actor.userId, operatingCompanyId, (client: DbClient) =>
    client.query<{ id: string; load_id: string | null; payment_account_uuid: string | null; vendor_uuid: string | null }>(
      `
        SELECT e.id::text, e.load_id::text, e.payment_account_uuid::text, e.vendor_uuid::text
        FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid
          AND e.status = 'draft'
          AND e.posting_status = 'unposted'
          AND e.voided_at IS NULL
          AND EXISTS (SELECT 1 FROM accounting.expense_lines el WHERE el.expense_id = e.id AND el.expense_account_uuid IS NOT NULL)
        ORDER BY e.id
      `,
      [operatingCompanyId]
    )
  );

  if (!expensePostingEnabled) {
    return { posting_batch_id: postingBatchId, outcomes: candidates.rows.map((r) => ({ expense_id: r.id, outcome: "flag_off" as const, journal_entry_id: null, hold_reason: null })) };
  }

  for (const expense of candidates.rows) {
    if (!expense.payment_account_uuid && !expense.vendor_uuid) {
      outcomes.push({ expense_id: expense.id, outcome: "still_held_orphan", journal_entry_id: null, hold_reason: "orphan_no_payment_account_or_vendor" });
      continue;
    }
    try {
      const posting = await postSourceTransaction(
        { operating_company_id: operatingCompanyId, source_transaction_type: "expense", source_transaction_id: expense.id },
        actor
      );
      await withCompanyScope(actor.userId, operatingCompanyId, async (client: DbClient) => {
        await client.query(
          `UPDATE accounting.expenses
              SET status='posted', posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, posting_hold_reason=NULL, updated_at=now()
            WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
          [expense.id, posting.journal_entry_id, operatingCompanyId]
        );
        await appendCrudAudit(
          client,
          actor.userId,
          "expense.posted",
          { expense_id: expense.id, journal_entry_id: posting.journal_entry_id, source: "held_expense_retry_batch", posting_batch_id: postingBatchId },
          "info"
        );
      });
      outcomes.push({ expense_id: expense.id, outcome: "posted", journal_entry_id: posting.journal_entry_id, hold_reason: null });
    } catch (err) {
      if (!(err instanceof PostingEngineError)) throw err;
      const holdReason = `post_failed:${err.code}`;
      await withCompanyScope(actor.userId, operatingCompanyId, (client: DbClient) =>
        client.query(`UPDATE accounting.expenses SET posting_hold_reason=$2, updated_at=now() WHERE id=$1::uuid AND operating_company_id=$3::uuid`, [expense.id, holdReason, operatingCompanyId])
      );
      outcomes.push({ expense_id: expense.id, outcome: "still_held_posting_error", journal_entry_id: null, hold_reason: holdReason });
    }
  }

  return { posting_batch_id: postingBatchId, outcomes };
}
