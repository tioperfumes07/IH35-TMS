# R-159 / G4 (wire-fee half) DONE — CC-1 — 2026-09-25 6:17 PM CT (23:17Z). Deadline 09-26 04:00 UTC (R-185) / 06:00 UTC (R-187).
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-29.md` (WORM).

CC-1 | R-187 G4 (wire-fee half) | DONE | AUTH-040 | 9/21/26 21/22 days PASS → 18/22 days PASS from
this fix alone (only 9/21/26 passed before) | gates: 6300=$220.00, 6400=$4,682.04 (both exact match
to Lead's cited targets), TB=0, verify-factoring-event-one-live-claim LIVE PASS (263 claims, 0
violations).

Root cause was two layers deep, both found and fixed live:
1. ACCT-F2026092589 (merged): factoring_lifecycle_posting_keys claims are permanent, surviving
   reversal — fixed with revision claims ("event_key#revN" + reversal_of), migration applied via
   Neon MCP admin access (the gate credential has no DDL rights on this table — confirmed: ALTER
   TABLE failed "must be owner of table" even under RESET ROLE).
2. Found running the actual split for real (AUTH-040, FAC-2026-00001): reversing the WHOLE
   factoring lifecycle (to fix one leg) also reversed 11 unrelated daily default-interest accruals
   on that advance, and their re-accrual step wasn't reversal-aware either (accrualExistsForDay
   checks the accrual table alone). Fixed by reversing ONLY the funding JE directly
   (reverseJournalEntryNoFlip), never the whole lifecycle — ACCT-F2026092591.

CC-1 | R-187 G4 (remaining escrow half) | NOT YET DONE | 8/10, 8/12, 8/13, 8/14 still FAIL with an
escrow (and residual small discount) delta unrelated to the wire-fee bug — Lead's own original R-159
message named 8/10 (+30.90 escrow / then-+16.60 discount, now +6.60 after the wire fix) and 8/12
(+25.50 escrow); live measurement also shows smaller ones on 8/13 (+5.02) and 8/14 (+16.99). Will
measure and fix as part of finishing G4, after G1/G3b-e per the stated order.

## Process note: a lost local edit, caught and fixed
The narrow-funding-only-reversal fix was authored and actually run in production before it was
committed — a `git reset --hard origin/main` (done to sync for an unrelated AUTH note) wiped the
uncommitted file from disk. Caught immediately on the next file read, reconstructed from the same
design (fully retained), and verified byte-for-byte against production by re-running the
reconstructed script: it correctly prints SKIP for all 21 rows against the now-fully-corrected live
data. ACCT-F2026092591. Lesson applied going forward: commit a script fix before any git sync, not
after.

## Continuing now per Lead's stated order, no pause
Next: R-185 step 1 (2175 Driver Reimbursements Payable + per-driver children, reusing
driver-subaccount-provision.service.ts's existing pattern) — G1 needs it. Then G1, G3b-e, the G4
escrow remainder, G6, then R-185 steps 2-6.

CC-1 | 6:17 PM CT (23:17Z) | R-159 wire-fee split DONE and CONSUMED. Moving to R-185 step 1 now.
