# TO THE NEW LEAD — WHERE EVERYTHING IS, AND THE FIVE TRAPS I FELL INTO
Written by the outgoing Claude Lead, 2026-09-23 11:40 PM CT (2026-09-24 04:40Z), at the owner's instruction.
**Read this before you measure anything, assign anything, or write a number in a report.**
Everything below is a path on this machine that I verified by opening it. Nothing here is from memory.

---

## PART 1 — THE AUTHORITIES. NEVER DERIVE WHAT THESE ALREADY STATE.

### THE PER-INVOICE REGISTER — the single most important file, and the one I failed to read
`~/Downloads/IH35-RECONCILIATION-AND-FEED/06-OUTPUT/faro_reconciliation_register.csv` — **89 rows, one per
invoice.** Columns: `faro_date, faro_inv, faro_debtor, purchase, po, class, tms_load, tms_customer, note`.
It carries the amount, the debtor, the PO, whether it matched a TMS load, and **why it did not.**
`~/Desktop/IH35-FARO-RECONCILE/faro_canonical_purchases.csv` — 128 rows, columns
`inv, date, debtor, po, purchase, escrow_rsv, discount, fees, wire_fee, net_adv, chgback, src`.
Also `faro_daily_totals.csv` and `faro_canonical_purchases.json` in the same folder.
**Every per-invoice figure in this project is in those files. If you are computing an invoice amount from a
day total, you are about to be wrong.**

### THE DAY CONTROL — the authority for which invoices belong to which day
`~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/day_control.json` — 23 days, each with
`date, invoices, purchase, escrow, cash_rsv, discount, wire, sch_fee, receipts, net_adv, inv[]`.
**The `inv[]` array is the authority for a day's membership — never the invoice number's numeric order.**
Numbers are NOT contiguous within a day: 18 sits on 8/21 while 17 and 19 sit on 8/19; 37 sits on 9/1 while
38-41 sit on 8/31. Built from `01-FARO/PURCHASE REPORT ALL.csv` + `funds due report 09-21-26.csv`.

### THE FEED INPUT AND ENGINES
`01-ENGINES/` — `feed_input.json` (**124 loads, 1,165 item lines**; the builder refuses to write unless
qty × rate reconstructs the amount) · `parsed.json` · `settlement_control.json` ·
`parse_settlements.py` · `build_feed_input.py` · **`run_feed_day.py`** · `build_day_control.py` ·
`build_settlement_control.py` · `parse_rate_confirmations.py` · `measure_faro_shortpay.py`.

### THE GATES
`02-CONTROLS-AND-GATES/` — **`verify-feed-day.mjs`** (revenue) · **`verify-feed-load.mjs`** (cost) ·
`verify-feed-readiness.mjs` · `feed_cursor.py` · `verify-purge.mjs` · `verify-zero-state.mjs`.
The cost gate enforces three posting destinations dollars alone cannot catch, and **the feeder must DECLARE
where it posted each — silence fails**: `cash_advance → bill_payment` · `escrow → driver_escrow_liability` ·
`admin_fee → income`.

### THE SOURCE DOCUMENTS
`03-SOURCE-DOCUMENTS/` — 146 files (116 settlement-text, 19 rate-confirmations, `_duplicate-exports/`).
**Signed PDFs live in `~/Downloads`: 89 `Company_Settlement_*.pdf` + 73 `Driver_Settlement_*.pdf`.**
When a line lost its description in parsing, **open the PDF.** 19 lines / $1,571.91 were deliberately left
without an item rather than guessed — `06-OUTPUT/feed_input_gaps.json`.

### THE MANUALS — `~/Desktop/README-START-HERE-EVERY-SEAT-EVERY-SESSION.md`, six files in order
1 `capability-registry.json` — **14 verified capabilities with file and line. If it is listed, IT EXISTS.**
  Find out why it is not running. A PR that rebuilds one fails review on sight.
2 `01-DATA-SOURCE-REGISTER-READ-BEFORE-SAYING-MISSING.md`
3 `03-RULING-THE-RECONCILER-THE-ONE-GENERATIVE-CAUSE.md`
4 `04-RULING-FEED-PARITY-THE-VERIFIED-SIDE-EFFECT-LIST.md` — the **8 INSERTs and 14 gates** Book Load
  performs, **by line number**, that a feed skips
5 `02-RULING-LIVE-LOADS-VIEW-THE-PERMANENT-FIX.md`
6 `09-22-2026-IH35-FULL-LINKAGE-PROCESS-AND-MAPPING.md`
Plus `~/Desktop/IH35-CLAUDE-JOURNAL.md` and `~/Desktop/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md`.

