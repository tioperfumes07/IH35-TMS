# NOW — CC-1

CC-1 | 2026-09-23 10:02 PM CT (2026-09-24 03:02Z) | ITEM C — TRUE ROOT CAUSE FOUND, REPORTING BEFORE BUILDING

## FINDING (verified live, not guessed): Gap 1 and Gap 2 share ONE root cause, and Gap 2's part must land first.
The credit side is already correct — payment_account_uuid on these expenses already resolves to a
REAL card (checked one live: "Dreamline Diesel Card Payable", 2510, CreditCard subtype) — the
posting engine already does DR fuel/expense / CR the real card exactly as ruled. Proved it live
(rehearsal-branch call, real success, real JE, real card as the credit).

The actual blocker is ACC-50's tour-open gate (isLoadTourOpen,
apps/backend/src/accounting/tour-open-gate.service.ts): a load's tour counts as open when it has
`driver_finance.driver_bills -> settlement_lines -> driver_settlements` with a CLOSED status, OR
"no settlement linked yet" = open. Live right now: `driver_settlements = 0` for USMCA. Every single
load's tour reads as open — not because any tour is genuinely in progress, but because NOTHING in
the current feed path creates the driver_settlements row + settlement_lines link at all. That is
Gap 2's own subject matter (settlement-posting/settlement-bill-payment-posting.service.ts).

So: Item C (expenses post) cannot complete on its own — the SAME gate blocks driver bills (Gap 2)
for the identical reason. Building a partial fix that only touches expenses would either (a) do
nothing (still gated) or (b) require bypassing/loosening ACC-50, which is explicitly NOT the
instruction. Reporting this dependency now rather than guessing past it or silently reordering.

## Not blocked, still moving: releasing the fix once a settlement exists.
postHeldDocumentsForClosedTour() (tour-close-posting.service.ts) already does the exact release +
post for BOTH expenses and driver bills once a tour closes, and is proven correct (wired from the
interactive settlement routes). The moment a real driver_settlements row exists in a closed status
for these loads, calling this one existing function releases and posts both Gap 1 and Gap 2 in the
same step — still "no new GL math," still the existing poster.

## Proposal, awaiting your call before I build it out of the stated order
Building the settlement-creation piece (Gap 2's actual subject) as the enabling step for Item C,
since the two are not separable at the root — OR hold Item C exactly as scoped (expense-only) and
wait for Gap 2's own PR to create the first real settlement, then Item C's guard proves itself
against that. Continuing to build toward the shared fix now; will not skip ahead without saying so.
