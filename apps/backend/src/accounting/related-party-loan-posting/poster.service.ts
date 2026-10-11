/**
 * LOAN-02 — related-party loan posting. Reuses the shared poster; writes NO new GL math.
 *
 * DIRECTIONS AND WHAT MOVES:
 *   direction 'in'  — someone (owner/spouse/friend/employee) funds a company obligation.
 *                     DR the obligation being settled (the account the wizard chose), CR the
 *                     related-party LIABILITY account. The company now owes them.
 *   direction 'out' — the company lends to a person.
 *                     DR the related-party RECEIVABLE account, CR the funding source (cash clearing).
 *                     The person now owes the company.
 *
 * The `account_id` on the entry is the RELATED-PARTY side in BOTH directions — a liability for 'in',
 * an asset for 'out'. That is why the entry carries one such column and not two: the direction decides
 * which side of the JE it lands on, so the account can never be silently mis-sided the way a single
 * overloaded `gl_liability_account_id` would be.
 *
 * NO SILENT DEFAULT (DoD-D). If the counter-account cannot be resolved, this REFUSES and names what was
 * missing. It does not fall back to a suspense or "other" account: a loan posted to the wrong account is
 * worse than one that failed to post, because the failure is visible and the misposting is not.
 *
 * FLAG-GATED per entity, default OFF (RELATED_PARTY_LOAN_GL_POSTING_ENABLED). Flag OFF => zero writes.
 * Idempotency stays the shared poster's job via its idempotency_key — this service does not invent a
 * second source of truth for "has this posted?".
 */
import { isEnabled } from "../../lib/feature-flags/service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";

export const RELATED_PARTY_LOAN_GL_POSTING_FLAG = "RELATED_PARTY_LOAN_GL_POSTING_ENABLED";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type Posting = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
};

/**
 * 443.64 — parse fee metadata stored in funding_source_note for party_relay_funded entries.
 * Format: {"fee_cents":N,"fee_account_id":"uuid"} as JSON prefix, optionally followed by "|note".
 */
export function parseRelayFeeNote(note: string | null): { fee_cents: number; fee_account_id: string } | null {
  if (!note) return null;
  const raw = note.startsWith("{") ? note.split("|")[0] : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { fee_cents?: number; fee_account_id?: string };
    if (parsed.fee_cents && parsed.fee_account_id) {
      return { fee_cents: parsed.fee_cents, fee_account_id: parsed.fee_account_id };
    }
  } catch {
    // not fee JSON
  }
  return null;
}

/**
 * 443.64 — build 3-leg JE for party_relay_funded:
 * DR funding_account (1295) principal / DR fee_account (5005) fee / CR party_account (2410-sub) total.
 */
export function buildPartyRelayFundedPostings(
  partyAccountId: string,
  fundingAccountId: string,
  feeAccountId: string,
  principalCents: number,
  feeCents: number,
  memo: string
): Posting[] {
  const totalCents = principalCents + feeCents;
  return [
    {
      account_id: fundingAccountId,
      debit_or_credit: "debit",
      amount_cents: principalCents,
      description: `${memo} — Relay Fuel Wallet funded by party`,
    },
    {
      account_id: feeAccountId,
      debit_or_credit: "debit",
      amount_cents: feeCents,
      description: `${memo} — Relay 3.25% fee`,
    },
    {
      account_id: partyAccountId,
      debit_or_credit: "credit",
      amount_cents: totalCents,
      description: `${memo} — due to/from party (Relay funded)`,
    },
  ];
}

export type RelatedPartyLoanPostResult = {
  posted: boolean;
  reason?:
    | "flag_off"
    | "loan_not_found"
    | "zero_amount"
    | "already_posted"
    | "counter_account_unresolved";
  journal_entry_id?: string;
  amount_cents?: number;
  memo?: string;
  missing_role?: string;
};

/**
 * The two legs. Balanced by construction AND asserted by the balance-invariant test plus the CI guard —
 * "balanced by construction" is a comment; the test is the control.
 */
export function buildRelatedPartyLoanPostings(
  direction: "in" | "out",
  relatedPartyAccountId: string,
  counterAccountId: string,
  amountCents: number,
  memo: string
): Posting[] {
  if (direction === "in") {
    // They funded something for us: the obligation is settled, and we now owe them.
    return [
      {
        account_id: counterAccountId,
        debit_or_credit: "debit",
        amount_cents: amountCents,
        description: `${memo} — obligation funded by related party`,
      },
      {
        account_id: relatedPartyAccountId,
        debit_or_credit: "credit",
        amount_cents: amountCents,
        description: `${memo} — related-party loan payable`,
      },
    ];
  }
  // We lent money out: a receivable rises, cash leaves.
  return [
    {
      account_id: relatedPartyAccountId,
      debit_or_credit: "debit",
      amount_cents: amountCents,
      description: `${memo} — related-party loan receivable`,
    },
    {
      account_id: counterAccountId,
      debit_or_credit: "credit",
      amount_cents: amountCents,
      description: `${memo} — funds advanced`,
    },
  ];
}

export async function postingEnabled(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client as never, RELATED_PARTY_LOAN_GL_POSTING_FLAG, {
    operating_company_id: operatingCompanyId,
  });
}

/**
 * Resolve the NON-related-party side of the entry.
 *
 * 'out' moves money from somewhere -> cash_clearing (the role every other poster already uses).
 * 'in' settles a specific obligation -> the account the wizard chose. When the caller supplies none we
 * REFUSE: an 'in' entry with no target account has no defensible debit side, and guessing one would put
 * an owner loan against an arbitrary expense.
 */
export async function resolveCounterAccount(
  client: DbClient,
  operatingCompanyId: string,
  direction: "in" | "out",
  fundingAccountId: string | null
): Promise<{ ok: true; accountId: string } | { ok: false; missingRole: string }> {
  if (direction === "out") {
    // 443.59: party_transfer_out supplies the specific bank account as the counter (not cash_clearing).
    // DR 2410-00-xxx (relatedPartyAccountId) / CR bank (fundingAccountId). The fundingAccountId was
    // persisted on the entry so this path is idempotent across retries.
    if (fundingAccountId) return { ok: true, accountId: fundingAccountId };
    try {
      const id = await resolveRoleAccount(client, operatingCompanyId, "cash_clearing");
      return { ok: true, accountId: id };
    } catch {
      return { ok: false, missingRole: "cash_clearing" };
    }
  }
  if (fundingAccountId) return { ok: true, accountId: fundingAccountId };
  return {
    ok: false,
    missingRole: "funding_account_id (direction 'in' requires an explicit obligation account)",
  };
}
