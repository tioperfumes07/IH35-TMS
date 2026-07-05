// CODER-34 — Factoring GL poster, re-architected from the SALE model to SECURED BORROWING (ASC 860).
//
// The old poster booked FARO's advance as a `customer_payment` (Dr Cash / Cr A/R) and recorded NO
// liability — sale/derecognition, which misstates A/R and liabilities under the CPA's secured-borrowing
// ruling (full recourse + mandatory repurchase + security interest + guaranty => retained control =>
// borrowing). This rewrite implements the 5-step borrowing lifecycle (see
// docs package 02_ACCOUNTING_secured-borrowing.md):
//
//   FUNDING           Dr Cash + Dr Factoring Reserves + Dr Factoring Fees (+ Dr Bank/ACH)
//                     / Cr Factoring Advance (LIABILITY = FULL net invoice).  A/R is UNTOUCHED.
//   CUSTOMER PAYMENT  Dr Factoring Advance / Cr A/R.  This is the ONLY place A/R goes down.
//   RESERVE RELEASE   Dr Cash / Cr Factoring Reserves.  Not a customer_payment, not against A/R.
//   CHARGEBACK        Dr Factoring Advance + Dr Default Interest / Cr Cash;  and
//                     Dr Factoring Recoursed Invoices / Cr A/R.
//
// Design notes (see PR body):
//  * Every entry is routed through createJournalEntry (accounting.journal_entries /
//    journal_entry_postings — the DB double-entry trigger tables), which asserts debits===credits>0 and
//    writes the transaction_source_links spine + audit + QBO-sync. We deliberately do NOT use the
//    posting-engine's customer_payment source type any more (that is the sale-model defect), and we do
//    NOT edit the shared posting-engine (lane lock).
//  * Idempotency: each entry is keyed to a deterministic memo per (advance, step[, amount]); a re-run
//    finds the existing JE and no-ops (no double-post) — mirrors factoring-fees-posting's guard.
//  * FLAG GATE: FACTORING_GL_POSTING_ENABLED (per-entity, DEFAULT OFF) is checked via
//    isEnabled(client, KEY, {operating_company_id}) — never a global env read. Off => nothing posts.
//  * Per-entity isolation: all accounts resolve via the entity-pinned role resolver (fail-closed); a
//    TRANSP post can never resolve a TRK/USMCA account.
//  * The optional A/R => "A/R – Assigned to Faro" reclass is intentionally NOT applied at funding, so
//    that funding never credits ar_control (leaves total A/R exactly as-is and satisfies the
//    verify-factoring-treatment guard). ar_assigned_to_factor is created/bound for that optional
//    presentation + the chargeback path.

import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { createJournalEntry } from "../journal-entries.service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import {
  FACTORING_DEFAULT_INTEREST_DAILY_RATE,
  FACTORING_INTEREST_ACCRUAL_AFTER_DAY,
} from "./contract-config.js";

export const FACTORING_GL_POSTING_FLAG = "FACTORING_GL_POSTING_ENABLED";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type PostResult = {
  posted: boolean;
  reason?:
    | "flag_off"
    | "already_posted"
    | "zero_amount"
    | "advance_not_found"
    | "no_invoices"
    | "not_outstanding"
    | "before_grace";
  journal_entry_id?: string;
  memo?: string;
  closing_balance_cents?: number;
};

