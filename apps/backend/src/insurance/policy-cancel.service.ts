/**
 * Block F — Insurance policy cancellation + unearned-premium refund.
 *
 * Cancelling a policy:
 *   1. Sets policy.status = 'cancelled' + records cancelled_on + cancel_reason.
 *   2. Stops FUTURE, NOT-YET-ISSUED schedule rows by setting bill_status='cancelled'
 *      (rows with bill_uuid IS NULL and due_date >= cancelled_on). Already-issued
 *      bills (bill_uuid set) are left untouched — issued AP is never deleted here.
 *   3. Books the unearned-premium refund as a SEPARATE credit line via the existing
 *      accounting service createJournalEntry() (per VQ6 — NOT a negative premium and
 *      NO new financial code). Unearned premium is pro-rated by remaining days.
 *
 * Idempotency (in addition to the HTTP Idempotency-Key middleware that already covers
 * /api/v1/insurance/policies/*):
 *   - An already-cancelled policy is a no-op (returns the current state).
 *   - The refund journal entry is deduped by its deterministic memo, so a retry after
 *     a partial failure (JE committed, policy update not yet) never double-posts. The
 *     JE is posted BEFORE the policy is flipped to 'cancelled' so a crash in between is
 *     recoverable on retry.
 *
 * All DB work is RLS-scoped to the operating company.
 */

import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { createJournalEntry } from "../accounting/journal-entries.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { recordPendingRefundObligation } from "./refund-obligation.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

type PolicyRow = {
  id: string;
  status: string;
  policy_number: string;
  insurer_name: string;
  total_premium_cents: string | number;
  effective_date: string;
  expiry_date: string;
  cancelled_on: string | null;
  cancel_reason: string | null;
};

export type CancelRefund = {
  journal_entry_id: string;
  amount_cents: number;
  reused: boolean;
};

export type CancelPolicyResult =
  | { kind: "policy_not_found" }
  | { kind: "already_cancelled"; policy: Record<string, unknown> }
  | {
      kind: "ok";
      policy: Record<string, unknown>;
      cancelled_schedule_count: number;
      unearned_premium_cents: number;
      refund: CancelRefund | null;
      refund_skipped_reason: string | null;
      refund_obligation_id: string | null;
    };

export type CancelPolicyInput = {
  userId: string;
  role: string;
  operatingCompanyId: string;
  policyId: string;
  cancelledOn: string;
  cancelReason: string;
};

const CANCEL_SELECT = `
  id::text,
  status,
  policy_number,
  insurer_name,
  total_premium_cents::bigint,
  effective_date::text,
  expiry_date::text,
  cancelled_on::text,
  cancel_reason
`;

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00.000Z`);
  const to = Date.parse(`${toIso}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Pro-rata unearned premium in cents: total * (remaining days / total days),
 * clamped to [0, total]. Cancelling on/after expiry => 0; on/before effective => full.
 */
export function computeUnearnedPremiumCents(
  totalPremiumCents: number,
  effectiveDate: string,
  expiryDate: string,
  cancelledOn: string
): number {
  const total = Math.max(0, Math.trunc(totalPremiumCents));
  if (total === 0) return 0;
  const totalDays = daysBetween(effectiveDate, expiryDate);
  if (totalDays <= 0) return 0;
  const elapsedDays = daysBetween(effectiveDate, cancelledOn);
  const remainingDays = Math.min(Math.max(totalDays - elapsedDays, 0), totalDays);
  if (remainingDays <= 0) return 0;
  const unearned = Math.round((total * remainingDays) / totalDays);
  return Math.min(Math.max(unearned, 0), total);
}

function refundMemo(policyId: string, policyNumber: string): string {
  // Deterministic — used both as the human-readable memo AND the idempotency marker.
  return `Insurance cancellation refund (unearned premium) — policy ${policyNumber} [refund:insurance_policy_cancellation:policy=${policyId}]`;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
): Promise<T> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client as Queryable);
  });
}

