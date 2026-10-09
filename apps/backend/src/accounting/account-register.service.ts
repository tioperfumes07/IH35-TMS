// D5 / CA-05 — read-only per-account register (running-balance ledger over the chart of accounts).
// Reuses accounting.fn_account_balances_as_of for the opening balance + the account's normal-balance side,
// then walks the period's postings in date order to produce a natural-sign running balance.
// Read-only: no posting, no mutation. Voided journal entries are excluded (their reversing entry is a
// separate posted JE, so the net is already correct).

// ACCT-F410 — the ONLY import in this file, and deliberately so. This module takes its client
// structurally (QueryableClient below) to stay pure and unit-testable. applyCashBasisSuppression
// is a pure function and importing it is what makes the register's basis the SAME decision the
// Trial Balance and Balance Sheet already make, instead of a second implementation of it.
import { applyCashBasisSuppression, type CashBasisEntry } from "./cash-basis/engine.js";

type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type NormalBalance = "debit" | "credit";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  bill: "Bill",
  customer_payment: "Invoice Payment",
  bill_payment: "Bill Payment",
  cash_advance: "Cash Advance",
  // BANK-F91057 — live USMCA posts driver_cash_advance (not cash_advance).
  driver_cash_advance: "Cash Advance",
  driver_advance: "Driver Advance",
  settlement: "Settlement",
  // BANK-F91057 — live USMCA posts driver_settlement (420 rows); settlement alias kept.
  driver_settlement: "Settlement",
  transfer: "Transfer",
  expense: "Expense",
  bank_deposit: "Deposit",
  // QBO bank-feed Categorize: money-out → Expense, money-in → Deposit (not a third "Bank Categorization"
  // type). Direction comes from banking.bank_transactions.is_credit on the source row — see
  // buildRegisterRows. The raw source_transaction_type stays bank_categorization for drill-through.
  bank_categorization: "Expense",
  journal_entry: "Journal Entry",
  manual_je: "Journal Entry",
  factoring_advance: "Factoring Advance",
  // BANK-F91056 — ORDERS leftover type labels (match B-1 TRANSACTION_TYPES chips).
  credit_memo: "Credit Memo",
  fuel_event: "Fuel Event",
  // BANK-F91057 — live census chips (load 387 · escrow 32 · bank_reconciliation 6).
  load: "Load",
  escrow_account: "Escrow",
  bank_reconciliation: "Bank Reconciliation",
};

export type RawPosting = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  memo: string | null;
  description: string | null;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  source_transaction_type: string | null;
  source_transaction_id: string | null;
  /** Human document id (bill_number / invoice display_id / …). Never a UUID. */
  reference: string | null;
  // CA-05 QBO-parity additions (all read-only, derived):
  payee: string | null; // from the source transaction (bill→vendor, invoice→customer); null when unresolved
  split_account: string | null; // the contra account(s); "-Split-" when the JE touches >1 other account
  class_name: string | null; // catalogs.classes via posting.class_id
  /** B-1 / QBO ✓ — blank | C (matched to bank feed OR register_cleared) | R (locked by closed reconciliation). */
  reconcile_status: "" | "C" | "R";
  /** True when C/R comes from a bank_transactions match (blank↔C then requires unmatch). */
  cleared_by_bank_match: boolean;
  /** B-1 📎 count from docs.file_links on the source document (0 when unlinked / no docs). */
  attachment_count: number;
  /** Location label when bank categorization carried one; honest null otherwise. */
  location: string | null;
  /**
   * B-1 ORDERS — when source is expense, accounting.expenses.payment_type (expense|check|cash|credit_card).
   * Check documents are expenses with payment_type='check'; Edit must hop to /accounting/checks/:id.
   */
  expense_payment_type: string | null;
  /**
   * QBO bank-feed Categorize direction (CHAIN-05). Only set when source_transaction_type =
   * bank_categorization — true = money IN (Deposit), false = money OUT (Expense). Null otherwise.
   */
  bank_is_credit: boolean | null;
};

export type AccountRegisterRow = {
  posting_id: string;
  journal_entry_id: string;
  entry_date: string;
  type: string;
  source_transaction_type: string | null; // raw type for drill-through routing (label is in `type`)
  // ACCT-REGISTER-SOURCEROUTE-UUID-REGRESSION: `reference` (below) became a human document id in
  // ACCT-F5426, but AccountRegisterPage.tsx's sourceRoute() still called navigate() with it — every
  // drill-through link (invoice/bill/payment/expense/settlement) silently broke, since those routes
  // expect the entity's real UUID, not its display id. This raw id is the one sourceRoute() must use.
  source_transaction_id: string | null;
  reference: string | null;
  payee: string | null;
  memo: string | null;
  description: string | null;
  split_account: string | null;
  class_name: string | null;
  reconcile_status: "" | "C" | "R";
  cleared_by_bank_match: boolean;
  attachment_count: number;
  location: string | null;
  /** B-1 — expense.payment_type when source is expense; null otherwise. Drives Check Edit hop. */
  expense_payment_type: string | null;
  // QBO labels the amount columns Increase/Decrease by account normal-balance; debit/credit are the raw
  // ledger sides. The frontend renders Increase/Decrease from these + normal_balance.
  debit_cents: number;
  credit_cents: number;
  running_balance_cents: number;
};

