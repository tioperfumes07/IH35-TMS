# FIVE INVOICES ARE MISSING. NAMED, WITH AMOUNTS. THEY SUM TO THE VARIANCE EXACTLY.
Claude Lead, 2026-09-23 10:48 PM CT (2026-09-24 03:48Z). The owner is right — the map already says what to
feed and where. I read it instead of asking. `01-ENGINES/day_control.json` carries **every purchase day with
its invoice numbers**, built from `01-FARO/PURCHASE REPORT ALL.csv` + `funds due report 09-21-26.csv`.

## LIVE `faro_invoice_number` SET, production, USMCA, read-only
```
1,2,3,4,5,6,7,8,11,12,13,14,17,19,20,21,22,23,24,25,27,28,29,30,31,32,33,34,35,36,37,38,41,42,43,44
```
## CONTROL SET FOR THE SAME DAYS (8/10 -> 9/1), from day_control.json
```
8/10 2,3 · 8/11 1 · 8/12 4 · 8/13 5,6,7 · 8/14 8,11,12,13 · 8/17 14,15 · 8/18 16 · 8/19 17,19
8/21 18,20,22,23,24 · 8/24 21,25 · 8/26 27,28 · 8/28 29,30,31,32,33,34,35,36 · 8/31 38,39,40,41
9/1  37,42,43,44
```
*(9, 10 and 26 are absent from both and that is CORRECT — they are 3 of the 5 self-carried invoices Faro
never purchased: 9, 10, 26, 55, 74.)*

## THE FIVE MISSING — THIS IS THE WHOLE VARIANCE
| invoice | purchase day | amount | day control |
|---|---|---|---|
| **15** | 8/17/26 | **3,600.00** | day = 2 invoices (14, 15), purchase 7,100.00, net adv 6,877.00. Live has only 14 at 3,500.00 |
| **16** | 8/18/26 | **3,800.00** | day = 1 invoice (16), purchase 3,800.00, net adv 3,676.00. **Live has ZERO rows for 8/18** |
| **18** | 8/21/26 | **3,900.00** | day = 5 invoices (18,20,22,23,24), purchase 16,900.00. Live has 20,22,23,24 = 13,000.00 |
| **39 + 40** | 8/31/26 | **3,900.00** | day = 4 invoices (38,39,40,41), purchase 13,900.00. Live has 38,41 = 10,000.00 |
| | | **15,200.00** | **= the frozen cumulative variance, to the cent** |

## THE SIGNAL ON ROOT CAUSE — DO NOT GUESS, VERIFY IT
The invoice numbers are **not contiguous within a purchase day**: 18 sits on 8/21 while 17 and 19 sit on
8/19; 37 sits on 9/1 while 38-41 sit on 8/31. The feeder got 37 right and missed 18, 39 and 40. Establish
from the code whether the day loop is keyed on the invoice number rather than on the day's `inv` list in
`day_control.json`. **The `inv` array is the authority for which invoices belong to a day. Nothing else is.**

## CURSOR — DO THIS, NOTHING ELSE, BEFORE ANOTHER ROW IS WRITTEN
1. Feed **15, 16, 18, 39, 40** from `01-ENGINES/feed_input.json` via `run_feed_day.py`, keyed on each day's
   `inv` list. Read the signed PDF for any line whose description did not survive parsing —
   `~/Downloads/Company_Settlement_<n>.pdf` / `Driver_Settlement_<n>.pdf`. **Never guess an item.**
2. Re-run the cumulative check and paste it. Every day 8/10 -> your position must equal its control
   `purchase` **to the cent**: 5,500 · 9,100 · 10,800 · 16,450 · 26,575 · 33,675 · 37,475 · 44,075 ·
   60,975 · 65,075 · 68,175 · 95,075 · 108,975 · 123,625.
3. Name the root cause of the skip in one line, from the code, and fix it — or the same five become fifteen
   across the days still to come.
4. Then `verify-feed-day.mjs` + `verify-feed-load.mjs` after **every** day, declaring
   `cash_advance -> bill_payment` · `escrow -> driver_escrow_liability` · `admin_fee -> income`.
   RED = the day does not close and the next does not open.
5. Still yours: the **$5,210.00 Refrigerx invoice mapped to load 13579 (Semares)** — finding `c6a11428`.
   Void, never delete, and fix the mapping path, not just the row.

## THE REST OF THE CONTROL, SO NOBODY RE-DERIVES IT
`9/3 45,46,47,48,49,51 10,800 · 9/4 50,52,53,54 17,315 · 9/8 56,57,58,59,60,1013272-2 23,910 ·
9/10 61,62 3,100 · 9/11 63-69 33,400 · 9/14 70,71,72,73,75,76,77 30,770 · 9/17 78,79 7,600 ·
9/18 80-86 28,300 · 9/21 87-93 32,767` — cumulative ends **311,587.00**, 89 invoices.
Totals: escrow 4,530.19 · cash_rsv 135.41 · discount 4,673.82 · wire 220.00 · sch_fee 8.22 ·
receipts 12,825.00 · **net advance 302,019.36**.
