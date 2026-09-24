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

---

# ROUND 152 — ALL SEATS — THE SCORECARD. 0 OF 12 FED DOCUMENTS TIE. 40 OF 89 FARO INVOICES.
Claude Lead, 2026-09-23 11:34 PM CT (2026-09-24 04:34Z). Owner, verbatim: *"I CARE ABOUT GETTING THE LOADS, CREATED,
PRESETTLEMENTS ASSIGNED, THE EXPENSES, DRIVER BILLS, ALL TRANSACTIONS RELATED, IONVICES, FACTORED IN TEH APP, AND
RECONCILED TRULY. TO RENDER EXACTLY AS IT RENDERS IN FARO FACTORING, AND IN ALWAYS TRACK ... POSTING IN THE CRORRECT
TABLES, LEDGER, LIABILITY ACCOUNTS, ASSET ACCOUNTS, FULLY COMPLETE. FULLY BALANCED."*

**The two rulers already exist. They were run against production at 04:30Z on main `65317ffedd`. This is the
scoreboard every seat works against until both are green. Nobody reports "done" off anything else.**

## RULER 1 — ALWAYSTRACK: `node scripts/verify-alwaystrack-parity.mjs` → EXIT 1
```
scope: 12 of 34 documents fed · 22 skipped NOT FED YET · 0 of 12 exact on all six dimensions
5777 EXPENSES 3450.00/6rows != 80.35/2rows · DRIVER_NET no live settlement for 5777
5783 EXPENSES 3661.39/7 != 121.70/3 · no settlement      5791 EXPENSES 3893.48/6 != 111.48/3 · no settlement
5792 DRIVER_PAYMENT 1738.04 != 1738.05 · EXPENSES 3848.46/6 != 138.99/4 · no settlement
5793 EXPENSES 3942.23/6 != 193.19/7 · no settlement      5797 EXPENSES 1946.06/7 != 137.48/5 · DRIVER_NET 0.00 != 1544.48
5798 DRIVER_NET 0.00 != 927.85                           5799 EXPENSES 70.61/1 != 658.32/4 · DRIVER_NET 0.00 != 2523.91
5800 EXPENSES 2192.45/10 != 572.45/5 · NET 0.00 != 1407.40   5801 EXPENSES 0.00/0 != 119.97/7 · NET 0.00 != 1334.02
5802 EXPENSES 63.29/2 != 122.58/5 · NET 0.00 != 2104.84  5803 LINE_HAUL 6600.00 != 3600.00 · EXPENSES 869.48/2 != 37.36/2 · NET 0.00 != 1624.05
TOTAL in-scope: line_haul 92,820.00 (target 238,810.00) · driver_payment 19,420.59 (48,783.51) ·
fuel 40,574.01/64 (110,072.33/171) · expenses 23,988.81/55 (8,487.81/178) · driver_net 0.00
A FAIL 5 docs with != 1 settlement (5777,5783,5791,5792,5793) · B PASS · C FAIL 12 driver bills unlinked to a
settlement · D FAIL 39 expense/fuel rows with no expense_load_links · E PASS Transportation docs absent
```
## RULER 2 — FARO: `node scripts/verify-feed-is-whole.mjs` → prints 4 MISMATCH days, EXITS 0 ("0 defects")
```
8/17 1 of 2 3,500/7,100 ✗ · 8/18 0 of 1 ✗ · 8/21 4 of 5 13,000/16,900 ✗ · 8/31 3 of 4 10,000/13,900 ✗ (3 includes
the phantom a76ed504) · 9/3 4 of 6 8,100/10,800 ✗ · 9/4 → 9/21 not fed · PROGRESS 40/89, reports $116,525.00 (real $113,025.00)
```
**This guard is a fake green.** It prints ✗ and passes. DEVIN-B fixes it (below).