// Whole-day gap between two ISO dates (accrual date − purchase date), computed on the calendar-date parts
// only (no partial-day / TZ drift). Purchase Date = the advance's advanced_at (funding date).
function dayIndexBetween(purchaseIso: string, accrualIso: string): number {
  const purchase = Date.parse(`${purchaseIso.slice(0, 10)}T00:00:00.000Z`);
  const accrual = Date.parse(`${accrualIso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(purchase) || Number.isNaN(accrual)) return 0;
  return Math.round((accrual - purchase) / 86_400_000);
}

const FLAG_OFF: PostResult = { posted: false, reason: "flag_off" };

// Proportional allocation (floor + largest-remainder) — no penny created/lost. Preserved verbatim from
// the prior poster so batch amounts split identically across invoices where a per-invoice split is needed.
export function allocateByProportion(total: number, lines: Array<{ invoice_id: string; total_cents: number }>) {
  if (total <= 0 || lines.length === 0) return new Map<string, number>();
  const sumBase = lines.reduce((acc, row) => acc + row.total_cents, 0);
  if (sumBase <= 0) return new Map<string, number>();

  const provisional = lines.map((row) => {
    const raw = (row.total_cents / sumBase) * total;
    const floor = Math.floor(raw);
    return { invoice_id: row.invoice_id, floor, remainder: raw - floor };
  });

  let assigned = provisional.reduce((acc, row) => acc + row.floor, 0);
  let remaining = total - assigned;
  provisional.sort((a, b) => b.remainder - a.remainder);
  for (const row of provisional) {
    if (remaining <= 0) break;
    row.floor += 1;
    remaining -= 1;
  }

  const out = new Map<string, number>();
  for (const row of provisional) out.set(row.invoice_id, row.floor);
  return out;
}

async function factoringPostingEnabled(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client as never, FACTORING_GL_POSTING_FLAG, { operating_company_id: operatingCompanyId });
}

// Idempotency: an auto factoring JE is uniquely identified by its deterministic memo. If one already
// exists for this (advance, step[, amount]) we do not post again — no double-post on a re-run/re-import.
async function journalEntryExistsByMemo(client: DbClient, operatingCompanyId: string, memo: string): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM accounting.journal_entries
      WHERE operating_company_id = $1::uuid
        AND source = 'auto'
        AND memo = $2
        AND status <> 'voided'
      LIMIT 1
    `,
    [operatingCompanyId, memo]
  );
  return Boolean(res.rows[0]?.id);
}

type AdvanceRow = {
  id: string;
  display_id: string;
  status: string;
  invoice_total_cents: number;
  advance_amount_cents: number;
  reserve_amount_cents: number;
  factor_fee_cents: number;
  release_amount_cents: number;
  submitted_at: string | null;
  advanced_at: string | null;
  collected_at: string | null;
  released_at: string | null;
};

