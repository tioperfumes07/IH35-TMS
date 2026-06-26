import { randomUUID } from "node:crypto";
import { withCurrentUser } from "../auth/db.js";

/**
 * Lumper Lifecycle STEP 3b — cash-advance disburse SPLIT engine.
 *
 * Splits one driver cash advance (e.g. $400) into N atomic legs in ONE transaction (all-or-nothing):
 *   - bill_payment   : the $250 against the load's auto-bill (advance_id + bill_id; existing advance→bill rail)
 *   - lumper_expense : the $150 lumper → accounting.expenses + expense_lines (load_id, 'lumper' category
 *                      account QBO-117, billable_customer_uuid per rule), then the customer-invoice/posting
 *                      legs are STEP 4/7.
 * Fail-loud if the legs do not sum to the advance total. Emits a spine event via the (now-fixed, #1491)
 * events.log_event. ALL behavior is gated behind LUMPER_LIFECYCLE_ENABLED (default OFF) — nothing posts
 * money until Jorge's Tier-1 sign-off flips the flag. The live path is not exercised until #1440 (load_id on
 * the advance tables) + STEP 3a (the 'lumper' category map) are applied; GUARD verifies the $250/$150 rows +
 * a balanced JE on a Neon branch before any flag flip.
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

  return withCurrentUser(actorUserUuid, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    await client.query("BEGIN");
    try {
      // 1. Lock the advance + read its total (driver_advances.amount is numeric dollars).
      const adv = await client.query(
        `SELECT amount::text AS amount FROM driver_finance.driver_advances
         WHERE operating_company_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
        [companyId, input.advance_id],
      );
      if (adv.rows.length === 0) {
        await client.query("ROLLBACK");
        return { ok: false, code: 404, error: "advance_not_found" };
      }
      const advanceTotalCents = Math.round(Number((adv.rows[0] as { amount: string }).amount) * 100);

      // 2. Fail-loud: the legs MUST sum to the advance.
      const v = validateAdvanceSplit(input.splits, advanceTotalCents);
      if (!v.ok) {
        await client.query("ROLLBACK");
        return { ok: false, code: 422, error: v.error, message: v.message };
      }

      const billPaymentIds: string[] = [];
      const expenseIds: string[] = [];

      for (const leg of input.splits) {
        if (leg.kind === "bill_payment") {
          // advance→bill leg (payment_date/status default; payment_method matches the existing rail).
          const bp = await client.query(
            `INSERT INTO accounting.bill_payments
               (operating_company_id, bill_id, amount, amount_cents, payment_method, advance_id, source_bank_transaction_id)
             VALUES ($1::uuid, $2::uuid, $3, $4, 'cash_advance', $5::uuid, $6)
             RETURNING id::text AS id`,
            [companyId, leg.bill_id, leg.amount_cents / 100, leg.amount_cents, input.advance_id, input.source_bank_transaction_id ?? null],
          );
          billPaymentIds.push(String((bp.rows[0] as { id: string }).id));
        } else {
          // lumper expense leg → DR QBO-117 (resolved per entity by account_number; fail-loud if missing).
          const acct = await client.query(
            `SELECT id::text AS id FROM catalogs.accounts
             WHERE operating_company_id = $1::uuid AND account_number = 'QBO-117' AND deactivated_at IS NULL`,
            [companyId],
          );
          if (acct.rows.length === 0) {
            await client.query("ROLLBACK");
            return { ok: false, code: 409, error: "lumper_expense_account_missing", message: "QBO-117 (Warehouse-Lumper Fee) not found for this entity" };
          }
          const lumperAccountId = String((acct.rows[0] as { id: string }).id);

          const exp = await client.query(
            `INSERT INTO accounting.expenses
               (operating_company_id, status, transaction_date, total_amount_cents, load_id)
             VALUES ($1::uuid, 'posted', CURRENT_DATE, $2, $3::uuid)
             RETURNING id::text AS id`,
            [companyId, leg.amount_cents, leg.load_id],
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

      await client.query("COMMIT");
      return { ok: true, advanceId: input.advance_id, billPaymentIds, expenseIds };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }
  });
}
