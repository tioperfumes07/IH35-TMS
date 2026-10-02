# LEAD RULING — CURSOR competing-engine bank-match / legal / register one-writer, lane cross

2026-10-02 · Cursor Lead · authorizes LANE_CROSS for this filename

## Why

Owner law 2026-10-02 (build engines only — competing-engine audit) assigns Cursor the
**bank-match writer** lane: find every accept path that stamps `matched_*_id`, keep one
(`acceptReconMatch` → `acceptMatchWithResolveDifference`), repoint the rest, guard.

Those accept routes live under `apps/backend/src/banking/**` (CC-2 map in LANES.md) and the
one-writer guards land under `scripts/verify-*.mjs` (CC-1 map for money guards). Cursor cannot
finish the owner-ordered engine without touching those files. Standing EACH-SEAT-BUILDS-ITS-
ENGINE-END-TO-END (2026-10-01) already says the seat that owns the ORDERS/owner engine finishes
the route — this ruling names the exact cross for verify-lane-ownership.

## Scope (this PR only)

- `apps/backend/src/banking/link-suggestions-actions.routes.ts` — proxy accept/undo to acceptReconMatch / unmatchBankTransaction
- `apps/backend/src/banking/reconciliation.routes.ts` — settlement match → acceptReconMatch; load/bill refuse
- `apps/backend/src/banking/obligation-reconcile.routes.ts` — expense/settlement → acceptReconMatch; other kinds refuse (factoring_batch stays applyMatch)
- `scripts/verify-competing-engine-bank-match-one-writer.mjs`
- `scripts/verify-competing-engine-legal-money-one-writer.mjs`
- `scripts/verify-competing-engine-register-cleared-one-writer.mjs`
- `scripts/verify-no-automatch.mjs` — shrink allowlist after retired stamp writers

No new GL math. No Chrome/seed. No QBO write-back.

## Cite

`LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-COMPETING-ENGINE-BANK-MATCH-LANE-CROSS.md`
