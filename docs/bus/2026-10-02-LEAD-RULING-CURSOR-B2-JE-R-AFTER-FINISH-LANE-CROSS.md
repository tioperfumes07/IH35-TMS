# LEAD RULING — CURSOR B-2 Finish→R JE-only register_cleared, lane cross into CC-1 account-register + CC-2 reconciliation.routes

2026-10-02 · Cursor Lead · authorizes LANE_CROSS for this filename

## Why

ORDERS-2026-10-01-BANKING-REGISTER-SET assigns B-2 Reconcile to CURSOR end to end
(screen + route + read model). After B-2 JE-line reconcilable (#24009), Finish stamps
only `banking.bank_transactions.reconciliation_session_id`. Account-register ✓ for
JE-only `register_cleared` lines stayed C forever. Closing that half of B-2 requires
the read-model CASE + toggle lock in `account-register.service.ts` (CC-1 lane) and a
comment on the complete path in `reconciliation.routes.ts` (CC-2 lane).

Standing owner law 2026-10-01 (EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END) already says the
seat that owns the ORDERS engine finishes the route/read-model that completes it — no
handoff. This ruling names the two files for verify-lane-ownership.

## Scope (this PR only)

- `apps/backend/src/accounting/account-register.service.ts` — derive R when
  `register_cleared` + bank ledger under a closed `reconciliation_sessions` period;
  lock toggle + inline-save on derived R. No new GL math. No migration (UTC 06).
- `apps/backend/src/banking/reconciliation.routes.ts` — comment only on complete()
  (still stamps bank_transactions only).
- `scripts/verify-b2-je-line-r-after-finish.mjs` — static guard.

No other accounting/banking writers. Column `posting.reconciliation_session_id` stays
deferred to Cursor HH 12–23.

## Cite

`LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-B2-JE-R-AFTER-FINISH-LANE-CROSS.md`
