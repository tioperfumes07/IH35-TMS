# CHECKPOINT — CC-1 — 2026-09-25 5:15 PM CT (22:15Z). Deadline 09-26 04:00 UTC (R-185) / 06:00 UTC (R-187).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-28.md` (WORM).

## Status honestly, before going deeper: R-185 and R-187 read and scoped, not yet executed
Both documents read in full, §0 hard rules noted (never touch banking.bank_transactions; create
ONLY what's on the list; existing engines / InClientTx variants only; void-never-delete;
AUTH-then-dry-run-then-commit-then-CONSUMED for every write; gates after every commit).

R-185 is a real two-engine change (expense-posting payee_kind=driver payment-account resolution,
and settlement-posting.service.ts's reimbursement-line debit target), a new liability account
(2175 + per-driver children — found the correct, existing pattern to use:
`driver-subaccount-provision.service.ts`'s `provisionDriverEscrowSubAccount`/
`provisionDriverAdvanceSubAccount` precedent, ROUND-181 "no auto numbers" rule, ready to mirror for
a new `provisionDriverReimbursementSubAccount`), a 25-row + linked-settlement correction, and a new
guard (`verify-reimbursement-one-cost.mjs`). R-187 is 6 further sub-investigations (G1-G6), one of
which (G1) explicitly depends on R-185's account existing first.

Doing this properly — same rigor as every AUTH this session (measure live, dry run, gates,
CONSUMED with proof) — is genuinely more than fits safely into what's already been a very long,
dense round of work this session (ROUND 174 September reconciliation, the AUTH-033 false-alarm
catch, two real shared-code fixes, and the R-159 architecture finding below). Flagging that plainly
rather than rushing a posting-engine change to make it LOOK done.

## R-159 (G4) — still HELD pending a decision (AUTH-035, see its own note)
ROUND 187 G4 repeats "fix through the factoring engine's own reverse/re-post" — this session's own
live test (FAC-2026-00001) proved that path is architecturally blocked (permanent
`factoring_lifecycle_posting_keys` claim, survives reversal) regardless of credential. Not
re-litigating further here; full finding is in AUTH-035's BLOCKED note and the prior bus archive.
Needs an explicit call: the manual Dr 6300/Cr 6400 reclass-JE alternative, or something else Lead
has in mind that this session hasn't found yet.

## What actually landed and is verified this round (all merged to main, gates/tests green)
- AUTH-033 (load 13570 cash advance) correctly WITHDRAWN — the row already netted $0 on GL 1245;
  my own query used the wrong source_transaction_type filter. No double-book happened.
- ACCT-F2026092583: fixed a pre-existing typecheck-merge-result break blocking every PR (PR #22718
  put fields on the wrong type).
- ACCT-F2026092584: `resolveAccountForCategory` now accepts an optional client, closing a SET-ROLE
  gap for cash_advance/driver_advance in-client postings.
- ACCT-F2026092585: same fix for the factoring funding-poster and default-interest-accrual
  functions (new InClientTx variants, additive, 86/86 existing tests still pass) — this is what
  surfaced the R-159 architecture finding above.

## Next, in order, once a call lands on R-159
1. R-185 step 1 (2175 account) — ready to write now, low-risk, purely additive.
2. R-185 steps 2-4 (both engine fixes + the 25-row correction) — the larger lift.
3. R-187 G1 (needs #1), then G2/G3/G5/G6 (independent measurements/fixes), G4 once unblocked.
4. Re-run the full gate list, CONSUME every AUTH with proof.

CC-1 | 5:15 PM CT (22:15Z) | Real progress + one real architecture finding this round; R-185/R-187
scoped and ready, continuing now rather than pausing.