/**
 * ACCT-F410 — THE REGISTER'S BASIS. One rule, derived from the engine the reports already use.
 *
 * WHY THIS EXISTS
 *   Five report pages let you click a figure and land here. Until now this register had no basis
 *   concept at all — MEASURED 2026-10-05: zero occurrences of `basis` in this file and in
 *   account-register.routes.ts — so a CASH-basis figure drilled into an ACCRUAL register and the
 *   register's total disagreed with the number clicked. ACCT-F410-A stopped the lie by refusing the
 *   drill (resolveAmountRoute returned null for cash, rendering plain text). This restores the
 *   drill by making the register actually answer in the basis asked for.
 *
 * HOW IT TIES BY CONSTRUCTION, AND WHY IT IS NOT A SECOND IMPLEMENTATION
 *   The reports do not compute cash basis per POSTING; they compute it per ACCOUNT, through
 *   cash-basis/engine.ts `applyCashBasisSuppression`, with the account classified by its COA ROLE
 *   (ar_control / ap_control, resolved by resolveRoleAccountOptional) and otherwise "other" —
 *   see account-balances.service.ts inferSourceType and cash-basis/report-transforms.ts. This
 *   register is ONE account, so it feeds that same engine the same single classification and gets
 *   the same answer the Trial Balance and Balance Sheet get for that account. Nothing is
 *   re-derived here; a per-posting classification would be a RICHER rule than the reports apply
 *   and would therefore break the very tie it was meant to create.
 *
 * WHAT CASH BASIS DOES TO A REGISTER, concretely
 *   - The A/R control or A/P control account: every posting is zeroed and the running balance stays
 *     flat at zero, which is exactly @decision Q3 ("Trial Balance cash mode keeps AR/AP rows
 *     present with zero balances") made visible one level down. The rows remain, because the
 *     transactions are real; what cash basis denies them is recognition, not existence.
 *   - Every other account: unchanged. That is not a shortcut — it is what the reports do, since
 *     the engine passes source_type "other" straight through.
 *
 * NAMED, NOT FIXED HERE — ACCT-F412. The cash-basis P&L is currently IDENTICAL to the accrual P&L.
 * cash-basis/report-transforms.ts `profitLossLineToEntry` sets `settlement_date: anchorDate` where
 * anchorDate IS the as-of date, and the engine recognizes a line when settlement_date <= as_of, so
 * every revenue and expense line is always recognized. MEASURED: an entry anchored that way keeps
 * 100000 of 100000, while the same entry with settlement_date null correctly zeroes. So the
 * transform is structurally present and economically inert — a cash-basis P&L that never defers
 * unpaid revenue. That is an accounting decision about reported numbers, not a defect I may fix
 * silently, so it is reported rather than changed. This register matching it is correct TODAY and
 * will keep matching it after ACCT-F412, because both go through the same engine.
 */
export type AccountingBasis = "accrual" | "cash";

export type AccountRegisterReport = {
  account: {
    account_id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    normal_balance: NormalBalance;
  };
  from_date: string;
  to_date: string;
  /** ACCT-F410 — the basis this payload was computed in. The caller asked; this is the answer. */
  basis: AccountingBasis;
  /**
   * True when cash basis actually suppressed this account (it is the A/R or A/P control). The UI
   * says so on screen, because a register of real transactions showing zeros must explain itself
   * rather than look like a broken query.
   */
  cash_basis_suppressed: boolean;
  opening_balance_cents: number;
  closing_balance_cents: number;
  /** Feed-side balance from banking.bank_accounts.current_balance_cents when a bank maps to this GL. */
  bank_balance_cents: number | null;
  /** banking.bank_accounts.id when this GL is linked; null for pure CoA accounts. */
  bank_account_id: string | null;
  /** Last closed reconciliation statement date (period_end), or null. */
  reconciled_through: string | null;
  total_debit_cents: number;
  total_credit_cents: number;
  transaction_count: number;
  rows: AccountRegisterRow[];
  generated_at: string;
};

/**
 * Pure register builder (unit-tested). Walks postings in order, producing a NATURAL-sign running balance:
 * for a debit-normal account the balance rises on debits; for a credit-normal account it rises on credits.
 * `openingNaturalCents` is the opening balance already expressed in the account's natural sign.
 */
export function buildRegisterRows(
  openingNaturalCents: number,
  normal: NormalBalance,
  postings: RawPosting[]
): { rows: AccountRegisterRow[]; total_debit_cents: number; total_credit_cents: number; closing_balance_cents: number } {
  let running = openingNaturalCents;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows = postings.map((p): AccountRegisterRow => {
    const amt = Number(p.amount_cents) || 0;
    const debit = p.debit_or_credit === "debit" ? amt : 0;
    const credit = p.debit_or_credit === "credit" ? amt : 0;
    totalDebit += debit;
    totalCredit += credit;
    running += normal === "debit" ? debit - credit : credit - debit;
    // B-1 ORDERS: a Check is an expense with payment_type='check' — surface TYPE as Check (not Expense).
    const paymentType = p.expense_payment_type ?? null;
    const isCheck =
      p.source_transaction_type === "expense" && (paymentType ?? "").toLowerCase() === "check";
    // QBO parity (Martin bank categorize): bank-feed Categorize lands in the account register as
    // Expense (money OUT) or Deposit (money IN) — never a third type. CoA Category posts through
    // CHAIN-05 without requiring an Item / expense_category_account_map row.
    const isBankCat = p.source_transaction_type === "bank_categorization";
    const typeLabel = isCheck
      ? "Check"
      : isBankCat
        ? p.bank_is_credit === true
          ? "Deposit"
          : "Expense"
        : p.source_transaction_type
          ? SOURCE_TYPE_LABELS[p.source_transaction_type] ?? p.source_transaction_type
          : "Journal Entry";
    return {
      posting_id: p.posting_id,
      // LV-REPORTS-BALANCE-SHEET-GL-JE-DRILL (ACCT-F5425): AccountRegisterPage.tsx's "Ref No."
      // column now renders a real EntityLink kind="journal_entry" bound to this field — do not
      // drop or rename journal_entry_id here without updating that column, or the balance-sheet
      // -> register -> JE drill regresses back to dead plain text.
      journal_entry_id: p.journal_entry_id,
      entry_date: p.entry_date,
      type: typeLabel,
      source_transaction_type: p.source_transaction_type ?? null,
      source_transaction_id: p.source_transaction_id ?? null,
      // ACCT-REGISTER-REF-IS-SOURCE-UUID: Ref No. is a human document id from already-joined
      // source rows. Never copy source_transaction_id (UUID) here — EntityLink tombstones it as
      // "Journal entry — not visible" on every register row.
      reference: p.reference ?? null,
      payee: p.payee ?? null,
      memo: p.memo ?? null,
      description: p.description ?? null,
      split_account: p.split_account ?? null,
      class_name: p.class_name ?? null,
      reconcile_status: p.reconcile_status === "R" || p.reconcile_status === "C" ? p.reconcile_status : "",
      cleared_by_bank_match: Boolean(p.cleared_by_bank_match),
      attachment_count: Number(p.attachment_count) || 0,
      location: p.location ?? null,
      expense_payment_type: paymentType,
      debit_cents: debit,
      credit_cents: credit,
      running_balance_cents: running,
    };
  });
  return { rows, total_debit_cents: totalDebit, total_credit_cents: totalCredit, closing_balance_cents: running };
}

