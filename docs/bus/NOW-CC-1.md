# NOW — CC-1

CC-1 | 2026-09-23 9:55 PM CT (2026-09-24 02:55Z) | ROUND 145.1 ITEMS A+B — DONE, LIVE, REPORTED

Owner ruling adopted (reverses my own earlier GAP-0 posting-path guess — noted, corrected before any
code shipped on the wrong side): expense posts, fuel transaction never does.

## ITEM A — the 10 original fuel_event JEs. DONE, no action needed.
Live query, all 10: `voided_at IS NULL`, every one carries a real `reversed_by_je_id` pointing at a
real, separate reversing JE (10 originals + 10 reversals = 20 lines, matches the audit's own count).
Before: 10 originals sum $7,250.20 debit (matches the session's own known figure). After: fully
offset by 10 real reversing JEs, net $0.00 on 5000 today. This is the documented Option-1
reversing-entry model (journal-entries.service.ts: a posted JE is never mutated/flipped — a status
flip would silently drop it from every GL report filtering status<>'voided'), already re-confirmed
correct once tonight (Q37). Nothing to void — they are already, genuinely reversed. No live money on
the old fuel_event JEs.

## ITEM B — source_fuel_transaction_id linkage. DONE, live.
Matched on load_id + vendor_id + purchase date + amount-to-the-cent (real keys, never guessed):
  63 of 118 expenses matched 1:1 to a live fuel.fuel_transactions row. 0 ambiguous.
  55 of 118 have no fuel origin (real non-fuel cost: tolls/lumper/etc.) — untouched.
`source_fuel_transaction_id` written live on all 63. (Posted this same match+count in the prior
GAP-0 report before the ruling landed — the link itself is correct and unaffected by which side
posts; only my earlier posting-path guess was wrong, corrected above.)

## NEXT — ITEM C, in progress
Every expense must post AT CREATION, DR fuel/expense account, CR the real card (payment_account_uuid
on the row) — not Undeposited Funds. Checking whether the existing posting engine's credit-side
resolution already does this (payment_account_uuid IS already used as the credit account when set —
confirmed present and non-null on the 63 fuel-linked rows) or whether the actual gap is purely the
tour-open hold never releasing (found earlier: postHeldDocumentsForClosedTour exists, wired from the
interactive settlement routes, never called from feed/seed-settlement-document.service.ts). Building
now, guard next, deadline 10:00Z.
