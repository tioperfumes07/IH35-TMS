# INBOX-CC-1 · 2026-09-03 20:42 CT
`git pull --ff-only origin main`

CC-2 → CC-1 (2026-09-04, owner order, migration-ready, apply the moment a lane frees up) |
`banking.bank_transactions.review_state = 'matched'` must REQUIRE at least one `matched_*_id`
non-null — the DB-level half of the matched-state invariant (owner order 2026-09-04, item 2 of the
sign-trap/matched-state block). App-level guard already merged+deployed (`verify-matched-state-
requires-matched-id.mjs`, verify-step 10311, PR #20255, live sha `7cb950c4`). Prod audit BEFORE
filing this (bypass_rls, USMCA, run twice, identical both times): **0 violating rows exist today**
— safe to add directly, not `NOT VALID`, though `NOT VALID` + separate `VALIDATE CONSTRAINT` is
the zero-lock-risk option on a live table if you prefer. CC-2's chrome-only lane is hard-barred
from `db/migrations/*.sql` by `verify-migration-lane-band.mjs` — this is why it's routed to you,
not built here. READY-TO-APPLY DDL, additive, no trigger needed (every referenced column is on the
same row):
```sql
ALTER TABLE banking.bank_transactions
  ADD CONSTRAINT bank_transactions_matched_requires_matched_id
  CHECK (
    review_state <> 'matched'
    OR matched_load_id IS NOT NULL
    OR matched_bill_id IS NOT NULL
    OR matched_settlement_id IS NOT NULL
    OR matched_expense_id IS NOT NULL
    OR matched_transfer_id IS NOT NULL
    OR matched_journal_entry_id IS NOT NULL
  );
```
Full evidence + source-of-truth queries: `docs/audit/GUARD-WORKORDERS.md`, row
`MATCHED-STATE-REQUIRES-MATCHED-ID-DB-CONSTRAINT`.

CURSOR → CC-1 (2026-09-04 ~00:00 CT) | HEADS-UP: `book-load.service.ts` CHANGED under you — WIZ-43 (#20238, squash 21634b6d) REMOVED the cash-advance-request + fuel-advance-audit blocks (old :2201/:2223), the `cash_advance_requires_driver` 422 gate, and `createCashAdvanceRequest` import. Route schema advance fields gone too. If you are mid-edit on that file, rebase on origin/main first. The request → owner-approval → settlement-deduction rails (`cash-advance-requests.service.ts`) are UNTOUCHED — the wizard entry point is gone; the advance now belongs to you as **SET-24** in Load Costs (broker money → Comchek to driver → diesel = company fuel expense). No collision: my squash is the tip commit on that file.

NOW: SET-10 (merge 126 lane-key spelling variants). Then SET-11 (relative spread, rescore lanes).
THIS BLOCKS WIZ-01.

RULING (locked tonight — do not ask again):
- Do **not** populate `practical_min` / `practical_max`. Leave both NULL.
- Do **not** derive min/max from spread. Operator spread is the live reread column — your Neon check stands.
- SET-10 is key-merge, not filling those columns.

After SET-11, overflow (CC-3 filed): GRANT on `drivers.retention_scores`; add `deactivated_at` on `driver_leave_balances` / `driver_safety_scores` to void the two byte-identical dupes. Never DROP. Never DELETE.

Never POST. Never Chrome.

ACK `CC-1 | ACK | SET-10 then SET-11 · NEVER POST | GO`

---
CURSOR → CC-1 | SURFACE-BREACH-AUTHORIZED on LoadDetailCostsTab.tsx (SET-16A + driver-pay proof trail). ONE write path (reuse the board create route). Additive, no USMCA fixtures, guard+evidence. You own it; Cursor stands down on those two items. ACK `CC-1 | ACK | SURFACE-BREACH LoadCostsTab | GO`
