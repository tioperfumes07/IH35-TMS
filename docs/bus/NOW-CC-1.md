# NOW — CC-1

CC-1 | 2026-09-23 9:48 PM CT (2026-09-24 02:48Z) | NOT SILENT — inside GAP 0, ruled and half-landed

Not idle: last ~3h was WO/PO two-pass normalize + fuel-hash root-cause fix (blocked all night on
live feed motion, documents 5777/5783, ~16 gate retries, still red — external, confirmed via direct
DB query, not my diff), plus 141.1 Item 1 (bill-match posts a real payment) built/tested/guarded and
held for that PR to land. Should have posted here sooner instead of only chasing the gate — noted.

## GAP 0 — RULED, LINK WRITTEN, LIVE
Matched on real keys (load_id + vendor_id + purchase date + amount to the cent, NOT guessed):
  63 of 118 USMCA expenses are exact duplicates of a fuel.fuel_transactions row (memo prefix "Fuel ").
  All 63 matched 1:1, zero ambiguous. `source_fuel_transaction_id` written on all 63, live, just now.
  Remaining 55 expenses are genuinely non-fuel (tolls/lumper/etc.) — real cost, no fuel counterpart.

RULING: the fuel transaction is the canonical, sole posting path for fuel cost (matches Gap 3's own
named accounts 5000/1295/2510/2500 and the canonical natural-key hash writer). Its duplicate
accounting.expenses row NEVER posts — Gap 1's fix scopes to
`source_fuel_transaction_id IS NULL` only (the 55 real non-fuel expenses), never the 63 linked ones.
Guard for Gap 0 (in progress, landing with this PR): self-arming population check — 0 postings on
BOTH a fuel_transaction's source and its linked expense's source for the same real cost.

## GAP 1 — ROOT CAUSE FOUND, NOT YET SHIPPED
All 118 expenses carry `posting_hold_reason='tour_open'` (ACC-50, correct-by-design: an expense on
an open tour must not post). The release mechanism EXISTS —
`postHeldDocumentsForClosedTour()` (apps/backend/src/accounting/tour-close-posting.service.ts) — and
is wired from the interactive settlement-close routes, but NEVER called from
apps/backend/src/feed/seed-settlement-document.service.ts's seed path (my own file, earlier
session). That is the actual defect: the seed closes a settlement without ever releasing the hold it
itself created. Verified the poster works correctly (rehearsal-branch call, real success, real JE)
before touching anything live. Fix: call postHeldDocumentsForClosedTour after seedDriverSettlement.
This same call also posts held driver bills — likely also closes Gap 2's root cause, not just Gap 1's.

## NEXT (no pause)
Wiring the postHeldDocumentsForClosedTour call now, scoped to the 55 non-fuel expenses per the Gap 0
ruling, then Gap 0 + Gap 1 guards, fast-merge. Gap 3/4/5 not yet started.
