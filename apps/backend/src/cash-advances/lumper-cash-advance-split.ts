import { randomUUID } from "node:crypto";
import { withCurrentUser } from "../auth/db.js";
import { isBillPaymentGlPostingEnabled } from "../accounting/bill-payment-gl.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { generateExpenseNumber } from "../expense-attribution/expense-number.js";
import { logger } from "../observability/structured-logger.js";

/**
 * Lumper Lifecycle STEP 3b — cash-advance disburse SPLIT engine.
 *
 * Splits one driver cash advance (e.g. $400) into N atomic legs in ONE transaction (all-or-nothing):
 *   - bill_payment   : the $250 against the load's auto-bill (advance_id + bill_id; existing advance→bill rail).
 *                      C6 (GO-23) — this leg now posts its own JE via postSourceTransactionInClientTx
 *                      (source_transaction_type='bill_payment'), the SAME poster cc-payment.routes.ts /
 *                      cash-advances.routes.ts mark-disbursed (#19618) / bills-bulk.routes.ts mark_paid
 *                      (#19625) already use for this exact data shape — no new GL math, gated by the
 *                      EXISTING BILL_PAYMENT_GL_POSTING_ENABLED flag (default OFF), not a new one.
 *   - lumper_expense : the $150 lumper → accounting.expenses + expense_lines (load_id, 'lumper' category
 *                      account QBO-117, billable_customer_uuid per rule), then the customer-invoice/posting
 *                      legs are STEP 4/7 — GENUINELY NOT YET BUILT. No customer-facing invoice/billing-back
 *                      poster exists anywhere in this codebase for this leg; posting it correctly requires
 *                      real design (which revenue account, timing, whether the customer invoice fires here
 *                      or at a later billing-run step) — not a call to an existing function this file forgot
 *                      to make. Left unposted on purpose; C6-MONEY-JE-EXEMPT below documents why.
 * Fail-loud if the legs do not sum to the advance total. Emits a spine event via the (now-fixed, #1491)
 * events.log_event. ALL behavior is gated behind LUMPER_LIFECYCLE_ENABLED (default OFF) — nothing posts
 * money until Jorge's Tier-1 sign-off flips the flag. The live path is not exercised until #1440 (load_id on
 * the advance tables) + STEP 3a (the 'lumper' category map) are applied; GUARD verifies the $250/$150 rows +
 * a balanced JE on a Neon branch before any flag flip.
 *
 * C6-MONEY-JE-EXEMPT (expense_lines leg only — bill_payments leg has a REAL poster call below, not an
 * exemption): accounting.expenses/expense_lines here record the lumper fee itself; the customer-facing
 * invoice/billing-back JE is STEP 4/7 of this same staged build, explicitly not built yet (see above).
 * Verified 2026-09-02, GO-23 C6 — this is the one gap this session leaves genuinely open, not papered over.
 */

/** Feature flag — default OFF. */
export function lumperLifecycleEnabled(): boolean {
  return process.env.LUMPER_LIFECYCLE_ENABLED === "true";
}

export type BillPaymentSplit = { kind: "bill_payment"; amount_cents: number; bill_id: string };
export type LumperExpenseSplit = {
  kind: "lumper_expense";
  amount_cents: number;
  load_id: string;
  // per-load lumper scenario, persisted on the stop (load_stops.lumper_paid_by). Only a carrier-paid +
  // billable lumper carries a billable_customer_uuid (scenario 2, not flat-rate); broker/absorb → null.
  billable_customer_uuid?: string | null;
};
export type AdvanceSplit = BillPaymentSplit | LumperExpenseSplit;

export type SplitValidation = { ok: true } | { ok: false; error: string; message: string };

/**
 * Pure, fail-loud split check (the maker≠checker money contract): every leg is a positive integer-cents
 * amount, and the legs MUST sum to the advance total. $250 + $150 must equal $400 or the whole disburse aborts.
 */
export function validateAdvanceSplit(splits: readonly AdvanceSplit[], advanceTotalCents: number): SplitValidation {
  if (!Array.isArray(splits) || splits.length === 0) {
    return { ok: false, error: "empty_split", message: "split must contain at least one leg" };
  }
  for (const s of splits) {
    if (!Number.isInteger(s.amount_cents) || s.amount_cents <= 0) {
      return { ok: false, error: "invalid_split_amount", message: `each leg must be positive integer cents; got ${String(s.amount_cents)}` };
    }
  }
  if (!Number.isInteger(advanceTotalCents) || advanceTotalCents <= 0) {
    return { ok: false, error: "invalid_advance_total", message: `advance total must be positive integer cents; got ${String(advanceTotalCents)}` };
  }
  const sum = splits.reduce((acc, s) => acc + s.amount_cents, 0);
  if (sum !== advanceTotalCents) {
    return { ok: false, error: "split_sum_mismatch", message: `split legs sum to ${sum}c but the advance total is ${advanceTotalCents}c` };
  }
  return { ok: true };
}

