// C6-MONEY-JE-EXEMPT: this ingests a RAW, uncategorized bank_transactions row (status stays
// unposted, no categorization_gl_account_id set here). The real GL post happens later, once, when
// the row is categorized — maybePostBankCategorizationToGl (banking/categorization.routes.ts,
// banking/bank-feed-gl-posting.service.ts) — verified 2026-09-02, GO-23 C6.
import { computeBankTransactionDedupHash } from "./bank-tx-dedup.js";

export type BankTransactionSource = "plaid" | "qbo_import" | "manual" | "csv_import";

export type SqlQueryable = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

export function normalizeBankTransactionDescription(description: string | null | undefined): string {
  let s = String(description ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\s+#\d+$/g, "").trim();
  }
  return s.trim();
}

export async function insertPlaidSyncedBankTransaction(
  client: SqlQueryable,
  input: {
    bank_account_id: string;
    operating_company_id: string;
    plaid_transaction_id: string;
    transaction_date: string;
    posted_date: string | null;
    amount_cents: number;
    description: string | null;
    merchant_name: string | null;
    plaid_category: string[];
    pending: boolean;
    is_credit: boolean;
  }
): Promise<{ rows: Array<{ id: string; operating_company_id: string; plaid_category: string[] }> }> {
  const normalized_description = normalizeBankTransactionDescription(input.description);
  return client.query(
    `
      INSERT INTO banking.bank_transactions (
        bank_account_id,
        operating_company_id,
        plaid_transaction_id,
        transaction_date,
        posted_date,
        amount_cents,
        description,
        merchant_name,
        plaid_category,
        pending,
        is_credit,
        normalized_description,
        source,
        source_ref,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4::date,$5::date,$6,$7,$8,$9::text[],$10,$11,$12,$13,$14,now(),now()
      )
      ON CONFLICT (bank_account_id, dedup_hash)
      WHERE dedup_hash IS NOT NULL AND voided_at IS NULL
      DO UPDATE SET
        source = 'plaid',
        source_ref = EXCLUDED.source_ref,
        plaid_transaction_id = COALESCE(banking.bank_transactions.plaid_transaction_id, EXCLUDED.plaid_transaction_id),
        description = EXCLUDED.description,
        merchant_name = EXCLUDED.merchant_name,
        plaid_category = EXCLUDED.plaid_category,
        pending = EXCLUDED.pending,
        is_credit = EXCLUDED.is_credit,
        normalized_description = EXCLUDED.normalized_description,
        transaction_date = EXCLUDED.transaction_date,
        posted_date = EXCLUDED.posted_date,
        amount_cents = EXCLUDED.amount_cents,
        updated_at = now()
      WHERE banking.bank_transactions.source IS DISTINCT FROM 'plaid'
      RETURNING id, operating_company_id, plaid_category
    `,
    [
      input.bank_account_id,
      input.operating_company_id,
      input.plaid_transaction_id,
      input.transaction_date,
      input.posted_date,
      input.amount_cents,
      input.description,
      input.merchant_name,
      input.plaid_category,
      input.pending,
      input.is_credit,
      normalized_description,
      "plaid",
      input.plaid_transaction_id,
    ]
  ) as Promise<{ rows: Array<{ id: string; operating_company_id: string; plaid_category: string[] }> }>;
}

/**
 * BANK-F9341 (2026-10-02) — a statement upload is idempotent. The insert never set dedup_hash, so the partial unique
 * index (bank_account_id, dedup_hash) could not see it and a re-uploaded file landed every line twice (prod USMCA:
 * 399 of 475 csv_import lines carried no hash). Now:
 *   - `occurrence` is this row's ordinal among IDENTICAL rows (same date, amount, direction, description as printed) in
 *     the uploaded file, 1-based. Two genuine identical transactions in one file are #1 and #2 — both land.
 *   - the row lands only while the account holds FEWER than `occurrence` live rows with that same key — so a re-upload,
 *     or an overlapping statement, adds nothing, including against historical rows that were stored without a hash.
 *   - dedup_hash is written (occurrence 1 = the shared computeBankTransactionDedupHash, later ones suffixed), so the
 *     unique index backs the count under concurrency.
 */
/** A statement row's identity text: the description as printed, case- and whitespace-folded. Check / reference numbers
 * stay — "CHECK #1001" and "CHECK #1002" on the same day for the same amount are two transactions. */
export function statementRowIdentityText(description: string | null | undefined): string {
  return String(description ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function csvStatementDedupHash(
  parts: { bank_account_id: string; transaction_date: string; amount_cents: number; normalized_description: string; is_credit: boolean },
  occurrence: number
): string {
  const base = computeBankTransactionDedupHash({ ...parts, normalized_description: `${parts.is_credit ? "in" : "out"}|${parts.normalized_description}` });
  return occurrence <= 1 ? base : computeBankTransactionDedupHash({ ...parts, normalized_description: `${base}#${occurrence}` });
}

export async function insertCsvStatementBankTransaction(
  client: SqlQueryable,
  input: {
    bank_account_id: string;
    operating_company_id: string;
    transaction_date: string;
    posted_date: string;
    amount_cents: number;
    description: string;
    is_credit: boolean;
    notes: string;
    /** 1-based ordinal of this row among identical rows in the same upload. */
    occurrence?: number;
  }
): Promise<{ rows: Array<{ id: string }> }> {
  const normalized_description = normalizeBankTransactionDescription(input.description);
  const identity = statementRowIdentityText(input.description);
  const occurrence = Math.max(1, Math.floor(input.occurrence ?? 1));
  const dedup_hash = csvStatementDedupHash(
    {
      bank_account_id: input.bank_account_id,
      transaction_date: input.transaction_date,
      amount_cents: input.amount_cents,
      normalized_description: identity,
      is_credit: input.is_credit,
    },
    occurrence
  );
  return client.query(
    `
      INSERT INTO banking.bank_transactions (
        bank_account_id,
        operating_company_id,
        plaid_transaction_id,
        transaction_date,
        posted_date,
        amount_cents,
        description,
        merchant_name,
        plaid_category,
        pending,
        is_credit,
        notes,
        normalized_description,
        source,
        source_ref,
        dedup_hash,
        created_at,
        updated_at
      )
      SELECT $1,$2,NULL,$3::date,$4::date,$5,$6,NULL,'{}'::text[],false,$7,$8,$9,$10,$11,$12,now(),now()
       WHERE (
         SELECT count(*) FROM banking.bank_transactions bt
          WHERE bt.bank_account_id = $1::uuid
            AND bt.transaction_date = $3::date
            AND abs(bt.amount_cents) = abs($5::bigint)
            AND bt.is_credit = $7
            AND lower(regexp_replace(btrim(bt.description), '\\s+', ' ', 'g')) = $14
            AND bt.voided_at IS NULL
       ) < $13::int
      ON CONFLICT (bank_account_id, dedup_hash)
      WHERE dedup_hash IS NOT NULL AND voided_at IS NULL
      DO NOTHING
      RETURNING id
    `,
    [
      input.bank_account_id,
      input.operating_company_id,
      input.transaction_date,
      input.posted_date,
      input.amount_cents,
      input.description,
      input.is_credit,
      input.notes,
      normalized_description,
      "csv_import",
      null,
      dedup_hash,
      occurrence,
      identity,
    ]
  ) as Promise<{ rows: Array<{ id: string }> }>;
}
