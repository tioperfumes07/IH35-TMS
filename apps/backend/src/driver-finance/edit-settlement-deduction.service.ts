// SET-01 part 2 — settlement-detail "true per-line editable input" for a saved deduction line.
// A deduction's amount/type/reason is written once at creation (deductions.service.ts) and — per
// the void-not-delete / WORM law and the SETL-DED-GL retype design (retype-settlement-deduction.
// service.ts, "a void changes only WHEN/HOW, never WHETHER") — is NEVER edited by a bare UPDATE.
// Editing a saved line is therefore VOID-OLD + RECREATE through the same real writers the create
// and void routes use, so the WORM audit trail shows the edit as an event pair (a void + a fresh
// row), not a silent mutation. Identical mechanics to retype; retype changes only the type, this
// generalizes it to amount + reason + type in one guarded pass.
//
// FAILS CLOSED. Refuses unless ALL hold:
//   1. the deduction exists in this company and is NOT already voided;
//   2. status = 'pending' (an 'applied'/'partial' deduction is collected history — never re-edited,
//      matching voidSettlementDeduction's own "already-collected money is never touched" ruling);
//   3. it is a MANUAL deduction — no source_pending_id / reversed_reimbursement_id / bucket_id /
//      source_bank_transaction_id. A system-sourced deduction (escrow-pending approval, reimbursement
//      reversal, recover-from-driver bucket, bank-txn categorize) carries provenance the recreate
//      path cannot faithfully re-thread, so editing it by void+recreate would sever that linkage —
//      refuse it here rather than quietly break the trail;
//   4. if it has already been materialized onto an OPEN settlement, that settlement is still 'open'
//      (a locked/closed settlement's lines are posted history).
// At least one of amount / type / reason must actually change, else it is a no-op (refused).

import { voidSettlementDeduction, DeductionVoidError } from "./settlement-deduction-void.service.js";
import { createSettlementDeduction, type SettlementDeductionSourceType, type Queryable as DeductionsQueryable } from "./deductions.service.js";
import { materializeSettlementLines, type MaterializeSettlementLinesResult } from "./settlement-lines-materialize.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

// The user-editable deduction kinds — identical to the create route's typed, GL-bound set
// (deductions.routes.ts createDeductionBodySchema). 'other' is retired going forward (SETL-DED-GL),
// and the special source-linked kinds are refused above, so this is the exact editable universe.
export const EDITABLE_DEDUCTION_TYPES = ["wire_fee", "ach_fee", "company_vehicle_fuel", "escrow_contribution"] as const;
export type EditableDeductionType = (typeof EDITABLE_DEDUCTION_TYPES)[number];

export class EditDeductionError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "EditDeductionError";
  }
}

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type EditSettlementDeductionInput = {
  operatingCompanyId: string;
  deductionId: string;
  /** New amount in cents. Omit to keep the current amount. */
  newAmountCents?: number;
  /** New typed, GL-bound kind. Omit to keep the current type. */
  newType?: EditableDeductionType;
  /** New description/reason (>= 10 chars). Always required — an edit states why. */
  reason: string;
  actorUserId: string;
};

export type EditSettlementDeductionResult = {
  oldDeductionId: string;
  newDeductionId: string;
  voidedLineId: string | null;
  materialize: MaterializeSettlementLinesResult | null;
  newAmountCents: number;
  newType: string;
};

