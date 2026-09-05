// ACCT-SETL-DEDUCTION-VOID-DESIGN — OWNER RULING 2026-09-05 19:44Z ("why would I forgive the
// debt"), superseding the earlier docs/bus/OUTBOX-CURSOR.md design this file originally built to
// (retracted there too — "my earlier 'refund vs stop-collection' framing was wrong"):
// driver_finance.driver_settlement_deductions void is ONE route, THREE branches keyed off status,
// and NONE of them ever forgive, refund, or write off the debt. A void changes only WHEN/HOW an
// amount is collected, never WHETHER.
//
//   PENDING (nothing collected)  -> void the row (voided_at/void_reason/voided_by), no money moved.
//                                   The uncollected amount is carried forward to be re-collected in
//                                   a later settlement (this row's own remaining_balance_cents is
//                                   the scheduling artifact for THIS attempt only — the underlying
//                                   debt source, e.g. the cash-advance/escrow balance this deduction
//                                   was drawing down, is untouched by this UPDATE, so the next
//                                   settlement build still sees the debt and schedules it again).
//   PARTIAL (some collected)     -> NEVER touch the collected portion; void/close only the
//                                   uncollected REMAINING schedule going forward; the collected
//                                   amount stays posted (real history); void_reason notes exactly
//                                   how much was already collected and retained.
//   APPLIED (fully collected)    -> RECORD-ONLY void. No reversing JE, no money moves, the driver
//                                   is NEVER credited back — "any already-collected portion stays
//                                   correctly applied (it really did pay down the debt)". The
//                                   earlier version of this file posted a reversing JE crediting
//                                   the driver via A/P control for a fully-applied deduction — that
//                                   IS the refund the owner explicitly rejected; do not rebuild it.

import { appendCrudAudit } from "../audit/crud-audit.js";
import type { QueryableClient } from "../accounting/journal-entries.service.js";

export class DeductionVoidError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "DeductionVoidError";
  }
}

export type VoidDeductionInput = {
  operating_company_id: string;
  deduction_id: string;
  reason: string;
  actor_user_id: string;
};

export type VoidDeductionResult = {
  id: string;
  status_seen: "pending" | "partial" | "applied";
  outcome: "voided_pending" | "voided_partial_remainder" | "voided_applied_retained";
  collected_cents: number;
  reversed_cents: number;
  journal_entry_id: string | null;
};

/**
 * Loads the deduction FOR UPDATE, dispatches to the correct branch by its CURRENT status, and
 * returns a result describing exactly what happened. Refuses (throws DeductionVoidError) if the row
 * is missing, already voided, or in a status this function does not recognize (fail closed — never
 * guess a new status's treatment).
 */