### PRODUCTION
Neon `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`, db `neondb`. USMCA
`5c854333-6ea5-4faa-af31-67cb272fef80` ONLY — TRANSPORTATION and TRUCKING are frozen.
Reads need `SET LOCAL app.bypass_rls = 'lucia'` **as a materialized CTE referenced in a WHERE clause**,
inside one transaction. A bare 0 under forced RLS is **MASKED, not empty** — re-run before it is a verdict.

---

## PART 2 — THE FIVE TRAPS. I FELL INTO EVERY ONE. THE OWNER PAID FOR ALL FIVE.

### TRAP 1 — DERIVING A FIGURE THAT IS ALREADY WRITTEN DOWN
I computed invoices 39 and 40 as $3,900 / $3,900 by subtracting from the 8/31 day total. **The register
says 39 = BIG G LOGISTICS $3,500.00 (PO 3965) and 40 = DGL EXPORT $3,900.00 (PO L-43416).**
The real five-invoice shortfall is **$18,700.00**, not the $15,200.00 I reported all night:
```
15  8/17  DARDINI LLC            3,600.00  PO 154100
16  8/18  MPH CARRIER SERVICES   3,800.00  PO MPHC261334
18  8/21  DARDINI LLC            3,900.00  PO 154067
39  8/31  BIG G LOGISTICS LLC    3,500.00  PO 3965
40  8/31  DGL EXPORT INC         3,900.00  PO L-43416
                                18,700.00
```
**Open the register. Do not do arithmetic.**

### TRAP 2 — MEASURING AGAINST A RUNNING TOTAL INSTEAD OF THE INVOICE SET
A live row `a76ed504` carries **$3,500.00, a NULL invoice number, `status = 'voided'`, `voided_at` NULL and
no void reason.** It passes every `voided_at IS NULL` filter — the filter I used in every measurement — and
it hid exactly $3,500 of the gap, which is why 18,700 − 3,500 = 15,200 looked like it tied.
**Two errors cancelling looked like a reconciliation.**
The reconciliation says **89 advances, every one with an invoice number.** Measure against the invoice SET,
never a sum. A NULL invoice number is a hard failure and cannot exist in the reconciliation's world.

### TRAP 3 — GUESSING A ROOT CAUSE INSTEAD OF READING THE COLUMN THAT NAMES IT
I theorised the day loop keyed on the invoice number. **Wrong.** The register's `class` column says all five
are **`UNMATCHED name`** — Faro's debtor (Dardini, MPH, Big G, DGL) did not resolve to a TMS customer, so
`tms_load` and `tms_customer` are blank and the feeder skipped them. The `note` column even lists the
ambiguity: *"same amount on 13511 = Rehmann, 13523 = DLS Dardini, 13586 = Mode Transportation."*
**It is a debtor-name resolution failure. The file said so before anyone fed a row.**

### TRAP 4 — REPORTING "DELIVERED" FOR A FILE THAT NEVER REACHED MAIN
I wrote orders into seat checkouts and `~/Downloads` and called them delivered. **I have no git credentials
and never got a seat to commit them**, so no seat ever saw them and the feed ran for hours on stale orders.
**A file on disk is not an order. It is delivered when it is on `origin/main`.** If you cannot push, say so
in the same breath and name the seat that must commit.

### TRAP 5 — RAISING A CLOSED QUESTION, AND CITING A STALE FILE AS LAW
I re-raised the Honda fee sign as open. It was **closed** — commit `387370a0f3`, PR #22320: the four $10.00
GASOLINA/HONDA lines are the **company reimbursing the driver** for fuel he bought for the company Honda
pickup. A company expense. **Not income, not 5000, not an IFTA gallon.** The "unconfirmed" line I quoted
lives in a README written *before* the answer. **A prior session's summary is memory, not a source.**
Also closed and never to be re-asked: **DEF, reefer fuel and washout are ITEMS, not accounts** (5010 / 5160 /
5170 retired) · **lumper is an ITEM → 5310** · **cash advances are BILL PAYMENTS** · **escrow is a
LIABILITY** · **admin fee and the company vehicle use fee are INCOME** · **line haul is a CONTRACTED TOTAL,
not qty × rate** · the nine LAW figures · repository public · GL posting flags ON by design ·
capitalize ≥ $7,000. Full list: `~/Desktop/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md`.

---

## PART 3 — WHAT IS TRUE RIGHT NOW, MEASURED 04:33Z