export async function cancelInsurancePolicy(input: CancelPolicyInput): Promise<CancelPolicyResult> {
  // --- Phase 1: read policy, resolve accounts, compute refund, dedupe JE. ---
  const pre = await withCompanyScope(input.userId, input.operatingCompanyId, async (client) => {
    const policyRes = await client.query<PolicyRow>(
      `SELECT ${CANCEL_SELECT} FROM insurance.policy WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.operatingCompanyId, input.policyId]
    );
    const policy = policyRes.rows[0];
    if (!policy) return { kind: "policy_not_found" as const };
    if (policy.status === "cancelled") {
      return { kind: "already_cancelled" as const, policy: policy as unknown as Record<string, unknown> };
    }

    const unearnedCents = computeUnearnedPremiumCents(
      Number(policy.total_premium_cents),
      policy.effective_date,
      policy.expiry_date,
      input.cancelledOn
    );

    let apAccountId: string | null = null;
    let expenseAccountId: string | null = null;
    let existingRefundJeId: string | null = null;
    if (unearnedCents > 0) {
      apAccountId = await resolveRoleAccountOptional(client, input.operatingCompanyId, "ap_control");
      expenseAccountId = await resolveRoleAccountOptional(client, input.operatingCompanyId, "expense_default");
      const memo = refundMemo(policy.id, policy.policy_number);
      const existing = await client.query<{ id: string }>(
        `
          SELECT id::text
          FROM accounting.journal_entries
          WHERE operating_company_id = $1::uuid
            AND status = 'posted'
            AND memo = $2
          ORDER BY created_at ASC
          LIMIT 1
        `,
        [input.operatingCompanyId, memo]
      );
      existingRefundJeId = existing.rows[0]?.id ?? null;
    }

    return {
      kind: "proceed" as const,
      policy,
      unearnedCents,
      apAccountId,
      expenseAccountId,
      existingRefundJeId,
    };
  });

  if (pre.kind !== "proceed") return pre;

  // --- Phase 2: post the unearned-premium refund as a separate credit line. ---
  // Posted BEFORE flipping the policy to 'cancelled' (recoverable on retry).
  let refund: CancelRefund | null = null;
  let refundSkippedReason: string | null = null;
  if (pre.unearnedCents > 0) {
    if (pre.existingRefundJeId) {
      refund = { journal_entry_id: pre.existingRefundJeId, amount_cents: pre.unearnedCents, reused: true };
    } else if (pre.apAccountId && pre.expenseAccountId) {
      const memo = refundMemo(pre.policy.id, pre.policy.policy_number);
      const description = `Unearned premium refund on cancellation of policy ${pre.policy.policy_number} (${pre.policy.insurer_name})`;
      const je = await createJournalEntry(
        {
          operating_company_id: input.operatingCompanyId,
          entry_date: input.cancelledOn,
          memo,
          source: "auto",
          postings: [
            // Debit AP control: reduce the payable owed to the insurer for the unearned portion.
            {
              account_id: pre.apAccountId,
              debit_or_credit: "debit",
              amount_cents: pre.unearnedCents,
              description,
            },
            // Credit insurance expense: the separate credit line (reverses unearned premium).
            {
              account_id: pre.expenseAccountId,
              debit_or_credit: "credit",
              amount_cents: pre.unearnedCents,
              description,
            },
          ],
        },
        { userId: input.userId, role: input.role }
      );
      refund = { journal_entry_id: je.id, amount_cents: pre.unearnedCents, reused: false };
    } else {
      // No COA role mapping resolvable — cancellation still proceeds; refund must be booked manually.
      refundSkippedReason = "coa_role_mapping_not_found";
    }
  }

  // --- Phase 3: flip the policy to cancelled + stop future unissued schedule rows. ---
  const result = await withCompanyScope(input.userId, input.operatingCompanyId, async (client) => {
    const updatedRes = await client.query(
      `
        UPDATE insurance.policy
        SET status = 'cancelled',
            cancelled_on = $3::date,
            cancel_reason = $4,
            updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid
        RETURNING ${CANCEL_SELECT}
      `,
      [input.operatingCompanyId, input.policyId, input.cancelledOn, input.cancelReason]
    );
    const updated = updatedRes.rows[0];
    if (!updated) return { kind: "policy_not_found" as const };

    const cancelledSched = await client.query<{ id: string }>(
      `
        UPDATE insurance.payment_schedule
        SET bill_status = 'cancelled',
            updated_at = now()
        WHERE tenant_id = $1::uuid
          AND policy_id = $2::uuid
          AND bill_uuid IS NULL
          AND due_date >= $3::date
          AND bill_status NOT IN ('cancelled', 'voided', 'issued')
        RETURNING id::text
      `,
      [input.operatingCompanyId, input.policyId, input.cancelledOn]
    );

    // Decision C: a positive unearned premium that could NOT be posted (COA roles
    // unmapped) is NOT silently dropped. Emit a CRITICAL audit event and persist a
    // durable, drainable obligation so the refund can be posted once roles exist.
    let refundObligationId: string | null = null;
    if (refundSkippedReason) {
      const obligation = await recordPendingRefundObligation(client, {
        operatingCompanyId: input.operatingCompanyId,
        policyId: input.policyId,
        amountCents: pre.unearnedCents,
        deterministicMemo: refundMemo(pre.policy.id, pre.policy.policy_number),
        entryDate: input.cancelledOn,
      });
      refundObligationId = obligation.id || null;

      await appendCrudAudit(
        client,
        input.userId,
        "insurance.policy.refund_pending_coa_unmapped",
        {
          resource_type: "insurance.policy",
          resource_id: input.policyId,
          operating_company_id: input.operatingCompanyId,
          unearned_premium_cents: pre.unearnedCents,
          refund_obligation_id: refundObligationId,
          intended_debit_role: "ap_control",
          intended_credit_role: "expense_default",
          deterministic_memo: refundMemo(pre.policy.id, pre.policy.policy_number),
          reason: refundSkippedReason,
        },
        "warning",
        "BLOCK-F-REFUND-COA-UNMAPPED"
      );
    }

    await appendCrudAudit(client, input.userId, "insurance.policy.cancelled", {
      resource_type: "insurance.policy",
      resource_id: input.policyId,
      operating_company_id: input.operatingCompanyId,
      cancelled_on: input.cancelledOn,
      cancel_reason: input.cancelReason,
      cancelled_schedule_count: cancelledSched.rows.length,
      unearned_premium_cents: pre.unearnedCents,
      refund_journal_entry_id: refund?.journal_entry_id ?? null,
      refund_obligation_id: refundObligationId,
    });

    return {
      kind: "ok" as const,
      policy: updated as unknown as Record<string, unknown>,
      cancelledScheduleCount: cancelledSched.rows.length,
      refundObligationId,
    };
  });

  if (result.kind === "policy_not_found") return { kind: "policy_not_found" };

  return {
    kind: "ok",
    policy: result.policy,
    cancelled_schedule_count: result.cancelledScheduleCount,
    refund_obligation_id: result.refundObligationId,
    unearned_premium_cents: pre.unearnedCents,
    refund,
    refund_skipped_reason: refundSkippedReason,
  };
}
