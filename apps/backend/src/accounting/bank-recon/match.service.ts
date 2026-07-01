import { withLuciaBypass } from "../../auth/db.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { writeTransactionSourceLink } from "../accounting-spine-emit.js";
import { applyCashBasisSuppression, type CashBasisEntry } from "../cash-basis/engine.js";

export type LedgerEntryKind = "payment" | "bill_payment" | "transfer" | "je" | "bill" | "expense";
export type MatchState = "auto_matched" | "user_matched" | "rejected";

// bank.reconciliation_matches.ledger_entry_kind has a CHECK constraint that (as of migration
// 0219_block_29_bank_reconciliation_matches.sql) only permits these four kinds. "bill"/"expense"
// candidates are surfaced as read-only match SUGGESTIONS in Part 1 but MUST NOT be persisted here —
// inserting them would violate the CHECK and 500 at runtime. Part 2 (Tier-1, gated) adds the
// migration that widens the CHECK and wires the accept path. Keeping this guard is what keeps Part 1
// Tier-3 (no schema change).
const PERSISTABLE_MATCH_KINDS: ReadonlySet<LedgerEntryKind> = new Set<LedgerEntryKind>([
  "payment",
  "bill_payment",
  "transfer",
  "je",
]);

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type BankTxn = {
  id: string;
  bank_account_id: string;
  operating_company_id: string;
  transaction_date: string;
  amount_cents: number;
  is_credit: boolean;
  description: string | null;
  merchant_name: string | null;
  notes: string | null;
};

export type MatchCandidate = {
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
  amount_cents: number;
  event_date: string;
  memo: string;
  amount_gap_cents: number;
  date_gap_days: number;
  memo_similarity: number;
  match_score: number;
  auto_match: boolean;
};

export type ResolveDifferenceInput = {
  operating_company_id: string;
  bank_transaction_id: string;
  actor_user_uuid: string;
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
  difference_account_id: string;
};

export type ResolveDifferenceResult = {
  variance_cents: number;
  difference_posted: boolean;
  journal_entry_id: string | null;
  cash_basis_revenue_cents: number;
};

export type MatchVariancePreview = {
  variance_cents: number;
  bank_amount_cents: number;
  ledger_amount_cents: number;
};

// Q11 tolerance rule for auto-match: max($1.00, 0.01% of amount).
const Q11_FIXED_TOLERANCE_CENTS = 100;
const Q11_PERCENT_TOLERANCE = 0.0001;
const AUTO_MATCH_DATE_WINDOW_DAYS = 5;
const AUTO_MATCH_MEMO_SIMILARITY_MIN = 0.8;

function normalizeText(input: string | null | undefined) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string) {
  return input
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function memoSimilarity(aRaw: string | null | undefined, bRaw: string | null | undefined) {
  const a = tokenize(normalizeText(aRaw));
  const b = tokenize(normalizeText(bRaw));
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }
  return (2 * overlap) / (aSet.size + bSet.size);
}

function daysBetween(aDate: string, bDate: string) {
  const a = new Date(aDate.slice(0, 10));
  const b = new Date(bDate.slice(0, 10));
  const deltaMs = Math.abs(a.getTime() - b.getTime());
  return Math.round(deltaMs / (24 * 60 * 60 * 1000));
}

function toleranceForAmount(amountCents: number) {
  return Math.max(Q11_FIXED_TOLERANCE_CENTS, Math.round(Math.abs(amountCents) * Q11_PERCENT_TOLERANCE));
}

function computeMatchScore(input: { amountGapCents: number; toleranceCents: number; dateGapDays: number; similarity: number }) {
  const amountScore = Math.max(0, 1 - input.amountGapCents / Math.max(input.toleranceCents, 1));
  const dateScore = Math.max(0, 1 - input.dateGapDays / AUTO_MATCH_DATE_WINDOW_DAYS);
  const memoScore = Math.max(0, Math.min(input.similarity, 1));
  return Number((0.55 * amountScore + 0.2 * dateScore + 0.25 * memoScore).toFixed(6));
}

