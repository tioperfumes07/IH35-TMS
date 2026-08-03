/**
 * LOAN-07 — related-party loan interest accrual.
 *
 * WHAT ACCRUES, PER DIRECTION:
 *   direction 'out' (we lent money) — interest is INCOME we have earned but not received:
 *       DR 1260 Interest Receivable   (role interest_income's asset counterpart)
 *       CR 7100 Interest Income       (role interest_income)
 *   direction 'in'  (they lent us money) — interest is a COST we owe but have not paid:
 *       DR 6810 Interest & Financing Expense (role related_party_interest_expense)
 *       CR the related-party LIABILITY account on the loan itself
 *
 * WHY A DEDICATED EXPENSE ROLE. `default_interest_expense` resolves to 6830 Factoring Default Interest
 * on BOTH operating entities — a financing penalty on receivables sold, which is a different fact from
 * the cost of insider money. ASC 850 requires related-party interest to be separately disclosable, and
 * a ledger that collapses the two cannot produce that disclosure. This service therefore resolves
 * `related_party_interest_expense`, never `default_interest_expense`, and the LOAN-06 migration fails
 * closed if that role is ever bound to 6830.
 *
 * ACCRUAL IS PER SCHEDULE ROW, NOT PER PERIOD-END SWEEP. Each unposted schedule row already carries the
 * interest portion the amortization computed, so accruing a row means posting the number the borrower
 * was actually shown. Re-deriving interest at accrual time would let the ledger and the repayment
 * schedule drift apart, and the schedule is the document the counterparty holds.
 *
 * NO SILENT DEFAULT (DoD-D). If either account cannot be resolved this REFUSES and names the missing
 * role. Interest posted to a guessed account is worse than interest not posted — the miss is visible,
 * the misposting is not.
 *
 * FLAG-GATED per entity, default OFF. Flag OFF => zero writes.
 */
import { isEnabled } from "../../lib/feature-flags/service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import { RELATED_PARTY_LOAN_GL_POSTING_FLAG } from "./poster.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type Posting = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
};

export type InterestAccrualResult =
  | { ok: true; postings: Posting[]; amount_cents: number; memo: string }
  | { ok: false; reason: "flag_off" | "zero_interest" | "account_unresolved"; missing_role?: string };

/**
 * The two legs of an interest accrual. Balanced by construction and asserted by the shared
 * balance-invariant test (registered there as its own shape, both directions).
 */
export function buildInterestAccrualPostings(
  direction: "in" | "out",
  interestAccountId: string,
  counterAccountId: string,
  amountCents: number,
  memo: string
): Posting[] {
  if (direction === "out") {
    // We earned it: an asset rises, income is recognised.
    return [
      {
        account_id: counterAccountId,
        debit_or_credit: "debit",
        amount_cents: amountCents,
        description: `${memo} — interest receivable`,
      },
      {
        account_id: interestAccountId,
        debit_or_credit: "credit",
        amount_cents: amountCents,
        description: `${memo} — related-party interest income`,
      },
    ];
  }
  // We owe it: an expense is recognised, the amount owed to the lender rises.
  return [
    {
      account_id: interestAccountId,
      debit_or_credit: "debit",
      amount_cents: amountCents,
      description: `${memo} — related-party interest expense`,
    },
    {
      account_id: counterAccountId,
      debit_or_credit: "credit",
      amount_cents: amountCents,
      description: `${memo} — added to related-party loan balance`,
    },
  ];
}

/**
 * Resolve both sides for an accrual.
 *
 * 'out': interest side = interest_income (7100); counter = Interest Receivable, resolved by ACCOUNT
 *        NUMBER 1260 rather than by role, because there is no `interest_receivable` role in the role
 *        CHECK and inventing one to hold a single account would widen a constrained vocabulary for no
 *        gain. The lookup is entity-scoped and REFUSES when absent — it never guesses a nearby asset.
 * 'in':  interest side = related_party_interest_expense (6810); counter = the loan's OWN liability
 *        account, which is already on the entry, so nothing is resolved and nothing can be guessed.
 */
export async function resolveAccrualAccounts(
  client: DbClient,
  operatingCompanyId: string,
  direction: "in" | "out",
  loanAccountId: string
): Promise<{ ok: true; interestAccountId: string; counterAccountId: string } | { ok: false; missingRole: string }> {
  if (direction === "out") {
    let interestAccountId: string;
    try {
      interestAccountId = await resolveRoleAccount(client, operatingCompanyId, "interest_income");
    } catch {
      return { ok: false, missingRole: "interest_income" };
    }
    const recv = await client.query<{ id: string }>(
      `SELECT id::text AS id
         FROM catalogs.accounts
        WHERE operating_company_id = $1::uuid
          AND account_number = '1260'
          AND deactivated_at IS NULL
          -- is_postable mirrors what resolveRoleAccount demands of every role-resolved account. A
          -- header/summary account accepts no journal lines; resolving one here would produce an entry
          -- that fails at insert, or worse, posts to a rollup and distorts every child balance.
          AND is_postable = true
        LIMIT 1`,
      [operatingCompanyId]
    );
    const counterAccountId = recv.rows[0]?.id;
    if (!counterAccountId) return { ok: false, missingRole: "account 1260 Interest Receivable" };
    return { ok: true, interestAccountId, counterAccountId };
  }

  try {
    const interestAccountId = await resolveRoleAccount(
      client,
      operatingCompanyId,
      "related_party_interest_expense"
    );
    // The credit side is the loan's own liability account — already chosen and validated at creation.
    return { ok: true, interestAccountId, counterAccountId: loanAccountId };
  } catch {
    return { ok: false, missingRole: "related_party_interest_expense" };
  }
}

export async function accrualEnabled(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client as never, RELATED_PARTY_LOAN_GL_POSTING_FLAG, {
    operating_company_id: operatingCompanyId,
  });
}

/**
 * Prepare the accrual for ONE schedule row. Returns the postings for the shared poster to write; it
 * does not post, so the caller keeps a single posting path and a single idempotency source of truth.
 */
export async function prepareInterestAccrual(
  client: DbClient,
  input: {
    operating_company_id: string;
    direction: "in" | "out";
    loan_account_id: string;
    interest_cents: number;
    payment_number: number;
    counterparty_label: string;
  }
): Promise<InterestAccrualResult> {
  if (!(await accrualEnabled(client, input.operating_company_id))) {
    return { ok: false, reason: "flag_off" };
  }
  // A 0% related-party loan is normal (an owner lending the company money at no interest). Accruing
  // zero would write a $0.00 JE that is technically balanced and completely meaningless.
  if (!Number.isFinite(input.interest_cents) || input.interest_cents <= 0) {
    return { ok: false, reason: "zero_interest" };
  }

  const resolved = await resolveAccrualAccounts(
    client,
    input.operating_company_id,
    input.direction,
    input.loan_account_id
  );
  if (!resolved.ok) {
    return { ok: false, reason: "account_unresolved", missing_role: resolved.missingRole };
  }

  const memo = `Related-party loan interest — ${input.counterparty_label} payment ${input.payment_number}`;
  return {
    ok: true,
    amount_cents: input.interest_cents,
    memo,
    postings: buildInterestAccrualPostings(
      input.direction,
      resolved.interestAccountId,
      resolved.counterAccountId,
      input.interest_cents,
      memo
    ),
  };
}
