// INS-02 — insurer claim recovery → balanced JE. FINANCIAL-HOLD.
// INERT until INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED is flipped per entity.
//
// DEFECT: PATCH amount_paid_cents only updates the claim row — recovery dollars never
// reach the ledger (Upload-4 · INS-02).
//
// WRITES ZERO NEW GL MATH. Reuses createJournalEntry:
//   Dr cash_clearing
//   Cr insurance_recovery (owner-designated — NEVER sales income)
// Flag OFF => zero JE writes. Idempotency via sum of accounting.insurance_claim_recovery_postings.

import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { createJournalEntry } from "../journal-entries.service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";

export const INSURANCE_CLAIM_RECOVERY_GL_POSTING_FLAG = "INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ClaimRecoveryPostResult = {
  posted: boolean;
  reason?:
    | "flag_off"
    | "zero_amount"
    | "already_posted"
    | "claim_not_found"
    | "no_delta"
    | "capped_at_recorded_loss"
    | "no_recorded_loss";
  journal_entry_id?: string;
  amount_cents?: number;
  memo?: string;
  /** ASC 450-30/610-30: recovery in excess of the recorded loss is a GAIN CONTINGENCY, not posted. */
  unposted_gain_contingency_cents?: number;
  recorded_loss_cents?: number;
};

const FLAG_OFF: ClaimRecoveryPostResult = { posted: false, reason: "flag_off" };

export function buildClaimRecoveryPostings(
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
      description: `${memo} — cash from insurer recovery`,
    },
    {
      account_id: recoveryAccountId,
      debit_or_credit: "credit" as const,
      amount_cents: amountCents,
      description: `${memo} — credit insurance recovery`,
    },
  ];
}

async function postingEnabled(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client as never, INSURANCE_CLAIM_RECOVERY_GL_POSTING_FLAG, {
    operating_company_id: operatingCompanyId,
  });
}

export type PostClaimRecoveryInput = {
  operating_company_id: string;
  claim_id: string;
  actor_user_id: string;
  entry_date_iso: string;
  /** Current claim.amount_paid_cents after the PATCH (total recovered to date). */
  amount_paid_cents: number;
};

