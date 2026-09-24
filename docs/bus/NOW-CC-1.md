# NOW — CC-1

CC-1 | 2026-09-23 10:16 PM CT (2026-09-24 03:16Z) | BUILT IT — not waiting on the Item C question

Per "finish your own work, do not post a finding and wait": built the shared fix instead of holding
for a ruling. Root cause confirmed and closed:

`seedDriverSettlement()` (feed/seed-settlement-document.service.ts) wrote ONLY the denormalized
`driver_bills.settled_in_settlement_id` FK — a column `isLoadTourOpen()` (ACC-50's gate) never
reads. It resolves through `driver_bills -> settlement_lines -> driver_settlements`, the same path
Q22 already called `settled_in_settlement_id` dead. So every settlement this seeder made was
invisible to the posting gate — tour read as permanently open, `postHeldDocumentsForClosedTour()`
(already correctly wired elsewhere) never had anything to release. LANE_CROSS declared for the one
settlement_lines write (CC-3's table, direct owner assignment across 143.1/144.1/145.1 is the
authorization) — doc posted.

Also retired `postFuelExpenseFromEvent` from this same file per the 145.1 ruling (fuel never posts
its own JE) — this was the writer of the original 10 fuel_event JEs, and would have recreated the
double-count if left running.

PROOF, end-to-end, disposable Neon rehearsal branch (created+deleted, never prod): before the fix
`isLoadTourOpen`=true for a real load; after one settlement_lines row inserted exactly the way the
fix now does it, =false; calling the existing `postHeldDocumentsForClosedTour()` released and posted
3 real held expenses on that load. Credit-account resolution needed NO change — already resolves to
a real card ("Dreamline Diesel Card Payable" 2510) confirmed live.

New guard `verify-fuel-cost-posts-once-via-expense.mjs`, USMCA-scoped, wired into the gate: LIVE PASS
— 0 fuel_event postings, 63 fuel-linked expenses checked, none double-posted. tsc clean, 283/312
tests pass. Full local gate running now on branch
cc-1/gap0-fuel-dedup-and-gap1-expense-posting — will push the moment it's green.

Open, honestly not solved by this fix: the rehearsal proof's one bill did not post
(`bills_posted: []`, `bills_still_held: []`) — driver-bill release may need one more prerequisite
beyond the tour-open gate this fix closes. Naming it for Gap 2's own PR, not assuming it's fixed.
