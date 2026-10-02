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
- follow-up (after claim on main): `db/migrations/202615221300_*.sql` + FE wiring

USMCA only. No QBO write-back. No other migration numbers in the claim PR.

## How to cite

`LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-CLAIM-202615221300-LANE-CROSS.md`

PR body must carry the same line.