async function loadAdvance(client: DbClient, operatingCompanyId: string, factoringAdvanceId: string): Promise<AdvanceRow | null> {
  const res = await client.query<AdvanceRow>(
    `
      SELECT
        id::text,
        display_id,
        status::text               AS status,
        invoice_total_cents::int   AS invoice_total_cents,
        advance_amount_cents::int  AS advance_amount_cents,
        reserve_amount_cents::int  AS reserve_amount_cents,
        factor_fee_cents::int      AS factor_fee_cents,
        release_amount_cents::int  AS release_amount_cents,
        submitted_at::text,
        advanced_at::text,
        collected_at::text,
        released_at::text
      FROM accounting.factoring_advances
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [factoringAdvanceId, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

// ---------------------------------------------------------------------------------------------------
// STEP 2 — FUNDING (posts at funding, using FARO's actual funded figures; A/R is UNTOUCHED).
//   Dr Cash + Dr Factoring Reserves + Dr Factoring Fees (+ Dr Bank/ACH) / Cr Factoring Advance (liability).
//   The liability is the FULL net invoice (invoice_total_cents). Cash is derived so the entry balances by
//   construction: cash = invoice_total - reserve - fee - ach. `postFactoringAdvanceEvent` keeps the prior
//   name/shape so the route + tests keep compiling; `funding_figures` lets the funding-report import supply
//   FARO's actual reserve/fee/ACH breakdown (scope C).
// ---------------------------------------------------------------------------------------------------
export type PostFactoringAdvanceInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  advanced_at_iso?: string | null;
  // FARO's ACTUAL funded breakdown (from the funding report). When omitted, reserve/fee are read from the
  // advance row and ACH defaults to 0 (the advance row has no ACH column).
  funding_figures?: {
    invoice_total_cents?: number;
    reserve_cents?: number;
    fee_cents?: number;
    ach_cents?: number;
  } | null;
};

export async function postFactoringAdvanceEvent(input: PostFactoringAdvanceInput): Promise<PostResult> {
  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    const liability = Number(input.funding_figures?.invoice_total_cents ?? advance.invoice_total_cents ?? 0);
    const reserve = Number(input.funding_figures?.reserve_cents ?? advance.reserve_amount_cents ?? 0);
    const fee = Number(input.funding_figures?.fee_cents ?? advance.factor_fee_cents ?? 0);
    const ach = Number(input.funding_figures?.ach_cents ?? 0);
    if (liability <= 0) return { gate: "zero_amount" as const };
    const cash = liability - reserve - fee - ach;
    if (cash < 0 || reserve < 0 || fee < 0 || ach < 0) {
      // FAIL CLOSED — never post a funding entry whose fees exceed the pledged invoice (would imply a
      // negative cash leg / unbalanced economics). Surface for reconciliation instead of silently posting.
      throw new Error(
        `factoring_funding_figures_invalid: liability=${liability} reserve=${reserve} fee=${fee} ach=${ach} => cash=${cash}`
      );
    }

    const memo = `Factoring funding ${advance.display_id}`;
    if (await journalEntryExistsByMemo(client, input.operating_company_id, memo)) return { gate: "already_posted" as const };

    // Resolve every account per-entity, fail-closed. NO ar_control at funding (borrowing keeps A/R).
    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
    const reserveAccountId = await resolveRoleAccount(client, input.operating_company_id, "factor_reserve_held");
    const feeAccountId = await resolveRoleAccount(client, input.operating_company_id, "factor_fee_expense");
    const liabilityAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_advance_liability");

    const entryDate = (input.advanced_at_iso ?? advance.advanced_at ?? advance.submitted_at ?? new Date().toISOString()).slice(0, 10);

    const postings: Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; description: string }> = [];
    if (cash > 0) postings.push({ account_id: cashAccountId, debit_or_credit: "debit", amount_cents: cash, description: `${memo} — cash advanced` });
    if (reserve > 0) postings.push({ account_id: reserveAccountId, debit_or_credit: "debit", amount_cents: reserve, description: `${memo} — reserve held (due-from-factor)` });
    if (fee > 0) postings.push({ account_id: feeAccountId, debit_or_credit: "debit", amount_cents: fee, description: `${memo} — factoring fee (interest & financing)` });
    // Bank/ACH transaction fee: a financing/transaction cost. Booked to the Factoring Fees (Interest &
    // Financing) account as a distinct line (no separate bank_charges role is in CODER-34 scope; splitting
    // ACH into its own account is a documented CPA/GUARD follow-up).
    if (ach > 0) postings.push({ account_id: feeAccountId, debit_or_credit: "debit", amount_cents: ach, description: `${memo} — bank/ACH fee` });
    postings.push({ account_id: liabilityAccountId, debit_or_credit: "credit", amount_cents: liability, description: `${memo} — factoring advance (liability)` });

    return { gate: "post" as const, memo, entryDate, postings };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "advance_not_found") return { posted: false, reason: "advance_not_found" };
  if (prepared.gate === "zero_amount") return { posted: false, reason: "zero_amount" };
  if (prepared.gate === "already_posted") return { posted: false, reason: "already_posted" };

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
  return { posted: true, journal_entry_id: created.id, memo: prepared.memo };
}

// ---------------------------------------------------------------------------------------------------
// STEP 3 — CUSTOMER PAYMENT (customer pays FARO). Dr Factoring Advance / Cr A/R. The ONLY place A/R goes
//   down under the borrowing model.
// ---------------------------------------------------------------------------------------------------
export type PostFactoringCustomerPaymentInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  amount_cents: number;
  paid_at_iso?: string | null;
};

export async function postFactoringCustomerPaymentEvent(input: PostFactoringCustomerPaymentInput): Promise<PostResult> {
  const amount = Number(input.amount_cents ?? 0);
  if (amount <= 0) return { posted: false, reason: "zero_amount" };

  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    const entryDate = (input.paid_at_iso ?? advance.collected_at ?? new Date().toISOString()).slice(0, 10);
    const memo = `Factoring customer payment ${advance.display_id} (${amount}@${entryDate})`;
    if (await journalEntryExistsByMemo(client, input.operating_company_id, memo)) return { gate: "already_posted" as const };

    const liabilityAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_advance_liability");
    const arAccountId = await resolveRoleAccount(client, input.operating_company_id, "ar_control");

    return {
      gate: "post" as const,
      memo,
      entryDate,
      postings: [
        { account_id: liabilityAccountId, debit_or_credit: "debit" as const, amount_cents: amount, description: `${memo} — settle factoring advance` },
        { account_id: arAccountId, debit_or_credit: "credit" as const, amount_cents: amount, description: `${memo} — clear A/R (customer paid FARO)` },
      ],
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "advance_not_found") return { posted: false, reason: "advance_not_found" };
  if (prepared.gate === "already_posted") return { posted: false, reason: "already_posted" };

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
  return { posted: true, journal_entry_id: created.id, memo: prepared.memo };
}

// ---------------------------------------------------------------------------------------------------
// STEP 4 — RESERVE RELEASE (FARO releases the withheld reserve). Dr Cash / Cr Factoring Reserves. NOT a
//   customer_payment; NOT against A/R. `postFactoringReleaseEvent` keeps the prior name/shape; factor_fee_cents
//   is accepted for signature compatibility but is NOT re-booked here (the fee is booked at funding).
// ---------------------------------------------------------------------------------------------------
export type PostFactoringReleaseInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  released_at_iso?: string | null;
  release_amount_cents: number;
  factor_fee_cents?: number;
};

export async function postFactoringReleaseEvent(input: PostFactoringReleaseInput): Promise<PostResult> {
  const releaseAmount = Number(input.release_amount_cents ?? 0);
  if (releaseAmount <= 0) return { posted: false, reason: "zero_amount" };

  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    const entryDate = (input.released_at_iso ?? advance.released_at ?? new Date().toISOString()).slice(0, 10);
    const memo = `Factoring reserve release ${advance.display_id} (${releaseAmount}@${entryDate})`;
    if (await journalEntryExistsByMemo(client, input.operating_company_id, memo)) return { gate: "already_posted" as const };

    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
    const reserveAccountId = await resolveRoleAccount(client, input.operating_company_id, "factor_reserve_held");

    return {
      gate: "post" as const,
      memo,
      entryDate,
      postings: [
        { account_id: cashAccountId, debit_or_credit: "debit" as const, amount_cents: releaseAmount, description: `${memo} — reserve returned to cash` },
        { account_id: reserveAccountId, debit_or_credit: "credit" as const, amount_cents: releaseAmount, description: `${memo} — release factoring reserve (asset)` },
      ],
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "advance_not_found") return { posted: false, reason: "advance_not_found" };
  if (prepared.gate === "already_posted") return { posted: false, reason: "already_posted" };

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
  return { posted: true, journal_entry_id: created.id, memo: prepared.memo };
}

// ---------------------------------------------------------------------------------------------------
// STEP 5 — CHARGEBACK (customer fails to pay by the deadline). Two balanced entries:
//   (A) repay FARO:  Dr Factoring Advance + Dr Default Interest / Cr Cash.
//   (B) return the receivable:  Dr Factoring Recoursed Invoices / Cr A/R.
//   (The default funding path never reclassed A/R to Assigned-to-Faro, so the receivable is still in
//   ar_control; (B) moves it to the recoursed-invoices asset. Collect directly / write to bad debt later.)
// ---------------------------------------------------------------------------------------------------
export type PostFactoringChargebackInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  charged_back_at_iso?: string | null;
  chargeback_amount_cents: number; // the advance repaid to FARO
  default_interest_cents?: number; // 0.067%/day past term + grace
  recoursed_ar_cents?: number; // the receivable returned to us (defaults to chargeback_amount_cents)
};

export async function postFactoringChargebackEvent(input: PostFactoringChargebackInput): Promise<PostResult> {
  const chargeback = Number(input.chargeback_amount_cents ?? 0);
  const interest = Number(input.default_interest_cents ?? 0);
  const recoursed = Number(input.recoursed_ar_cents ?? input.chargeback_amount_cents ?? 0);
  if (chargeback <= 0) return { posted: false, reason: "zero_amount" };

  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    const entryDate = (input.charged_back_at_iso ?? new Date().toISOString()).slice(0, 10);
    const repayMemo = `Factoring chargeback repay ${advance.display_id} (${chargeback}+${interest}@${entryDate})`;
    const returnMemo = `Factoring chargeback receivable ${advance.display_id} (${recoursed}@${entryDate})`;

    const liabilityAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_advance_liability");
    const defaultInterestAccountId = await resolveRoleAccount(client, input.operating_company_id, "default_interest_expense");
    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
    const recoursedAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_recoursed_ar");
    const arAccountId = await resolveRoleAccount(client, input.operating_company_id, "ar_control");

    const repayPostings = [
      { account_id: liabilityAccountId, debit_or_credit: "debit" as const, amount_cents: chargeback, description: `${repayMemo} — repay factoring advance` },
      ...(interest > 0
        ? [{ account_id: defaultInterestAccountId, debit_or_credit: "debit" as const, amount_cents: interest, description: `${repayMemo} — default interest` }]
        : []),
      { account_id: cashAccountId, debit_or_credit: "credit" as const, amount_cents: chargeback + interest, description: `${repayMemo} — cash to FARO` },
    ];
    const returnPostings =
      recoursed > 0
        ? [
            { account_id: recoursedAccountId, debit_or_credit: "debit" as const, amount_cents: recoursed, description: `${returnMemo} — receivable returned to us` },
            { account_id: arAccountId, debit_or_credit: "credit" as const, amount_cents: recoursed, description: `${returnMemo} — remove from trade A/R` },
          ]
        : [];

    const repayExists = await journalEntryExistsByMemo(client, input.operating_company_id, repayMemo);
    const returnExists = returnPostings.length > 0 ? await journalEntryExistsByMemo(client, input.operating_company_id, returnMemo) : true;

    return { gate: "post" as const, entryDate, repayMemo, returnMemo, repayPostings, returnPostings, repayExists, returnExists };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "advance_not_found") return { posted: false, reason: "advance_not_found" };

  let anyPosted = false;
  let lastJeId: string | undefined;
  if (!prepared.repayExists) {
    const created = await createJournalEntry(
      { operating_company_id: input.operating_company_id, entry_date: prepared.entryDate, memo: prepared.repayMemo, source: "auto", postings: prepared.repayPostings },
      { userId: input.actor_user_id, role: "system" }
    );
    anyPosted = true;
    lastJeId = created.id;
  }
  if (prepared.returnPostings.length > 0 && !prepared.returnExists) {
    const created = await createJournalEntry(
      { operating_company_id: input.operating_company_id, entry_date: prepared.entryDate, memo: prepared.returnMemo, source: "auto", postings: prepared.returnPostings },
      { userId: input.actor_user_id, role: "system" }
    );
    anyPosted = true;
    lastJeId = created.id;
  }
  return anyPosted ? { posted: true, journal_entry_id: lastJeId } : { posted: false, reason: "already_posted" };
}

// ---------------------------------------------------------------------------------------------------
// DAILY DEFAULT-INTEREST ACCRUAL (contract: 0.067%/day, COMPOUNDED DAILY, on the unpaid balance, ONLY
//   after day 35 = 30-day Repurchase Term + 5-day Grace). Posts ONE day's charge:
//     Dr Default-Interest-Expense / Cr Factoring-Advance-Liability   (interest compounds INTO the liability
//     per the contract "Repurchase Price = Net + fees + interest" — see contract-config OPEN #2).
//
//   Compounding is deterministic + idempotent via accounting.factoring_default_interest_accruals: exactly
//   ONE row per (advance, accrual_date), carrying opening → interest → closing. The opening balance for a
//   given day = the PRIOR accrual's closing balance (compounded), or the pledged Net (invoice_total_cents)
//   for the first charged day. A re-run for a day already accrued no-ops (already_posted). The accrual cron
//   drives one call per (outstanding advance, missing day) in ascending date order, so each day compounds
//   off the committed prior row. Interest only accrues while the advance is still funded-and-unpaid
//   (status 'advanced'); once the customer pays the factor (reserve_held) or it recourses, accrual stops.
// ---------------------------------------------------------------------------------------------------
export type PostFactoringDefaultInterestAccrualInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  accrual_date_iso: string; // the calendar day interest is charged for (America/Chicago)
};

async function lastAccrualClosingBalance(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<number | null> {
  const res = await client.query<{ closing_balance_cents: string }>(
    `
      SELECT closing_balance_cents::text AS closing_balance_cents
      FROM accounting.factoring_default_interest_accruals
      WHERE operating_company_id = $1::uuid
        AND factoring_advance_id = $2::uuid
        AND is_active = true
      ORDER BY accrual_date DESC
      LIMIT 1
    `,
    [operatingCompanyId, factoringAdvanceId]
  );
  const raw = res.rows[0]?.closing_balance_cents;
  return raw == null ? null : Number(raw);
}

async function accrualExistsForDay(
  client: DbClient,
  operatingCompanyId: string,
  factoringAdvanceId: string,
  accrualDate: string
): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM accounting.factoring_default_interest_accruals
      WHERE operating_company_id = $1::uuid
        AND factoring_advance_id = $2::uuid
        AND accrual_date = $3::date
      LIMIT 1
    `,
    [operatingCompanyId, factoringAdvanceId, accrualDate]
  );
  return Boolean(res.rows[0]?.id);
}

