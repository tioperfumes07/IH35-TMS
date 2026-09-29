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
