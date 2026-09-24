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
