export type AccountingOutboundEntityType =
  | "invoice"
  | "bill"
  | "payment"
  | "bill_payment"
  | "journal_entry"
  | "credit_memo"
  | "factoring_advance"
  | "expense";

export type SyncEntityOutcome = "synced" | "blocked_conflict" | "failed_retry" | "failed_dead_letter";

export type SyncEntityToQboResult = {
  outcome: SyncEntityOutcome;
  qbo_id?: string;
  qbo_sync_token?: string;
};
