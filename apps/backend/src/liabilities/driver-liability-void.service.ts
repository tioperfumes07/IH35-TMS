import { appendCrudAudit } from "../audit/crud-audit.js";
import { writeOffDriverReceivableInClientTx } from "../driver-finance/driver-receivable-writeoff.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }>;
};

export type DriverLiabilityVoidResult =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "already_voided" }
  | { kind: "recovered"; recovered_cents: number };

/**
 * THE driver-liability void engine (Owner: PATCH /api/v1/liabilities/:id/void; LEAD 443.114 — dismissing a converted
 * civil fine). Runs inside the caller's transaction:
 *   1. ROUND 394 RULING 2 — a posted driver receivable (damage / fine) is written off ONLY by the reversing entry of its
 *      creation posting, and its pending settlement deductions are voided; refused (nothing written) when any of it
 *      was already recovered through a settlement.
 *   2. The liability is marked voided (balance 0, reason, actor, reversal entry).
 *   3. Its forward deduction schedule is held permanently, so a voided liability can never resume deducting.
 *   4. One audit row `liability.voided`.
 * Callers never re-implement any of these steps.
 */
export async function voidDriverLiabilityInClientTx(
  client: Queryable,
  input: { operatingCompanyId: string; liabilityId: string; actorUserId: string; reason: string }
): Promise<DriverLiabilityVoidResult> {
  const { operatingCompanyId: companyId, liabilityId, actorUserId, reason } = input;
  const pre = await client.query<{ id: string; voided_at: string | null }>(
    `SELECT id, voided_at::text AS voided_at
       FROM driver_finance.driver_liabilities
      WHERE id = $1 AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [liabilityId, companyId]
  );
  if (!pre.rows[0]) return { kind: "not_found" };
  if (pre.rows[0].voided_at) return { kind: "already_voided" };

  const writeOff = await writeOffDriverReceivableInClientTx(client as never, {
    operatingCompanyId: companyId,
    liabilityId,
    actorUserId,
    reason,
  });
  if (writeOff.kind === "recovered") return { kind: "recovered", recovered_cents: writeOff.recovered_cents };

  await client.query(
    `
      UPDATE driver_finance.driver_liabilities
      SET current_balance = 0,
          status = 'voided',
          voided_at = now(),
          void_reason = $3,
          voided_by_user_id = $4::uuid,
          void_reversal_entry_id = COALESCE($5::uuid, void_reversal_entry_id)
      WHERE id = $1
        AND operating_company_id = $2::uuid
    `,
    [liabilityId, companyId, reason, actorUserId, writeOff.kind === "reversed" ? writeOff.journal_entry_id : null]
  );

  // Cascade: stop any future recovery. deduction_schedule has no cancelled/voided concept of its own (append-only
  // forward schedule) — reuse the SAME hold_until_period/hold_reason mechanism the /hold route uses, permanently.
  await client.query(
    `
      UPDATE driver_finance.deduction_schedule
      SET hold_until_period = '9999-12-31'::date,
          hold_reason = $2,
          updated_at = now()
      WHERE liability_id = $1
    `,
    [liabilityId, `Parent liability voided: ${reason}`]
  );

  await appendCrudAudit(
    client as never,
    actorUserId,
    "liability.voided",
    {
      resource_type: "driver_finance.driver_liabilities",
      resource_id: liabilityId,
      operating_company_id: companyId,
      reason,
    },
    "warning",
    "ACCT-SETL-LIAB-VOID-GAP"
  );
  return { kind: "ok" };
}
