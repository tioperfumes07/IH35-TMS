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
      ON CONFLICT (bank_account_id, dedup_hash) DO UPDATE SET
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
  }
): Promise<{ rows: Array<{ id: string }> }> {
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
        notes,
        normalized_description,
        source,
        source_ref,
        created_at,
        updated_at
      )
      VALUES ($1,$2,NULL,$3::date,$4::date,$5,$6,NULL,'{}'::text[],false,$7,$8,$9,$10,$11,now(),now())
      ON CONFLICT (bank_account_id, dedup_hash) DO NOTHING
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
    ]
  ) as Promise<{ rows: Array<{ id: string }> }>;
}
