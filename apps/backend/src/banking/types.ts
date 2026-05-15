export type BankAccountSyncStatus = "pending" | "active" | "disconnected" | "needs_reauth" | "error";

export type BankAccount = {
  id: string;
  operating_company_id: string;
  plaid_item_id: string | null;
  plaid_access_token: string | null;
  plaid_account_id: string | null;
  institution_name: string | null;
  account_name: string | null;
  account_type: string | null;
  account_class?: string | null;
  account_mask: string | null;
  current_balance_cents: number;
  available_balance_cents: number;
  currency_code: string;
  is_active: boolean;
  sync_status: BankAccountSyncStatus;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
};

export type BankTransaction = {
  id: string;
  bank_account_id: string;
  operating_company_id: string;
  plaid_transaction_id: string | null;
  transaction_date: string;
  posted_date: string | null;
  amount_cents: number;
  description: string | null;
  merchant_name: string | null;
  plaid_category: string[];
  pending: boolean;
  is_credit: boolean;
  source?: string | null;
  source_ref?: string | null;
  normalized_description?: string | null;
  matched_load_id: string | null;
  matched_bill_id: string | null;
  matched_settlement_id: string | null;
  qbo_synced_at: string | null;
  qbo_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionCategoryRule = {
  id: string;
  operating_company_id: string;
  plaid_category_pattern: string;
  coa_account_id: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ReconciliationSessionStatus = "open" | "reconciled" | "disputed";

export type ReconciliationSession = {
  id: string;
  operating_company_id: string;
  bank_account_id: string;
  period_start: string;
  period_end: string;
  statement_balance_cents: number | null;
  book_balance_cents: number | null;
  variance_cents: number | null;
  status: ReconciliationSessionStatus;
  reconciled_by_user_id: string | null;
  reconciled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
