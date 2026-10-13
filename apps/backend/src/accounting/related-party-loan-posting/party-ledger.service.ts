/**
 * RULING 443.65 #2c (443.59 order item 4) — the PARTY LEDGER, read from the GL account itself.
 *
 * One running account per related party: catalogs.accounts named "Due to / from <party>" (202615560900). Every posting on
 * that account is a movement — whoever wrote it (the loan engine's party entries, CC-2's Relay deposit poster, the owner's
 * bank categorizations) — so the ledger can never leave out a line the trial balance carries. Each line: date, document,
 * bank line, running balance (credit-positive: Cr = USMCA owes the party, Dr = the party owes USMCA), and for a fuel
 * funding or a money-out its pair, or "unpaired".
 *
 * A PAIR is recorded, never guessed (443.59 item 5: the owner confirms, nothing auto-pairs): a party_transfer_out entry
 * (money out to the party) names the funding entry it answers in target_id — at create, or later through
 * POST /related-party-loans/:id/pair. A funding entry is paid_direct_vendor (a party card paid Relay) or party_paid_vendor
 * (the party paid a USMCA vendor / expense).
 *
 * PARTY_LEDGER_SQL is the one query the endpoint runs; verify-party-ledger-sums-to-gl-account.mjs reads it from this file
 * (between the markers) and runs it live against an independent GL sum — the guard tests the endpoint's own query.
 */

type PgClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export const PARTY_ACCOUNT_PREFIX = "Due to / from ";

/* PARTY_LEDGER_SQL:BEGIN */
export const PARTY_LEDGER_SQL = `
  WITH mv AS (
    SELECT jep.id::text AS posting_id,
           je.id::text AS journal_entry_id,
           je.entry_date::text AS date,
           je.created_at AS je_created_at,
           jep.debit_or_credit,
           jep.amount_cents::bigint AS amount_cents,
           COALESCE(jep.description, je.memo) AS description,
           jep.source_transaction_type,
           jep.source_transaction_id,
           jep.entity_uuid::text AS entity_uuid,
           e.id::text AS loan_id,
           e.display_id AS loan_display_id,
           e.target_type,
           e.target_id::text AS loan_target_id,
           rd.deposit_id AS relay_deposit_id,
           bt.id::text AS bank_transaction_id,
           bt.transaction_date::text AS bank_line_date,
           bt.description AS bank_line_description,
           bt.amount_cents::bigint AS bank_line_amount_cents
      FROM accounting.journal_entry_postings jep
      JOIN accounting.journal_entries je
        ON je.id = jep.journal_entry_uuid AND je.operating_company_id = $2::uuid
       AND je.voided_at IS NULL AND je.status = 'posted'
      LEFT JOIN LATERAL (
        SELECT x.id, x.display_id, x.target_type, x.target_id, x.bank_transaction_id
          FROM accounting.related_party_loan_entries x
         WHERE x.je_id = je.id AND x.operating_company_id = $2::uuid AND x.deleted_at IS NULL
         ORDER BY x.created_at LIMIT 1
      ) e ON true
      LEFT JOIN integrations.relay_deposits rd
        ON jep.source_transaction_type = 'relay_deposit' AND rd.id::text = jep.source_transaction_id
      LEFT JOIN LATERAL (
        SELECT t.id, t.transaction_date, t.description, t.amount_cents
          FROM banking.bank_transactions t
         WHERE t.operating_company_id = $2::uuid
           AND (t.id = e.bank_transaction_id
                OR (jep.source_transaction_type = 'bank_categorization' AND t.id::text = jep.source_transaction_id)
                OR t.matched_journal_entry_id = je.id)
         ORDER BY (t.id = e.bank_transaction_id) DESC NULLS LAST, t.transaction_date LIMIT 1
      ) bt ON true
     WHERE jep.account_id = $1::uuid AND jep.operating_company_id = $2::uuid
  )
  SELECT mv.*,
         CASE
           WHEN mv.loan_display_id IS NOT NULL AND mv.relay_deposit_id IS NOT NULL
             THEN mv.loan_display_id || ' · Relay deposit ' || mv.relay_deposit_id
           WHEN mv.loan_display_id IS NOT NULL THEN mv.loan_display_id
           WHEN mv.relay_deposit_id IS NOT NULL THEN 'Relay deposit ' || mv.relay_deposit_id
           WHEN mv.source_transaction_type = 'bank_categorization' THEN 'Bank categorization'
           ELSE mv.source_transaction_type
         END AS document,
         CASE
           WHEN mv.target_type IN ('paid_direct_vendor', 'party_paid_vendor') THEN
             CASE WHEN po.display_id IS NOT NULL THEN 'paired' ELSE 'unpaired' END
           WHEN mv.target_type = 'party_transfer_out' THEN
             CASE WHEN pf.display_id IS NOT NULL THEN 'paired' ELSE 'unpaired' END
           ELSE NULL
         END AS pair_status,
         COALESCE(po.display_id, pf.display_id) AS pair_document,
         SUM(CASE WHEN mv.debit_or_credit = 'credit' THEN mv.amount_cents ELSE -mv.amount_cents END)
           OVER (ORDER BY mv.date, mv.je_created_at, mv.posting_id) AS running_balance_cents
    FROM mv
    LEFT JOIN LATERAL (
      SELECT o.display_id FROM accounting.related_party_loan_entries o
       WHERE mv.target_type IN ('paid_direct_vendor', 'party_paid_vendor')
         AND o.operating_company_id = $2::uuid AND o.target_type = 'party_transfer_out'
         AND o.target_id::text = mv.loan_id AND o.deleted_at IS NULL AND o.reversed_at IS NULL
       ORDER BY o.created_at LIMIT 1
    ) po ON true
    LEFT JOIN LATERAL (
      SELECT f.display_id FROM accounting.related_party_loan_entries f
       WHERE mv.target_type = 'party_transfer_out'
         AND f.operating_company_id = $2::uuid AND f.id::text = mv.loan_target_id
         AND f.target_type IN ('paid_direct_vendor', 'party_paid_vendor') AND f.deleted_at IS NULL
       LIMIT 1
    ) pf ON true
   ORDER BY mv.date, mv.je_created_at, mv.posting_id`;
