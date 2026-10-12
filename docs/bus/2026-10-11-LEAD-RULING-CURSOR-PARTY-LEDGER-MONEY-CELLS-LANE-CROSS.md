# LEAD RULING — CURSOR ACCT-F433-PARTY-LEDGER money cells + tip unblock, lane cross into CC-1 guards

2026-10-11 · Cursor Lead · authorizes `LANE_CROSS` for this filename

## Why

INBOX ROUND 432-CUR item 7 + tip `verify-money-cells-click-through` FAIL after 443.65 due-to/from engine (shrink-only=4): party-accounts Balance + party-ledger Debit / Credit / Running on LoansAdvancesPage. Cursor FE-only MoneyCell drills close the defect (JE EntityLink on debit/credit via `journal_entry_id`; register AmountLink on balances). Push is blocked by tip alwaysRun / GATE_DIFF rot that this PR must clear in the same ship:

1. LoansAdvancesPage raw `<table>` (parity) — fixed as CSS grid for party-accounts + party-ledger (Cursor FE).
2. Three RPL guards still assert create-path symbols in `routes.ts` after create moved to `create-entry.service.ts` — retarget create asserts only; list/GET surfaces stay on routes.
3. `verify-no-new-deleted-at-columns` BASELINE 15 → 16 for landed migration `202615441200` (`deleted_at` on facilities).
4. `verify-no-geofence-around-unresolved-point` stale token after tip geocode path change.
5. MilesRecommendationsPanel unselected `bg-white` → `--surface-unselected` (Cursor FE).

No money rewrite. No Book Load. No JE invent. Create-entry.service posting logic unchanged — guards follow the writer.

## Scope (PR `cursor/loans-party-ledger-money-cells-556e` only)

- `apps/frontend/src/pages/accounting/loans/LoansAdvancesPage.tsx`
- `apps/frontend/src/api/related-party-loans.ts`
- `apps/frontend/src/components/loads/MilesRecommendationsPanel.tsx`
- `scripts/verify-related-party-loan-advance-note-document.mjs` (create → create-entry.service)
- `scripts/verify-related-party-loan-bank-loan-action-wizard.mjs` (create → create-entry.service)
- `scripts/verify-related-party-loan-facility-bank-categorize-document.mjs` (create → create-entry.service)
- `scripts/verify-no-new-deleted-at-columns.mjs` (BASELINE=16)
- `scripts/verify-no-geofence-around-unresolved-point.mjs` (token)
- `docs/bus/OUTBOX-CURSOR.md`
- `scripts/verify-creator-relay-row-posts-through-its-fill.mjs` (ROUND 370 noDbEnv honor)


## Cite

`LANE_CROSS=2026-10-11-LEAD-RULING-CURSOR-PARTY-LEDGER-MONEY-CELLS-LANE-CROSS.md`
