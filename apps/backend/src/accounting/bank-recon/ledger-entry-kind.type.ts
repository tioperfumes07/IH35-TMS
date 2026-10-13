/**
 * The bank-recon ledger entry kinds a bank line can be matched to. Type-only leaf (no runtime imports), so the one
 * unmatch writer (unmatch-bank-transaction.service.ts) and the match engine (match.service.ts, which re-exports it)
 * share it without an import cycle — the db-client.type.ts pattern verify-no-circular-dependencies.mjs documents.
 */
export type LedgerEntryKind =
  | "payment"
  | "bill_payment"
  | "transfer"
  | "je"
  | "bill"
  | "expense"
  | "factoring_advance"
  | "fuel_transaction"
  | "relay_fuel"
  | "settlement"
  // ROUND 373.4 — a Deposit document (accounting.deposits): the bank deposit line matches the deposit that already
  // posted (Dr bank / Cr Undeposited Funds) when it was made. The match links; it posts nothing.
  | "deposit"
  // ROUND 443.29-B — settled Relay company wallet funding (wallet + 3.25% fee = bank/card outflow).
  | "relay_deposit";