// Sum of all accrued interest to date for an advance (closing − Net, or the running total) — used by the
// day-95 recourse trigger to know how much of the outstanding liability is compounded interest.
export async function sumAccruedDefaultInterest(
  operatingCompanyId: string,
  factoringAdvanceId: string
): Promise<{ total_interest_cents: number; last_closing_cents: number | null }> {
  return withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<{ total_interest_cents: string; last_closing_cents: string | null }>(
      `
        SELECT
          COALESCE(SUM(interest_cents), 0)::text AS total_interest_cents,
          (
            SELECT closing_balance_cents::text
            FROM accounting.factoring_default_interest_accruals
            WHERE operating_company_id = $1::uuid AND factoring_advance_id = $2::uuid AND is_active = true
            ORDER BY accrual_date DESC LIMIT 1
          ) AS last_closing_cents
        FROM accounting.factoring_default_interest_accruals
        WHERE operating_company_id = $1::uuid AND factoring_advance_id = $2::uuid AND is_active = true
      `,
      [operatingCompanyId, factoringAdvanceId]
    );
    const row = res.rows[0];
    return {
      total_interest_cents: Number(row?.total_interest_cents ?? 0),
      last_closing_cents: row?.last_closing_cents == null ? null : Number(row.last_closing_cents),
    };
  });
}