/**
 * ACCT-F410 — apply the basis to one account's postings. PURE, so it is unit-provable without a
 * database, and it delegates the decision to cash-basis/engine.ts rather than restating it.
 *
 * The account is classified exactly as the reports classify it: by COA ROLE first (the ids the
 * route resolved with resolveRoleAccountOptional), then by the engine's own name heuristic, which
 * is what account-balances.service.ts inferSourceType does. One entry, one answer, and that answer
 * is whatever the Trial Balance and Balance Sheet already show for this account.
 */
export function applyRegisterBasis(input: {
  basis: AccountingBasis;
  postings: RawPosting[];
  account: { account_id: string; account_code: string; account_name: string; account_type: string };
  asOfDate: string;
  roleMatches?: { arControlAccountId?: string | null; apControlAccountId?: string | null };
}): { postings: RawPosting[]; suppressed: boolean } {
  if (input.basis !== "cash") return { postings: input.postings, suppressed: false };

  // Role match first, heuristic second — the same order, and the same heuristic, the reports use.
  const roleSource: CashBasisEntry["source_type"] =
    input.roleMatches?.arControlAccountId && input.account.account_id === input.roleMatches.arControlAccountId
      ? "ar_control"
      : input.roleMatches?.apControlAccountId && input.account.account_id === input.roleMatches.apControlAccountId
        ? "ap_control"
        : "other";

  const probe: CashBasisEntry = {
    entry_id: input.account.account_id,
    account_code: input.account.account_code,
    account_name: input.account.account_name,
    account_type: input.account.account_type,
    // A non-zero probe: the engine answers by ZEROING a suppressed account, so a zero probe could
    // not tell "suppressed" from "already zero". 1 cent in, 0 out means suppressed.
    amount_cents: 1,
    source_type: roleSource,
  };
  const [answer] = applyCashBasisSuppression([probe], { as_of_date: input.asOfDate });
  const suppressed = (answer?.amount_cents ?? 1) === 0;
  if (!suppressed) return { postings: input.postings, suppressed: false };

  // Suppressed: the rows STAY — the transactions are real and the owner must still see them — and
  // every amount goes to zero, so the register's totals and running balance land exactly where the
  // report's number for this account does. @decision Q3.
  return {
    postings: input.postings.map((p) => ({ ...p, amount_cents: 0 })),
    suppressed: true,
  };
}

type BalanceFnRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: string;
  opening_balance_cents: string | number | null;
};

