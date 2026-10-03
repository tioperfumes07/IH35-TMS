# THE FEED PACKAGE ALREADY EXISTS AND IT IS NOT BEING USED. THAT IS THE DEVIATION.
Claude Lead, 2026-09-24 12:16 AM CT (2026-09-24 05:16Z). Owner: *"what is the point of the reconciliation
you have? it was so this was created seamlessly."* He is right. Everything below was measured on his machine
just now, not recalled.

## IT IS ALL SITTING IN `~/Downloads/IH35-RECONCILIATION-AND-FEED/`
```
00-READ-FIRST/00-READ-THIS-FIRST-EVERYTHING-IS-HERE.md
01-ENGINES/    parse_settlements.py · build_feed_input.py · run_feed_day.py ·
               build_day_control.py · build_settlement_control.py · parse_rate_confirmations.py
               parsed.json · feed_input.json · day_control.json · settlement_control.json
02-CONTROLS-AND-GATES/  verify-feed-day.mjs · verify-feed-load.mjs · verify-feed-readiness.mjs ·
               feed_cursor.py · verify-purge.mjs · verify-zero-state.mjs
03-SOURCE-DOCUMENTS/    146 files — 116 settlement-text, 19 rate-confirmations
06-OUTPUT/     feed_input.json · parsed.json · rate_confirmations.json · gaps · suppressed
```
And the signed PDFs are in `~/Downloads`: **89 `Company_Settlement_*.pdf` + 73 `Driver_Settlement_*.pdf`.**

## WHAT THE PACKAGE ALREADY PROVED — DO NOT RE-DERIVE ANY OF IT
117 AlwaysTrack documents (59 company + 58 driver) · **124 loads on BOTH sides · zero orphans** ·
355 stops, 353 with a facility name, 227 with leg miles · 124 of 124 with a delivery departure and a named
consignee · `feed_input.json` carries **124 loads and 1,165 ITEM lines**, and the build **refuses to write
unless qty x rate reconstructs the amount**.
Faro side, tying to the cent: purchases 311,587.00 · receipts 12,825.00 · A/R 298,762.00 · escrow 4,530.19 ·
discount 4,673.82 · wire 220.00 · schedule 8.22 · **89 invoices** · advance rate 0.9700 exact ·
funding identity holds on **82 of 82 funded invoices** · 7 purchased-not-funded (88, 87, 93, 92, 89, 90, 91) ·
**zero confirmed short-pays, zero chargebacks** · one partial: invoice 14 / load 13521, open 250.00.

## THE MEASUREMENT THAT NAMES THE DEVIATION
```
feed_input.json expects   124 loads
live USMCA today           32 loads · 0 tour links · 0 settlements · 30 driver bills ·
                          118 expenses with 0 ledger · 63 fuel with 10 ledger
```
**The feeders are not running the package.** If `verify-feed-load.mjs` had been run on a single day it would
have failed on the spot — it enforces **three posting destinations the dollars alone cannot catch**, and
**the feeder must DECLARE where it posted each one. Silence fails.**
```
cash_advance -> bill_payment
escrow       -> driver_escrow_liability
admin_fee    -> income
```
Zero settlements and zero posted expenses could not have survived that gate. It was never run.

## THE ORDER — BOTH FEEDERS, STARTING NOW
1. **Read `00-READ-FIRST/00-READ-THIS-FIRST-EVERYTHING-IS-HERE.md` end to end.** Every ruling below is in it.
2. **Feed from `01-ENGINES/feed_input.json`, document by document** — `run_feed_day.py`, `feed_cursor.py`.
   The settlement document **IS** the tour **IS** the settlement: one document -> the tour header -> its loads
   -> driver bill, expenses, fuel, cash advances, customer charges -> closed -> posted. Never loose loads.
3. **Where a line lost its description, READ THE SIGNED PDF.** `~/Downloads/Company_Settlement_<n>.pdf` and
   `Driver_Settlement_<n>.pdf`. 19 money lines / **$1,571.91** have no item and were deliberately NOT guessed
   (`06-OUTPUT/feed_input_gaps.json`) — 15 need the source PDF re-read, 4 are the Honda fee. **Read the PDF.
   Never guess an item. Never invent a line.**
4. **Run BOTH gates on every single day. `verify-feed-day.mjs` (revenue) and `verify-feed-load.mjs` (cost).**
   DECLARE the posting destination for cash advance, escrow and admin fee. RED = the day does not close and
   the next day does not open.
5. **NO DIRECT INSERT INTO AN ACCOUNTING TABLE, EVER.** Origin creates the document; the document is matched
   in the bank register; the register creates nothing. **MATCH IS NOT ADD.**

## THE LAWS FROM THE PACKAGE THAT ARE ALREADY COSTING US
- **Cash advances are BILL PAYMENTS**, dated when the money left. Not deductions, not expenses.
- **Escrow for claims is a driver escrow LIABILITY.** Not an expense.
- **Admin fee is INCOME.** Not a negative expense. So is the company vehicle use fee.
- **Line haul is NOT qty x rate** — the customer is billed a CONTRACTED TOTAL; the printed per-mile figure is
  derived and will never reconstruct. Driver CPM and fuel cost-per-gallon ARE real rates and do.
- **Not everything we are paid is line haul** — tracking/MacroPoint, on-time pickup, on-time delivery, tarp
  are accessorials and bill separately.
- **DEF, reefer fuel and washout are ITEMS, not accounts.** 5010/5160/5170 are retired.
- **A gap is not a reason.** No remittance document means fault = unknown, account 4960.
- **Six reversal engines exist. A seventh must never be written.**

## STILL OPEN, NAMED IN THE PACKAGE — NOT HIDDEN, NOT INVENTED
- 19 lines / $1,571.91 with no item — re-read the PDFs.
- 4 rate confirmations with no charge block: loads_5601763, 5606017, 5606138, 5647973.
- The Honda fee's SIGN is unconfirmed — confirm against one source PDF **before** the feed runs.
- Invoice 14 / load 13521 open 250.00 — partial or short-pay unknown until Core Logistics remits. PO 31496-65096.
- Line-haul variance is **CLOSED** — it was a duplicated export, deduped corpus ties 429,695.00 = 429,695.00.
  Do not reopen it.