async function loadTransaction(client: DbClient, operatingCompanyId: string, bankTransactionId: string): Promise<BankTxn | null> {
  const txn = await client.query<BankTxn>(
    `
      SELECT
        id::text,
        bank_account_id::text,
        operating_company_id::text,
        transaction_date::text,
        amount_cents::int,
        is_credit,
        description,
        merchant_name,
        notes
      FROM banking.bank_transactions
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [bankTransactionId, operatingCompanyId]
  );
  return txn.rows[0] ?? null;
}

type RawLedgerCandidate = {
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
  amount_cents: number;
  event_date: string;
  memo: string;
};

// Open-state list for accounting.bills. accounting.bills.status is plain text with NO
// enum/CHECK constraint (confirmed against 0090_p5_d2_bill_payment_balance.sql), so there is no
// CHECK to read literally. The authoritative open-state set is the one that migration itself uses
// in its partial index idx_accounting_bills_company_due_open AND the accounting.vendor_balances
// view: ('open','partial','partially_paid','unpaid'), gated on a real open balance (amount_cents >
// paid_cents) and revoked_at IS NULL.
const OPEN_BILL_STATUSES = ["open", "partial", "partially_paid", "unpaid"] as const;

// Direction of a bank line vs the money-flow direction of each candidate source. A withdrawal
// (is_credit=false, money OUT) can only reconcile against money-out records (bills, expenses,
// bill_payments, and transfers OUT of this account). A deposit (is_credit=true, money IN) can only
// reconcile against money-in records (customer/AR payments and transfers INTO this account).
// Journal entries are double-sided and genuinely ambiguous, so they are offered in both directions.
// Never cross the streams (a deposit must not surface a bill; a withdrawal must not surface an AR
// receipt).
async function fetchLedgerCandidates(
  client: DbClient,
  operatingCompanyId: string,
  txnDate: string,
  isCredit: boolean,
  bankAccountId: string
): Promise<RawLedgerCandidate[]> {
  const results: RawLedgerCandidate[] = [];

  // --- MONEY IN (deposit) sources ------------------------------------------------
  if (isCredit) {
    const payments = await client.query<{ id: string; amount_cents: number; event_date: string; memo: string | null }>(
      `
        SELECT id::text, amount_cents::int, payment_date::text AS event_date, display_id::text AS memo
        FROM accounting.payments
        WHERE operating_company_id = $1::uuid
          AND payment_date BETWEEN ($2::date - INTERVAL '7 days') AND ($2::date + INTERVAL '7 days')
          AND voided_at IS NULL
        LIMIT 200
      `,
      [operatingCompanyId, txnDate]
    );
    for (const row of payments.rows) {
      results.push({
        ledger_entry_kind: "payment",
        ledger_entry_id: row.id,
        amount_cents: Math.abs(Number(row.amount_cents ?? 0)),
        event_date: row.event_date,
        memo: row.memo ?? "",
      });
    }
  }

  // --- MONEY OUT (withdrawal) sources --------------------------------------------
  if (!isCredit) {
    const billPayments = await client.query<{ id: string; amount_cents: number; event_date: string; memo: string | null }>(
      `
        SELECT id::text, amount_cents::int, payment_date::text AS event_date, COALESCE(reference_number, memo)::text AS memo
        FROM accounting.bill_payments
        WHERE operating_company_id = $1::uuid
          AND payment_date BETWEEN ($2::date - INTERVAL '7 days') AND ($2::date + INTERVAL '7 days')
          AND revoked_at IS NULL
        LIMIT 200
      `,
      [operatingCompanyId, txnDate]
    );
    for (const row of billPayments.rows) {
      results.push({
        ledger_entry_kind: "bill_payment",
        ledger_entry_id: row.id,
        amount_cents: Math.abs(Number(row.amount_cents ?? 0)),
        event_date: row.event_date,
        memo: row.memo ?? "",
      });
    }

    // OPEN BILLS (candidate kind 'bill'). Open-states passed as $3 text[] (b.status = ANY($3)).
    // amount = open balance (amount_cents − paid_cents). Read-only SUGGESTION only in Part 1.
    const bills = await client.query<{ id: string; amount_cents: number; event_date: string; memo: string | null }>(
      `
        SELECT
          b.id::text,
          (COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0))::int AS amount_cents,
          b.bill_date::text AS event_date,
          COALESCE(b.display_id, b.bill_number, b.memo)::text AS memo
        FROM accounting.bills b
        WHERE b.operating_company_id = $1::uuid
          AND b.bill_date BETWEEN ($2::date - INTERVAL '7 days') AND ($2::date + INTERVAL '7 days')
          AND b.revoked_at IS NULL
          AND b.status = ANY($3::text[])
          AND (COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0)) > 0
          AND NOT EXISTS (
            SELECT 1 FROM bank.reconciliation_matches m
            WHERE m.ledger_entry_kind = 'bill'
              AND m.ledger_entry_id = b.id
              AND m.match_state IN ('auto_matched', 'user_matched')
          )
        LIMIT 200
      `,
      [operatingCompanyId, txnDate, OPEN_BILL_STATUSES as unknown as string[]]
    );
    for (const row of bills.rows) {
      results.push({
        ledger_entry_kind: "bill",
        ledger_entry_id: row.id,
        amount_cents: Math.abs(Number(row.amount_cents ?? 0)),
        event_date: row.event_date,
        memo: row.memo ?? "",
      });
    }

    // EXPENSES (candidate kind 'expense'). Columns confirmed from
    // 202606151300_expenses_header_phase1_foundation.sql: total_amount_cents, transaction_date, memo,
    // expense_number, is_active, voided_at. amount = total_amount_cents. Read-only SUGGESTION only.
    const expenses = await client.query<{ id: string; amount_cents: number; event_date: string; memo: string | null }>(
      `
        SELECT
          e.id::text,
          e.total_amount_cents::int AS amount_cents,
          e.transaction_date::text AS event_date,
          COALESCE(e.expense_number, e.memo)::text AS memo
        FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid
          AND e.transaction_date BETWEEN ($2::date - INTERVAL '7 days') AND ($2::date + INTERVAL '7 days')
          AND e.is_active = true
          AND e.voided_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM bank.reconciliation_matches m
            WHERE m.ledger_entry_kind = 'expense'
              AND m.ledger_entry_id = e.id
              AND m.match_state IN ('auto_matched', 'user_matched')
          )
        LIMIT 200
      `,
      [operatingCompanyId, txnDate]
    );
    for (const row of expenses.rows) {
      results.push({
        ledger_entry_kind: "expense",
        ledger_entry_id: row.id,
        amount_cents: Math.abs(Number(row.amount_cents ?? 0)),
        event_date: row.event_date,
        memo: row.memo ?? "",
      });
    }
  }

  // --- TRANSFERS (direction-scoped to this bank account's side) -------------------
  // money OUT of this account = from_account_id side; money IN = to_account_id side.
  const transferDirectionClause = isCredit
    ? "t.to_account_id = $3::uuid AND t.to_account_kind = 'bank'"
    : "t.from_account_id = $3::uuid AND t.from_account_kind = 'bank'";
  const transfers = await client.query<{ id: string; amount_cents: number; event_date: string; memo: string | null }>(
    `
      SELECT t.id::text, t.amount_cents::int, t.transfer_date::text AS event_date, COALESCE(t.memo, t.reference_number)::text AS memo
      FROM banking.transfers t
      WHERE t.operating_company_id = $1::uuid
        AND t.transfer_date BETWEEN ($2::date - INTERVAL '7 days') AND ($2::date + INTERVAL '7 days')
        AND t.revoked_at IS NULL
        AND (${transferDirectionClause})
      LIMIT 200
    `,
    [operatingCompanyId, txnDate, bankAccountId]
  );
  for (const row of transfers.rows) {
    results.push({
      ledger_entry_kind: "transfer",
      ledger_entry_id: row.id,
      amount_cents: Math.abs(Number(row.amount_cents ?? 0)),
      event_date: row.event_date,
      memo: row.memo ?? "",
    });
  }

  // --- JOURNAL ENTRIES (double-sided; offered in both directions) -----------------
  const journalEntries = await client.query<{ id: string; amount_cents: number; event_date: string; memo: string | null }>(
    `
      SELECT
        je.id::text,
        COALESCE(SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit = 'debit'), 0)::int AS amount_cents,
        je.entry_date::text AS event_date,
        je.memo::text AS memo
      FROM accounting.journal_entries je
      LEFT JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
      WHERE je.operating_company_id = $1::uuid
        AND je.entry_date BETWEEN ($2::date - INTERVAL '7 days') AND ($2::date + INTERVAL '7 days')
      GROUP BY je.id, je.entry_date, je.memo
      LIMIT 200
    `,
    [operatingCompanyId, txnDate]
  );
  for (const row of journalEntries.rows) {
    results.push({
      ledger_entry_kind: "je",
      ledger_entry_id: row.id,
      amount_cents: Math.abs(Number(row.amount_cents ?? 0)),
      event_date: row.event_date,
      memo: row.memo ?? "",
    });
  }

  return results;
}

async function loadLedgerAmountCents(client: DbClient, operatingCompanyId: string, kind: LedgerEntryKind, entryId: string) {
  if (kind === "payment") {
    const res = await client.query<{ amount_cents: number }>(
      `SELECT amount_cents::int FROM accounting.payments WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return Math.abs(Number(res.rows[0]?.amount_cents ?? 0));
  }
  if (kind === "bill_payment") {
    const res = await client.query<{ amount_cents: number }>(
      `SELECT amount_cents::int FROM accounting.bill_payments WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return Math.abs(Number(res.rows[0]?.amount_cents ?? 0));
  }
  if (kind === "transfer") {
    const res = await client.query<{ amount_cents: number }>(
      `SELECT amount_cents::int FROM banking.transfers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return Math.abs(Number(res.rows[0]?.amount_cents ?? 0));
  }
  if (kind === "bill") {
    // bill amount = OPEN BALANCE (amount_cents − paid_cents), same basis as the candidate query.
    const res = await client.query<{ amount_cents: number }>(
      `SELECT (COALESCE(amount_cents, 0) - COALESCE(paid_cents, 0))::int AS amount_cents
         FROM accounting.bills WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return Math.abs(Number(res.rows[0]?.amount_cents ?? 0));
  }
  if (kind === "expense") {
    const res = await client.query<{ amount_cents: number }>(
      `SELECT total_amount_cents::int AS amount_cents
         FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [entryId, operatingCompanyId]
    );
    return Math.abs(Number(res.rows[0]?.amount_cents ?? 0));
  }
  const res = await client.query<{ amount_cents: number }>(
    `
      SELECT COALESCE(SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit = 'debit'), 0)::int AS amount_cents
      FROM accounting.journal_entries je
      LEFT JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
      WHERE je.id = $1::uuid
        AND je.operating_company_id = $2::uuid
      GROUP BY je.id
      LIMIT 1
    `,
    [entryId, operatingCompanyId]
  );
  return Math.abs(Number(res.rows[0]?.amount_cents ?? 0));
}