export async function editSettlementDeduction(
  client: QueryClient,
  input: EditSettlementDeductionInput
): Promise<EditSettlementDeductionResult> {
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 10) {
    throw new EditDeductionError("edit_reason_required", "A reason of at least 10 characters is required to edit a deduction.");
  }
  if (input.newAmountCents != null && (!Number.isInteger(input.newAmountCents) || input.newAmountCents <= 0)) {
    throw new EditDeductionError("edit_amount_invalid", "newAmountCents must be a positive integer.");
  }
  if (input.newType != null && !EDITABLE_DEDUCTION_TYPES.includes(input.newType)) {
    throw new EditDeductionError("edit_type_invalid", `newType must be one of ${EDITABLE_DEDUCTION_TYPES.join(", ")}.`);
  }

  const src = await client.query<{
    id: string;
    driver_id: string;
    deduction_type: string;
    amount_cents: string;
    reason: string;
    status: string;
    applied_to_settlement_id: string | null;
    load_id: string | null;
    voided_at: string | null;
    source_pending_id: string | null;
    reversed_reimbursement_id: string | null;
    bucket_id: string | null;
    source_bank_transaction_id: string | null;
  }>(
    `
      SELECT id::text, driver_id::text, deduction_type, amount_cents::text, reason, status,
             applied_to_settlement_id::text, load_id::text, voided_at::text,
             source_pending_id::text, reversed_reimbursement_id::text, bucket_id::text,
             source_bank_transaction_id::text
        FROM driver_finance.driver_settlement_deductions
       WHERE id = $1::uuid AND operating_company_id = $2::uuid
       LIMIT 1
    `,
    [input.deductionId, input.operatingCompanyId]
  );
  const d = src.rows[0];
  if (!d) throw new EditDeductionError("deduction_not_found");
  if (d.voided_at) throw new EditDeductionError("deduction_already_voided", "This deduction is voided and cannot be edited.");
  if (d.status !== "pending") {
    throw new EditDeductionError(
      "deduction_not_editable",
      `status '${d.status}' is not editable — only a 'pending', not-yet-collected deduction can be edited`
    );
  }
  if (d.source_pending_id || d.reversed_reimbursement_id || d.bucket_id || d.source_bank_transaction_id) {
    throw new EditDeductionError(
      "deduction_source_linked",
      "This deduction was generated from another record (escrow approval, reimbursement reversal, recovery bucket, or bank transaction) and cannot be edited here — void it at its source."
    );
  }

  const currentAmountCents = Number(d.amount_cents);
  const nextAmountCents = input.newAmountCents ?? currentAmountCents;
  const nextType = (input.newType ?? d.deduction_type) as SettlementDeductionSourceType;
  const changed = nextAmountCents !== currentAmountCents || nextType !== d.deduction_type || reason !== (d.reason ?? "");
  if (!changed) throw new EditDeductionError("edit_no_change", "No field changed — nothing to edit.");

  // If already materialized onto a settlement, that settlement must still be open to gain a
  // re-materialized replacement line (matches materializeSettlementLines' own OPEN-only invariant
  // and retypeSettlementDeduction's guard).
  let settlementId: string | null = d.applied_to_settlement_id;
  if (settlementId) {
    const settlementRes = await client.query<{ status: string }>(
      `SELECT status FROM driver_finance.driver_settlements WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [settlementId, input.operatingCompanyId]
    );
    const s = settlementRes.rows[0];
    if (!s) settlementId = null;
    else if (s.status !== "open") {
      throw new EditDeductionError(
        "settlement_not_open",
        "The settlement this deduction is attached to is not open; its posted lines are history and cannot be edited."
      );
    }
  }

  // Step 1 — void the OLD deduction (record-only 'pending' branch; no money moves, nothing forgiven).
  try {
    await voidSettlementDeduction(client as never, {
      operating_company_id: input.operatingCompanyId,
      deduction_id: d.id,
      reason: `SET-01 edit: ${reason}`,
      actor_user_id: input.actorUserId,
    });
  } catch (err) {
    if (err instanceof DeductionVoidError) throw new EditDeductionError(`void_failed_${err.code}`, err.message);
    throw err;
  }

  // Step 2 — void the OLD settlement_lines row it had materialized into (WORM void-not-delete). Only
  // relevant when the deduction is attached to an open settlement.
  let voidedLineId: string | null = null;
  if (settlementId) {
    const oldLine = await client.query<{ id: string }>(
      `
        UPDATE driver_finance.settlement_lines
           SET is_active = false, voided_at = now(), void_reason = $2, voided_by_user_id = $3::uuid
         WHERE settlement_id = $1::uuid
           AND source_table = 'driver_finance.driver_settlement_deductions'
           AND source_reference_id = $4::uuid
           AND is_active = true
        RETURNING id::text
      `,
      [settlementId, `SET-01 edit: ${reason}`, input.actorUserId, d.id]
    );
    voidedLineId = oldLine.rows[0]?.id ?? null;
  }

  // Step 3 — create the REPLACEMENT deduction with the edited amount/type/reason (real writer, never
  // a bare UPDATE — the WORM audit sees a new row, matching the void-not-delete law).
  const replacement = await createSettlementDeduction(client as unknown as DeductionsQueryable, {
    driverId: d.driver_id,
    operatingCompanyId: input.operatingCompanyId,
    amountCents: nextAmountCents,
    reason,
    sourceType: nextType,
    loadId: d.load_id,
    createdByUserId: input.actorUserId,
  });

  // Step 4 — re-materialize so the replacement gets a fresh, role-resolved posting_account_id under
  // the (possibly changed) type. createSettlementDeduction already materializes when the deduction
  // is load-linked and an open settlement exists; run it explicitly for the attached-settlement case
  // (idempotent) so a non-load-linked edit on an open settlement also re-lines.
  let materialize: MaterializeSettlementLinesResult | null = null;
  if (settlementId) {
    materialize = await materializeSettlementLines(client as never, {
      settlementId,
      operatingCompanyId: input.operatingCompanyId,
      actorUserId: input.actorUserId,
    });
  }

  await appendCrudAudit(
    client as never,
    input.actorUserId,
    "driver_finance.settlement_deduction.edited",
    {
      resource_type: "driver_finance.driver_settlement_deductions",
      resource_id: replacement.id,
      operating_company_id: input.operatingCompanyId,
      driver_id: d.driver_id,
      old_deduction_id: d.id,
      old_amount_cents: currentAmountCents,
      new_amount_cents: nextAmountCents,
      old_deduction_type: d.deduction_type,
      new_deduction_type: nextType,
      old_settlement_line_id: voidedLineId,
      reason,
    },
    "info",
    "SET-01-EDIT-DEDUCTION"
  );

  return {
    oldDeductionId: d.id,
    newDeductionId: replacement.id,
    voidedLineId,
    materialize,
    newAmountCents: nextAmountCents,
    newType: nextType,
  };
}
