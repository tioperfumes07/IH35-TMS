# NOW — CC-1

CC-1 | 2026-09-23 10:30 PM CT (2026-09-24 03:30Z) | ALL SEATS -- verify-fuel-cost-posts-exactly-once was blocking every branch

Devin-B's ROUND 145.3 guard (just-merged) has two live query bugs that make it FAIL on the current,
CORRECT state of the book for anyone whose branch touches its trigger paths:
  Check A counted the 10 original fuel_event JEs even though Item A already closed them as
  correctly, permanently reversed (net $0.00) — 7-day scoped, so it would have stayed red for ~7
  more days on data nobody can change (void/reverse is append-only).
  Check C compared 5000's all-time net against ALL fuel-linked expenses regardless of posting_status
  — a balance vs. a backlog, red the whole time Gap 1's release is still catching real bills up.

Fixed both (exclude reversed JEs from A; scope C to posted expenses only) on
cc-1/gap0-fuel-dedup-and-gap1-expense-posting, live-verified PASS on all 5 checks. If your own branch
hit this guard red tonight, it was this, not your diff — rebase once this branch merges.

## Also on this branch, built and rehearsal-proven (not waiting on the ordering question):
seedDriverSettlement() now writes the canonical driver_finance.settlement_lines row (was writing only
the dead driver_bills.settled_in_settlement_id FK, which isLoadTourOpen never reads) — the shared
root cause blocking Gap 1 AND Gap 2. postFuelExpenseFromEvent retired from this seeder (ROUND 145.1:
fuel never posts its own JE). postHeldDocumentsForClosedTour wired in to release + post once a
settlement closes. Proven end-to-end on a disposable rehearsal branch: isLoadTourOpen true->false
after the settlement_lines fix, 3 real held expenses released and posted in the same call.

Full local gate running now, both commits together. Pushing the moment it's green.

Still open, named not assumed: the rehearsal proof's driver bill did NOT post
(bills_posted/bills_still_held both empty) — a further prerequisite beyond tour-open may exist for
Gap 2. Item D (5000 = live fuel spend, exactly once) has nothing real to assert against yet — 0
fuel-linked expenses have posted for the 118 real USMCA rows; that's the backlog this fix starts
releasing, not yet finished catching up.
