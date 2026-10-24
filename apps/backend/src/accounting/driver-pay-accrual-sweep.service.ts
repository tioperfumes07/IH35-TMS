/**
 * ROW-73 (443.279-CC1) — idempotent sweep for unaccrued delivered-basis driver bills.
 *
 * ROOT CAUSE: fireDriverPayAccrual in delivery-evidence-latch runs once inline and swallows errors
 * to console.warn. A transient failure (lock, RLS, missing GL account at delivery time) leaves the
 * bill permanently unaccrued until settlement close. Settlement close does post the pay, but the
 * A/P bill was never created — the load never appeared in the A/P subledger for the pay period.
 *
 * FIX: this sweep runs at boot + every 15 min. For every open, unvoided driver bill whose
 * due_date_basis = 'delivered' and accrued_bill_id IS NULL, it calls
 * accrueDriverPayAtDeliveryInClientTx (idempotent by design: already-accrued bills are skipped).
 * Failures are recorded in _system.background_jobs (last_failed_run_at + last_error_message).
 */
import { withLuciaBypass } from "../auth/db.js";
import { accrueDriverPayAtDeliveryInClientTx } from "../driver-finance/driver-pay-delivery-accrual.service.js";

export const DRIVER_PAY_ACCRUAL_SWEEP_JOB = "driver_finance.driver_pay_accrual_sweep";
const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

export type AccrualSweepResult = {
  checked: number;
  accrued: number;
  skipped: number;
  failed: number;
  errors: Array<{ load_id: string; driver_bill_id: string; error: string }>;
};

/**
 * Find all unaccrued delivered-basis driver bills and accrue them.
 * Idempotent: a bill already accrued is skipped by accrueDriverPayAtDeliveryInClientTx.
 */
export async function runDriverPayAccrualSweep(operatingCompanyId: string): Promise<AccrualSweepResult> {
  const result: AccrualSweepResult = { checked: 0, accrued: 0, skipped: 0, failed: 0, errors: [] };

  const candidates = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<{ load_id: string; driver_bill_id: string }>(
      `SELECT db.load_id::text, db.id::text AS driver_bill_id
         FROM driver_finance.driver_bills db
        WHERE db.operating_company_id = $1::uuid
          AND db.due_date_basis = 'delivered'
          AND db.accrued_bill_id IS NULL
          AND db.accrued_team_bill_id IS NULL
          AND db.voided_at IS NULL
          AND db.status <> 'void'
          AND db.settled_in_settlement_id IS NULL
          AND COALESCE(db.gross_amount_cents, 0) > 0
        ORDER BY db.created_at ASC
        LIMIT 50`,
      [operatingCompanyId]
    );
    return res.rows;
  });

  result.checked = candidates.length;

  for (const { load_id, driver_bill_id } of candidates) {
    try {
      const outcome = await withLuciaBypass(
        (client) =>
          accrueDriverPayAtDeliveryInClientTx(client, {
            operatingCompanyId,
            loadId: load_id,
            actorUserId: SYSTEM_USER_ID,
          }),
        { actorUserId: SYSTEM_USER_ID }
      );
      if (outcome.accrued.length > 0) {
        result.accrued += outcome.accrued.length;
      } else {
        result.skipped++;
      }
    } catch (err) {
      console.error({ load_id, driver_bill_id, err }, "driver-pay-accrual-sweep: per-load accrual failed");
      result.failed++;
      result.errors.push({ load_id, driver_bill_id, error: String((err as Error)?.message ?? err) });
    }
  }

  return result;
}
