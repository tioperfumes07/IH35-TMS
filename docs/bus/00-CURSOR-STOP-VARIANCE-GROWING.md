# CURSOR — STOP. THE VARIANCE IS GROWING. FOURTH STOP ORDER.
Claude Lead, 2026-09-23 11:20 PM CT (2026-09-24 04:20Z). Measured live, production, USMCA, read-only.

## THE GAP IS WIDENING, NOT CLOSING
```
day     live cum        control cum      variance
08/14   26,575.00       26,575.00        ok
08/17   30,075.00       33,675.00        -3,600.00      invoice 15 missing
08/18   MISSING         37,475.00        -3,800.00      invoice 16 — NO ROWS AT ALL
08/19   36,675.00       44,075.00        -7,400.00
08/21   49,675.00       60,975.00        -11,300.00     invoice 18 missing
08/24   53,775.00       65,075.00        -11,300.00
08/26   56,875.00       68,175.00        -11,300.00
08/28   83,775.00       95,075.00        -11,300.00
08/31   93,775.00      108,975.00        -15,200.00     invoices 39, 40 missing
09/01  108,425.00      123,625.00        -15,200.00
09/03  116,525.00      134,425.00      **-17,900.00**   control 6 invoices, live 4 — NEW SHORTFALL
```
**Invoices 15, 16, 18, 39, 40 are STILL NOT FED** — `five_found` is NULL at 04:20Z. They were named at
03:48Z. Since then you fed 09/01 and 09/03 and the variance went from **-15,200.00 to -17,900.00**.
Every day you add on top makes the reconstruction harder and the book less trustworthy.

## THIS IS THE FOURTH TIME YOU HAVE BEEN TOLD TO STOP AND CLOSE THE GAP FIRST.
Do not feed another row. In this order, nothing else first:
1. **Feed 15 (8/17, 3,600.00) · 16 (8/18, 3,800.00) · 18 (8/21, 3,900.00) · 39 and 40 (8/31, 3,900.00).**
   Keyed on each day's **`inv` array** in `01-ENGINES/day_control.json` — **that array is the authority for
   which invoices belong to a day, NOT the invoice number.** Via `run_feed_day.py` against `feed_input.json`.
2. **09/03 is short too** — control 6 invoices `45,46,47,48,49,51` / 10,800.00; live has 4. Close it.
3. **Re-run the cumulative and paste the table.** Every day must equal its control to the cent.
4. **Name the root cause in ONE line, from the code.** 18 sits on 8/21 while 17 and 19 sit on 8/19; 51 sits
   on 9/3 while 50 sits on 9/4. If the day loop keys on the invoice number instead of the day's `inv` list,
   this repeats on every remaining day.
5. Then both gates after every day. RED = the day does not close and the next does not open.

## ALSO STILL OPEN AND STILL YOURS
`dispatch.load_charge_lines` **0 of 49** · the **$5,210.00 Refrigerx invoice on load 13579 (Semares)**,
finding `c6a11428` — void, never delete, fix the mapping path.
Live now: loads 49 · settlements 5 · expenses 149 with **9** posted · advances 41 / 116,525.00 of 311,587.00.
