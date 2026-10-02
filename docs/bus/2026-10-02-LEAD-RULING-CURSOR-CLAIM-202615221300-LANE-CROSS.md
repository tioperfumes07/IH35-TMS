# LANE_CROSS — CURSOR — CLAIM-RESERVE 202615221300 B-4 Settlement No + Location — 2026-10-02

2026-10-02 · Cursor Lead · authorizes LANE_CROSS for this filename

## Why

`db/migrations/CLAIMED-MIGRATION-NUMBERS.json` is default-owned by CC-1 in
`verify-lane-ownership.mjs`. Owner migration lane law assigns **Cursor HH 12–23 UTC**
for claim + author. BANK-F91035 shipped Class on existing `class_id`; ORDERS §B-4 still
needs `settlement_no` + `location_id` on `accounting.expenses` (checks).

## Authorized

Cursor may claim and later author exactly:

- claim entry `202615221300` in `db/migrations/CLAIMED-MIGRATION-NUMBERS.json`
- `db/migrations/202615221300_expense_settlement_no_location_id.sql`
- BE createCheck / checks.routes + FE WriteCheckForm Settlement No / Location wiring
  (`apps/backend/src/accounting/checks/**`, `apps/frontend/src/api/checks.ts`,
  `apps/frontend/src/components/checks/WriteCheckForm.tsx`,
  `scripts/ops/verify-b4-check-creator.mjs`)

USMCA only. No QBO write-back. No other migration numbers in the claim PR.

## How to cite

`LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-CLAIM-202615221300-LANE-CROSS.md`

PR body must carry the same line.
