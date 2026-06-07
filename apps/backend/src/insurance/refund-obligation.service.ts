/**
 * Block F Decision C — durable insurance refund obligations.
 *
 * When a policy is cancelled but the COA roles needed to post the unearned-
 * premium refund are not mapped, we persist a DURABLE obligation row instead of
 * silently skipping. The obligation carries everything required to post the
 * refund later via the existing createJournalEntry() service:
 *   tenant_id, policy_id, amount_cents, debit_role, credit_role,
 *   deterministic_memo, entry_date.
 *
 * Draining (auto-/one-click post) resolves the roles and, when available, posts
 * the JE. Dedupe is by deterministic_memo (the SAME memo used for JE dedupe), so
 * retries never double-post — both a unique constraint on the obligation and a
 * pre-post JE lookup enforce this.
 *
 * FINANCIAL RULE: all posting goes through createJournalEntry(). No new
 * financial ledger code here.
 */

import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { createJournalEntry } from "../accounting/journal-entries.service.js";

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
 * Upsert a pending refund obligation. Idempotent on (tenant_id,
 * deterministic_memo): a retry never creates a duplicate.
 */
export async function recordPendingRefundObligation(
  client: Queryable,
  input: RecordRefundObligationInput
): Promise<{ id: string; created: boolean }> {
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO insurance.refund_obligation (
        tenant_id,
        policy_id,
        amount_cents,
        debit_role,
        credit_role,
        deterministic_memo,
        entry_date,
        status
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::date, 'pending')
      ON CONFLICT (tenant_id, deterministic_memo) DO NOTHING
      RETURNING id::text
    `,
    [
      input.operatingCompanyId,
      input.policyId,
      input.amountCents,
      input.debitRole ?? "ap_control",
      input.creditRole ?? "expense_default",
      input.deterministicMemo,
      input.entryDate,
    ]
  );
  if (res.rows[0]) return { id: res.rows[0].id, created: true };

  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM insurance.refund_obligation
      WHERE tenant_id = $1::uuid AND deterministic_memo = $2
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
  const filters = ["tenant_id = $1::uuid", "status = 'pending'"];
  const values: unknown[] = [input.operatingCompanyId];
  if (input.policyId) {
    values.push(input.policyId);
    filters.push(`policy_id = $${values.length}::uuid`);
  }
  const pendingRes = await client.query<DrainPolicyRow>(
    `
      SELECT id::text, amount_cents::bigint, debit_role, credit_role, deterministic_memo, entry_date::text
      FROM insurance.refund_obligation
      WHERE ${filters.join(" AND ")}
      ORDER BY created_at ASC
    `,
    values
  );

  const result: DrainResult = { posted: [], still_pending: [] };

  for (const obligation of pendingRes.rows) {
    const debitAccountId = await resolveRoleAccountOptional(client, input.operatingCompanyId, obligation.debit_role as never);
    const creditAccountId = await resolveRoleAccountOptional(
      client,
      input.operatingCompanyId,
      obligation.credit_role as never
    );
    if (!debitAccountId || !creditAccountId) {
      result.still_pending.push({ obligation_id: obligation.id, reason: "coa_role_mapping_not_found" });
      continue;
    }

    const amountCents = Number(obligation.amount_cents);

    // Dedupe: reuse an existing posted JE with the same memo if present.
    const existingJe = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM accounting.journal_entries
        WHERE operating_company_id = $1::uuid
          AND status = 'posted'
          AND memo = $2
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [input.operatingCompanyId, obligation.deterministic_memo]
    );

    let journalEntryId: string;
    let reused: boolean;
    if (existingJe.rows[0]) {
      journalEntryId = existingJe.rows[0].id;
      reused = true;
    } else {
      const je = await createJournalEntry(
        {
          operating_company_id: input.operatingCompanyId,
          entry_date: obligation.entry_date,
          memo: obligation.deterministic_memo,
          source: "auto",
          postings: [
            { account_id: debitAccountId, debit_or_credit: "debit", amount_cents: amountCents, description: obligation.deterministic_memo },
            { account_id: creditAccountId, debit_or_credit: "credit", amount_cents: amountCents, description: obligation.deterministic_memo },
          ],
        },
        { userId: input.userId, role: input.role }
      );
      journalEntryId = je.id;
      reused = false;
    }

    await client.query(
      `
        UPDATE insurance.refund_obligation
        SET status = 'posted',
            journal_entry_id = $3::uuid,
            posted_at = now(),
            updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND status = 'pending'
      `,
      [input.operatingCompanyId, obligation.id, journalEntryId]
    );

    result.posted.push({ obligation_id: obligation.id, journal_entry_id: journalEntryId, amount_cents: amountCents, reused });
  }

  return result;
}