**The reconciliation is INTACT.** I re-verified all five of its identities from its own source files:
`purchase − receipts = AR` 311,587.00 − 12,825.00 = 298,762.00 · `purchase − escrow − cash_rsv − discount −
wire − sch = net_adv` 302,019.36 · days sum to 311,587.00 · day invoice counts sum to 89 · 89 distinct
invoice numbers, zero duplicates. **All HOLD.**
It is built from Faro's CSVs and the 117 signed documents and **never reads production**, so nothing that
went wrong in the feed touches it. **The ruler is fine. Production is what is off. Measure production
against the reconciliation — never re-derive the reconciliation.**

Live at 04:28Z: advances **40 with an invoice number / $113,025.00** (41 rows non-voided, one is the phantom)
· loads 49 · `dispatch.load_charge_lines` **0** · expenses 149 with **9** posted · settlements 5 ·
1090 Undeposited Funds ~95,338.66 with 1000 Bank of America Operating at zero.

## PART 4 — THE ONE GUARD THAT CLOSES THIS WHOLE CLASS
**Every live advance maps to one of the 89 invoice numbers in `day_control.json`'s `inv[]` arrays, each
number appears exactly once, and a NULL invoice number is a hard failure.**
Derived from the file, never from arithmetic. That single assertion catches the phantom row, the five
missing, the partial days and any future duplicate — all four at once. It is the highest-value thing left to
build and it belongs ahead of the rest of the guard queue.

---

## PART 5 — THE FEED UNIVERSE. THE WHOLE SCOPE, IN ONE PLACE.
The owner defined it in four parts. **Nothing outside these four parts gets fed.**

### PART 1 — THE 23 FARO PURCHASE DAYS · 89 INVOICES · $311,587.00
Every row below is read from `01-ENGINES/day_control.json`. `inv[]` is the authority for a day's membership —
**never the invoice number's numeric order.** Amounts per invoice are in
`06-OUTPUT/faro_reconciliation_register.csv`, never derived from the day total.

| # | purchase day | inv | purchase | net advance | cumulative | invoice numbers |
|---|---|---|---|---|---|---|
| 1 | 8/10/26 | 2 | 5,500.00 | 5,325.00 | 5,500.00 | 2,3 |
| 2 | 8/11/26 | 1 | 3,600.00 | 3,482.00 | 9,100.00 | 1 |
| 3 | 8/12/26 | 1 | 1,700.00 | 1,639.00 | 10,800.00 | 4 |
| 4 | 8/13/26 | 3 | 5,650.00 | 5,470.50 | 16,450.00 | 5,6,7 |
| 5 | 8/14/26 | 4 | 10,125.00 | 9,811.24 | 26,575.00 | 8,11,12,13 |
| 6 | 8/17/26 | 2 | 7,100.00 | 6,877.00 | 33,675.00 | 14,15 |
| 7 | 8/18/26 | 1 | 3,800.00 | 3,676.00 | 37,475.00 | 16 |
| 8 | 8/19/26 | 2 | 6,600.00 | 6,392.00 | 44,075.00 | 17,19 |
| 9 | 8/21/26 | 5 | 16,900.00 | 16,383.00 | 60,975.00 | 18,20,22,23,24 |
| 10 | 8/24/26 | 2 | 4,100.00 | 3,967.00 | 65,075.00 | 21,25 |
| 11 | 8/26/26 | 2 | 3,100.00 | 2,997.00 | 68,175.00 | 27,28 |
| 12 | 8/28/26 | 8 | 26,900.00 | 26,083.00 | 95,075.00 | 29,30,31,32,33,34,35,36 |
| 13 | 8/31/26 | 4 | 13,900.00 | 13,473.00 | 108,975.00 | 38,39,40,41 |
| 14 | 9/1/26 | 4 | 14,650.00 | 14,200.50 | 123,625.00 | 37,42,43,44 |
| 15 | 9/3/26 | 6 | 10,800.00 | 10,466.00 | 134,425.00 | 45,46,47,48,49,51 |
| 16 | 9/4/26 | 4 | 17,315.00 | 16,785.54 | 151,740.00 | 50,52,53,54 |
| 17 | 9/8/26 | 6 | 23,910.00 | 23,182.70 | 175,650.00 | 56,57,58,59,60,1013272-2 |
| 18 | 9/10/26 | 2 | 3,100.00 | 2,997.00 | 178,750.00 | 61,62 |
| 19 | 9/11/26 | 7 | 33,400.00 | 32,388.00 | 212,150.00 | 63,64,65,66,67,68,69 |
| 20 | 9/14/26 | 7 | 30,770.00 | 29,836.90 | 242,920.00 | 70,71,72,73,75,76,77 |
| 21 | 9/17/26 | 2 | 7,600.00 | 7,362.00 | 250,520.00 | 78,79 |
| 22 | 9/18/26 | 7 | 28,300.00 | 27,441.00 | 278,820.00 | 80,81,82,83,84,85,86 |
| 23 | 9/21/26 | 7 | 32,767.00 | 31,783.98 | 311,587.00 | 87,88,89,90,91,92,93 |

