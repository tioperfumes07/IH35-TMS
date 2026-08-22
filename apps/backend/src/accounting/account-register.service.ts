// D5 / CA-05 — read-only per-account register (running-balance ledger over the chart of accounts).
// Reuses accounting.fn_account_balances_as_of for the opening balance + the account's normal-balance side,
// then walks the period's postings in date order to produce a natural-sign running balance.
// Read-only: no posting, no mutation. Voided journal entries are excluded (their reversing entry is a
// separate posted JE, so the net is already correct).

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
  driver_advance: "Driver Advance",
  settlement: "Settlement",
  transfer: "Transfer",
  expense: "Expense",
  bank_categorization: "Bank Categorization",
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
  // QBO labels the amount columns Increase/Decrease by account normal-balance; debit/credit are the raw
  // ledger sides. The frontend renders Increase/Decrease from these + normal_balance.
  debit_cents: number;
  credit_cents: number;
  running_balance_cents: number;
};

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
  opening_balance_cents: number;
  closing_balance_cents: number;
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
    return {
      posting_id: p.posting_id,
      // LV-REPORTS-BALANCE-SHEET-GL-JE-DRILL (ACCT-F5425): AccountRegisterPage.tsx's "Ref No."
      // column now renders a real EntityLink kind="journal_entry" bound to this field — do not
      // drop or rename journal_entry_id here without updating that column, or the balance-sheet
      // -> register -> JE drill regresses back to dead plain text.
      journal_entry_id: p.journal_entry_id,
      entry_date: p.entry_date,
      type: p.source_transaction_type
        ? SOURCE_TYPE_LABELS[p.source_transaction_type] ?? p.source_transaction_type
        : "Journal Entry",
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
      debit_cents: debit,
      credit_cents: credit,
      running_balance_cents: running,
    };
  });
  return { rows, total_debit_cents: totalDebit, total_credit_cents: totalCredit, closing_balance_cents: running };
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
      AND je.entry_date >= $3::date AND je.entry_date <= $4::date AND je.status <> 'voided'`;
  if (input.type) {
    params.push(input.type);
    where += ` AND p.source_transaction_type = $${params.length}`;
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
  const res = await client.query<RawPosting & { amount_cents: string | number }>(
    `SELECT p.id::text AS posting_id, je.id::text AS journal_entry_id, je.entry_date::text AS entry_date,
            je.memo, p.description, p.debit_or_credit, p.amount_cents::bigint AS amount_cents,
            p.source_transaction_type, p.source_transaction_id,
            cls.class_name,
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
         ON p.source_transaction_type = 'settlement' AND ds.id::text = p.source_transaction_id
        AND ds.operating_company_id = p.operating_company_id
       LEFT JOIN mdata.drivers dr ON dr.id = ds.driver_id AND dr.operating_company_id = p.operating_company_id
       LEFT JOIN accounting.bill_payments bpp
         ON p.source_transaction_type = 'bill_payment' AND bpp.id::text = p.source_transaction_id
        AND bpp.operating_company_id = p.operating_company_id
       LEFT JOIN accounting.bills bpay
         ON bpay.id = bpp.bill_id AND bpay.operating_company_id = p.operating_company_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(NULLIF(btrim(bt.merchant_name), ''), NULLIF(btrim(bt.description), '')) AS display_label
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
  const postings: RawPosting[] = res.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));

  const { rows, total_debit_cents, total_credit_cents, closing_balance_cents } = buildRegisterRows(
    openingNatural,
    normal,
    postings
  );

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
    opening_balance_cents: openingNatural,
    closing_balance_cents,
    total_debit_cents,
    total_credit_cents,
    transaction_count: rows.length,
    rows,
    generated_at: new Date().toISOString(),
  };
}