export async function postInsuranceClaimRecovery(
  input: PostClaimRecoveryInput
): Promise<ClaimRecoveryPostResult> {
  const paidTotal = Number(input.amount_paid_cents ?? 0);
  if (!Number.isFinite(paidTotal) || paidTotal <= 0) return { posted: false, reason: "zero_amount" };

  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      input.operating_company_id,
    ]);
    if (!(await postingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    // ASC 450-30 / 610-30 — THE RECORDED LOSS is the cap. Preference order, most concrete first:
    //   1. the actual cost booked against this claim (the linked expense, then the linked bill —
    //      insurance.claim.expense_id / bill_id, added in #4003);
    //   2. failing any linkage, amount_claimed_cents (what we asserted the loss was).
    // A claim with neither is NOT capped blind — it is refused below, because posting an uncapped
    // recovery is precisely the defect this guards.
    const claim = await client.query<{
      id: string;
      claim_number: string | null;
      amount_paid_cents: number;
      recorded_loss_cents: number | null;
    }>(
      `SELECT c.id::text,
              c.claim_number,
              c.amount_paid_cents::bigint AS amount_paid_cents,
              -- Column names verified against prod, NOT assumed: the two tables spell the amount
              -- differently, and a first pass that assumed they matched was caught by
              -- verify-sql-column-existence before it could ship — the same defect class as the
              -- mdata.units display-id crash fixed in #4091. Do not "tidy" these into one name.
              -- (Deliberately not naming the wrong column here: verify-sql-read-targets scans
              -- comment text too, so a phantom identifier written in prose fails the build.)
              COALESCE(
                e.total_amount_cents,
                b.amount_cents,
                NULLIF(c.amount_claimed_cents, 0)
              )::bigint AS recorded_loss_cents
       FROM insurance.claim c
       LEFT JOIN accounting.expenses e
         ON e.id = c.expense_id AND e.operating_company_id = $1::uuid
       LEFT JOIN accounting.bills b
         ON b.id = c.bill_id AND b.operating_company_id = $1::uuid
       WHERE (c.operating_company_id = $1::uuid OR c.tenant_id = $1::uuid)
         AND c.id = $2::uuid
       LIMIT 1`,
      [input.operating_company_id, input.claim_id]
    );
    const row = claim.rows[0];
    if (!row) return { gate: "claim_not_found" as const };

    const posted = await client.query<{ sum_cents: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0)::text AS sum_cents
       FROM accounting.insurance_claim_recovery_postings
       WHERE operating_company_id = $1::uuid
         AND claim_id = $2::uuid
         AND is_active
         AND status = 'posted'`,
      [input.operating_company_id, input.claim_id]
    );
    const already = Number(posted.rows[0]?.sum_cents ?? 0);
    const rawDelta = Math.round(paidTotal) - already;
    if (rawDelta <= 0) {
      return { gate: "no_delta" as const, already };
    }

    // ── CAP AT THE RECORDED LOSS (ASC 450-30 / 610-30) ──────────────────────────────────────────
    // Before this, the poster credited the FULL delta of amount_paid_cents with no reference to the
    // loss at all. An insurer paying more than the repair cost would drive the contra-expense account
    // NEGATIVE and overstate income — a recovery recognised as if it were revenue. Under ASC a loss
    // recovery is recognised only when probable and only UP TO the recorded loss; anything beyond is a
    // GAIN CONTINGENCY and must not be recognised until realised.
    //
    // Fail CLOSED when there is no loss to cap against: an uncapped recovery is exactly the defect.
    const recordedLoss = Number(row.recorded_loss_cents ?? 0);
    if (!Number.isFinite(recordedLoss) || recordedLoss <= 0) {
      return { gate: "no_recorded_loss" as const };
    }
    const remainingRoom = Math.max(0, recordedLoss - already);
    const delta = Math.min(rawDelta, remainingRoom);
    const excess = rawDelta - delta;
    if (delta <= 0) {
      // Already recovered the whole recorded loss; the rest is a gain contingency.
      return { gate: "capped" as const, already, recordedLoss, excess: rawDelta };
    }

    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
    const recoveryAccountId = await resolveRoleAccount(
      client,
      input.operating_company_id,
      "insurance_recovery"
    );
    const entryDate = input.entry_date_iso.slice(0, 10);
    const label = row.claim_number?.trim() || row.id;
    const memo = `Insurance claim recovery — ${label} [${row.id}]`;

    return {
      gate: "post" as const,
      amount: delta,
      entryDate,
      memo,
      // Carried so the success return can report BOTH what posted and what was withheld. Without
      // these the caller cannot tell a full recovery from one trimmed to the recorded loss — and a
      // silently trimmed amount is the same class of defect as a silently uncapped one.
      recordedLoss,
      excess,
      postings: buildClaimRecoveryPostings(cashAccountId, recoveryAccountId, delta, memo),
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "claim_not_found") return { posted: false, reason: "claim_not_found" };
  if (prepared.gate === "no_recorded_loss") {
    // No linked expense/bill and no amount_claimed — nothing to cap against. Refuse rather than post
    // an uncapped recovery. Reported under its OWN reason: reusing "claim_not_found" here would send
    // whoever reads it hunting for a missing claim instead of the missing LOSS, which is the actual
    // problem and is fixed by linking the repair expense/bill to the claim (insurance.claim.expense_id
    // / bill_id, #4003).
    return { posted: false, reason: "no_recorded_loss" };
  }
  if (prepared.gate === "capped") {
    return {
      posted: false,
      reason: "capped_at_recorded_loss",
      amount_cents: prepared.already,
      recorded_loss_cents: prepared.recordedLoss,
      unposted_gain_contingency_cents: prepared.excess,
    };
  }
  if (prepared.gate === "no_delta") {
    return { posted: false, reason: "already_posted", amount_cents: prepared.already };
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
        INSERT INTO accounting.insurance_claim_recovery_postings (
          operating_company_id, claim_id, journal_entry_id,
          amount_cents, entry_date, memo, status, created_by_user_id
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::date, $6, 'posted', $7::uuid)
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
      "accounting.insurance_claim_recovery.posted",
      {
        resource_type: "insurance.claim",
        resource_id: input.claim_id,
        operatingCompanyId: input.operating_company_id,
        journalEntryId: created.id,
        amount_cents: prepared.amount,
      },
      "warning"
    );
  });

  return {
    posted: true,
    journal_entry_id: created.id,
    amount_cents: prepared.amount,
    memo: prepared.memo,
    recorded_loss_cents: prepared.recordedLoss,
    // > 0 when the insurer paid MORE than the recorded loss: the excess is deliberately unposted and
    // reported so a human can recognise the gain when it is realised.
    unposted_gain_contingency_cents: prepared.excess,
  };
}