**TOTALS — closed, never re-derive:** invoices **89** · purchase **311,587.00** ·
escrow **4,530.19** · cash reserve **135.41** · discount **4,673.82** ·
wire **220.00** (flat 10.00 on 19 invoices) · schedule fee **8.22** ·
receipts **12,825.00** · **net advance 302,019.36**.
Advance rate **0.9700 exact**. Funding identity holds on **82 of 82 funded**.
**7 purchased but NOT YET FUNDED: 88, 87, 93, 92, 89, 90, 91.**
**Confirmed customer short-pays: ZERO. Chargebacks: ZERO.**
One partial — invoice 14 / load 13521, face 3,500.00, receipts 3,250.00, **open 250.00**, Core Logistics,
PO 31496-65096. Partial or short-pay is UNKNOWN until their remittance arrives. **A gap is not a reason** —
no document means fault = unknown, account 4960.

### PART 2 — THE 5 SELF-CARRIED INVOICES FARO NEVER PURCHASED · $12,592.40
The owner uploaded these himself. They are **real, unfactored, unvoided, and $0.00 has been paid on any of
them.** They are NOT Faro purchases and must **never** be fed as one, never counted in the 89, and never
included in a purchase-day total.
| invoice | customer |
|---|---|
| **009** | FLS |
| **010** | Supply Chain Mgmt |
| **026** | IM Specialized |
| **055 / 13555** | 2EMS |
| **074 / 13593** | Alligator |
`factoring_status` is the real column. A $51,262.41 figure derived from the wrong field is WRONG — the true
open balance is **$12,592.40**.
**This is also why 9, 10 and 26 are absent from the live invoice set and from `day_control.json` — that is
CORRECT, not a gap.** Do not "fix" it. Three of the five simply are not Faro invoices.

### PART 3 — THE 117 ALWAYSTRACK SETTLEMENT DOCUMENTS · 124 LOADS
**59 company documents + 58 driver documents · 124 loads on BOTH sides · ZERO orphans.**
355 stops · 353 with a facility name · 227 with leg miles · **124 of 124 carry a delivery departure date and
a named consignee.** `feed_input.json` = **124 loads, 1,165 ITEM lines**, and the builder refuses to write
unless qty × rate reconstructs the amount.
**A settlement document IS a tour IS a settlement.** One document → the tour header → its loads inside it →
the driver bill, the expenses, the bills, the cash advances recorded as **bill payments**, every charge to
the customer → closed → posted. **Document-first. Never loose loads.**
Signed PDFs: `~/Downloads/Company_Settlement_<n>.pdf` and `Driver_Settlement_<n>.pdf` — **89 + 73 on disk.**
**KNOWN LIVE DEFECT:** documents feed **partially** — the document lands but some of its loads are dropped.
Documents 5769–5800 carry **72 loads; 40 are in production.** Measure per document, never per day alone.

### PART 4 — CURRENTLY DISPATCHED LOADS, AND TODAY FORWARD
Loads dispatched through **2026-09-22**. The owner's instruction: **post the AlwaysTrack dispatched-load list
and WAIT for his confirmation before creating them.** That is a hard stop, not a formality.
After that the owner provides today's purchases and new loads, and the app runs live — **no more feeding.**

### WHAT IS ALREADY CLOSED IN THE LINE-HAUL NUMBER — DO NOT REOPEN
The line-haul variance is **CLOSED**. It was a **duplicated export**, not a feeder loss and not accessorials:
`Company_Settlement_5760.txt` and `Company_Settlement_5760 (Merged) page 1.txt` both carried Total Line Haul
6,720.00. Summing files instead of documents inflated the control to 436,415.00; the feeder keyed by
settlement number and was right at **429,695.00** all along. The merged export was MOVED to
`03-SOURCE-DOCUMENTS/_duplicate-exports/` (not deleted) and
`parse_settlements.assert_no_duplicate_documents()` now refuses a duplicated corpus.
Deduped corpus ties to `feed_input.json` **to the cent: 429,695.00 = 429,695.00.**
3 loads carry no line-haul row at all — **13525, 13554, 13564** — unrelated to that variance.
