# GO — REAL BOOK, LIVE, NOW · 2026-08-31 20:55Z
**OWNER HAS GIVEN THE GO. Stop asking. Enter the real August book, live, by clicking.**

Owner, verbatim: *"you do not need to ask me… once we create all these, really create them live, and
complete the whole process, we can begin voiding all test transactions because i do not want them
to confuse or affect our books."*

`is_sample_data = false` on real transactions is **AUTHORIZED**. The August period is **open**.
The unflagged August JE baseline is **236** — real entries will move it, and that is correct.

## THE BAR — read this before the first click
The owner's standard, verbatim: build it *"to the full standards as if we were using a McLeod or
QuickBooks or Alvys or NetSuite subscription, or launching our own subscription."*
A row entered by hand that no module can reproduce is **not** a finished module. The test
transactions were reconnaissance. **The intelligence they produced must now exist as permanent,
wired, guarded software — not as OUTBOX notes.** Every seat, before closing any phase:
- the defect found in the test phase is **fixed in code**, with a guard and a selftest
- the linkage is declared (Rule 14): both-way to financial primitives, operational modules, and hubs
- the hop is reproducible by a user, not by a seat with database access
**"It worked when I clicked it once" is not done. "Any user can do this and the guard proves it" is done.**

## TIE-OUT TARGETS — read off the owner's own files. Reconcile to these to the cent.
| source | rows | control total |
|---|---|---|
| `CC-1-USMCA-FARO-33-INVOICES.csv` | 33 | **face $95,075.00** · escrow reserve $1,426.13 · discount fee $1,426.13 · wire fees $120.00 · **net advance $92,102.74** · dates 08/10–08/28 |
| `CC-1-COMPANY-SETTLEMENTS.csv` | 29 | **Total Inv. $388,976.50** · 08-03 → 08-28 |
| `CC-1-DRIVER-SETTLEMENTS.csv` | 58 | `Total` column sums **$113,878.14 including a trailing totals line**; excluding that line **$75,918.76**. **DO NOT GUESS WHICH.** Open the file, identify the totals row, state which figure is the control, and show the arithmetic. |
| `CC-1-DRIVER-DEDUCTIONS.csv` | 74 | **$2,737.23**, of which **44 escrow rows = $1,100.00 across 12 drivers** · 08-01 → 08-28 |
| `CC-1-DRIVER-ADD-PAYMENTS.csv` | 32 | **$1,102.00** |
| `CC-1-DRIVER-EXPENSES.csv` | 135 | **$6,006.56** · 08-01 → 08-26 |
A phase is not closed until the app's own report equals the control total **exactly**. Not close. Equal.

## SEQUENCE — accounting order. Do not jump ahead; each phase feeds the next.
**P0 · MASTER DATA FIRST.** Customers, drivers, units must exist before any transaction references
them. Includes the **3 AL-scheduled drivers missing from `mdata.drivers`** (Leonel Antonio Morales,
Hugo Gaytan Sarabia, Angel Alfonso Sosa Perez) — resolve variant-vs-absent, then create by clicking.
**P1 · LOADS / DISPATCH** — real, **original dates**, `is_sample_data=false`.
**P2 · INVOICES** → A/R. 33 Faro invoices, face $95,075.00.
**P3 · DRIVER BILLS** — minted from the load, at the driver's real rate card.
**P4 · LOAD EXPENSES** — 135 rows, $6,006.56.
**P5 · SETTLEMENTS** — driver (58) and company (29).
**P6 · DEDUCTIONS + ESCROW** — 74 deductions $2,737.23; escrow auto-create, then backfill the 12
drivers / $1,100.00. **Escrow is a liability owed to the driver**, not our cash. Ledger must sum to
balance for every driver, old and new.
**P7 · FACTORING** — **97.00% advance · 1.50% discount fee · 1.50% escrow reserve · $10.00 flat wire
fee.** Not 95/2.5. Proof: 95,075.00 − 1,426.13 − 1,426.13 − 120.00 = **92,102.74** exact.
**P8 · BANK** — transactions in, then match to settlements and to the Faro remittances.
**P9 · GL TIE-OUT** — every control total above, reconciled, evidenced.

## P10 · VOID THE TEST DATA — ONLY AFTER P9 PASSES. NOT BEFORE.
This is the step that can destroy the company's books if done carelessly. It runs **last**, once,
under review.
- **Void by UUID, from a reviewed list.** Never a predicate sweep. Never `void-all-TEST`
  (owner-locked, 08-22/27/28).
- **Reverse, never erase.** WORM. No `DELETE` on a financial row, ever.
- **`INV-2026-00049..00081` are NOT test.** Owner ruling: real transactions. **NO VOIDS.**
- **The 20 trailer rows are NOT test.** Real equipment, `is_sample_data=false`, correctly entered.
- The void list is generated, **published for review, and only then executed**. CC-2 grades the list
  **before** anyone runs it — a wrong entry on that list is a real transaction destroyed.
- If a row's `is_sample_data` flag is wrong, the flag is the defect. **Fix the flag, then void.**
  Never void something because it "looks like" test data.

## SEATS
- **CC-1** — money spine. Finish L-0002/L-0004 remint by clicking, then own P2, P3, P5, P7 and the
  insurance schema. Every fix carries a guard + selftest.
- **CC-2** — grade every phase live against the control totals. Only CC-2 writes `prod_verified`.
  **CC-2 also gates the P10 void list before it executes.**
- **CC-3** — P0 master data, the ID-card/COI upload once CC-1's schema lands, and the one
  `CreateTrailerModal` proof click.
- **CODEX** — P8 bank + matching.
- **DEVIN-A** — P1 loads, P4 expenses, live-proof the dispatch blocks.
- **CASCADE** — navy sweep, monthly-reporting-by-the-5th job, and the aggregate-CI guard **count**.
- **CURSOR** — sequence, keep queues ≥3, enforce LIVE CLICK on every OUTBOX line.

## UNCHANGED
LIVE CLICK ONLY — no Neon/API/env creation; a broken UI is the defect, file it, never route around it.
Arm's-length Trucking → USMCA at ×1.16. T144 pending removal. T163 "coverage claimed, not evidenced."
No insurance JE until the endorsed premium and updated COI arrive.
**Nobody closes August but the owner.**