export async function voidSettlementDeduction(
  client: QueryableClient,
  input: VoidDeductionInput
): Promise<VoidDeductionResult> {
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new DeductionVoidError("void_reason_required", "A reason is required to void a settlement deduction.");

  const row = await client.query<{
    id: string;
    operating_company_id: string;
    driver_id: string;
    deduction_type: string;
    amount_cents: string;
    remaining_balance_cents: string | null;
    status: string;
    bucket_id: string | null;
    voided_at: string | null;
  }>(
    `
      SELECT id::text, operating_company_id::text, driver_id::text, deduction_type,
             amount_cents::text, remaining_balance_cents::text, status,
             bucket_id::text, voided_at::text
        FROM driver_finance.driver_settlement_deductions
       WHERE id = $1::uuid AND operating_company_id = $2::uuid
       LIMIT 1 FOR UPDATE
    `,
    [input.deduction_id, input.operating_company_id]
  );
  const d = row.rows[0];
  if (!d) throw new DeductionVoidError("deduction_not_found");
  if (d.voided_at) throw new DeductionVoidError("deduction_already_voided");

  const amountCents = Number(d.amount_cents);
  const remainingCents = d.remaining_balance_cents != null ? Number(d.remaining_balance_cents) : amountCents;
  const collectedCents = Math.max(0, amountCents - remainingCents);

  if (d.status === "pending") {
    await client.query(
      `
        UPDATE driver_finance.driver_settlement_deductions
        SET remaining_balance_cents = 0,
            voided_at = now(),
            void_reason = $2,
            voided_by_user_id = $3::uuid,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [d.id, reason, input.actor_user_id]
    );
    await auditDeductionVoid(client, input.actor_user_id, d, "pending_voided", { reason });
    return {
      id: d.id,
      status_seen: "pending",
      outcome: "voided_pending",
      collected_cents: 0,
      reversed_cents: 0,
      journal_entry_id: null,
    };
  }

  if (d.status === "partial") {
    const annotatedReason = `${reason} — $${(collectedCents / 100).toFixed(2)} already collected retained`;
    await client.query(
      `
        UPDATE driver_finance.driver_settlement_deductions
        SET remaining_balance_cents = 0,
            voided_at = now(),
            void_reason = $2,
            voided_by_user_id = $3::uuid,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [d.id, annotatedReason, input.actor_user_id]
    );
    await auditDeductionVoid(client, input.actor_user_id, d, "partial_remainder_voided", {
      reason: annotatedReason,
      collected_cents: collectedCents,
      remainder_voided_cents: remainingCents,
    });
    return {
      id: d.id,
      status_seen: "partial",
      outcome: "voided_partial_remainder",
      collected_cents: collectedCents,
      reversed_cents: 0,
      journal_entry_id: null,
    };
  }

  if (d.status === "applied") {
    if (amountCents <= 0) throw new DeductionVoidError("deduction_zero_amount", "Applied deduction has no amount to void.");

    // OWNER RULING 2026-09-05 19:44Z ("why would I forgive the debt"): a void NEVER forgives,
    // refunds, or writes off — it only changes WHEN/HOW an amount is collected, never WHETHER. An
    // APPLIED deduction was already 100% collected — "any already-collected portion stays
    // correctly applied (it really did pay down the debt)". So voiding one is a RECORD-ONLY
    // marker: no reversing JE, no money moves, the driver is never credited back. (The earlier
    // design here posted a reversing JE crediting the driver via A/P control — that IS the refund
    // the owner explicitly rejected; retracted, not built on.)
    await client.query(
      `
        UPDATE driver_finance.driver_settlement_deductions
        SET voided_at = now(),
            void_reason = $2,
            voided_by_user_id = $3::uuid,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [d.id, `${reason} — $${(amountCents / 100).toFixed(2)} already collected, retained (never refunded)`, input.actor_user_id]
    );
    await auditDeductionVoid(client, input.actor_user_id, d, "applied_retained_no_reversal", {
      reason,
      collected_cents: amountCents,
    });
    return {
      id: d.id,
      status_seen: "applied",
      outcome: "voided_applied_retained",
      collected_cents: amountCents,
      reversed_cents: 0,
      journal_entry_id: null,
    };
  }

  // deferred, or any future/unrecognized status — fail closed rather than guess a treatment for a
  // state this ruling never named.
  throw new DeductionVoidError("deduction_status_not_voidable", `status '${d.status}' has no defined void treatment`);
}

async function auditDeductionVoid(
  client: QueryableClient,
  actorUserId: string,
  d: { id: string; operating_company_id: string; driver_id: string },
  outcome: string,
  extra: Record<string, unknown>
) {
  await appendCrudAudit(
    client as never,
    actorUserId,
    "driver_finance.settlement_deduction.voided",
    {
      resource_type: "driver_finance.driver_settlement_deductions",
      resource_id: d.id,
      operating_company_id: d.operating_company_id,
      driver_id: d.driver_id,
      outcome,
      ...extra,
    },
    "warning",
    "ACCT-SETL-DEDUCTION-VOID-DESIGN"
  );
}