/** Build the register for one account over [from_date, to_date]. `client` must already be company-scoped (RLS set). */
export async function getAccountRegister(
  client: QueryableClient,
  input: {
    operating_company_id: string;
    account_id: string;
    from_date: string;
    to_date: string;
    search?: string | null;
    type?: string | null;
    /** ACCT-F410 — defaults to accrual (@decision Q7: "Basis defaults to accrual"). */
    basis?: AccountingBasis | null;
    /**
     * The company's COA role accounts, resolved by the ROUTE with resolveRoleAccountOptional, the
     * same way trial-balance.routes.ts and balance-sheet.routes.ts resolve them. Passed in rather
     * than looked up here so the register cannot answer from a different role mapping than the
     * report the owner clicked from.
     */
    roleMatches?: { arControlAccountId?: string | null; apControlAccountId?: string | null } | null;
  }
): Promise<AccountRegisterReport> {
  // Opening balance + account meta from the shared balances function. opening_balance_cents is the raw net
  // (debits - credits) through (from_date - 1 day); flip to the account's natural sign for a credit-normal account.
  const balRes = await client.query<BalanceFnRow>(
    `SELECT account_id::text, account_code, account_name, account_type, normal_balance, opening_balance_cents
       FROM accounting.fn_account_balances_as_of($1::uuid, $2::date, $3::date)`,
    [input.operating_company_id, input.to_date, input.from_date]
  );
  let acct = balRes.rows.find((r) => r.account_id === input.account_id);
  // ACCT-F51: fn_account_balances_as_of's HAVING clause (by design, for balance-sheet-style listings)
  // excludes any account whose opening AND closing balance are both exactly $0 for this window — e.g. a
  // wash entry (equal offsetting debit+credit), or a real account with no activity yet. That exclusion is
  // an honest EMPTY register, not a missing account, and must not 404/crash the page (ACCT-R-44 precedent:
  // an accounting surface never unmounts to a blank/error page on a well-formed-but-sparse response). Fall
  // back to a direct metadata lookup ONLY to confirm the account itself exists in this company's chart —
  // the balance is already known to be zero by construction of the exclusion, so this is not new GL math.
  if (!acct) {
    const metaRes = await client.query<{
      account_id: string;
      account_code: string;
      account_name: string;
      account_type: string;
    }>(
      `SELECT id::text AS account_id, COALESCE(account_number, '') AS account_code, account_name, account_type
         FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [input.account_id, input.operating_company_id]
    );
    const meta = metaRes.rows[0];
    if (!meta) throw new Error("account_not_found");
    const inferredNormal: NormalBalance = ["Asset", "CostOfGoodsSold", "Expense", "OtherExpense"].includes(
      meta.account_type
    )
      ? "debit"
      : "credit";
    acct = { ...meta, normal_balance: inferredNormal, opening_balance_cents: 0 };
  }
  const normal: NormalBalance = acct.normal_balance === "debit" ? "debit" : "credit";
  const openingRaw = acct.opening_balance_cents != null ? Number(acct.opening_balance_cents) : 0;
  const openingNatural = (normal === "credit" ? -openingRaw : openingRaw) || 0; // avoid -0 on a zero balance

  const params: unknown[] = [input.operating_company_id, input.account_id, input.from_date, input.to_date];
  let where = `p.operating_company_id = $1::uuid AND p.account_id = $2::uuid
      AND je.entry_date >= $3::date AND je.entry_date <= $4::date AND je.status <> 'voided'
      AND COALESCE(je.is_sample_data, false) = false`;
  if (input.type === "check") {
    // B-1 ORDERS — Check = expense with payment_type='check' (same expense row / JE).
    where += ` AND p.source_transaction_type = 'expense'
      AND EXISTS (
        SELECT 1 FROM accounting.expenses ex_chk
         WHERE ex_chk.id::text = p.source_transaction_id
           AND ex_chk.operating_company_id = p.operating_company_id
           AND ex_chk.payment_type = 'check'
      )`;
  } else if (input.type === "expense") {
    // B-1 / BANK-F91027 — Expense filter must not include Checks (payment_type='check').
    // QBO bank-feed Categorize money-OUT posts as bank_categorization but surfaces TYPE=Expense —
    // include those rows so the Expense chip matches the register Type column (Martin / QBO parity).
    where += ` AND (
        (
          p.source_transaction_type = 'expense'
          AND NOT EXISTS (
            SELECT 1 FROM accounting.expenses ex_non_chk
             WHERE ex_non_chk.id::text = p.source_transaction_id
               AND ex_non_chk.operating_company_id = p.operating_company_id
               AND ex_non_chk.payment_type = 'check'
          )
        )
        OR (
          p.source_transaction_type = 'bank_categorization'
          AND EXISTS (
            SELECT 1 FROM banking.bank_transactions bt_exp
             WHERE bt_exp.id::text = p.source_transaction_id
               AND bt_exp.operating_company_id = p.operating_company_id
               AND bt_exp.is_credit IS NOT TRUE
          )
        )
      )`;
  } else if (input.type) {
    // BANK-F91057 — live keys ≠ chip aliases. Settlement chip must hit driver_settlement
    // (420 USMCA rows); Cash Advance → driver_cash_advance; Journal Entry → manual_je too.
    if (input.type === "journal_entry") {
      where += ` AND (p.source_transaction_type IS NULL OR p.source_transaction_type IN ('journal_entry', 'manual_je'))`;
    } else if (input.type === "settlement" || input.type === "driver_settlement") {
      where += ` AND p.source_transaction_type IN ('settlement', 'driver_settlement')`;
    } else if (input.type === "cash_advance" || input.type === "driver_cash_advance") {
      where += ` AND p.source_transaction_type IN ('cash_advance', 'driver_cash_advance')`;
    } else if (input.type === "bank_deposit") {
      // QBO: money-IN bank Categorize surfaces as Deposit beside bank_deposit documents.
      where += ` AND (
          p.source_transaction_type = 'bank_deposit'
          OR (
            p.source_transaction_type = 'bank_categorization'
            AND EXISTS (
              SELECT 1 FROM banking.bank_transactions bt_dep
               WHERE bt_dep.id::text = p.source_transaction_id
                 AND bt_dep.operating_company_id = p.operating_company_id
                 AND bt_dep.is_credit IS TRUE
            )
          )
        )`;
    } else {
      params.push(input.type);
      where += ` AND p.source_transaction_type = $${params.length}`;
    }
  }
  if (input.search && input.search.trim()) {
    params.push(`%${input.search.trim()}%`);
    const i = params.length;
    where += ` AND (p.description ILIKE $${i} OR je.memo ILIKE $${i} OR p.source_transaction_id ILIKE $${i})`;
  }

  // CA-05 QBO-parity columns, all read-only / derived (no new GL math):
  //  - split_account: the contra account(s) of the SAME journal entry; "-Split-" when >1 distinct other
  //    account (QBO register semantics). Computed via a lateral over the other postings of this JE.
  //  - class_name: catalogs.classes via posting.class_id (honest NULL when unclassed).
  //  - payee: derived from the source transaction — bill→vendor, invoice→customer (the unambiguous cases);
  //    honest NULL otherwise. source_transaction_id is text; targets cast to text for a safe compare.
  const res = await client.query<
    RawPosting & {
      amount_cents: string | number;
      reconcile_status: string | null;
      attachment_count: string | number | null;
      cleared_by_bank_match: boolean | null;
      location: string | null;
      register_cleared: boolean | null;
      match_status: string | null;
      expense_payment_type: string | null;
    }
  >(
    `SELECT p.id::text AS posting_id, je.id::text AS journal_entry_id, je.entry_date::text AS entry_date,
            je.memo, p.description, p.debit_or_credit, p.amount_cents::bigint AS amount_cents,
            p.source_transaction_type, p.source_transaction_id,
            CASE WHEN p.source_transaction_type = 'expense' THEN ex.payment_type ELSE NULL END AS expense_payment_type,
            btx_lbl.bank_is_credit AS bank_is_credit,
            cls.class_name,
            COALESCE(p.register_cleared, false) AS register_cleared,
            COALESCE(match_info.match_status, '') AS match_status,
            -- B-2 Finish→R (no migration): JE-only register_cleared on a bank ledger becomes R
            -- when a closed reconciliation_session covers the entry date for that bank
            -- (same ledger join as reconciled_through). Bank-match R still wins first.
            CASE
              WHEN COALESCE(match_info.match_status, '') = 'R' THEN 'R'
              WHEN COALESCE(p.register_cleared, false)
                   AND EXISTS (
                     SELECT 1
                       FROM banking.bank_accounts ba
                       JOIN banking.reconciliation_sessions rs
                         ON rs.bank_account_id = ba.id
                        AND rs.operating_company_id = ba.operating_company_id
                        AND rs.status = 'reconciled'
                      WHERE ba.operating_company_id = p.operating_company_id
                        AND ba.ledger_account_id = p.account_id
                        AND ba.deactivated_at IS NULL
                        AND je.entry_date BETWEEN rs.period_start AND rs.period_end
                   ) THEN 'R'
              WHEN COALESCE(match_info.match_status, '') = 'C' OR COALESCE(p.register_cleared, false) THEN 'C'
              ELSE ''
            END AS reconcile_status,
            (COALESCE(match_info.match_status, '') IN ('C', 'R')) AS cleared_by_bank_match,
            COALESCE(att.attachment_count, 0)::int AS attachment_count,
            NULLIF(btrim(match_info.location_label), '') AS location,
            -- Payee derived from the source transaction's real party (verified FKs, no phantom columns):
            --   bill→vendor, expense→vendor, invoice→customer, customer_payment→customer, settlement→driver.
            --   bill_payment has no clean direct party link → honest NULL (not fabricated).
            COALESCE(bv.vendor_name, ev.vendor_name, ic.customer_name, pc.customer_name,
                     NULLIF(TRIM(CONCAT_WS(' ', dr.first_name, dr.last_name)), '')) AS payee,
            -- Human Ref No. from the same source joins as payee. bills.display_id is near-dead;
            -- bill_number is the live identity (JE source-link resolver, same convention).
            -- Honest NULL when no human id exists — never source_transaction_id.
            COALESCE(
              NULLIF(btrim(b.bill_number), ''),
              NULLIF(btrim(inv.display_id), ''),
              NULLIF(btrim(pay.display_id), ''),
              NULLIF(btrim(ex.expense_number), ''),
              CASE WHEN p.source_transaction_type = 'expense' THEN 'Expense' END,
              NULLIF(btrim(dep.display_id), ''),
              NULLIF(btrim(ds.display_id), ''),
              NULLIF(btrim(bpay.bill_number), ''),
              NULLIF(btrim(btx_lbl.display_label), '')
            ) AS reference,
            sp.split_account
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je
         ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
       -- ACCT-F350 — the entry this one reverses, for the LIFO unwind ordering documented at ORDER BY.
       LEFT JOIN accounting.journal_entries orig
         ON orig.id = je.reverses_je_id AND orig.operating_company_id = je.operating_company_id
       LEFT JOIN catalogs.classes cls ON cls.id = p.class_id AND cls.operating_company_id = p.operating_company_id
       LEFT JOIN accounting.bills b
         ON p.source_transaction_type = 'bill' AND b.id::text = p.source_transaction_id
        AND b.operating_company_id = p.operating_company_id
       LEFT JOIN mdata.vendors bv ON bv.id::text = b.vendor_uuid AND bv.operating_company_id = p.operating_company_id
       LEFT JOIN accounting.expenses ex
         ON p.source_transaction_type = 'expense' AND ex.id::text = p.source_transaction_id
        AND ex.operating_company_id = p.operating_company_id
       LEFT JOIN mdata.vendors ev ON ev.id = ex.vendor_uuid AND ev.operating_company_id = p.operating_company_id
       LEFT JOIN accounting.invoices inv
         ON p.source_transaction_type = 'invoice' AND inv.id::text = p.source_transaction_id
        AND inv.operating_company_id = p.operating_company_id
       LEFT JOIN mdata.customers ic ON ic.id = inv.customer_id AND ic.operating_company_id = p.operating_company_id
       LEFT JOIN accounting.payments pay
         ON p.source_transaction_type = 'customer_payment' AND pay.id::text = p.source_transaction_id
        AND pay.operating_company_id = p.operating_company_id
       LEFT JOIN mdata.customers pc ON pc.id = pay.customer_id AND pc.operating_company_id = p.operating_company_id
       LEFT JOIN driver_finance.driver_settlements ds
         ON p.source_transaction_type IN ('settlement', 'driver_settlement')
        AND ds.id::text = p.source_transaction_id
        AND ds.operating_company_id = p.operating_company_id
       LEFT JOIN mdata.drivers dr ON dr.id = ds.driver_id AND dr.operating_company_id = p.operating_company_id
       LEFT JOIN accounting.bill_payments bpp
         ON p.source_transaction_type = 'bill_payment' AND bpp.id::text = p.source_transaction_id
        AND bpp.operating_company_id = p.operating_company_id
       LEFT JOIN accounting.bills bpay
         ON bpay.id = bpp.bill_id AND bpay.operating_company_id = p.operating_company_id
       LEFT JOIN accounting.deposits dep
         ON p.source_transaction_type = 'bank_deposit' AND dep.id::text = p.source_transaction_id
        AND dep.operating_company_id = p.operating_company_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(NULLIF(btrim(bt.merchant_name), ''), NULLIF(btrim(bt.description), '')) AS display_label,
                bt.is_credit AS bank_is_credit
           FROM banking.bank_transactions bt
          WHERE p.source_transaction_type = 'bank_categorization'
            AND bt.id::text = p.source_transaction_id
            AND bt.operating_company_id = p.operating_company_id
          LIMIT 1
       ) btx_lbl ON true
       LEFT JOIN LATERAL (
         SELECT CASE WHEN count(*) = 0 THEN NULL
                     WHEN count(*) = 1 THEN max(sa.account_name)
                     ELSE '-Split-' END AS split_account
           FROM (SELECT DISTINCT op.account_id
                   FROM accounting.journal_entry_postings op
                  WHERE op.journal_entry_uuid = p.journal_entry_uuid
                    AND op.account_id <> p.account_id) d
           JOIN catalogs.accounts sa ON sa.id = d.account_id AND sa.operating_company_id = p.operating_company_id
       ) sp ON true
       -- B-1 ✓ column: blank / C / R from bank-feed match + closed reconciliation session + register_cleared.
       -- R when the matched bank row's reconciliation_session is status=reconciled
       --   OR (JE-only) register_cleared on bank ledger under a closed session period (B-2 Finish→R);
       -- C when matched to a bank row otherwise OR posting.register_cleared; blank when neither.
       LEFT JOIN LATERAL (
         SELECT CASE
                  WHEN bool_or(rs.status = 'reconciled') THEN 'R'
                  WHEN bool_or(bt.id IS NOT NULL) THEN 'C'
                  ELSE ''
                END AS match_status,
                MAX(NULLIF(btrim(bt.categorization_location), '')) AS location_label
           FROM banking.bank_transactions bt
           LEFT JOIN banking.reconciliation_sessions rs
             ON rs.id = bt.reconciliation_session_id
            AND rs.operating_company_id = bt.operating_company_id
          WHERE bt.operating_company_id = p.operating_company_id
            AND (
              bt.matched_journal_entry_id = je.id
              OR (p.source_transaction_type = 'expense' AND bt.matched_expense_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'bill' AND bt.matched_bill_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'invoice' AND bt.matched_invoice_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'customer_payment' AND bt.matched_payment_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'bill_payment' AND bt.matched_bill_payment_id::text = p.source_transaction_id)
              OR (p.source_transaction_type IN ('settlement', 'driver_settlement') AND bt.matched_settlement_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'transfer' AND bt.matched_transfer_id::text = p.source_transaction_id)
              -- B-1 / BANK-F91025 — Faro wire + cash/driver advance matches must light ✓=C on the register.
              OR (p.source_transaction_type = 'factoring_advance' AND bt.matched_factoring_advance_id::text = p.source_transaction_id)
              OR (p.source_transaction_type IN ('cash_advance', 'driver_advance', 'driver_cash_advance') AND bt.matched_advance_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'bank_categorization' AND bt.id::text = p.source_transaction_id)
            )
       ) match_info ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS attachment_count
           FROM docs.file_links fl
          WHERE fl.deleted_at IS NULL
            AND p.source_transaction_id IS NOT NULL
            AND fl.entity_id::text = p.source_transaction_id
            AND fl.entity_type = CASE p.source_transaction_type
              WHEN 'expense' THEN 'expense'
              WHEN 'bill' THEN 'bill'
              WHEN 'bill_payment' THEN 'bill'
              WHEN 'invoice' THEN 'invoice'
              WHEN 'customer_payment' THEN 'payment'
              WHEN 'settlement' THEN 'settlement'
              WHEN 'driver_settlement' THEN 'settlement'
              ELSE p.source_transaction_type
            END
       ) att ON true
      WHERE ${where}
      -- ACCT-F349 — ORDER BY DOCUMENT, THEN BY LINE WITHIN THAT DOCUMENT.
      --
      -- line_sequence was the first tiebreaker, which sorted ACROSS journal entries by each posting's
      -- position INSIDE its own entry. A bill credits A/P on line 2 (its expense line is 1); a bill
      -- payment debits A/P on line 1. So in the A/P register EVERY payment sorted before EVERY bill that
      -- shared its date, no matter which actually happened first, and the running-balance column then
      -- showed a state that never existed.
      --
      -- Measured on prod 2026-08-11: USMCA A/P (2000), 2026-08-16 — the payment of bill L-20260810-0003
      -- (JE created 22:45:57) sorted above the bill itself (JE created 22:45:54), so the register read
      -- -17,415c: a NEGATIVE accounts-payable balance, from paying a bill the register had not yet shown.
      -- 468 account-days across the ledger carry more than one journal entry, so this is the norm on any
      -- day a bill is paid the day it is entered, not an edge case.
      --
      -- je.created_at is the ledger's own record of document order (populated on all 1,919 entries; there
      -- is no document-sequence column), je.id breaks exact ties deterministically, and line_sequence then
      -- orders the lines WITHIN one entry, which is what it was always for.
      -- ACCT-F350 — WITHIN A DATE: ORIGINALS IN RECORDING ORDER, THEN THEIR REVERSALS LIFO.
      --
      -- A reversal is back-dated onto the ORIGINAL entry's date whenever that period is still open
      -- (resolveReversalDate — deliberate, matches QuickBooks, 4 tests pin it). So one date legitimately
      -- holds a document AND its unwind, recorded days apart. Ordering those purely by recording time
      -- interleaves an unwind into the middle of still-live documents, and the running balance then shows
      -- a state that never existed.
      --
      -- Measured on prod 2026-08-11 — USMCA A/P (2000) on 2026-08-06: bill CC3-VOIDTEST-20260807-01
      -- (+8,877) had two payments (−3,340, −1,260); its VOID reversal was recorded 02:12:56 but the second
      -- payment's reversal only at 18:51, so the bill's liability was removed while a payment against it
      -- was still standing — A/P read **−3,340**, a negative accounts payable.
      --
      -- Unwinding is last-in-first-out: you cannot un-bill something while a payment against it stands.
      -- Ordering originals by recording order (a payment is never recorded before its bill) and then their
      -- reversals by the ORIGINAL's recording order DESCENDING replays the unwind as an unwind, so the
      -- balance cannot pass through a state the books were never in. The net for the date is unchanged —
      -- this reorders presentation only, and the closing balance still ties to fn_account_balances_as_of.
      ORDER BY je.entry_date ASC,
               (je.reverses_je_id IS NOT NULL) ASC,
               CASE WHEN je.reverses_je_id IS NOT NULL THEN orig.created_at END DESC NULLS LAST,
               je.created_at ASC, je.id ASC, p.line_sequence ASC, p.created_at ASC`,
    params
  );
  const postings: RawPosting[] = res.rows.map((r) => ({
    ...r,
    amount_cents: Number(r.amount_cents),
    reconcile_status: r.reconcile_status === "R" || r.reconcile_status === "C" ? r.reconcile_status : "",
    cleared_by_bank_match: Boolean(r.cleared_by_bank_match),
    attachment_count: Number(r.attachment_count) || 0,
    location: r.location ?? null,
    expense_payment_type: r.expense_payment_type ?? null,
    bank_is_credit:
      r.bank_is_credit === true ? true : r.bank_is_credit === false ? false : null,
  }));

  // ACCT-F410 — apply the basis to the RAW POSTINGS, before the register is built, so the running
  // balance, the period totals and the closing balance all follow from ONE decision instead of
  // three places having to agree. See THE REGISTER'S BASIS at the top of this file.
  const basis: AccountingBasis = input.basis === "cash" ? "cash" : "accrual";
  const { postings: basisPostings, suppressed: cashBasisSuppressed } = applyRegisterBasis({
    basis,
    postings,
    account: {
      account_id: acct.account_id,
      account_code: acct.account_code,
      account_name: acct.account_name,
      account_type: acct.account_type,
    },
    asOfDate: input.to_date,
    roleMatches: input.roleMatches ?? undefined,
  });

  const { rows, total_debit_cents, total_credit_cents, closing_balance_cents } = buildRegisterRows(
    // A suppressed account opens at zero too: the TB cash row for A/R is 0, not "no activity on top
    // of an accrual opening balance". Leaving the opening in would make the register's first line
    // disagree with the report in the only place the report has a number.
    cashBasisSuppressed ? 0 : openingNatural,
    normal,
    basisPostings
  );

  // B-1 header: Bank balance (feed) vs Ending balance (book) + Reconciled through.
  const bankMeta = await client.query<{
    bank_account_id: string;
    bank_balance_cents: string | number | null;
    reconciled_through: string | null;
  }>(
    `SELECT ba.id::text AS bank_account_id,
            ba.current_balance_cents AS bank_balance_cents,
            (
              SELECT rs.period_end::text
                FROM banking.reconciliation_sessions rs
               WHERE rs.bank_account_id = ba.id
                 AND rs.operating_company_id = ba.operating_company_id
                 AND rs.status = 'reconciled'
               ORDER BY rs.period_end DESC NULLS LAST
               LIMIT 1
            ) AS reconciled_through
       FROM banking.bank_accounts ba
      WHERE ba.operating_company_id = $1::uuid
        AND ba.ledger_account_id = $2::uuid
        AND ba.deactivated_at IS NULL
      ORDER BY ba.updated_at DESC NULLS LAST
      LIMIT 1`,
    [input.operating_company_id, input.account_id]
  );
  const bankRow = bankMeta.rows[0];

  return {
    account: {
      account_id: acct.account_id,
      account_code: acct.account_code,
      account_name: acct.account_name,
      account_type: acct.account_type,
      normal_balance: normal,
    },
    from_date: input.from_date,
    to_date: input.to_date,
    basis,
    cash_basis_suppressed: cashBasisSuppressed,
    opening_balance_cents: openingNatural,
    closing_balance_cents,
    bank_balance_cents: bankRow?.bank_balance_cents != null ? Number(bankRow.bank_balance_cents) : null,
    bank_account_id: bankRow?.bank_account_id ?? null,
    reconciled_through: bankRow?.reconciled_through ?? null,
    total_debit_cents,
    total_credit_cents,
    transaction_count: rows.length,
    rows,
    generated_at: new Date().toISOString(),
  };
}

export class AccountRegisterToggleError extends Error {
  constructor(
    readonly code:
      | "posting_not_found"
      | "reconcile_status_locked"
      | "unmatch_bank_first"
      | "register_cleared_column_missing",
    readonly httpStatus: 404 | 409 | 503 = 409
  ) {
    super(code);
    this.name = "AccountRegisterToggleError";
  }
}

/**
 * B-1b — toggle blank↔C on one register posting.
 * R (closed reconciliation) is locked. C from a bank-feed match cannot be blanked here
 * (operator must unmatch in Bank Transactions). Manual C uses register_cleared.
 */
export async function toggleAccountRegisterCleared(
  client: QueryableClient,
  input: {
    operating_company_id: string;
    posting_id: string;
    cleared: boolean;
    actor_user_id: string;
  }
): Promise<{ posting_id: string; reconcile_status: "" | "C" | "R"; cleared_by_bank_match: boolean; register_cleared: boolean }> {
  const rowRes = await client.query<{
    posting_id: string;
    register_cleared: boolean;
    match_status: string | null;
    je_session_reconciled: boolean;
  }>(
    `SELECT p.id::text AS posting_id,
            COALESCE(p.register_cleared, false) AS register_cleared,
            COALESCE(match_info.match_status, '') AS match_status,
            EXISTS (
              SELECT 1
                FROM banking.bank_accounts ba
                JOIN banking.reconciliation_sessions rs
                  ON rs.bank_account_id = ba.id
                 AND rs.operating_company_id = ba.operating_company_id
                 AND rs.status = 'reconciled'
               WHERE ba.operating_company_id = p.operating_company_id
                 AND ba.ledger_account_id = p.account_id
                 AND ba.deactivated_at IS NULL
                 AND je.entry_date BETWEEN rs.period_start AND rs.period_end
            ) AS je_session_reconciled
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je
         ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
       LEFT JOIN LATERAL (
         SELECT CASE
                  WHEN bool_or(rs.status = 'reconciled') THEN 'R'
                  WHEN bool_or(bt.id IS NOT NULL) THEN 'C'
                  ELSE ''
                END AS match_status
           FROM banking.bank_transactions bt
           LEFT JOIN banking.reconciliation_sessions rs
             ON rs.id = bt.reconciliation_session_id
            AND rs.operating_company_id = bt.operating_company_id
          WHERE bt.operating_company_id = p.operating_company_id
            AND (
              bt.matched_journal_entry_id = je.id
              OR (p.source_transaction_type = 'expense' AND bt.matched_expense_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'bill' AND bt.matched_bill_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'invoice' AND bt.matched_invoice_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'customer_payment' AND bt.matched_payment_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'bill_payment' AND bt.matched_bill_payment_id::text = p.source_transaction_id)
              OR (p.source_transaction_type IN ('settlement', 'driver_settlement') AND bt.matched_settlement_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'transfer' AND bt.matched_transfer_id::text = p.source_transaction_id)
              -- B-1 / BANK-F91025 — Faro wire + cash/driver advance matches must light ✓=C on the register.
              OR (p.source_transaction_type = 'factoring_advance' AND bt.matched_factoring_advance_id::text = p.source_transaction_id)
              OR (p.source_transaction_type IN ('cash_advance', 'driver_advance', 'driver_cash_advance') AND bt.matched_advance_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'bank_categorization' AND bt.id::text = p.source_transaction_id)
            )
       ) match_info ON true
      WHERE p.id = $1::uuid
        AND p.operating_company_id = $2::uuid
      LIMIT 1`,
    [input.posting_id, input.operating_company_id]
  );
  const row = rowRes.rows[0];
  if (!row) throw new AccountRegisterToggleError("posting_not_found", 404);

  const matchRaw = String(row.match_status ?? "");
  const matchStatus: "" | "C" | "R" = matchRaw === "R" || matchRaw === "C" ? matchRaw : "";
  const jeSessionReconciled = Boolean(row.je_session_reconciled);
  // JE-only R after Finish: register_cleared under a closed bank-ledger session is locked like bank-match R.
  const derivedJeR = Boolean(row.register_cleared) && jeSessionReconciled;
  if (matchStatus === "R" || derivedJeR) throw new AccountRegisterToggleError("reconcile_status_locked", 409);
  if (!input.cleared && matchStatus === "C") throw new AccountRegisterToggleError("unmatch_bank_first", 409);

  try {
    await client.query(
      `UPDATE accounting.journal_entry_postings
          SET register_cleared = $3::boolean,
              register_cleared_at = CASE WHEN $3::boolean THEN now() ELSE NULL END,
              register_cleared_by_user_id = CASE WHEN $3::boolean THEN $4::uuid ELSE NULL END
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid`,
      [input.posting_id, input.operating_company_id, input.cleared, input.actor_user_id]
    );
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (/register_cleared/.test(msg) && /does not exist|undefined_column/i.test(msg)) {
      throw new AccountRegisterToggleError("register_cleared_column_missing", 503);
    }
    throw err;
  }

  const registerCleared = input.cleared;
  const reconcileStatus: "" | "C" | "R" =
    registerCleared && jeSessionReconciled
      ? "R"
      : matchStatus === "C" || registerCleared
        ? "C"
        : "";
  return {
    posting_id: row.posting_id,
    reconcile_status: reconcileStatus,
    cleared_by_bank_match: matchStatus === "C",
    register_cleared: registerCleared,
  };
}

export class AccountRegisterInlineSaveError extends Error {
  constructor(
    readonly code:
      | "posting_not_found"
      | "open_original_document"
      | "reconcile_status_locked"
      | "nothing_to_save",
    readonly httpStatus: 404 | 409 = 409
  ) {
    super(code);
    this.name = "AccountRegisterInlineSaveError";
  }
}

/**
 * B-1c — register inline Save for fields that do not invent GL math.
 * Memo syncs JE + source document header. Location syncs matched bank categorization_location.
 * Date / payee / amount / account changes refuse with open_original_document (Edit → engine).
 * R rows warn via reconcile_status_locked when memo/location would still be allowed only after reopen —
 * QBO warns; we lock memo/location on R the same way as ✓ (operator reopens recon first).
 */
export async function saveAccountRegisterInline(
  client: QueryableClient,
  input: {
    operating_company_id: string;
    posting_id: string;
    memo?: string | null;
    location?: string | null;
    /** When true, caller also tried to change date/payee/amount/account — refuse. */
    requires_original_document?: boolean;
    actor_user_id: string;
  }
): Promise<{ posting_id: string; memo: string | null; location: string | null }> {
  if (input.requires_original_document) {
    throw new AccountRegisterInlineSaveError("open_original_document", 409);
  }

  const rowRes = await client.query<{
    posting_id: string;
    journal_entry_id: string;
    source_transaction_type: string | null;
    source_transaction_id: string | null;
    je_memo: string | null;
    match_status: string | null;
    bank_txn_id: string | null;
    location_label: string | null;
    register_cleared: boolean;
    je_session_reconciled: boolean;
  }>(
    `SELECT p.id::text AS posting_id,
            je.id::text AS journal_entry_id,
            p.source_transaction_type,
            p.source_transaction_id,
            je.memo AS je_memo,
            COALESCE(match_info.match_status, '') AS match_status,
            match_info.bank_txn_id,
            match_info.location_label,
            COALESCE(p.register_cleared, false) AS register_cleared,
            EXISTS (
              SELECT 1
                FROM banking.bank_accounts ba
                JOIN banking.reconciliation_sessions rs
                  ON rs.bank_account_id = ba.id
                 AND rs.operating_company_id = ba.operating_company_id
                 AND rs.status = 'reconciled'
               WHERE ba.operating_company_id = p.operating_company_id
                 AND ba.ledger_account_id = p.account_id
                 AND ba.deactivated_at IS NULL
                 AND je.entry_date BETWEEN rs.period_start AND rs.period_end
            ) AS je_session_reconciled
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je
         ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
       LEFT JOIN LATERAL (
         SELECT CASE
                  WHEN bool_or(rs.status = 'reconciled') THEN 'R'
                  WHEN bool_or(bt.id IS NOT NULL) THEN 'C'
                  ELSE ''
                END AS match_status,
                (array_agg(bt.id::text ORDER BY bt.transaction_date DESC NULLS LAST))[1] AS bank_txn_id,
                MAX(NULLIF(btrim(bt.categorization_location), '')) AS location_label
           FROM banking.bank_transactions bt
           LEFT JOIN banking.reconciliation_sessions rs
             ON rs.id = bt.reconciliation_session_id
            AND rs.operating_company_id = bt.operating_company_id
          WHERE bt.operating_company_id = p.operating_company_id
            AND (
              bt.matched_journal_entry_id = je.id
              OR (p.source_transaction_type = 'expense' AND bt.matched_expense_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'bill' AND bt.matched_bill_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'invoice' AND bt.matched_invoice_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'customer_payment' AND bt.matched_payment_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'bill_payment' AND bt.matched_bill_payment_id::text = p.source_transaction_id)
              OR (p.source_transaction_type IN ('settlement', 'driver_settlement') AND bt.matched_settlement_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'transfer' AND bt.matched_transfer_id::text = p.source_transaction_id)
              -- B-1 / BANK-F91025 — Faro wire + cash/driver advance matches must light ✓=C on the register.
              OR (p.source_transaction_type = 'factoring_advance' AND bt.matched_factoring_advance_id::text = p.source_transaction_id)
              OR (p.source_transaction_type IN ('cash_advance', 'driver_advance', 'driver_cash_advance') AND bt.matched_advance_id::text = p.source_transaction_id)
              OR (p.source_transaction_type = 'bank_categorization' AND bt.id::text = p.source_transaction_id)
            )
       ) match_info ON true
      WHERE p.id = $1::uuid
        AND p.operating_company_id = $2::uuid
      LIMIT 1`,
    [input.posting_id, input.operating_company_id]
  );
  const row = rowRes.rows[0];
  if (!row) throw new AccountRegisterInlineSaveError("posting_not_found", 404);

  const matchRaw = String(row.match_status ?? "");
  const derivedJeR = Boolean(row.register_cleared) && Boolean(row.je_session_reconciled);
  if (matchRaw === "R" || derivedJeR) throw new AccountRegisterInlineSaveError("reconcile_status_locked", 409);

  const memoProvided = input.memo !== undefined;
  const locationProvided = input.location !== undefined;
  if (!memoProvided && !locationProvided) {
    throw new AccountRegisterInlineSaveError("nothing_to_save", 409);
  }

  let nextMemo = row.je_memo ?? null;
  let nextLocation = row.location_label ?? null;

  if (memoProvided) {
    const memo = input.memo == null ? null : String(input.memo).trim() || null;
    nextMemo = memo;
    await client.query(
      `UPDATE accounting.journal_entries
          SET memo = $3,
              updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid`,
      [row.journal_entry_id, input.operating_company_id, memo]
    );
    await client.query(
      `UPDATE accounting.journal_entry_postings
          SET description = COALESCE($3, description)
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid`,
      [input.posting_id, input.operating_company_id, memo]
    );

    const srcType = (row.source_transaction_type ?? "").toLowerCase();
    const srcId = row.source_transaction_id;
    if (srcId && srcType === "expense") {
      await client.query(
        `UPDATE accounting.expenses
            SET memo = $3, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [srcId, input.operating_company_id, memo]
      );
    } else if (srcId && srcType === "bill") {
      await client.query(
        `UPDATE accounting.bills
            SET memo = $3, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [srcId, input.operating_company_id, memo]
      );
    } else if (srcId && (srcType === "invoice" || srcType === "customer_payment")) {
      // invoice / payment memo columns vary — JE memo is the register display SoT for these.
    }
  }

  if (locationProvided) {
    const location = input.location == null ? null : String(input.location).trim() || null;
    nextLocation = location;
    const bankTxnId =
      row.bank_txn_id ??
      (row.source_transaction_type === "bank_categorization" ? row.source_transaction_id : null);
    if (!bankTxnId) {
      // No bank row to stamp — refuse rather than invent a location column on the JE.
      if (location != null) throw new AccountRegisterInlineSaveError("open_original_document", 409);
    } else {
      await client.query(
        `UPDATE banking.bank_transactions
            SET categorization_location = $3
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid`,
        [bankTxnId, input.operating_company_id, location]
      );
    }
  }

  return { posting_id: row.posting_id, memo: nextMemo, location: nextLocation };
}
