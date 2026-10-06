/**
 * Block F Decision C — durable insurance refund obligations.
 *
 * When a policy is cancelled but the COA roles needed to post the unearned-
 * premium refund are not mapped, we persist a DURABLE obligation row instead of
 * silently skipping. The obligation carries everything required to issue the
 * refund later: operating_company_id, policy_id, amount_cents, debit_role,
 * credit_role, deterministic_memo, entry_date.
 *
 * Draining (auto-/one-click post) resolves the credit role and the policy's
 * insurer vendor and issues a VENDOR CREDIT on the caller's transaction
 * (LST-F414: A/P is written only by its documents, ROUND 393.1). Dedupe is by
 * deterministic_memo (the credit's notes, or a JE posted before LST-F414), so
 * retries never double-post — the obligation's unique constraint enforces it too.
 *
 * FINANCIAL RULE: all posting goes through createVendorCreditInClientTx(). No new
 * financial ledger code here.
 */

import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { createVendorCreditInClientTx } from "../accounting/vendor-credits.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type RecordRefundObligationInput = {
  operatingCompanyId: string;
  policyId: string;
  amountCents: number;
  deterministicMemo: string;
  entryDate: string;
  debitRole?: string;
  creditRole?: string;
};

/**
 * Upsert a pending refund obligation. Idempotent on (operating_company_id,
 * deterministic_memo): a retry never creates a duplicate.
 */
export async function recordPendingRefundObligation(
  client: Queryable,
  input: RecordRefundObligationInput
): Promise<{ id: string; created: boolean }> {
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO insurance.refund_obligation (
        -- ROUND 342: the one scope column, written from $1.
        operating_company_id,
        policy_id,
        amount_cents,
        debit_role,
        credit_role,
        deterministic_memo,
        entry_date,
        status
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::date, 'pending')
      ON CONFLICT (operating_company_id, deterministic_memo) DO NOTHING
      RETURNING id::text
    `,
    [
      input.operatingCompanyId,
      input.policyId,
      input.amountCents,
      input.debitRole ?? "ap_control",
      // LST-F414 — the account the premium bills debited (policy-bill-schedule.service.ts), not expense_default.
      input.creditRole ?? "insurance_expense",
      input.deterministicMemo,
      input.entryDate,
    ]
  );
  if (res.rows[0]) return { id: res.rows[0].id, created: true };

  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM insurance.refund_obligation
      WHERE operating_company_id = $1::uuid AND deterministic_memo = $2
      LIMIT 1
    `,
    [input.operatingCompanyId, input.deterministicMemo]
  );
  return { id: existing.rows[0]?.id ?? "", created: false };
}

export type DrainResult = {
  posted: Array<{ obligation_id: string; journal_entry_id: string; amount_cents: number; reused: boolean }>;
  still_pending: Array<{ obligation_id: string; reason: string }>;
};

type DrainPolicyRow = {
  id: string;
  amount_cents: string | number;
  debit_role: string;
  credit_role: string;
  deterministic_memo: string;
  entry_date: string;
  vendor_id: string | null;
};

/**
 * Drain pending refund obligations for a tenant: resolve the COA roles and post
 * the refund JE via createJournalEntry(). Roles still unmapped → left pending.
 * Dedupe by deterministic memo (existing posted JE is reused, never re-posted).
 *
 * `client` must be RLS-scoped to operatingCompanyId. `createJournalEntry` opens
 * its own transaction; we mark the obligation posted in this client afterwards.
 */
export async function postPendingRefundObligations(
  client: Queryable,
  input: { operatingCompanyId: string; userId: string; role: string; policyId?: string }
): Promise<DrainResult> {
  const filters = ["operating_company_id = $1::uuid", "status = 'pending'"];
  const values: unknown[] = [input.operatingCompanyId];
  if (input.policyId) {
    values.push(input.policyId);
    filters.push(`policy_id = $${values.length}::uuid`);
  }
  const pendingRes = await client.query<DrainPolicyRow>(
    `
      SELECT o.id::text, o.amount_cents::bigint, o.debit_role, o.credit_role, o.deterministic_memo, o.entry_date::text,
             p.vendor_id::text AS vendor_id
      FROM insurance.refund_obligation o
      LEFT JOIN insurance.policy p ON p.id = o.policy_id AND p.operating_company_id = o.operating_company_id
      WHERE ${filters.map((f) => `o.${f}`).join(" AND ")}
      ORDER BY o.created_at ASC
    `,
    values
  );

  const result: DrainResult = { posted: [], still_pending: [] };

  for (const obligation of pendingRes.rows) {
    // LST-F414 — the refund is a vendor credit to the insurer: Dr A/P (the debit role is always ap_control) / Cr the
    // credit role's account. A raw journal line on ap_control is refused at write time (ROUND 393.1).
    const creditAccountId = await resolveRoleAccountOptional(
      client,
      input.operatingCompanyId,
      obligation.credit_role as never
    );
    if (!creditAccountId) {
      result.still_pending.push({ obligation_id: obligation.id, reason: "coa_role_mapping_not_found" });
      continue;
    }
    if (!obligation.vendor_id) {
      result.still_pending.push({ obligation_id: obligation.id, reason: "insurer_vendor_missing" });
      continue;
    }

    const amountCents = Number(obligation.amount_cents);

    // Dedupe on the deterministic memo: a credit already issued for it, or a JE posted before LST-F414.
    const existing = await client.query<{ id: string | null }>(
      `
        SELECT COALESCE(
          (SELECT vc.journal_entry_id::text FROM accounting.vendor_credits vc
            WHERE vc.operating_company_id = $1::uuid AND vc.notes = $2 AND vc.voided_at IS NULL
            ORDER BY vc.created_at ASC LIMIT 1),
          (SELECT je.id::text FROM accounting.journal_entries je
            WHERE je.operating_company_id = $1::uuid AND je.status = 'posted' AND je.memo = $2
            ORDER BY je.created_at ASC LIMIT 1)
        ) AS id
      `,
      [input.operatingCompanyId, obligation.deterministic_memo]
    );

    let journalEntryId: string;
    let reused: boolean;
    if (existing.rows[0]?.id) {
      journalEntryId = existing.rows[0].id;
      reused = true;
    } else {
      const credit = await createVendorCreditInClientTx(client, {
        operatingCompanyId: input.operatingCompanyId,
        vendorId: obligation.vendor_id,
        issueDate: obligation.entry_date,
        amountCents,
        accountId: creditAccountId,
        notes: obligation.deterministic_memo,
        userId: input.userId,
      });
      if (!credit.journal_entry_id) {
        result.still_pending.push({ obligation_id: obligation.id, reason: "vendor_credit_not_posted" });
        continue;
      }
      journalEntryId = credit.journal_entry_id;
      reused = false;
    }

    await client.query(
      `
        UPDATE insurance.refund_obligation
        SET status = 'posted',
            journal_entry_id = $3::uuid,
            posted_at = now(),
            updated_at = now()
        WHERE operating_company_id = $1::uuid AND id = $2::uuid AND status = 'pending'
      `,
      [input.operatingCompanyId, obligation.id, journalEntryId]
    );

    result.posted.push({ obligation_id: obligation.id, journal_entry_id: journalEntryId, amount_cents: amountCents, reused });
  }

  return result;
}