export async function postFactoringDefaultInterestAccrualEvent(
  input: PostFactoringDefaultInterestAccrualInput
): Promise<PostResult> {
  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    if (!(await factoringPostingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    const advance = await loadAdvance(client, input.operating_company_id, input.factoring_advance_id);
    if (!advance) return { gate: "advance_not_found" as const };

    // Interest accrues ONLY while the advance is funded AND the customer has not yet paid the factor. Once
    // status leaves 'advanced' (reserve_held = customer paid, released, recourse_returned, voided) the
    // liability is being settled — no further interest. Defense-in-depth beyond the cron's own selection.
    if (advance.status !== "advanced" || !advance.advanced_at) return { gate: "not_outstanding" as const };

    const accrualDate = input.accrual_date_iso.slice(0, 10);
    const dayIndex = dayIndexBetween(advance.advanced_at, accrualDate);
    // Contract: no interest through the 30-day term + 5-day grace (day 35). First charged day is day 36.
    if (dayIndex <= FACTORING_INTEREST_ACCRUAL_AFTER_DAY) return { gate: "before_grace" as const };

    if (await accrualExistsForDay(client, input.operating_company_id, input.factoring_advance_id, accrualDate)) {
      return { gate: "already_posted" as const };
    }

    // Compounding: opening = prior accrual's closing, else the pledged Net (the outstanding liability).
    const priorClosing = await lastAccrualClosingBalance(client, input.operating_company_id, input.factoring_advance_id);
    const opening = priorClosing ?? Number(advance.invoice_total_cents ?? 0);
    if (opening <= 0) return { gate: "zero_amount" as const };

    const interest = Math.round(opening * FACTORING_DEFAULT_INTEREST_DAILY_RATE);
    if (interest <= 0) return { gate: "zero_amount" as const };
    const closing = opening + interest;

    const memo = `Factoring default interest ${advance.display_id} day ${dayIndex} (${accrualDate})`;

    const interestAccountId = await resolveRoleAccount(client, input.operating_company_id, "default_interest_expense");
    const liabilityAccountId = await resolveRoleAccount(client, input.operating_company_id, "factoring_advance_liability");

    return {
      gate: "post" as const,
      memo,
      accrualDate,
      dayIndex,
      opening,
      interest,
      closing,
      displayId: advance.display_id,
      postings: [
        { account_id: interestAccountId, debit_or_credit: "debit" as const, amount_cents: interest, description: `${memo} — default interest (0.067%/day compounded)` },
        { account_id: liabilityAccountId, debit_or_credit: "credit" as const, amount_cents: interest, description: `${memo} — compound into factoring advance (liability)` },
      ],
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "advance_not_found") return { posted: false, reason: "advance_not_found" };
  if (prepared.gate === "not_outstanding") return { posted: false, reason: "not_outstanding" };
  if (prepared.gate === "before_grace") return { posted: false, reason: "before_grace" };
  if (prepared.gate === "already_posted") return { posted: false, reason: "already_posted" };
  if (prepared.gate === "zero_amount") return { posted: false, reason: "zero_amount" };

  const created = await createJournalEntry(
    {
      operating_company_id: input.operating_company_id,
      entry_date: prepared.accrualDate,
      memo: prepared.memo,
      source: "auto",
      postings: prepared.postings,
    },
    { userId: input.actor_user_id, role: "system" }
  );

  // Record the accrual (ledger + connectivity: accrual → JE → advance). ON CONFLICT no-ops so a retry after
  // the JE posted but before this insert committed will not double-insert (and the memo-less JE stays keyed
  // by its own memo idempotency for any future guard).
  await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    await client.query(
      `
        INSERT INTO accounting.factoring_default_interest_accruals (
          operating_company_id, factoring_advance_id, accrual_date, day_index, daily_rate,
          opening_balance_cents, interest_cents, closing_balance_cents, journal_entry_id
        )
        VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8, $9::uuid)
        ON CONFLICT (operating_company_id, factoring_advance_id, accrual_date) DO NOTHING
      `,
      [
        input.operating_company_id,
        input.factoring_advance_id,
        prepared.accrualDate,
        prepared.dayIndex,
        FACTORING_DEFAULT_INTEREST_DAILY_RATE,
        prepared.opening,
        prepared.interest,
        prepared.closing,
        created.id,
      ]
    );
    await appendCrudAudit(
      client,
      input.actor_user_id,
      "accounting.factoring_default_interest_accrued",
      {
        resource_type: "accounting.factoring_advances",
        resource_id: input.factoring_advance_id,
        operating_company_id: input.operating_company_id,
        display_id: prepared.displayId,
        accrual_date: prepared.accrualDate,
        day_index: prepared.dayIndex,
        interest_cents: prepared.interest,
        closing_balance_cents: prepared.closing,
        journal_entry_id: created.id,
      },
      "info",
      "FACTORING-DEFAULT-INTEREST"
    );
  });

  return { posted: true, journal_entry_id: created.id, memo: prepared.memo, closing_balance_cents: prepared.closing };
}
