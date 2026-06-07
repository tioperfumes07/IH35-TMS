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
  sourceReferenceId?: string;
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
        source_pending_id
      )
      VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)
      RETURNING
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
    `,
    [
      input.operatingCompanyId,
      input.driverId,
      input.sourceType,
      input.amountCents,
      input.reason.trim(),
      input.createdByUserId,
      input.sourceReferenceId ?? null,
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
      source_reference_id: input.sourceReferenceId ?? null,
    },
    "info",
    "PREREQ-B-SETTLEMENT-DEDUCTION-SVC"
  );

  return row;
}
