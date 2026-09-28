# ROUND 191 items 2–4 — settlement_lines posting_account_id closed, item_id is expected-state, guard shipped — CC-1 — 2026-09-28 17:37Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-r191.md`. PRs #23033, #23034, #23035 — all merged.

## Item 2 — DIRECT WRITE EXECUTED. 332 of 347 NULL posting_account_id rows resolved, live.
Read-first result (as ordered): the canonical resolver already existed —
`backfillExistingSettlementLineAccounts` in `settlement-lines-materialize.service.ts` — built for
ROUND 16.22, but never re-invoked against this backlog, and never wired into
`settlement-creator.service.ts`'s bare-AlwaysTrack-digit path (the actual root cause: that path
inserts `earnings`/`deadhead_pay`/`reimbursement`/`extra_pay` rows directly with no
`posting_account_id` column at all). No twin-duplicate situation exists here (unlike the ROUND 190
advances) — repeated same-amount lines within a settlement are normal recurring business data,
confirmed live.

Re-ran the existing, already-built `scripts/ops/backfill-settlement-lines-accounts-sweep.ts --apply`
across all 66 live USMCA settlements (51 closed / 12 open / 3 cancelled). UPDATE-only — never
touches a dollar amount or `approval_status`, verified from the function's own code before running:

```
BEFORE -> AFTER
deadhead_pay:         0/73  -> 73/73
earnings:             0/129 -> 129/129
extra_pay:            0/59  -> 59/59
escrow_contribution:  4/72  -> 72/72
deduction:            2/7   -> 5/7
reimbursement:        0/13  -> 0/13
```

**15 rows stay NULL, by design, not a miss.** 13 reimbursement + 2 deduction lines have
`source_table`/`source_reference_id` both NULL — confirmed live, zero matching rows in
`driver_finance.driver_reimbursements` / `driver_settlement_deductions` for any of them. They were
inserted this way by the same bare-AlwaysTrack path, which never records source linkage for these
two line types. The resolver (`resolveReimbursementExpenseAccount`) already has a designed fallback
— an unresolved type falls back to the generic `reimbursement_expense` role — but applying that to a
row with **no source at all** would mean guessing a type that is nowhere recorded, which is exactly
the "bulk-set EVERY still-unresolved reimbursement line to the one generic account, regardless of
type" pattern the owner's 2026-09-10 ruling (already cited in the resolver file) banned. I checked
for a real, recoverable link first (matched by driver + amount + the reimbursement table's own
`settlement_line_id` reverse-FK) before concluding there is none — this is a genuine upstream data
gap, not a resolver bug.

**Reconciliation tie: EXACT, no discrepancy.** `driver_settlements.gross_pay`/`deductions_total`/
`net_pay` on the 51 CLOSED settlements sum to **gross $80,608.41 / deduct $5,243.21 / net
$75,629.80** — matching the owner's cited accrual-tie figures to the cent. (An earlier same-session
raw sum of `settlement_lines.amount` by my own ad-hoc classification showed $80,873.01/$2,200.00 —
that was my own line-type bucketing error, not a real header-level discrepancy; the settlements'
own stored gross/deduct/net fields were correct all along and untouched by this backfill, since it
never writes to an amount column.)

## Item 3 — READ FIRST, no write. This is expected state, not a defect.
214 of 336(+) active lines have `item_id = NULL`. Live check: **every one of those 214 rows also has
NULL `quantity`/`rate_cents`/`unit_of_measure`** — zero rows have quantity/rate set with item_id
missing. The live constraint `settlement_lines_item_qty_rate_amount_check` requires `item_id` NULL
whenever those three are NULL (all-four-or-none, confirmed in `settlement-creator.service.ts`'s own
comments and enforced live). These are flat-dollar lines — reimbursement, deduction,
escrow_contribution, and accessorial-only/flat earnings or deadhead_pay — that never carried a
per-unit mileage-style breakdown. Backfilling `item_id` here would require inventing a
quantity/rate/unit split that was never entered. Not built. `catalogs.items` (390 rows: 343
Service, 46 NonInventory, 1 Inventory) is fine as-is; there is simply nothing wired to it for a
dollar-only line, by the schema's own design.

## Item 4 — DONE. `verify-settlement-line-posting-account-complete.mjs` (verify-step 11695).
Asserts zero NULL `posting_account_id` on any **CLOSED** settlement's active line, per entity —
scope matches the owner's own CLOSED-vs-OPEN accrual-tie split (an OPEN settlement is still being
built, same treatment the Lead's ROUND 176 ruling gave an open pre-settlement on an undelivered
load). The 15 sourceless rows above are a named, structural exemption
(`line_type IN ('reimbursement','deduction') AND source_reference_id IS NULL`) — not a hand-picked
ID list (the kind ROUND 176 refused); same shape as that ruling's own fix (skip by a real predicate,
report the real gap, never silently bury it). Wired into `money-pr-local-gate.mjs`'s live-domain
guard list against the 3 files that could regress this. Live-verified:

```
verify-settlement-line-posting-account-complete: 15 known, non-failing gap(s) — ...(named, each printed)
verify-settlement-line-posting-account-complete: PASS — every CLOSED settlement's active line has
posting_account_id, except 15 named, sourceless gap(s) above (not guessed, per owner 2026-09-10 ruling).
```

## Also posted this round (per the Lead's ROUND 176 ruling, addressed to CC-1)
Confirmed live and added to the ROUND 173 load-import defect register (PR #23035): tour
`ec4023fd-f208-4553-907c-b967fae9b418` bundles cancelled load 13623 with in-flight load 13631;
pre-settlement P-0012 correctly reflects only 13631's real earnings, but nothing recorded that the
tour lost a leg when 13623 was cancelled. Register-only, not repaired — flagged for whoever owns
tour/settlement cascade logic.

## What's next
ROUND 191 items 2–4 are closed. No remaining task from this order. Standing by for the next ROUND.

Tier used: mid (live-data investigation + two small, surgical writes — an existing sweep script
re-run, and one new guard file — no new business logic authored beyond the guard's own predicate).
