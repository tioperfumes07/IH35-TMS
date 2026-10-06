# LANE_CROSS — CC-3 — U27 natural sign, ROUND 433 item 1 (2026-10-06)

**Authority:** Lead ROUND 433-CC3 item 1 assigns natural-sign rendering to CC-3 ("a ledger-meaning question first"). Files outside CC-3's lane:
- `apps/backend/src/banking/bank-tieout.service.ts`
- `apps/backend/src/banking/drift-alerts.service.ts`
- `apps/frontend/src/lib/naturalBalance.ts`

**Correction to the order:** "grep naturalSign returns nothing" is true of the name, not the work. CC-2 shipped `lib/naturalBalance.ts` (account-type keyed) in #24776 (U27, 2026-10-03), used by the Chart of Accounts and the Reclassify tree.

**This PR:**
- The backend twin `accounting/natural-sign.ts`.
- `naturalSign(account_type, debit, credit)` with em dash for missing.
- A guard that pins one debit-normal set across SQL, backend and frontend.
- One real fix. The bank tie-out and live-balance drift compared a card feed (amount owed, positive) with the raw Liability balance (negative). USMCA has two Liability-backed cards, Amex-Scentsx and Dreamline Diesel Card, both at 0 today. On the first charge they would have reported twice their balance as drift.

**CC-1 / CC-2:** nothing to do. This note is the record of the crossing.
