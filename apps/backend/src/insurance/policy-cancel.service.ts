/**
 * Block F — Insurance policy cancellation + unearned-premium refund.
 *
 * Cancelling a policy:
 *   1. Sets policy.status = 'cancelled' + records cancelled_on + cancel_reason.
 *   2. Stops FUTURE, NOT-YET-ISSUED schedule rows by setting bill_status='cancelled'
 *      (rows with bill_uuid IS NULL and due_date >= cancelled_on). Already-issued
 *      bills (bill_uuid set) are left untouched — issued AP is never deleted here.
 *   3. Books the unearned-premium refund as a VENDOR CREDIT to the insurer against
 *      insurance_expense (LST-F414; per VQ6 — NOT a negative premium and NO new
 *      financial code). Unearned premium is pro-rated by remaining days.
 *
 * Idempotency (in addition to the HTTP Idempotency-Key middleware that already covers
 * /api/v1/insurance/policies/*):
 *   - An already-cancelled policy is a no-op (returns the current state).
 *   - The refund vendor credit is deduped by its deterministic memo (its notes), so a
 *     retry after a partial failure (credit committed, policy update not yet) never
 *     double-posts. The credit is issued BEFORE the policy is flipped to 'cancelled' so
 *     a crash in between is recoverable on retry.
 *
 * All DB work is RLS-scoped to the operating company.
 */

import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { createVendorCreditInClientTx } from "../accounting/vendor-credits.service.js";
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
  vendor_id: string | null;
  total_premium_cents: string | number;
  effective_date: string;
  expiry_date: string;
  cancelled_on: string | null;
  cancel_reason: string | null;
};

export type CancelRefund = {
  journal_entry_id: string;
  /** LST-F414 — the refund is a vendor credit to the insurer (A/P is written only by its documents, ROUND 393.1). */
  vendor_credit_id: string;
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
  vendor_id::text,
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
    await setScopedCompanyContext(client, userId, operatingCompanyId);
    return fn(client as Queryable);
  });
}

export async function cancelInsurancePolicy(input: CancelPolicyInput): Promise<CancelPolicyResult> {
  // --- Phase 1: read policy, resolve accounts, compute refund, dedupe JE. ---
  const pre = await withCompanyScope(input.userId, input.operatingCompanyId, async (client) => {
    const policyRes = await client.query<PolicyRow>(
      `SELECT ${CANCEL_SELECT} FROM insurance.policy WHERE operating_company_id = $1::uuid AND id = $2::uuid`,
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

    // LST-F414 — the refund reduces what is owed to the INSURER, so it is that vendor's credit, against the same
    // insurance_expense account the premium bills debited (policy-bill-schedule.service.ts). It used to be a raw
    // `insurance_policy` journal line on ap_control crediting expense_default, which ROUND 393.1's write-time rule
    // refuses and which never reversed the account the premium hit.
    let expenseAccountId: string | null = null;
    let existingRefund: { vendor_credit_id: string; journal_entry_id: string | null } | null = null;
    if (unearnedCents > 0) {
      expenseAccountId = await resolveRoleAccountOptional(client, input.operatingCompanyId, "insurance_expense");
      const existing = await client.query<{ id: string; journal_entry_id: string | null }>(
        `
          SELECT id::text, journal_entry_id::text
          FROM accounting.vendor_credits
          WHERE operating_company_id = $1::uuid
            AND notes = $2
            AND voided_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1
        `,
        [input.operatingCompanyId, refundMemo(policy.id, policy.policy_number)]
      );
      existingRefund = existing.rows[0] ? { vendor_credit_id: existing.rows[0].id, journal_entry_id: existing.rows[0].journal_entry_id } : null;
    }
    return {
      kind: "proceed" as const,
      policy,
      unearnedCents,
      expenseAccountId,
      existingRefund,
    };
  });

  if (pre.kind !== "proceed") return pre;

  // --- Phase 2: post the unearned-premium refund as a separate credit line. ---
  // Posted BEFORE flipping the policy to 'cancelled' (recoverable on retry).
  let refund: CancelRefund | null = null;
  let refundSkippedReason: string | null = null;
  if (pre.unearnedCents > 0) {
    if (pre.existingRefund) {
      refund = {
        journal_entry_id: pre.existingRefund.journal_entry_id ?? "",
        vendor_credit_id: pre.existingRefund.vendor_credit_id,
        amount_cents: pre.unearnedCents,
        reused: true,
      };
    } else if (!pre.expenseAccountId) {
      // No COA role mapping resolvable — cancellation still proceeds; refund must be booked manually.
      refundSkippedReason = "coa_role_mapping_not_found";
    } else if (!pre.policy.vendor_id) {
      // No insurer vendor on the policy — there is no one to hold the credit. Durable obligation below, never a plug.
      refundSkippedReason = "insurer_vendor_missing";
    } else {
      const vendorId = pre.policy.vendor_id;
      const expenseAccountId = pre.expenseAccountId;
      const credit = await withCompanyScope(input.userId, input.operatingCompanyId, (client) =>
        createVendorCreditInClientTx(client, {
          operatingCompanyId: input.operatingCompanyId,
          vendorId,
          issueDate: input.cancelledOn,
          amountCents: pre.unearnedCents,
          accountId: expenseAccountId,
          notes: refundMemo(pre.policy.id, pre.policy.policy_number),
          userId: input.userId,
        })
      );
      refund = {
        journal_entry_id: credit.journal_entry_id ?? "",
        vendor_credit_id: credit.id,
        amount_cents: pre.unearnedCents,
        reused: false,
      };
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
        WHERE operating_company_id = $1::uuid AND id = $2::uuid
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
        WHERE operating_company_id = $1::uuid
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
          intended_credit_role: "insurance_expense",
          deterministic_memo: refundMemo(pre.policy.id, pre.policy.policy_number),
          reason: refundSkippedReason,
        },
        "critical",
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