export type DisburseSplitResult =
  | { ok: true; advanceId: string; billPaymentIds: string[]; expenseIds: string[] }
  | { ok: false; code: number; error: string; message?: string };

// B10-class fix (Devin sweep, 2026-09-28, applied here after the guard verify-no-nested-transactions
// -in-withcurrentuser.mjs caught this file too): this function used to manage its own explicit
// client.query("BEGIN"/"COMMIT"/"ROLLBACK") inside a withCurrentUser(...) callback -- redundant on
// the SAME already-open transaction (withCurrentUser BEGINs/COMMITs/ROLLBACKs on its own), and
// distinct from the real concern its own comment cited (avoiding a SECOND connection/transaction,
// which postSourceTransactionInClientTx never opens -- it explicitly expects to run inside the
// caller's existing transaction). A mid-loop failure (e.g. the missing-QBO-117-account case) can
// happen AFTER an earlier split leg already inserted a real bill_payment row in this same
// transaction, so simply removing the nested BEGIN/COMMIT and returning a plain falsy result would
// let withCurrentUser COMMIT that partial write -- breaking the "all-or-nothing" contract this
// function's own doc comment promises. This typed error preserves atomicity: a business-rule
// failure THROWS, withCurrentUser's own catch rolls back the whole transaction, and the outer
// wrapper below translates it back to the same { ok: false, code, error, message } shape callers
// already expect.
class DisburseSplitFailure extends Error {
  code: number;
  errorCode: string;
  userMessage?: string;
  constructor(code: number, errorCode: string, userMessage?: string) {
    super(`disburse_split_failure:${errorCode}`);
    this.code = code;
    this.errorCode = errorCode;
    this.userMessage = userMessage;
  }
}

type DisburseSplitInput = {
  advance_id: string;
  splits: AdvanceSplit[];
  source_bank_transaction_id?: string | null;
};

/**
 * Atomic split disburse. Behind the flag; one DB transaction; fail-loud on a sum mismatch.
 * Reuses the existing bill_payment (advance→bill) + expense/expense_line creators — no new money plumbing.
 */