/* PARTY_LEDGER_SQL:END */

export type PartyAccount = {
  account_id: string;
  account_number: string;
  account_name: string;
  party_name: string;
  party_vendor_id: string | null;
  balance_cents: number;
  movement_count: number;
};

/** Every "Due to / from <party>" account of the company, with its GL balance (credit-positive). */
export async function listPartyAccounts(client: PgClient, operatingCompanyId: string): Promise<PartyAccount[]> {
  const res = await client.query(
    `SELECT a.id::text AS account_id, a.account_number, a.account_name,
            substr(a.account_name, length($2) + 1) AS party_name,
            (SELECT CASE WHEN count(*) = 1 THEN min(v.id::text) END FROM mdata.vendors v
              WHERE v.operating_company_id = a.operating_company_id AND v.deactivated_at IS NULL
                AND v.vendor_name ILIKE substr(a.account_name, length($2) + 1) || '%') AS party_vendor_id,
            COALESCE((SELECT SUM(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END)
                        FROM accounting.journal_entry_postings p
                        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
                         AND je.operating_company_id = p.operating_company_id AND je.voided_at IS NULL AND je.status = 'posted'
                       WHERE p.account_id = a.id AND p.operating_company_id = a.operating_company_id), 0)::bigint AS balance_cents,
            (SELECT count(*) FROM accounting.journal_entry_postings p
               JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = p.operating_company_id
                AND je.voided_at IS NULL AND je.status = 'posted'
              WHERE p.account_id = a.id AND p.operating_company_id = a.operating_company_id)::int AS movement_count
       FROM catalogs.accounts a
      WHERE a.operating_company_id = $1::uuid AND a.deactivated_at IS NULL AND a.account_name LIKE $2 || '%'
      ORDER BY a.account_number`,
    [operatingCompanyId, PARTY_ACCOUNT_PREFIX]
  );
  return res.rows.map((r) => ({
    account_id: String(r.account_id),
    account_number: String(r.account_number),
    account_name: String(r.account_name),
    party_name: String(r.party_name),
    party_vendor_id: (r.party_vendor_id as string | null) ?? null,
    balance_cents: Number(r.balance_cents),
    movement_count: Number(r.movement_count),
  }));
}

export type PartyLedgerLine = {
  posting_id: string;
  journal_entry_id: string;
  date: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string | null;
  document: string;
  source_transaction_type: string;
  loan_id: string | null;
  target_type: string | null;
  relay_deposit_id: string | null;
  bank_transaction_id: string | null;
  bank_line_date: string | null;
  bank_line_description: string | null;
  bank_line_amount_cents: number | null;
  pair_status: "paired" | "unpaired" | null;
  pair_document: string | null;
  running_balance_cents: number;
};

export type PartyLedger = {
  account: PartyAccount;
  /** Credit-positive: > 0 "Due to <party>" (USMCA owes the party), < 0 "Due from <party>" (the party owes USMCA). */
  balance_cents: number;
  balance_label: "due_to" | "due_from" | "square";
  lines: PartyLedgerLine[];
};

export async function getPartyLedger(
  client: PgClient,
  operatingCompanyId: string,
  accountId: string
): Promise<PartyLedger | null> {
  const account = (await listPartyAccounts(client, operatingCompanyId)).find((a) => a.account_id === accountId);
  if (!account) return null;
  const res = await client.query(PARTY_LEDGER_SQL, [accountId, operatingCompanyId]);
  const lines: PartyLedgerLine[] = res.rows.map((r) => ({
    posting_id: String(r.posting_id),
    journal_entry_id: String(r.journal_entry_id),
    date: String(r.date),
    debit_or_credit: r.debit_or_credit as "debit" | "credit",
    amount_cents: Number(r.amount_cents),
    description: (r.description as string | null) ?? null,
    document: String(r.document),
    source_transaction_type: String(r.source_transaction_type),
    loan_id: (r.loan_id as string | null) ?? null,
    target_type: (r.target_type as string | null) ?? null,
    relay_deposit_id: (r.relay_deposit_id as string | null) ?? null,
    bank_transaction_id: (r.bank_transaction_id as string | null) ?? null,
    bank_line_date: (r.bank_line_date as string | null) ?? null,
    bank_line_description: (r.bank_line_description as string | null) ?? null,
    bank_line_amount_cents: r.bank_line_amount_cents == null ? null : Number(r.bank_line_amount_cents),
    pair_status: (r.pair_status as "paired" | "unpaired" | null) ?? null,
    pair_document: (r.pair_document as string | null) ?? null,
    running_balance_cents: Number(r.running_balance_cents),
  }));
  const balance = lines.length ? lines[lines.length - 1]!.running_balance_cents : 0;
  return {
    account,
    balance_cents: balance,
    balance_label: balance > 0 ? "due_to" : balance < 0 ? "due_from" : "square",
    lines,
  };
}
