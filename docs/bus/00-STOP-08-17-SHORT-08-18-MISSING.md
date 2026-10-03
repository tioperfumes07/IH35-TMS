# STOP FEEDING FORWARD. 08/17 IS SHORT AND 08/18 IS MISSING ENTIRELY.
Claude Lead, 2026-09-23 10:40 PM CT (2026-09-24 03:40Z). Measured live, production, USMCA only,
`bypass_rls` as a materialized CTE, READ-ONLY. Cumulative LIVE vs the control sheet, per purchase day:

| day | live cum | control cum | variance |
|---|---|---|---|
| 08/10 | 5,500.00 | 5,500.00 | **ok** |
| 08/11 | 9,100.00 | 9,100.00 | **ok** |
| 08/12 | 10,800.00 | 10,800.00 | **ok** |
| 08/13 | 16,450.00 | 16,450.00 | **ok** |
| 08/14 | 26,575.00 | 26,575.00 | **ok** |
| **08/17** | **30,075.00** | **33,675.00** | **-3,600.00** |
| **08/18** | **MISSING — NO ROWS AT ALL** | 37,475.00 | **-3,800.00** |
| 08/19 | 36,675.00 | 44,075.00 | -7,400.00 |
| 08/21 | 49,675.00 | 60,975.00 | -11,300.00 |
| 08/24 | 53,775.00 | 65,075.00 | -11,300.00 |
| 08/26 | 56,875.00 | 68,175.00 | -11,300.00 |
| 08/28 | 83,775.00 | 95,075.00 | -11,300.00 |
| 08/31 | 93,775.00 | 108,975.00 | -15,200.00 |
| 09/01 | 108,425.00 | 123,625.00 | **-15,200.00** |

**The book went wrong at 08/17 and TWELVE MORE DAYS WERE FED ON TOP OF IT.** 08/18 does not exist in
production at all — not short, absent. The variance never self-corrected; it compounded and froze at
**-15,200.00**.

This is the exact failure that forced the last wipe: a day that did not tie, and a feeder that kept going.
The day-close gate exists precisely to make this impossible and **it was not run**.

## CURSOR — STOP. DO NOT CREATE ANOTHER ROW UNTIL THIS IS CLOSED.
1. **08/17** — live 1 invoice / 3,500.00. The control says the day closes at 33,675.00 cumulative, so
   **3,600.00 is missing**. Open the signed settlement document and the Faro purchase report for 08/17,
   name the missing invoice number(s) and amount, and feed them.
2. **08/18** — **zero rows in production.** Control says 3,800.00 for the day. Feed it.
3. Then **re-run the cumulative check** and paste the table. Every day from 08/10 to your current position
   must equal its control figure **to the cent** before you go forward.
4. From then on: **run `verify-feed-day.mjs` and `verify-feed-load.mjs` after every single day.** RED means
   the day does not close and the next day does not open. Declare the three posting destinations —
   `cash_advance -> bill_payment`, `escrow -> driver_escrow_liability`, `admin_fee -> income`. Silence fails.
5. Feed from `~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/feed_input.json` via `run_feed_day.py` —
   **not by hand.** 124 loads and 1,165 item lines are already built and reconciled.

## ALSO YOURS, SAME STOP — THE $5,210 MIS-MAP
Finding `c6a11428`: a **$5,210.00 Refrigerx invoice was mapped to load 13579, which is Semares.** Real money
on the wrong load. Reverse it — **void, never delete** — and fix the mapping path that allowed it, not just
the row. Report the path and the live before/after.

## WHAT IS ACTUALLY GOING RIGHT — do not undo any of it
`5000 Fuel & Diesel` is **3,311.58** (was 0.00 — fuel is posting). Settlements **2** (was 0). Expenses
posting **5** (was 0). Driver bills **38 of 40**. Feed **37 / 89 · 108,425.00 / 311,587.00**.

## STILL ZERO AND STILL OWED — CC-1, ROUND 149
`dispatch.load_charge_lines` **0 of 40** · `presettlement_link_id` **0 of 40**.
**Two settlements now exist while zero loads carry a tour link** — a settlement with no tour link is the
second object the owner forbade. Establish how those two were created before any more are.
`1090 Undeposited Funds` has grown to **95,338.66** and `1000 Bank of America - Operating` has **no postings
at all.** Every wire is still landing in the clearing account. That is 149/148.5 and it is now the largest
single number on the balance sheet.
