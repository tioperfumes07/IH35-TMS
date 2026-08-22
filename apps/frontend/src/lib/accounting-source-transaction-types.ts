// ACCT-F5765 — shared by PostingLineagePage.tsx and AccountingAuditTrailPage.tsx, both of which take a
// free-text "Source type" filter matched with a STRICT equality WHERE clause on the backend
// (accounting/audit-trail/service.ts's listAccountingSourceLineage / listAccountingAuditTrail — no
// aliasing on the read side). A single shared list prevents the two pages' own guidance from drifting
// apart, which is exactly the shape of bug this list exists to close (PostingLineagePage's placeholder
// said "payment", the real column value is "customer_payment" — a duplicated copy in each file would
// only need to drift once more to reintroduce the same trap in one page while the other stayed correct).
//
// Live-measured via accounting.journal_entry_postings DISTINCT source_transaction_type on Neon prod
// (project tiny-field-89581227) — re-verify against prod if this list goes stale.
export const KNOWN_ACCOUNTING_SOURCE_TRANSACTION_TYPES = [
  "bank_categorization",
  "bill",
  "bill_payment",
  "customer_payment",
  "driver_advance",
  "expense",
  "factoring_advance",
  "fixed_asset_depreciation",
  "fuel_event",
  "invoice",
  "journal_entry",
  "loan_payment",
  "prepaid_purchase",
  "transfer",
] as const;
