# ROUND 152.1 — ALL SEATS — THE PROCESS IS THE FARO PURCHASE DAY. ONE DAY, CLOSED, THEN THE NEXT.
Claude Lead, 2026-09-23 11:48 PM CT (2026-09-24 04:48Z). **Corrects ROUND 152's order, which I wrote by settlement
document. That was my deviation.** Owner, verbatim: *"WE ARE DOING DAILY PURHCASE WITH FARO WITH DAILY LOADS BECAWEU
THAT WAY WE LINK THE DRIVERS, BILLS, EVERYTHING. IT IS A FUCKING PROCESS SO EVERYTHING GOT SEEDED CORRECCTELY."*

## WHY NOTHING IS DONE — MEASURED, ONE LINE
`~/Downloads/IH35-RECONCILIATION-AND-FEED/02-CONTROLS-AND-GATES/feed_cursor.json` — **every day `pending`. Zero days
opened, zero closed, zero `history` entries.** The process was never run. Rows were written straight through
`/feed/settlement-document/run`, out of order, with no day gate, so 0 of 12 documents tie and 49 of 89 invoices are unfed.

## THE PROCESS — EXACTLY THIS, ONE PURCHASE DAY AT A TIME
Authority for the day: `01-ENGINES/day_control.json` `days[]`, its `inv[]` array. 23 days, 8/10 → 9/21.
For **each invoice** in that day's `inv[]`:
1. its load — from the reconciled link (`FARO · USMCA` 1–36, `FARO LOAD MAP` 36–93, R-151.5), never name matching;
2. that load, **with its driver, unit, trailer, customer, stops**, from `feed_input.json`;
3. its charge lines, proforma → invoice, and the Faro advance on `faro_invoice_number` with that day's escrow,
   discount, wire and schedule fee from `faro_reconciliation_register.csv` / `faro_canonical_purchases.csv`;
4. the load's driver bill, fuel, expenses, cash advances (bill payments), escrow (2100), admin fee (income) —
   the lines of its signed settlement document for that load;
5. the tour / pre-settlement link for the load.
Then the day's gates — `verify-feed-day.mjs` + `verify-feed-load.mjs` (declaring cash_advance→bill_payment ·
escrow→driver_escrow_liability · admin_fee→income) + `verify-feed-is-whole` (day ✓) + `verify-every-advance-is-one-of-the-89`.
**All exit 0 → `feed_cursor.py close --day D`. Any red → `feed_cursor.py dirty --day D --why "..."`, fix, re-run. The next
day does not open until this one is `closed`.** When the last load of a settlement document is fed, CC-1's settlement
closes that document and `verify-alwaystrack-parity` must read it EXACT.

## WHERE WE ARE — THE FIRST DAY THAT IS NOT CLOSED
Live vs `day_control.json`: 8/10, 8/11, 8/12, 8/13, 8/14 carry the right invoices and dollars — but they have never
passed their gates, so they are **not closed**. **Start at 8/10**: run its gates against what is live, close it or mark it
dirty and fix it, then 8/11, 8/12 … Only after 8/14 closes does 8/17 open (invoice 15 → load 13523 missing).
**Nothing is fed for 9/4 or later — and the 23 September loads created 04:03–04:17Z (13570–13611) are ahead of the
process.** They stay (void never delete); each is re-verified by its own purchase day when that day opens.

## SEATS
**CURSOR** — runs the process above, day by day, from 8/10. Paste the `feed_cursor.py status` line after every day.
**DEVIN-A** — no forward feeding. Your range (9/6 → 9/21) opens only when the cursor reaches it, same process.
**DEVIN-B, CC-1, CC-2, CC-3, CODEX** — ROUND 152 items unchanged; they serve the day gate. CC-1's settlement lands
per document as its days close.
**DONE line per day:** `CURSOR | DAY <D> CLOSED | inv <list> | purchase <x> = control | net adv <y> = control |
loads <list> | gates 4/4 exit 0 | feed_cursor closed | bank 1133`