async function storeMatch(
  client: DbClient,
  input: {
    operating_company_id: string;
    bank_transaction_id: string;
    ledger_entry_kind: LedgerEntryKind;
    ledger_entry_id: string;
    match_score: number;
    match_state: MatchState;
    actor_user_uuid: string;
  }
) {
  await client.query(
    `
      INSERT INTO bank.reconciliation_matches (
        operating_company_id,
        bank_transaction_id,
        ledger_entry_kind,
        ledger_entry_id,
        match_score,
        match_state,
        matched_at,
        matched_by_user_uuid
      )
      VALUES ($1::uuid, $2::uuid, $3::text, $4::uuid, $5::numeric, $6::text, now(), $7::uuid)
      ON CONFLICT (bank_transaction_id, ledger_entry_kind, ledger_entry_id)
      DO UPDATE SET
        match_score = EXCLUDED.match_score,
        match_state = EXCLUDED.match_state,
        matched_at = now(),
        matched_by_user_uuid = EXCLUDED.matched_by_user_uuid
    `,
    [
      input.operating_company_id,
      input.bank_transaction_id,
      input.ledger_entry_kind,
      input.ledger_entry_id,
      input.match_score,
      input.match_state,
      input.actor_user_uuid,
    ]
  );
}

function computeCashBasisRevenueFromActualCashHit(input: { bankAmountCents: number; ledgerAmountCents: number; asOfDate: string }) {
  // @decision Q8 - resolve-difference for bank match must recognize actual cash hit.
  const entries: CashBasisEntry[] = [
    {
      entry_id: "ledger-revenue-reference",
      account_code: "REV",
      account_name: "Ledger Revenue Candidate",
      account_type: "Income",
      amount_cents: input.ledgerAmountCents,
      source_type: "invoice_revenue",
      event_date: input.asOfDate,
      settlement_date: input.asOfDate,
    },
    {
      entry_id: "bank-cash-hit",
      account_code: "BANK",
      account_name: "Bank Cash Hit",
      account_type: "Income",
      amount_cents: input.bankAmountCents,
      source_type: "cash_event",
      event_date: input.asOfDate,
      settlement_date: input.asOfDate,
    },
  ];
  const transformed = applyCashBasisSuppression(entries, { as_of_date: input.asOfDate });
  return transformed
    .filter((entry) => entry.entry_id === "bank-cash-hit")
    .reduce((sum, entry) => sum + Number(entry.amount_cents ?? 0), 0);
}

