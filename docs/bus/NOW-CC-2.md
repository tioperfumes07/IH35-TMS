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

# NOW — CC-2 — 2026-09-23 9:14 PM CT (2026-09-24 02:14Z)

## MERGED TONIGHT
#22479 queue claims · #22483 GATE-F004/F005/F005-B (ih35_ci_readonly default
+ concurrency-flake fix) · #22493 Q34 bus-file archiving (was blocking
every seat's push) · #22497 FILTER-MULTI-01 5/12 + VOID-BUTTON-01 first
surface (Invoices), pending CI/merge as of this write.

## HELD, GATE-TESTED, BLOCKED ONLY ON verify-alwaystrack-parity (external)
- cc2-task16-banking-void-dispatcher (Q25, task 16) — banking void routes
  through the one dispatcher, thin pass-through to reverseJournalEntryNoFlip.
- Q26 (task 38, JE memo writer, P0) at /tmp/cc2-q26-je-memo-writer — root-
  caused: the doc-reference requirement was ALREADY enforced; fixed memo
  shape validation (empty/JSON/length). RED/GREEN proven, zero regressions.
Both blocked by the SAME external condition: newly-fed AlwaysTrack docs
(5777, 5783) show zero settlements + real unlinked driver-bill/expense/fuel
rows. Measured live twice 10 min apart (9:03/9:11 PM CT), unchanged both
times — filed as a real recurring-pattern finding
(ALWAYSTRACK-PARITY-NEWLY-SCOPED-DOCS-MISSING-SETTLEMENT), routed to
whoever owns feed/settlement-creation sequencing. Not bypassing. Will push
both the instant it clears.

## VOID-BUTTON-01 scope finding
Grepped every module the packet named: only ONE real destructive action
exists per module today (Void/Cancel/Undo). Delete (any entity),
Void-for-loads, Exclude-for-banking do not exist as real backend
capabilities anywhere. Built the real shared component + wired the one
real case; did not fake the rest. Full writeup on the board.

## NEXT
7 more FILTER-MULTI-01 pages · task 48 (relay deposit cron) once Q26/task16
land · Q22 (settlement/presettlement column sweep).
