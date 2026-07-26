import { appendCrudAudit } from "../audit/crud-audit.js";

export type Queryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type SettlementDeductionSourceType =
  | "cash_advance_repayment"
  | "damage"
  | "equipment"
  | "fuel"
  // BLOCK-6b: recoverable-expense bucket types a driver can be charged for (e.g. a fine/toll/citation the
  // company paid on the driver's behalf and recovers from settlement). The FIN-18 settlement poster derives
  // the recovery role account generically as `${deduction_type}_recovery`, so these route with no new math.
  | "fine"
  | "toll"
  | "citation"
  | "other";

export type CreateSettlementDeductionInput = {
  driverId: string;
  operatingCompanyId: string;
  amountCents: number;
  reason: string;
  sourceType: SettlementDeductionSourceType;
  /**
   * Optional id of an originating driver_finance.escrow_deductions_pending row.
   * FK-constrained: must reference an existing escrow_deductions_pending(id).
   * Non-escrow sources MUST leave this undefined.
   * TODO B4-B: generic source_reference_id uuid column + partial unique index
   * deferred to the deduction-cap migration block.
   */
  sourcePendingId?: string;
  /**
   * Originating load for direct traceability (Jorge LOCKED 2026-06-27): a load-linked cash-advance
   * recovery deduction carries load_id DIRECTLY (not transitively via the advance/liability). Callers
   * that source from a load-linked advance pass driver_advances.load_id; non-load sources leave it null.
   */
  loadId?: string | null;
  /**
   * Optional deduction bucket (driver_finance.driver_deduction_buckets) this row is charged against.
   * Recover-from-driver sources (FIN-18 + BLOCK-6b bank-categorize fine) pass the bucket they charged so
   * the FIN-18 settlement poster applies the deduction against its ledger on post. Non-bucketed sources
   * (e.g. cash-advance repayment) leave it null.
   */
  bucketId?: string | null;
  /**
   * Optional originating bank transaction (banking.bank_transactions). BLOCK-6b: a fine the company paid
   * that is recovered from the driver carries the source bank transaction DIRECTLY for reverse
   * drill-through (bank txn ⇄ deduction). Non-bank sources leave it null.
   */
  sourceBankTransactionId?: string | null;
  /**
   * Optional originating fuel-card transaction (fuel.fuel_transactions). BANK-DOM-06: the recoverable
   * portion of an over-limit / non-fuel fleet-card purchase carries the source fuel transaction
   * DIRECTLY for reverse drill-through (fuel txn ⇄ deduction). A partial UNIQUE index on
   * (operating_company_id, source_fuel_transaction_id) makes the recovery idempotent at the DB level,
   * so a re-imported card file cannot double-charge the driver. Non-fuel sources leave it null.
   */
  sourceFuelTransactionId?: string | null;
  createdByUserId: string;
};

export type SettlementDeductionRow = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  deduction_type: string;
  amount_cents: number;
  reason: string;
  applied_to_settlement_id: string | null;
  created_by_user_id: string;
  source_pending_id: string | null;
  load_id: string | null;
  bucket_id: string | null;
  source_bank_transaction_id: string | null;
  source_fuel_transaction_id: string | null;
  created_at: string;
};

const RETURNING_COLUMNS = `
  id,
  operating_company_id,
  driver_id,
  deduction_type,
  amount_cents::int AS amount_cents,
  reason,
  applied_to_settlement_id,
  created_by_user_id,
  source_pending_id,
  load_id,
  bucket_id,
  source_bank_transaction_id,
  source_fuel_transaction_id,
  created_at::text AS created_at
`;

export async function createSettlementDeduction(
  client: Queryable,
  input: CreateSettlementDeductionInput
): Promise<SettlementDeductionRow> {
  if (!input.driverId?.trim()) throw new Error("E_INVALID_INPUT: driverId is required");
  if (!input.operatingCompanyId?.trim()) throw new Error("E_INVALID_INPUT: operatingCompanyId is required");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0)
    throw new Error("E_INVALID_INPUT: amountCents must be a positive integer");
  if (!input.reason?.trim()) throw new Error("E_INVALID_INPUT: reason is required");
  if (!input.createdByUserId?.trim()) throw new Error("E_INVALID_INPUT: createdByUserId is required");

  // B2-B dedupe: in-transaction pre-check so a double-approve of the same
  // escrow pending row cannot double-charge. There is no unique index on
  // source_pending_id (adding one needs a migration — out of lane), so a
  // pre-check is the FK-safe option. Block 7 (cash-advance-request) sources
  // pass no sourcePendingId and rely on the caller's pending->approved status
  // guard for idempotency.
  if (input.sourcePendingId) {
    const existing = await client.query<SettlementDeductionRow>(
      `
        SELECT ${RETURNING_COLUMNS}
        FROM driver_finance.driver_settlement_deductions
        WHERE operating_company_id = $1
          AND source_pending_id = $2
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [input.operatingCompanyId, input.sourcePendingId]
    );
    if (existing.rows[0]) return existing.rows[0];
  }

  const res = await client.query<SettlementDeductionRow>(
    `
      INSERT INTO driver_finance.driver_settlement_deductions (
        operating_company_id,
        driver_id,
        deduction_type,
        amount_cents,
        reason,
        applied_to_settlement_id,
        created_by_user_id,
        source_pending_id,
        load_id,
        bucket_id,
        source_bank_transaction_id,
        source_fuel_transaction_id,
        remaining_balance_cents
      )
      -- A3-2: initialise the carry-forward balance to the full amount on insert (status defaults to
      -- 'pending'). The recovery engine treats NULL as = amount_cents (A3-1 lock); this just makes
      -- new rows explicit going forward. $4 = amount_cents. $8 = load_id (direct trace, nullable),
      -- $9 = bucket_id (recover-from-driver), $10 = source_bank_transaction_id (BLOCK-6b provenance),
      -- $11 = source_fuel_transaction_id (BANK-DOM-06 fuel-card overage provenance).
      VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $4)
      RETURNING ${RETURNING_COLUMNS}
    `,
    [
      input.operatingCompanyId,
      input.driverId,
      input.sourceType,
      input.amountCents,
      input.reason.trim(),
      input.createdByUserId,
      input.sourcePendingId ?? null,
      input.loadId ?? null,
      input.bucketId ?? null,
      input.sourceBankTransactionId ?? null,
      input.sourceFuelTransactionId ?? null,
    ]
  );

  const row = res.rows[0];
  if (!row) throw new Error("E_INSERT_FAILED: deduction insert returned no row");

  await appendCrudAudit(
    client,
    input.createdByUserId,
    "driver_finance.deduction.created",
    {
      resource_type: "driver_finance.driver_settlement_deductions",
      resource_id: row.id,
      operating_company_id: input.operatingCompanyId,
      driver_id: input.driverId,
      amount_cents: input.amountCents,
      source_type: input.sourceType,
      source_pending_id: input.sourcePendingId ?? null,
      bucket_id: input.bucketId ?? null,
      source_bank_transaction_id: input.sourceBankTransactionId ?? null,
      source_fuel_transaction_id: input.sourceFuelTransactionId ?? null,
      load_id: input.loadId ?? null,
    },
    "info",
    "PREREQ-B-SETTLEMENT-DEDUCTION-SVC"
  );

  return row;
}