async function postDifferenceJournalEntry(
  client: DbClient,
  input: {
    operating_company_id: string;
    bank_transaction_id: string;
    bank_account_id: string;
    difference_account_id: string;
    actor_user_uuid: string;
    transaction_date: string;
    variance_cents: number;
    is_credit: boolean;
  }
) {
  if (input.variance_cents === 0) return null;

  const accountRes = await client.query<{ coa_account_id: string | null }>(
    `
      SELECT coa_account_id::text
      FROM banking.bank_accounts
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.bank_account_id, input.operating_company_id]
  );
  const cashAccountId = accountRes.rows[0]?.coa_account_id;
  if (!cashAccountId) {
    throw new Error("bank_account_missing_coa_account_id");
  }

  const magnitude = Math.abs(input.variance_cents);
  const shouldDebitCash = (input.is_credit && input.variance_cents > 0) || (!input.is_credit && input.variance_cents < 0);
  const journalEntry = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.journal_entries (
        operating_company_id,
        entry_date,
        memo,
        source,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::date,
        $3,
        'bank_reconciliation',
        $4::uuid,
        now(),
        now()
      )
      RETURNING id::text
    `,
    [input.operating_company_id, input.transaction_date, `bank-recon:${input.bank_transaction_id}`, input.actor_user_uuid]
  );
  const journalEntryId = journalEntry.rows[0]?.id;
  if (!journalEntryId) throw new Error("failed_to_create_reconciliation_journal_entry");

  const cashSide = shouldDebitCash ? "debit" : "credit";
  const diffSide = shouldDebitCash ? "credit" : "debit";
  const linesRes = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.journal_entry_postings (
        operating_company_id,
        journal_entry_uuid,
        account_id,
        debit_or_credit,
        amount_cents,
        description,
        line_sequence,
        idempotency_key,
        created_at,
        updated_at
      )
      VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::int, 'Bank reconciliation variance leg', 1, concat('bank-recon-var:', $2::text), now(), now()),
        ($1::uuid, $2::uuid, $6::uuid, $7::text, $5::int, 'Bank reconciliation offset leg',  2, concat('bank-recon-off:', $2::text), now(), now())
      RETURNING id::text
    `,
    [input.operating_company_id, journalEntryId, cashAccountId, cashSide, magnitude, input.difference_account_id, diffSide]
  );

  // CODER-12 audit-spine: link each variance posting line to the bank transaction it reconciles
  // (per-line grain), same transaction. (The match-only path / bank.reconciliation_matches write
  // posts no GL JE and gets no link.)
  for (const row of linesRes.rows) {
    await writeTransactionSourceLink(client, {
      operating_company_id: input.operating_company_id,
      journal_entry_posting_id: row.id,
      linked_object_type: "bank_transaction",
      linked_object_id: input.bank_transaction_id,
      relationship_role: "bank_reconciliation_variance",
    });
  }

  // CODER-12 audit-spine: write the immutable audit event for the variance posting to
  // audit.audit_events (canonical, DB-trigger immutable per the blueprint), atomic with the GL write
  // and fail-loud-SAFE (audit_events' only CHECK is severity). NOT events.log_event (its
  // valid_subject_type CHECK rejects accounting subjects -> would roll back the variance post). This
  // poster previously wrote NO audit event — CODER-12 closes that gap.
  await appendCrudAudit(
    client,
    input.actor_user_uuid,
    "accounting.bank_reconciliation.variance_posted",
    { journal_entry_id: journalEntryId, bank_transaction_id: input.bank_transaction_id, variance_cents: input.variance_cents },
    "info",
    "CODER-12-BANK-RECON-SPINE"
  );

  return journalEntryId;
}

export async function findCandidates(input: { operating_company_id: string; bank_transaction_id: string; actor_user_uuid?: string }): Promise<MatchCandidate[]> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    const txn = await loadTransaction(client, input.operating_company_id, input.bank_transaction_id);
    if (!txn) return [];

    const toleranceCents = toleranceForAmount(txn.amount_cents);
    const txnAmountAbs = Math.abs(Number(txn.amount_cents ?? 0));
    const txnMemo = `${txn.merchant_name ?? ""} ${txn.description ?? ""} ${txn.notes ?? ""}`.trim();
    const rawCandidates = await fetchLedgerCandidates(
      client,
      input.operating_company_id,
      txn.transaction_date,
      txn.is_credit,
      txn.bank_account_id
    );

    const ranked = rawCandidates
      .map((candidate) => {
        const amountGapCents = Math.abs(txnAmountAbs - candidate.amount_cents);
        const dateGapDays = daysBetween(txn.transaction_date, candidate.event_date);
        const similarity = memoSimilarity(txnMemo, candidate.memo);
        const autoMatch =
          amountGapCents <= toleranceCents &&
          dateGapDays <= AUTO_MATCH_DATE_WINDOW_DAYS &&
          similarity >= AUTO_MATCH_MEMO_SIMILARITY_MIN;
        const score = computeMatchScore({
          amountGapCents,
          toleranceCents,
          dateGapDays,
          similarity,
        });
        return {
          ...candidate,
          amount_gap_cents: amountGapCents,
          date_gap_days: dateGapDays,
          memo_similarity: similarity,
          match_score: score,
          auto_match: autoMatch,
        };
      })
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 50);

    // Only persist an auto-match whose kind the bank.reconciliation_matches CHECK constraint
    // accepts. 'bill'/'expense' auto-matches are returned as ranked suggestions but never written in
    // Part 1 (see PERSISTABLE_MATCH_KINDS) — that keeps this Tier-3 and avoids a CHECK-violation 500.
    const best = ranked.find((row) => row.auto_match && PERSISTABLE_MATCH_KINDS.has(row.ledger_entry_kind));
    if (best) {
      await storeMatch(client, {
        operating_company_id: input.operating_company_id,
        bank_transaction_id: input.bank_transaction_id,
        ledger_entry_kind: best.ledger_entry_kind,
        ledger_entry_id: best.ledger_entry_id,
        match_score: best.match_score,
        match_state: "auto_matched",
        actor_user_uuid: input.actor_user_uuid ?? "00000000-0000-0000-0000-000000000000",
      });
    }

    return ranked;
  });
}

export async function acceptMatchWithResolveDifference(input: ResolveDifferenceInput): Promise<ResolveDifferenceResult> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    const txn = await loadTransaction(client, input.operating_company_id, input.bank_transaction_id);
    if (!txn) {
      throw new Error("bank_transaction_not_found");
    }
    const ledgerAmountAbs = await loadLedgerAmountCents(client, input.operating_company_id, input.ledger_entry_kind, input.ledger_entry_id);
    const txnAmountAbs = Math.abs(Number(txn.amount_cents ?? 0));
    const varianceCents = txnAmountAbs - ledgerAmountAbs;
    const toleranceCents = toleranceForAmount(txn.amount_cents);
    const similarity = memoSimilarity(`${txn.merchant_name ?? ""} ${txn.description ?? ""}`, input.ledger_entry_kind);
    const score = computeMatchScore({
      amountGapCents: Math.abs(varianceCents),
      toleranceCents,
      dateGapDays: 0,
      similarity,
    });

    await storeMatch(client, {
      operating_company_id: input.operating_company_id,
      bank_transaction_id: input.bank_transaction_id,
      ledger_entry_kind: input.ledger_entry_kind,
      ledger_entry_id: input.ledger_entry_id,
      match_score: score,
      match_state: "user_matched",
      actor_user_uuid: input.actor_user_uuid,
    });

    const journalEntryId = await postDifferenceJournalEntry(client, {
      operating_company_id: input.operating_company_id,
      bank_transaction_id: input.bank_transaction_id,
      bank_account_id: txn.bank_account_id,
      difference_account_id: input.difference_account_id,
      actor_user_uuid: input.actor_user_uuid,
      transaction_date: txn.transaction_date,
      variance_cents: varianceCents,
      is_credit: txn.is_credit,
    });

    const cashBasisRevenueCents = computeCashBasisRevenueFromActualCashHit({
      bankAmountCents: txnAmountAbs,
      ledgerAmountCents: ledgerAmountAbs,
      asOfDate: txn.transaction_date.slice(0, 10),
    });

    return {
      variance_cents: varianceCents,
      difference_posted: varianceCents !== 0,
      journal_entry_id: journalEntryId,
      cash_basis_revenue_cents: cashBasisRevenueCents,
    };
  });
}

export async function previewMatchVariance(input: {
  operating_company_id: string;
  bank_transaction_id: string;
  ledger_entry_kind: LedgerEntryKind;
  ledger_entry_id: string;
}): Promise<MatchVariancePreview> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    const txn = await loadTransaction(client, input.operating_company_id, input.bank_transaction_id);
    if (!txn) throw new Error("bank_transaction_not_found");
    const ledgerAmountAbs = await loadLedgerAmountCents(client, input.operating_company_id, input.ledger_entry_kind, input.ledger_entry_id);
    const txnAmountAbs = Math.abs(Number(txn.amount_cents ?? 0));
    return {
      variance_cents: txnAmountAbs - ledgerAmountAbs,
      bank_amount_cents: txnAmountAbs,
      ledger_amount_cents: ledgerAmountAbs,
    };
  });
}
