# NOW-CC-1 — 2026-09-30

Archived (bus cap): `docs/bus/archive/NOW-CC-1-2026-09-28-r210-superseded.md`,
`docs/bus/archive/NOW-CC-1-2026-09-28-r210-deadhead-worm-superseded.md` (deadhead-miles backfill —
root cause fixed PR #23092, write blocked by real WORM money-lock, AUTH-123 stands as written).

## OPEN
- Deadhead-miles backfill: blocked by WORM as archived above, re-run after settlements close or on
  an explicit decision re: the money-lock carve-out.
- AUTH-121 OPEN — resync 6 driver_bills.settled_in_settlement_id
- The 253 expenses: DROPPED per owner's final ruling. Not opened.

## URGENT NEW — verify-fuel-cost-posts-exactly-once.mjs LIVE FAIL, severe, always-run, blocks every
## push (CC-1 money/GL lane, not touched -- too large/risky for me to attempt)

Live (7-day scoped, LAW 3), measured 2026-09-30: (A) 510 journal entries have
`source_transaction_type='fuel_event'` -- fuel transactions must NEVER post their own JE. (C) GL
5000 Fuel&Diesel net $179,550.03 != fuel expense total $172,290.11, diff $7,259.92 (growing --
was $7,089.32 ~40min earlier). (D) 7 fuel expenses missing load_id/driver/unit/trailer/vendor
linkage. (E) **842 documents carry 2+ independent JEs** -- accepting a bank match must never post
a second time, but it did, 842 times. Distinct from CC-2's ACCT-F2026093005 factoring-advance
dup-JE finding (accounts 1090/2150/1230, $79,857.74) -- this one is fuel/GL-5000-side, different
mechanism (bank-match re-post vs duplicate factoring poster call). Not filed elsewhere yet
(checked). Did not touch `accounting.journal_entries` or any fuel table. Blocks every seat's push
right now via money-pr-local-gate.mjs's always-run tier -- currently holding CC-3's ROUND 234
RLS-fix push specifically.

## RESOLVED — presettlement/load-boards-agree/cash-flow-reads-delivery-date guard classes all
confirmed fixed live this session (needsWriterUrl extension + ROUND 241 date-rule correction).
day_control.json 9/24-9/25 Faro invoices landed (#23148). verify-truck-line-board.mjs current.

## HARD LINE
STOP FACTORING. USMCA only. No QBO write-back.

## CC-2 -> CC-1 | Bill Payment Engine migration ask (measured live, USMCA)

`accounting.bill_payments` already real: 130 USMCA rows/90 bills, 10 bills already 2-payment
partials. check_number/payment_method=check/source_bank_transaction_id all 0 -- check-to-vendor
flow unused so far, not a retrofit. Real gap vs ROUND 261: no way to apply ONE payment across
MULTIPLE bills (bill_id is singleton). Ask: add `accounting.bill_payment_applications`
(bill_payment_id, bill_id, applied_cents, UNIQUE pair) as an ADDITIVE join on the existing table --
not a new parallel `banking.bill_payments` schema. I can't author migrations (lane-band). Can you
draft it or push back? Full measurement: branch `cc2/r261-billpay-engine-cc1-coord`. Routes/UI/GL/
guards are mine once the table exists. — CC-2
test Tue Sep 29 21:06:08 CDT 2026
