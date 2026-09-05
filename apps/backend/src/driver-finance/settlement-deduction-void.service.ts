// ACCT-SETL-DEDUCTION-VOID-DESIGN — owner ruling (docs/bus/OUTBOX-CURSOR.md, CURSOR -> CC-1, "RULINGS
// (settled law — build on them, no wait)"): driver_finance.driver_settlement_deductions void is ONE
// route, THREE branches keyed off status. "Void is a reversal, never a delete."
//
//   PENDING (nothing collected)  -> void the row (voided_at/void_reason/voided_by), no money moved.
//   PARTIAL (some collected)     -> NEVER touch the collected portion; void/close only the
//                                   uncollected REMAINING schedule going forward; the collected
//                                   amount stays posted (real history); void_reason notes exactly
//                                   how much was already collected and retained.
//   APPLIED (fully collected)    -> NOT a void — a reversing JE that credits the driver back,
//                                   routed through journal-entries.service, never a silent void of
//                                   posted money.
//
// The reversing JE for APPLIED reuses the SAME account-resolution primitives the canonical posting
// engine (settlement-bill-payment-posting.service.ts) uses for the ORIGINAL entry — never a second,
// independently-derived lookup for the same account. Mirrors that entry exactly, scoped to just this
// one deduction's amount: the original posts Dr ap_control / Cr <deduction's resolved account>; the
// reversal posts Dr <that same account> / Cr ap_control, crediting the driver (modeled as a VENDOR
// via A/P, per that engine's own header comment) back by exactly what this one row took.

import { appendCrudAudit } from "../audit/crud-audit.js";
import { createJournalEntryOnClient, type QueryableClient } from "../accounting/journal-entries.service.js";
import { resolveRoleAccountOptional, isCoaRole } from "../accounting/coa-roles/resolver.service.js";
import { resolveDriverOwnAccount } from "../accounting/settlement-posting/settlement-bill-payment-posting.service.js";
import { classifyDeductionTarget, bucketRecoveryRoleKey } from "../accounting/settlement-posting/settlement-bill-payment.math.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

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
  outcome: "voided_pending" | "voided_partial_remainder" | "reversed_applied";
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
    if (amountCents <= 0) throw new DeductionVoidError("deduction_zero_amount", "Applied deduction has no amount to reverse.");

    const bucketRes = d.bucket_id
      ? await client.query<{ bucket_type: string | null }>(
          `SELECT bucket_type FROM driver_finance.driver_deduction_buckets WHERE id = $1::uuid LIMIT 1`,
          [d.bucket_id]
        )
      : { rows: [] as Array<{ bucket_type: string | null }> };
    const bucketType = bucketRes.rows[0]?.bucket_type ?? null;
    const target = classifyDeductionTarget(d.deduction_type, bucketType);

    const driverRes = await client.query<{ driver_name: string; hire_date: string | null }>(
      `SELECT concat_ws(' ', first_name, last_name) AS driver_name, hire_date::text AS hire_date
         FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [d.driver_id, input.operating_company_id]
    );
    const driverName = String(driverRes.rows[0]?.driver_name ?? "").trim();
    const driverHireDate = driverRes.rows[0]?.hire_date ?? null;

    let deductionAccountId: string | null;
    if (target === "advance") {
      deductionAccountId = await resolveDriverOwnAccount(client, input.operating_company_id, d.driver_id, driverName, "advance");
      if (!deductionAccountId) {
        throw new DeductionVoidError(
          "driver_advance_account_missing",
          `Driver ${d.driver_id} has no provisioned Cash-Advance ASSET sub-account to reverse this deduction against`
        );
      }
    } else if (target === "escrow") {
      deductionAccountId = await resolveDriverOwnAccount(client, input.operating_company_id, d.driver_id, driverName, "escrow", driverHireDate);
      if (!deductionAccountId) {
        throw new DeductionVoidError(
          "driver_escrow_account_missing",
          `Driver ${d.driver_id} has no provisioned Driver-Escrow LIABILITY sub-account to reverse this deduction against`
        );
      }
    } else {
      const roleKey = bucketRecoveryRoleKey(d.deduction_type);
      deductionAccountId = isCoaRole(roleKey) ? await resolveRoleAccountOptional(client, input.operating_company_id, roleKey) : null;
      if (!deductionAccountId) {
        throw new DeductionVoidError(
          "deduction_recovery_account_missing",
          `No active '${roleKey}' role designation for deduction type '${d.deduction_type}'`
        );
      }
    }

    const apAccountId = await resolveRoleAccountOptional(client, input.operating_company_id, "ap_control");
    if (!apAccountId) {
      throw new DeductionVoidError("ap_account_missing", "No A/P control account (ap_control) designated");
    }

    const je = await createJournalEntryOnClient(
      client,
      {
        operating_company_id: input.operating_company_id,
        entry_date: companyBusinessDate(),
        memo: `Settlement deduction reversal — ${reason}`,
        source: "manual",
        postings: [
          // Undo the original credit to the deduction's own account, then credit the driver back
          // (A/P control — the driver is modeled as a vendor for settlement purposes, matching the
          // canonical posting engine's own convention).
          { account_id: deductionAccountId, debit_or_credit: "debit", amount_cents: amountCents },
          { account_id: apAccountId, debit_or_credit: "credit", amount_cents: amountCents },
        ],
      },
      { userId: input.actor_user_id, role: "Owner" }
    );

    await client.query(
      `
        UPDATE driver_finance.driver_settlement_deductions
        SET voided_at = now(),
            void_reason = $2,
            voided_by_user_id = $3::uuid,
            void_reversal_entry_id = $4::uuid,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [d.id, reason, input.actor_user_id, je.id]
    );
    await auditDeductionVoid(client, input.actor_user_id, d, "applied_reversed", {
      reason,
      reversed_cents: amountCents,
      journal_entry_id: je.id,
    });
    return {
      id: d.id,
      status_seen: "applied",
      outcome: "reversed_applied",
      collected_cents: amountCents,
      reversed_cents: amountCents,
      journal_entry_id: je.id,
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