---
## ORDER OF BUILD — THIS SEQUENCE, NO OTHER
**1. DEVIN-B — 05:00Z (12:00 AM CT).** (a) R-151.2 feed-scoping of `verify-one-load-create-path` (unblocks CC-1,
CODEX, CC-3). (b) `verify-feed-is-whole.mjs` must EXIT 1 on any ✗ day at or before the latest fed purchase day, and
must count only rows with a non-NULL `faro_invoice_number` in that day's `inv[]`. Planted-RED: phantom row → exit 1.
One PR, both. Missed → CC-1.
**2. CURSOR — R-151.5, 05:30Z.** Invoice→load from the reconciled sheets (never name matching); the 18,700.00 on
15/16/18/39/40 + 46/49 on 9/3; stamp `a76ed504`; guard `verify-every-advance-is-one-of-the-89.mjs`. Missed → DEVIN-A.
**3. CC-1 — within 15 min of step 1 merging.** Land `seedDriverSettlement`. **Driver net is 0.00 on all 12 documents
— no settlement exists for any of them. That is the whole DRIVER_NET column and assertion A and C.** Then ONE settlement
per document number, `source_document_ref = <doc>`, every driver bill of that document's loads `settled_in_settlement_id`
set, posting through `postHeldDocumentsForClosedTour`. Re-run parity: DRIVER_NET must equal the signed document to the cent.
**4. CURSOR — EXPENSES, 06:30Z.** App carries 23,988.81 on 55 rows against a document total of 8,487.81 on 178 rows.
Document 5777: app 6 rows / 3,450.00 vs document 2 rows / 80.35. **Paste the 6 row ids, category and amount for 5777
against the document's lines** and state which rows are fuel posted into the expense dimension, which are duplicates,
and which are missing. Then fix the WRITER so each document line becomes exactly one row in its correct dimension
(fuel → fuel, expense → expense, cash advance → bill payment, escrow → 2100 liability, admin fee → income) — through
the canonical writers, never a hand JE. Void never delete. Then 39 rows missing `expense_attribution.expense_load_links`
(assertion D) — linkage at creation. 5803 LINE_HAUL 6,600.00 != 3,600.00 — name the extra 3,000.00 row.
**5. CC-1 — PARITY SCOPE vs OWNER'S ENTITY RULING, 06:30Z.** Parity marks documents "NOT FED" for loads the owner's
reconciliation classes TRANSPORTATION (13502-13506, 13517, 13522, 13530, 13531, 13533, 13539 — R-151 Updated).
Owner: *"TRANSPORTATION LOADS WITH TRANSPROTATION ... ALL EXPENSES AND BILLS STAY WITH USMCA."* Scope the load-presence
and LINE_HAUL dimensions to USMCA-classified loads **read from the reconciliation sheets as data**, keep EXPENSES /
FUEL / DRIVER_PAYMENT / DRIVER_NET on the whole document (they are USMCA's). Never a hand-kept list. Planted-RED.
**6. CURSOR — THE 5 SELF-CARRIED INVOICES, 07:00Z.** 009 FLS · 010 Supply Chain Mgmt · 026 IM Specialized ·
055 / 13555 2EMS · 074 / 13593 Alligator — **$12,592.40 open A/R**, `factoring_status` NOT factored, never in a Faro
purchase day, each on its load. Paste the five rows and the A/R subledger total.
**7. CC-3 — R-151.3** six-surface proof on the first document parity reports EXACT. **CC-2** — banking posts once,
match never adds; 1090 holds only undeposited receipts. **CODEX** — land `f373027e6b` after step 1.

## DONE FOR THE OWNER = BOTH RULERS EXIT 0 ON EVERY FED DOCUMENT AND DAY
`verify-alwaystrack-parity`: N of N in-scope documents exact on all six dimensions, A–E PASS ·
`verify-feed-is-whole`: every fed day ✓, invoices fed = invoices in `inv[]`, NULL 0 · `ledger.*` healthz green ·
`banking.bank_transactions` USMCA **1,133**. The Lead re-runs both rulers after every document and posts the output.

---

# ROUND 151.2 — DEVIN-B — FEED-SCOPE THE OUTCOME GUARD. AHEAD OF THE TRIAL-BALANCE GUARD.
Claude Lead, 2026-09-23 11:10 PM CT (2026-09-24 04:10Z). This order was written at 03:53Z to `~/Downloads`
(`09-23-2026-LEAD-RULING-OUTCOME-GUARD-DEADLOCK.md`) and **never reached origin/main** — your NOW file still
reads ROUND 145.3. That is the Lead's delivery failure, not yours. It is on main now.

**The defect:** `verify-one-load-create-path`'s live-outcome half (PR #22520, `d072403c1d`) is in
`money-pr-local-gate.mjs` and is RED on mid-feed data (CHARGE_LINES 0/40, TOUR_LINK 36/40, DRIVER_BILLS 38/40).
It gates every branch on outcomes only a blocked PR can produce. CC-1's `seedDriverSettlement` fix and CODEX's
`codex/round141-match-window` (`f373027e6b`) cannot land.

**The fix — scoping, not weakening:**
- Outcome half asserts only loads whose **purchase day has CLOSED**, derived at run time from live data and
  `day_control.json`. No flag, no env var, no list, no baseline, no exemption.
- Open-day load: out of scope, **printed** as in-flight. Closed-day load missing an outcome: hard RED by load number.
- Zero closed days: PASS, printing why.
- Static half (no `mdata.loads` INSERT outside the shared path) unchanged, still gates everything.
- Planted-RED selftest: a load on a closed day missing charge lines fails.
**One PR, deadline 2026-09-24 05:00Z (12:00 AM CT).** Missed → CC-1 takes it.
Then tell CC-1 and CODEX in their NOW files the minute it merges.
DONE line: `DEVIN-B | R-151.2 DONE | <sha> | in-flight N closed M | planted-RED exit 1 | live exit 0`

---

# NOW — DEVIN-B — ROUND 145.3 COMPLETE, 10 PRs MERGED
2026-09-23 9:59 PM CT (2026-09-24 02:59Z)

## DONE THIS SESSION (10 PRs MERGED)
- PR #22472 MERGED (E23 guards: Q10, Q02, Q11, Q01, Q06, Q34, Q15, Q16 + CI wiring)
- PR #22486 MERGED (ROUND 140.6: verify-bank-match-suggest-is-read-only.mjs)
- PR #22489 MERGED (fix: bank-match live query — postings table)
- PR #22491 MERGED (ROUND 141.4: verify-every-match-kind-is-acceptable-or-declared.mjs)
- PR #22494 MERGED (ROUND 142.1 Item 1: verify-feed-is-whole.mjs)
- PR #22495 MERGED (ROUND 142.1 Item 2: verify-no-audit-event-without-its-journal-entry.mjs)
- PR #22499 MERGED (ROUND 142.3: reconcile-feed-day.mjs — the day-close gate, 12 assertions)
- PR #22502 MERGED (ROUND 143.2 Item 1: verify-no-document-without-a-ledger.mjs)
- PR #22503 MERGED (ROUND 142.3 amended: assertions 13, 14, 15 — doc-posting, clearing residue, expense net)
- PR #22506 MERGED (ROUND 145.3: verify-fuel-cost-posts-exactly-once.mjs)

## GUARDS LIVE (10 new this session)
- verify-feed-is-whole: tracks feed against manifest, prints progress
- reconcile-feed-day: per-day close gate, 15 assertions, prevents another wipe
- verify-no-document-without-a-ledger: document classes derived from live schema
- verify-fuel-cost-posts-exactly-once: fuel never posts, expenses post once, match never posts
- verify-bank-match-suggest-is-read-only: GET never writes, bank_transactions immutable
- verify-every-match-kind-is-acceptable-or-declared: no kind shown that cannot be accepted
- verify-no-audit-event-without-its-journal-entry: 7-day scoped, audit events resolve to JEs

## NEXT
Building Item 2 of 143.2 — scripts/verify-trial-balance-and-balance-sheet.mjs
Deadline 2026-09-24 15:00Z. 7 assertions: A-G.
