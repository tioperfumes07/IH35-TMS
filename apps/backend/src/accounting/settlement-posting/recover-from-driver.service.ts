// FIN-18 — Per-expense "recover from driver" linkage.
// When a bill/expense is flagged recover_from_driver (with a driver + a target bucket type) AND a signed
// deduction authorization is on file for that driver, this creates a BUCKET CHARGE + a pending
// driver_settlement_deductions row tied to the source expense. The charge does NOT post to a settlement
// until that settlement runs and passes the consent gate + the net-pay floor (FIN-18 poster).
//
// NOTE: writeTransactionSourceLink is journal-entry-posting-grained, so the expense->charge provenance is
// carried by the source_expense_id FKs on the bucket event + the deduction row (full audit trail) plus an
// immutable audit event — not transaction_source_links (which only links posting lines). The POSTING-time
// expense link IS written via writeTransactionSourceLink by the settlement poster.

import { withCurrentUser } from "../../auth/db.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { hasSignedDeductionAuthorization } from "../../legal/signed-finance-handoff.service.js";
import { chargeBucket, getOrCreateBucket } from "./bucket-ledger.service.js";
import { SettlementPostingError } from "./settlement-posting.math.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type Actor = { userId: string };

export type RecoverFromDriverResult = {
  deduction_id: string;
  bucket_id: string;
  bucket_type: string;
  amount_cents: number;
  bucket_remaining_cents: number;
};

/**
 * Charge a recover-from-driver expense into the driver's deduction bucket (creating a pending deduction).
 * Requires recover_from_driver=true, a driver, a target bucket type, and a signed auth on file.
 */
export async function chargeRecoverFromDriverExpense(
  input: { operatingCompanyId: string; expenseId: string },
  actor: Actor
): Promise<RecoverFromDriverResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const expRes = await client.query<{
      id: string;
      recover_from_driver: boolean;
      recover_deduction_type: string | null;
      driver_uuid: string | null;
      total_amount_cents: string | null;
      expense_number: string | null;
    }>(
      `SELECT id::text, recover_from_driver, recover_deduction_type, driver_uuid::text,
              total_amount_cents::text, expense_number
         FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1 FOR UPDATE`,
      [input.operatingCompanyId, input.expenseId]
    );
    const exp = expRes.rows[0];
    if (!exp) throw new SettlementPostingError("SETTLEMENT_NOT_FOUND", `Expense ${input.expenseId} not found`);
    if (!exp.recover_from_driver) {
      throw new SettlementPostingError("SETTLEMENT_NOT_POSTABLE", "Expense is not flagged recover_from_driver");
    }
    if (!exp.driver_uuid) {
      throw new SettlementPostingError("SETTLEMENT_NOT_POSTABLE", "recover_from_driver expense has no driver (driver picker required)");
    }
    const bucketType = exp.recover_deduction_type?.trim();
    if (!bucketType) {
      throw new SettlementPostingError("SETTLEMENT_NOT_POSTABLE", "recover_from_driver expense has no recover_deduction_type (target bucket)");
    }
    const amountCents = Number(exp.total_amount_cents ?? 0);
    if (!(amountCents > 0)) {
      throw new SettlementPostingError("SETTLEMENT_TOTALS_INCONSISTENT", "recover_from_driver expense has a non-positive amount");
    }

    // CONSENT GATE (FLSA) — a charge against the driver requires a signed authorization on file.
    const consented = await hasSignedDeductionAuthorization(client as never, {
      operatingCompanyId: input.operatingCompanyId,
      driverId: exp.driver_uuid,
    });
    if (!consented) {
      throw new SettlementPostingError(
        "CONSENT_MISSING",
        `No signed deduction authorization on file for driver ${exp.driver_uuid} — cannot recover expense ${exp.expense_number ?? input.expenseId}`,
        { driver_id: exp.driver_uuid, expense_id: input.expenseId }
      );
    }

    const bucket = await getOrCreateBucket(client, {
      operatingCompanyId: input.operatingCompanyId,
      driverId: exp.driver_uuid,
      bucketType,
      actorUserId: actor.userId,
    });

    const remainingAfter = await chargeBucket(client, {
      operatingCompanyId: input.operatingCompanyId,
      bucket,
      amountCents,
      sourceExpenseId: input.expenseId,
      reason: `Recover-from-driver: expense ${exp.expense_number ?? input.expenseId}`,
      actorUserId: actor.userId,
    });

    // Create the pending deduction (owner decides per-settlement how much to draw; this seeds the bucket).
    const dedRes = await client.query<{ id: string }>(
      `INSERT INTO driver_finance.driver_settlement_deductions
         (operating_company_id, driver_id, deduction_type, amount_cents, reason, status,
          remaining_balance_cents, bucket_id, source_expense_id, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'pending', $4, $6::uuid, $7::uuid, $8::uuid)
       RETURNING id::text`,
      [
        input.operatingCompanyId,
        exp.driver_uuid,
        bucketType,
        amountCents,
        `Recover-from-driver: expense ${exp.expense_number ?? input.expenseId}`,
        bucket.id,
        input.expenseId,
        actor.userId,
      ]
    );
    const deductionId = dedRes.rows[0]!.id;

    await appendCrudAudit(
      client as never,
      actor.userId,
      "driver_finance.deduction.charged_from_expense",
      {
        resource_type: "driver_finance.driver_settlement_deductions",
        resource_id: deductionId,
        operating_company_id: input.operatingCompanyId,
        source_expense_id: input.expenseId,
        bucket_id: bucket.id,
        bucket_type: bucketType,
        driver_id: exp.driver_uuid,
        amount_cents: amountCents,
        bucket_remaining_cents: remainingAfter,
      },
      "info",
      "FIN-18-RECOVER-FROM-DRIVER"
    );

    return {
      deduction_id: deductionId,
      bucket_id: bucket.id,
      bucket_type: bucketType,
      amount_cents: amountCents,
      bucket_remaining_cents: remainingAfter,
    };
  });
}
