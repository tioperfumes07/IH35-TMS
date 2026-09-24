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
