# ROUND 151.5 — CURSOR — THE ROOT CAUSE IS ALREADY WRITTEN. READ THE REGISTER. DERIVE NOTHING.
Claude Lead, 2026-09-23 11:24 PM CT (2026-09-24 04:24Z). **Corrects ROUND 151 §2 and §4. Everything else in R-151 stands.**

## MY TWO ERRORS IN R-151 — SAME TRAP AS THE LEAD BEFORE ME
1. **§4 told you to "find the root cause in the code."** It is already named, per invoice, in
   `~/Downloads/IH35-RECONCILIATION-AND-FEED/06-OUTPUT/faro_reconciliation_register.csv` (89 rows), column `class`:
   ```
   AUTO name+amount 42 · AUTO name+amount+date 12 · UNMATCHED name 19 · AMBIGUOUS 10 · UNMATCHED amount 6
   ```
   The feeder resolves a Faro invoice to a load by **debtor NAME**. Faro's debtor ("DARDINI LLC", "MPH CARRIER
   SERVICES INC", "BIG G LOGISTICS LLC", "DGL EXPORT INC") does not equal the TMS customer ("DLS Dardini Logistics
   Services", "Big G Logistics, LLC", "DGL Freight Broker") → `UNMATCHED name` → no load → **skipped**. 35 of 89
   invoices are not `AUTO`. **That is the root cause. It is not a filter, not invoice-number order, not day order.**
   Even the AUTO rows are not safe: the register sends 37, 45 AND 51 all to 13569, and 68 AND 92 both to 13588.
2. **§2 matched loads to invoices by debtor + amount + date — I derived it.** Do not use my table. Use the
   reconciled links the owner already made:

## THE AUTHORITY FOR "WHICH LOAD IS THIS FARO INVOICE" — READ, NEVER RE-MATCH
| invoices | file | sheet / column |
|---|---|---|
| 1–36 | `~/Desktop/IH35-AUGUST-RECONCILIATION-BOTH-ENTITIES.xlsx` | `FARO · USMCA` → `Load #`, `Settl #` |
| 36–93 + PO 1013272-2 | `~/Downloads/IH35-MASTER-RECONCILIATION-2026-09-21.xlsx` | `FARO LOAD MAP` → `Load`, `Settlement`, `Faro invoice #` |
| exceptions | same master workbook | `EXCEPTIONS` (e.g. #1: 13554 = inv 39, owner ruled) |
| amounts, PO, fees | `06-OUTPUT/faro_reconciliation_register.csv` + `~/Desktop/IH35-FARO-RECONCILE/faro_canonical_purchases.csv` | per invoice — **never from a day total** |
| day membership | `01-ENGINES/day_control.json` | `inv[]` |

Read from those, the five:
```
15  8/17  DARDINI       3,600.00  PO 154100     -> load 13523, doc 5781   (FARO · USMCA)
16  8/18  MPH           3,800.00  PO MPHC261334 -> load 13524             (ROUND 52: INV-2026-00007 / load 13524)
18  8/21  DARDINI       3,900.00  PO 154067     -> load 13529, doc 5782   (FARO · USMCA)
39  8/31  BIG G         3,500.00  PO 3965       -> load 13554, doc 5790   (FARO LOAD MAP + EXCEPTIONS #1)
40  8/31  DGL           3,900.00  PO L-43416    -> load 13557, doc 5789   (FARO LOAD MAP)
                       18,700.00   <- the real shortfall. 15,200 was the phantom a76ed504 ($3,500) hiding 3,500 of it.
```
Plus 9/3: **46** Hawkeye 600.00 → load 13563 · **49** AB Global 2,100.00 → load 13567 (FARO LOAD MAP).

## THE FIX, IN THE WRITER — ONE PR
The feed resolves invoice → load from the **reconciled link** (the sheets above, carried as data in the feed
input — PO / W.O. / load number), **never by debtor-name similarity.** An invoice with no reconciled link
**stops the day and prints the invoice number** — it is never silently skipped.
**Guard, named:** `scripts/verify-every-advance-is-one-of-the-89.mjs` — every live USMCA advance maps to exactly one
invoice in `day_control.json` `inv[]` (89, incl. PO 1013272-2), each exactly once; **a NULL invoice number is a hard
fail** (catches `a76ed504`); every one of the 89 whose purchase day is fed must be present. Planted-RED: delete one
link → exit 1; add a NULL-invoice row → exit 1. Wired in `money-pr-local-gate.mjs` in the same PR, scoped to fed days
(same scoping rule as R-151.2 — out-of-scope is not a variance).
DONE line: `CURSOR | R-151.5 DONE | <sha> | <live sha> | advances live = N, all N in inv[] once, NULL 0 |
cumulative 8/10..<day> = control to the cent | 18,700.00 fed on 15,16,18,39,40 | 46,49 fed`
**Deadline unchanged: 05:30Z (12:30 AM CT).** Missed → DEVIN-A.

---

# ROUND 151 (Updated 11:10 PM CT, 04:10Z) — CURSOR — THE FEED SKIPS LOADS INSIDE THE DOCUMENTS. 17 USMCA LOADS + 4 TO RESOLVE, NOT 5 INVOICES.
Claude Lead, 2026-09-23 11:06 PM CT (2026-09-24 04:06Z). Owner order: Cursor finishes the feed, every table,
balanced, confirmed, zero errors. Measured live (Neon br-fancy-credit-akjnd07a, bypass_rls in-tx, USMCA only)
and off `~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/feed_input.json`. Supersedes every earlier
"five missing invoices" box — that framing was too small, and one line of it was wrong (see §3).

## 1. THE MEASUREMENT
Settlement documents 5769 → 5800 carry **72 loads**. Production has **40** of them. **32 are not fed.**
Documents you have run come out PARTIAL — the document is fed, some of its loads are not:
```
5769 PART 13498,13508      5779 PART 13526,13527      5786 PART 13533,13548      5794 PART 13558,13568
5771 PART 13504,13510      5780 PART 13530,13532      5787 PART 13549,13555      5795 PART 13561,13567
5772 PART 13502,13507,13512,13513   5781 PART 13523,13534   5788 PART 13539,13546,13552   5800 PART 13551,13573,13584
5773 PART 13497,13511      5784 PART 13522,13528,13536      5789 PART 13550,13557
5774 PART 13517,13518      5785 PART 13531,13538,13543      5790 PART 13542,13554
5775 PART 13506,13514,13516   5776 PART 13505,13515,13520
NOT RUN AT ALL: 5770 · 5778 · 5782 · 5796 · 5798 (5798 is in flight right now, PID on the Mac)
```
### OWNER RULING, 2026-09-23 11:08 PM CT (04:08Z) — VERBATIM
> "READ THE DESKTOP RECONCILIATION, SOME LOADS ARE FROM TRANSPROATTION, SOME FROM SUMCA, WE USED THE SAME ACCOUNT.
> ALL THAT HAS ALREADY BEEN RECONCILED. DO NOT DO DOUBLE WORK. ALL EXPENSES AND BILLS STAY WITH USMCA.
> TRANSPORTATION LOADS WITH TRANSPROTATION."

**The entity of every load is already decided** in `~/Desktop/IH35-AUGUST-RECONCILIATION-BOTH-ENTITIES.xlsx`
(sheets `LOADS · USMCA`, `LOADS · TRANSPORTATION`, `LOADS · UNFACTORED`, `FARO · TRANSPORTATION`) and, for
September, `~/Downloads/IH35-MASTER-RECONCILIATION-2026-09-21.xlsx` sheet `FARO LOAD MAP`. Read the entity from
there. **Do not re-derive it.** A Transportation load is **never** written into USMCA. Every expense and every bill
on a USMCA settlement document stays in USMCA — including the costs of a leg whose load is Transportation's.

**The 32 missing loads, classified by those sheets:**
```
TRANSPORTATION — do NOT feed the load into USMCA (costs on the document still post to USMCA):
  13502 13503 13504 13505 13506 13517 13522 13530 13531 13533 13539
USMCA — FEED (sheet LOADS · USMCA):            13513 13523 13529
USMCA — FEED (unfactored, delivered after the 8/7 cutover; 13554/13557 purchased on USMCA Faro inv 39/40):
  13524 13525 13527 13540 13541 13554 13555 13557
USMCA — FEED (September, FARO LOAD MAP):       13567 13568 13572 13573 13575 13584
RESOLVE FROM THE TWO SHEETS, NEVER GUESS, REPORT BY NUMBER:
  13497 (FARO · TRANSPORTATION carries inv 13497 $7,200) · 13509 (UNFACTORED sheet, but FARO · TRANSPORTATION
  carries inv 13509 ES Logistics $4,400 8/10) · 13498, 13507 (UNFACTORED, delivered 8/5 and 8/7)
```
**Costs on a Transportation leg:** the expense / driver bill posts to USMCA and references the settlement document
and the Transportation load number as text — it never creates or links a USMCA `mdata.loads` row for that load.
If `enforce_load_fk_invariant` refuses that write, STOP and report the exact row. Do not disable the trigger.

## 2. WHY THE FARO NUMBER IS SHORT — IT IS THESE LOADS
The Faro invoices that are not fed are exactly loads in that list:
```
inv 15  8/17  DARDINI      3,600.00  -> load 13523 (doc 5781)
inv 16  8/18  MPH          3,800.00  -> load 13524 (doc 5778)
inv 18  8/21  DARDINI      3,900.00  -> load 13529 (doc 5782)
inv 39  8/31  BIG G        3,500.00  -> load 13554 (doc 5790) per FARO LOAD MAP; owner ruled AlwaysTrack line haul 0 was an AT mistake (EXCEPTIONS #1)
inv 40  8/31  DGL          3,900.00  -> load 13557 (doc 5789)
inv 46  9/03  HAWKEYE        600.00  -> load 13563 per FARO LOAD MAP. The $600 invoice now sits on live load 13544 — wrong load
inv 49  9/03  AB GLOBAL    2,100.00  -> load 13567 (doc 5795)
```
Load↔invoice pairs are matched on debtor + amount + date. **Confirm each against the signed
`Company_Settlement_<doc>.pdf` before writing.** Never guess.

## 3. CORRECTION OF THE PRIOR LEAD BOX — `39 + 40 = 3,900` WAS WRONG
PURCHASE REPORT ALL.csv: **inv 39 = 3,500.00 (Big G) · inv 40 = 3,900.00 (DGL) → 7,400.00.**
The "15,200.00" still matched only because of a broken row:
`accounting.factoring_advances a76ed504-82b6-45de-b75c-a842ed81c221` · 8/31 · 3,500.00 ·
**status='voided' but voided_at NULL, void_reason NULL, faro_invoice_number NULL.** It counts as live in
every `voided_at IS NULL` query. Real live advances: **40, $113,025.00** — not 41 / $116,525.00.
Stamp it properly (voided_at + void_reason + actor, same statement) through the existing void writer. Never delete.

## 4. ROOT CAUSE — NAME IT FROM THE CODE, ONE LINE, AND FIX IT FIRST
Every PART document drops loads. The feed is not keyed wrong on invoice number — it is **dropping loads inside a
document**. Read `apps/backend/src/feed/seed-settlement-document.service.ts` (the `/feed/settlement-document/run`
path) and find the filter that excludes a load in the document's `loads[]`. Fix it in the writer, so re-running
a document creates its missing loads and nothing else (idempotent on load_number). **Do not feed another document
until this is fixed.** The document IS the tour: every load in it is fed, with its money, or the document is red.

## 5. ORDER — EXACTLY THIS, NOTHING ELSE
1. **STOP** the forward run (5798 and after).
2. Fix the root cause (§4). One PR + guard `verify-feed-document-has-every-load.mjs`: for every settlement document
   the feed has touched, `count(loads in feed_input for that doc, load_number ≥ 13508) = count(live loads)`.
   (USMCA-classified loads only, per the reconciliation sheets). Planted-RED: drop one load → exit 1. Wired in `scripts/money-pr-local-gate.mjs` in the same PR.
3. Stamp the ghost advance `a76ed504` (§3).
4. Re-run documents **in order 5769 → 5800**, each one to completion: loads, stops, `dispatch.load_charge_lines`
   (from `feed_input.json` lines — line haul is a contracted total, not qty × rate), proforma → invoice, driver
   bill, expenses via the canonical expense writer (payment account = the card; never 1090), cash advances as
   bill payments, the Faro advance keyed on `faro_invoice_number`, tour link, settlement.
5. **After EVERY document**: `verify-feed-day.mjs` + `verify-feed-load.mjs` + your new guard. Red = stop.
6. `13544` and `90007` are live and in **no** signed document in `feed_input.json`. Check both against the signed
   PDFs. Not in a document → void with reason, never delete. 13544 carries the Hawkeye $600 invoice — if it belongs
   to 13583 (doc 5809), move it through the correct path.
7. **Refrigerx PO 1013272-2, $5,210.00, 9/8** — OWNER: "IT HAS BEEN RECONCILED, IT IS TIED TO A SETTLEMENT."
   Faro swaps Inv#/PO on that row; it is the 6th 9/8 invoice (net adv 5,053.70, escrow 78.15). Do NOT mint an
   invoice called "1013272-2", do NOT skip it, do NOT invent a load. Tie it to the settlement named in the reconciled
   record (`00-FEED-MANIFEST.md`, ROUND 61/62, the master workbook). The earlier "void c6a11428" order is WITHDRAWN.

## 6. DONE LINE — RE-MEASURABLE, OR IT IS NOT DONE
```
CURSOR | R-151 DONE | <sha> | <live git_sha> |
docs 5769-5800: USMCA loads fed = USMCA loads in the documents (n/n) | Transportation loads written to USMCA = 0 | 13497/13498/13507/13509 resolved by sheet+row |
charge_lines on every fed load | advances live N, $X, cumulative per purchase day = control to the cent:
5,500 · 9,100 · 10,800 · 16,450 · 26,575 · 33,675 · 37,475 · 44,075 · 60,975 · 65,075 · 68,175 · 95,075 ·
108,975 · 123,625 · 134,425 | ghost a76ed504 voided_at set | 13544/90007 resolved | unbalanced JEs 0 |
bank_transactions USMCA 1133 | NEXT: 5801 →
```
**Deadline:** root-cause fix + guard merged **2026-09-24 05:30Z (12:30 AM CT)**; documents 5769–5800 complete
**07:00Z (2:00 AM CT)**. Missed → the feed writer goes to **DEVIN-A** (feeder #2), Cursor keeps posting fixes only.
Blocked → quote the blocker and who unblocks it, in writing, before the deadline.

## 7. BANKING — UNCHANGED LAW
`banking.bank_transactions` USMCA = **1,133**, exact, before and after every document.

> **This Updated box SUPERSEDES the 11:06 PM CT ROUND 151 immediately below. Entity per the owner ruling.**

---

# ROUND 151 — CURSOR — THE FEED SKIPS LOADS INSIDE THE DOCUMENTS. 24 LOADS, NOT 5 INVOICES.
Claude Lead, 2026-09-23 11:06 PM CT (2026-09-24 04:06Z). Owner order: Cursor finishes the feed, every table,
balanced, confirmed, zero errors. Measured live (Neon br-fancy-credit-akjnd07a, bypass_rls in-tx, USMCA only)
and off `~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/feed_input.json`. Supersedes every earlier
"five missing invoices" box — that framing was too small, and one line of it was wrong (see §3).

## 1. THE MEASUREMENT
Settlement documents 5769 → 5800 carry **72 loads**. Production has **40** of them. **32 are not fed.**
Documents you have run come out PARTIAL — the document is fed, some of its loads are not:
```
5769 PART 13498,13508      5779 PART 13526,13527      5786 PART 13533,13548      5794 PART 13558,13568
5771 PART 13504,13510      5780 PART 13530,13532      5787 PART 13549,13555      5795 PART 13561,13567
5772 PART 13502,13507,13512,13513   5781 PART 13523,13534   5788 PART 13539,13546,13552   5800 PART 13551,13573,13584
5773 PART 13497,13511      5784 PART 13522,13528,13536      5789 PART 13550,13557
5774 PART 13517,13518      5785 PART 13531,13538,13543      5790 PART 13542,13554
5775 PART 13506,13514,13516   5776 PART 13505,13515,13520
NOT RUN AT ALL: 5770 · 5778 · 5782 · 5796 · 5798 (5798 is in flight right now, PID on the Mac)
```
**The 24 missing loads numbered ≥ 13508 — FEED ALL OF THEM:**
`13509 13513 13517 13522 13523 13524 13525 13527 13529 13530 13531 13533 13539 13540 13541 13554 13555
13557 13567 13568 13572 13573 13575 13584`
**The 8 missing loads numbered < 13508, delivered 8/5–8/7, before the first Faro purchase (8/10):**
`13497 13498 13502 13503 13504 13505 13506 13507` — do NOT feed these; report them by number in your DONE
line. Whether pre-8/10 legs of a tour belong in USMCA is the owner's call, not yours and not mine.

## 2. WHY THE FARO NUMBER IS SHORT — IT IS THESE LOADS
The Faro invoices that are not fed are exactly loads in that list:
```
inv 15  8/17  DARDINI      3,600.00  -> load 13523 (doc 5781)
inv 16  8/18  MPH          3,800.00  -> load 13524 (doc 5778)
inv 18  8/21  DARDINI      3,900.00  -> load 13529 (doc 5782)
inv 39  8/31  BIG G        3,500.00  -> not matched by name in feed_input — find it in the signed PDF
inv 40  8/31  DGL          3,900.00  -> load 13557 (doc 5789)
inv 46  9/03  HAWKEYE        600.00  -> advance NOT written (invoice exists on live load 13544)
inv 49  9/03  AB GLOBAL    2,100.00  -> load 13567 (doc 5795)
```
Load↔invoice pairs are matched on debtor + amount + date. **Confirm each against the signed
`Company_Settlement_<doc>.pdf` before writing.** Never guess.

## 3. CORRECTION OF THE PRIOR LEAD BOX — `39 + 40 = 3,900` WAS WRONG
PURCHASE REPORT ALL.csv: **inv 39 = 3,500.00 (Big G) · inv 40 = 3,900.00 (DGL) → 7,400.00.**
The "15,200.00" still matched only because of a broken row:
`accounting.factoring_advances a76ed504-82b6-45de-b75c-a842ed81c221` · 8/31 · 3,500.00 ·
**status='voided' but voided_at NULL, void_reason NULL, faro_invoice_number NULL.** It counts as live in
every `voided_at IS NULL` query. Real live advances: **40, $113,025.00** — not 41 / $116,525.00.
Stamp it properly (voided_at + void_reason + actor, same statement) through the existing void writer. Never delete.

## 4. ROOT CAUSE — NAME IT FROM THE CODE, ONE LINE, AND FIX IT FIRST
Every PART document drops loads. The feed is not keyed wrong on invoice number — it is **dropping loads inside a
document**. Read `apps/backend/src/feed/seed-settlement-document.service.ts` (the `/feed/settlement-document/run`
path) and find the filter that excludes a load in the document's `loads[]`. Fix it in the writer, so re-running
a document creates its missing loads and nothing else (idempotent on load_number). **Do not feed another document
until this is fixed.** The document IS the tour: every load in it is fed, with its money, or the document is red.

## 5. ORDER — EXACTLY THIS, NOTHING ELSE
1. **STOP** the forward run (5798 and after).
2. Fix the root cause (§4). One PR + guard `verify-feed-document-has-every-load.mjs`: for every settlement document
   the feed has touched, `count(loads in feed_input for that doc, load_number ≥ 13508) = count(live loads)`.
   Planted-RED: drop one load from a document → exit 1. Wired in `scripts/money-pr-local-gate.mjs` in the same PR.
3. Stamp the ghost advance `a76ed504` (§3).
4. Re-run documents **in order 5769 → 5800**, each one to completion: loads, stops, `dispatch.load_charge_lines`
   (from `feed_input.json` lines — line haul is a contracted total, not qty × rate), proforma → invoice, driver
   bill, expenses via the canonical expense writer (payment account = the card; never 1090), cash advances as
   bill payments, the Faro advance keyed on `faro_invoice_number`, tour link, settlement.
5. **After EVERY document**: `verify-feed-day.mjs` + `verify-feed-load.mjs` + your new guard. Red = stop.
6. `13544` and `90007` are live and in **no** signed document in `feed_input.json`. Check both against the signed
   PDFs. Not in a document → void with reason, never delete. 13544 carries the Hawkeye $600 invoice — if it belongs
   to 13583 (doc 5809), move it through the correct path.
7. Refrigerx $5,210.00 mis-mapped to 13579 (finding `c6a11428`) — fix the mapping path, void never delete.

## 6. DONE LINE — RE-MEASURABLE, OR IT IS NOT DONE
```
CURSOR | R-151 DONE | <sha> | <live git_sha> |
docs 5769-5800 loads>=13508 fed 64/64 | pre-8/10 not fed: 13497,13498,13502,13503,13504,13505,13506,13507 |
charge_lines on every fed load | advances live N, $X, cumulative per purchase day = control to the cent:
5,500 · 9,100 · 10,800 · 16,450 · 26,575 · 33,675 · 37,475 · 44,075 · 60,975 · 65,075 · 68,175 · 95,075 ·
108,975 · 123,625 · 134,425 | ghost a76ed504 voided_at set | 13544/90007 resolved | unbalanced JEs 0 |
bank_transactions USMCA 1133 | NEXT: 5801 →
```
**Deadline:** root-cause fix + guard merged **2026-09-24 05:30Z (12:30 AM CT)**; documents 5769–5800 complete
**07:00Z (2:00 AM CT)**. Missed → the feed writer goes to **DEVIN-A** (feeder #2), Cursor keeps posting fixes only.
Blocked → quote the blocker and who unblocks it, in writing, before the deadline.

## 7. BANKING — UNCHANGED LAW
`banking.bank_transactions` USMCA = **1,133**, exact, before and after every document.

---

# NOW — CURSOR — E22 — FUEL: CREATE THE EXPENSE ONLY. QUICKBOOKS FLOW.
2026-09-23 6:45 PM CT (23:45 UTC) — OWNER RULING. Supersedes E21.

## THE RULING, IN THE OWNER'S WORDS
"IT SHOULD ONLY BE CREATING THE EXPENSE, LIKE IN QUICKBOOKS, AND WE MATCH IN
BANKING."

## WHAT YOU ARE DOING WRONG
You are hand-writing a fuel journal entry:
    DR 5000 Fuel & Diesel      774.55
    CR 1090 Undeposited Funds  774.55
    memo: "Fuel event 56627fdf-6bf6-476b-a6ee-d8b5452ac1cf (diesel..."
Two things are wrong and the second is the real one.
  1. 1090 Undeposited Funds is where CUSTOMER RECEIPTS sit before deposit.
     It is the wrong direction entirely — you credited an incoming-cash
     account to pay for diesel.
  2. **You should not be writing a fuel JE at all.** A bare "Fuel event
     <uuid>" memo is the signature of a bespoke poster. QuickBooks does not
     journal a fuel purchase. It records an EXPENSE against a payment
     account, and the bank feed matches it later.

## WHAT TO DO INSTEAD — ONE THING
**CREATE THE EXPENSE. NOTHING ELSE.**
Use the canonical expense writer — the same path the app uses when a person
enters an expense. It already posts the GL correctly. Do not write a JE, do
not pick GL accounts by hand, do not invent a routing engine.

On the expense record set:
  - account / category : 5000 Fuel & Diesel
  - PAYMENT ACCOUNT    : the card the fuel was actually bought on
                           Relay      -> 1295 Relay Fuel Wallet
                           Dreamline  -> 2510 Dreamline Diesel Card Payable
                           Amex       -> 2500 Amex Credit Card Payable
                         If the provider is not on the fuel transaction,
                         STOP that row and report it. Never default to 1090.
  - load_id, driver, unit, gallons, date, vendor/location from the source
  - memo: human first — "Fuel · load 13511 · Infante Corona · T176 ·
    159.168 gal · Relay". Never a bare UUID.

The GL then falls out of the expense engine on its own. Banking matches the
card transaction against that expense later, exactly like QuickBooks.

## BANKING — DO NOT TOUCH IT
banking.bank_transactions stays at 1133 for USMCA, EXACT, every single day.
You never create, delete or modify a bank row. Matching happens in the
Banking module against rows that are already there. If a fuel expense has no
bank row to match yet, that is correct and expected — it matches when the
card statement lands.

## FIX WHAT IS ALREADY POSTED
Ten fuel JEs are live, all crediting 1090, total 7,250.20. Reverse them
through the existing reversal engine — void, never delete — and re-create
them as EXPENSES through the canonical writer. No new GL math.
GL 1090 currently reads +8,666.30 on 17 lines. After the fix it must hold
only genuine undeposited customer receipts.

## THE SAME RULE APPLIES TO EVERY COST YOU FEED
Expenses, tolls, lumper, repairs, scale fees — all of them. Create the
EXPENSE with its payment account. Never hand-write a journal entry. If a
step has no engine in docs/manuals/capability-registry.json, that is a
FINDING to post, not a function to write.

## WHAT IS CORRECT — UNCHANGED, DO NOT DISTURB
Trial balance nets to EXACTLY 0.00.
  1100 A/R +16,450.00 · 4000 Line-haul -16,450.00 ·
  2150 Factoring Advance -16,450.00 (gross, ASC 860 secured borrowing,
  A/R stays on books) · 1230 Factoring Reserves +239.92 ·
  6400 Factoring Fees +293.58 · 1150 Unbilled Revenue 0.00 on 14 lines
  (two-event latch opening and closing correctly) ·
  banking.bank_transactions 1133 EXACT
W.O. normalization, the Watco reserve legs as two offsetting movements, and
the carry-forward settlement ledger are all correct. Keep them.

## RESUME CONDITIONS
  1. Fuel creates an EXPENSE through the canonical writer, payment account
     = the real card, never 1090, never a hand-written JE.
  2. The 10 existing fuel JEs reversed and re-created as expenses.
  3. Memos name the load and the party.
Paste the corrected GL by account, then run 8/14 -> 9/21 continuously.
