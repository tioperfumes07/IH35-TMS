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
        remaining_balance_cents
      )
      -- A3-2: initialise the carry-forward balance to the full amount on insert (status defaults to
      -- 'pending'). The recovery engine treats NULL as = amount_cents (A3-1 lock); this just makes
      -- new rows explicit going forward. $4 = amount_cents.
      VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $4)
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
    },
    "info",
    "PREREQ-B-SETTLEMENT-DEDUCTION-SVC"
  );

  return row;
}
