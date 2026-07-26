// MNT-ECON-04 — warranty reimbursement → balanced JE. FINANCIAL-HOLD.
// INERT until WARRANTY_REIMBURSE_GL_POSTING_ENABLED is flipped per entity.
//
// DEFECT: POST /warranty/claims/:id/reimburse only stamps status/amount/audit —
// vendor-recovery dollars never reach the ledger (FOR-CURSOR 4 · MNT-ECON-04).
//
// WRITES ZERO NEW GL MATH. Reuses createJournalEntry:
//   Dr cash_clearing (or ar_control when receivable treatment is designated later)
//   Cr warranty_recovery (owner-designated — typically a contra to repair/parts expense;
//      NEVER sales income per MNT-ECON-04).
// Flag OFF => zero JE writes. Idempotency via accounting.warranty_reimburse_postings.

import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { createJournalEntry } from "../journal-entries.service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";

export const WARRANTY_REIMBURSE_GL_POSTING_FLAG = "WARRANTY_REIMBURSE_GL_POSTING_ENABLED";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type WarrantyReimbursePostResult = {
  posted: boolean;
  reason?:
    | "flag_off"
    | "zero_amount"
    | "already_posted"
    | "claim_not_found"
    | "not_reimbursed";
  journal_entry_id?: string;
  memo?: string;
};

const FLAG_OFF: WarrantyReimbursePostResult = { posted: false, reason: "flag_off" };

export function buildWarrantyReimbursePostings(
  cashAccountId: string,
  recoveryAccountId: string,
  amountCents: number,
  memo: string
) {
  return [
    {
      account_id: cashAccountId,
      debit_or_credit: "debit" as const,
      amount_cents: amountCents,
      description: `${memo} — cash/AR from vendor recovery`,
    },
    {
      account_id: recoveryAccountId,
      debit_or_credit: "credit" as const,
      amount_cents: amountCents,
      description: `${memo} — credit original repair/parts expense`,
    },
  ];
}

async function postingEnabled(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client as never, WARRANTY_REIMBURSE_GL_POSTING_FLAG, {
    operating_company_id: operatingCompanyId,
  });
}

export type PostWarrantyReimburseInput = {
  operating_company_id: string;
  claim_id: string;
  actor_user_id: string;
  entry_date_iso: string;
  reimbursement_amount_cents: number;
};

export async function postWarrantyReimbursement(
  input: PostWarrantyReimburseInput
): Promise<WarrantyReimbursePostResult> {
  const amount = Number(input.reimbursement_amount_cents ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return { posted: false, reason: "zero_amount" };

  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      input.operating_company_id,
    ]);
    if (!(await postingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const claim = await client.query<{
      id: string;
      status: string;
      claim_number: string | null;
      reimbursement_amount_cents: number | null;
    }>(
      `SELECT id::text, status, claim_number,
              reimbursement_amount_cents
       FROM maintenance.warranty_claims
       WHERE operating_company_id = $1::uuid AND id = $2::uuid AND archived_at IS NULL
       LIMIT 1`,
      [input.operating_company_id, input.claim_id]
    );
    const row = claim.rows[0];
    if (!row) return { gate: "claim_not_found" as const };
    if (row.status !== "reimbursed") return { gate: "not_reimbursed" as const };

    const existing = await client.query<{ id: string; expense_je_id: string | null }>(
      `SELECT id::text, expense_je_id::text
       FROM accounting.warranty_reimburse_postings
       WHERE operating_company_id = $1::uuid AND warranty_claim_id = $2::uuid AND is_active
       LIMIT 1`,
      [input.operating_company_id, input.claim_id]
    );
    if (existing.rows[0]?.id) {
      return {
        gate: "already_posted" as const,
        journal_entry_id: existing.rows[0].expense_je_id ?? undefined,
      };
    }

    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
    // warranty_recovery — owner designates a contra-expense / recovery account (NEVER sales income).
    const recoveryAccountId = await resolveRoleAccount(
      client,
      input.operating_company_id,
      "warranty_recovery"
    );
    const entryDate = input.entry_date_iso.slice(0, 10);
    const label = row.claim_number?.trim() || row.id;
    const memo = `Warranty reimbursement — ${label} [${row.id}]`;

    return {
      gate: "post" as const,
      amount,
      entryDate,
      memo,
      postings: buildWarrantyReimbursePostings(cashAccountId, recoveryAccountId, amount, memo),
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "claim_not_found") return { posted: false, reason: "claim_not_found" };
  if (prepared.gate === "not_reimbursed") return { posted: false, reason: "not_reimbursed" };
  if (prepared.gate === "already_posted") {
    return {
      posted: false,
      reason: "already_posted",
      journal_entry_id: prepared.journal_entry_id,
    };
  }

  const created = await createJournalEntry(
    {
      operating_company_id: input.operating_company_id,
      entry_date: prepared.entryDate,
      memo: prepared.memo,
      source: "auto",
      postings: prepared.postings,
    },
    { userId: input.actor_user_id, role: "system" }
  );

  await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      input.operating_company_id,
    ]);
    await client.query(
      `
        INSERT INTO accounting.warranty_reimburse_postings (
          operating_company_id, warranty_claim_id, expense_je_id,
          amount_cents, entry_date, memo, status, created_by_user_id
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::date, $6, 'posted', $7::uuid)
        ON CONFLICT (operating_company_id, warranty_claim_id) WHERE is_active DO NOTHING
      `,
      [
        input.operating_company_id,
        input.claim_id,
        created.id,
        prepared.amount,
        prepared.entryDate,
        prepared.memo,
        input.actor_user_id,
      ]
    );
    await appendCrudAudit(
      client as Parameters<typeof appendCrudAudit>[0],
      input.actor_user_id,
      "accounting.warranty_reimbursement.posted",
      {
        resource_type: "maintenance.warranty_claims",
        resource_id: input.claim_id,
        operatingCompanyId: input.operating_company_id,
        journalEntryId: created.id,
        amount_cents: prepared.amount,
      },
      "warning"
    );
  });

  return { posted: true, journal_entry_id: created.id, memo: prepared.memo };
}