export async function disburseCashAdvanceSplit(
  actorUserUuid: string,
  companyId: string,
  input: DisburseSplitInput,
): Promise<DisburseSplitResult> {
  if (!lumperLifecycleEnabled()) return { ok: false, code: 403, error: "lumper_lifecycle_disabled" };

  try {
    return await withCurrentUser(actorUserUuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
      // 1. Lock the advance + read its total (driver_advances.amount is numeric dollars).
      const adv = await client.query(
        `SELECT amount::text AS amount FROM driver_finance.driver_advances
         WHERE operating_company_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
        [companyId, input.advance_id],
      );
      if (adv.rows.length === 0) {
        throw new DisburseSplitFailure(404, "advance_not_found");
      }
      const advanceTotalCents = Math.round(Number((adv.rows[0] as { amount: string }).amount) * 100);

      // 2. Fail-loud: the legs MUST sum to the advance.
      const v = validateAdvanceSplit(input.splits, advanceTotalCents);
      if (!v.ok) {
        throw new DisburseSplitFailure(422, v.error, v.message);
      }

      const billPaymentIds: string[] = [];
      const expenseIds: string[] = [];

      for (const leg of input.splits) {
        if (leg.kind === "bill_payment") {
          // ACCT-F353 — derive from the BILL being paid, matching bills.service.ts's own bill_payment
          // writer precedent (paying a sample bill is a sample payment).
          const billSample = await client.query<{ is_sample_data: boolean | null }>(
            `SELECT is_sample_data FROM accounting.bills WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
            [leg.bill_id, companyId],
          );
          // advance→bill leg (payment_date/status default; payment_method matches the existing rail).
          const bp = await client.query(
            `INSERT INTO accounting.bill_payments
               (operating_company_id, bill_id, amount, amount_cents, payment_method, advance_id, source_bank_transaction_id, is_sample_data)
             VALUES ($1::uuid, $2::uuid, $3, $4, 'cash_advance', $5::uuid, $6, $7)
             RETURNING id::text AS id`,
            [
              companyId,
              leg.bill_id,
              leg.amount_cents / 100,
              leg.amount_cents,
              input.advance_id,
              input.source_bank_transaction_id ?? null,
              billSample.rows[0]?.is_sample_data === true,
            ],
          );
          const billPaymentId = String((bp.rows[0] as { id: string }).id);
          billPaymentIds.push(billPaymentId);

          // C6 (GO-23) — same-transaction poster: postSourceTransactionInClientTx runs on this same
          // `client`/transaction (withCurrentUser's own, not a second connection) — opening a SECOND
          // connection/transaction here would self-deadlock on the bill row's own lock, which is why
          // this stays on one client throughout (B10 fix, 2026-09-28: this file used to also manage
          // its own redundant nested BEGIN/COMMIT on this SAME connection, removed — see
          // DisburseSplitFailure above for how atomicity is still preserved). Flag-gated by the EXISTING
          // BILL_PAYMENT_GL_POSTING_ENABLED check — no new flag, no new GL math. Best-effort: a post
          // failure must not abort the whole split disburse, but must not vanish silently (SWL-1).
          try {
            const glPostingEnabled = await isBillPaymentGlPostingEnabled(companyId, actorUserUuid);
            if (glPostingEnabled) {
              await postSourceTransactionInClientTx(
                client,
                {
                  operating_company_id: companyId,
                  source_transaction_type: "bill_payment",
                  source_transaction_id: billPaymentId,
                },
                { userId: actorUserUuid }
              );
            }
          } catch (err) {
            logger.warn("lumper_split_bill_payment_gl_post_failed", {
              err: err instanceof Error ? err.message : String(err),
              company_id: companyId,
              bill_payment_id: billPaymentId,
              advance_id: input.advance_id,
            });
          }
        } else {
          // lumper expense leg → DR the 'reimbursement_expense' role (owner ruling ROW 0: lumper stays on that role —
          // 5310 Lumper Expense on USMCA). ROUND 365.1: by ROLE, never by account number — the old lookup named
          // 'QBO-117', a number USMCA's chart does not carry, so this leg refused every time. Fail-loud if unbound.
          const lumperRoleAccount = await resolveRoleAccountOptional(client as never, companyId, "reimbursement_expense");
          if (!lumperRoleAccount) {
            throw new DisburseSplitFailure(409, "lumper_expense_account_missing", "the 'reimbursement_expense' role (lumper expense) is not bound for this entity — bind it on the CoA Roles page");
          }
          const lumperAccountId = String(lumperRoleAccount);

          // ACCT-F353 — derive from the LOAD the lumper fee is tied to (mdata.loads.is_sample_data).
          const loadSample = await client.query<{ is_sample_data: boolean | null }>(
            `SELECT is_sample_data FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
            [leg.load_id, companyId],
          );

          // N1 (owner direct instruction, 2026-09-02) — this insert had a real load_id in hand
          // (LumperExpenseSplit.load_id is required, never optional) and never called the canonical
          // mint path, leaving expense_number NULL — the same LV-EXPENSE-NUMBER-NEVER-POPULATED shape
          // already fixed for the main create route (accounting/expenses.routes.ts), just never
          // ported to this sibling writer. Same generator, same load-scoped format (12225/12225-1),
          // no second numbering series invented.
          const numbered = await generateExpenseNumber(client, leg.load_id, companyId);

          // ACT-F5413 (LV-EXPENSES-UNAUDITED-AND-ACTORLESS, actor half, sibling site): actorUserUuid
          // is already threaded into this function — it was just never stamped on the expense row.
          const exp = await client.query(
            `INSERT INTO accounting.expenses
               (operating_company_id, status, transaction_date, total_amount_cents, load_id, is_sample_data, created_by_user_id, expense_number)
             VALUES ($1::uuid, 'posted', CURRENT_DATE, $2, $3::uuid, $4, $5::uuid, $6)
             RETURNING id::text AS id`,
            [companyId, leg.amount_cents, leg.load_id, loadSample.rows[0]?.is_sample_data === true, actorUserUuid, numbered.number],
          );
          const expenseId = String((exp.rows[0] as { id: string }).id);
          expenseIds.push(expenseId);

          await client.query(
            `INSERT INTO accounting.expense_lines
               (expense_id, line_sequence, amount_cents, amount, description, expense_account_uuid,
                load_id, load_required, line_category, billable_customer_uuid)
             VALUES ($1::uuid, 1, $2, $3, $4, $5::uuid, $6::uuid, true, 'lumper', $7)`,
            [
              expenseId,
              leg.amount_cents,
              leg.amount_cents / 100,
              "Lumper fee (cash-advance split)",
              lumperAccountId,
              leg.load_id,
              leg.billable_customer_uuid ?? null,
            ],
          );
        }
      }

      // 3. Spine event via the fixed log_event (valid event_type: ^[a-z]+\.[a-z_]+$; subject_type='task').
      await client.query(
        `SELECT events.log_event($1::text, 'lumper.disbursed', 'user', $2, 'task', $3, $4::jsonb, now(),
                                 'lumper', 'driver_finance.driver_advances', $5::uuid, $6::uuid, $7::uuid)`,
        [
          companyId,
          actorUserUuid,
          input.advance_id,
          JSON.stringify({ advance_id: input.advance_id, legs: input.splits.map((s) => ({ kind: s.kind, amount_cents: s.amount_cents })) }),
          input.advance_id,
          actorUserUuid,
          randomUUID(),
        ],
      );

      return { ok: true, advanceId: input.advance_id, billPaymentIds, expenseIds };
    });
  } catch (e) {
    if (e instanceof DisburseSplitFailure) {
      return { ok: false, code: e.code, error: e.errorCode, message: e.userMessage };
    }
    throw e;
  }
}
