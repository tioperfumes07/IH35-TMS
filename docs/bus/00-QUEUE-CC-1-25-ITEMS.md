# CC-1 — NUMBERED QUEUE — 25 ITEMS — 2026-10-02
Claude Lead. Modules owned end to end: **Settlements · Cash Flow · Maintenance · accounting core.**
Work top to bottom. Each item FULLY COMPLETE before the next: engine correct in code, screen matching
its board, named guard holding, deploy live on **both** services. Not "merged."

**Item 1 is the engine audit, and its findings get added to this queue and renumbered.** Report the
audit before building item 2.

Permanent fixes only — root cause plus a guard, never a patch. No seeding, feeding, matching,
categorizing, live verification, backfilling or reposting. No handoffs: you finish your own items.

---

**1 of 25 — COMPETING-ENGINE AUDIT, YOUR MODULES.** Read code, query nothing. Find every place two or
more engines do the same job. For each: file and line of both, which one the live path actually calls,
which is correct against the owner's rulings and the CPA answers, the repoint, the guard name. You
already found the pattern — `closeSettlementPayRun` vs `postSettlementBillPayment`. Find the rest.

**2 of 25 — THE SINGLE SETTLEMENT POSTER.** Make `postSettlementBillPayment` (Poster B) what Close
runs. Retire `closeSettlementPayRun` at the call site, unreachable, commented with this order. Guard
fails if a second settlement poster ever becomes the default. **Repost no history.**

**3 of 25 — G-04, THE SETTLEMENT GL CHAIN.** `driver_settlement_gl_runs` and
`driver_settlement_gl_bills` have never run. Build the chain on Poster B.

**4 of 25 — PER-LOAD A/P BILL, NUMBERED AS THE LOAD.** Owner's ruling. The engine guarantees the
numbering; today 131 of 136 happen to match, which is not a guarantee.

**5 of 25 — CASH ADVANCE AS A BILL PAYMENT** against that load's own bill. Owner's ruling: the driver
bill is created the instant a load is assigned, and the advance applies to it. Stamp
`linked_bill_id` and `linked_bill_payment_id` on the advance.

**6 of 25 — DRIVER ESCROW, 2100 SERIES.** A liability we owe the driver, per-driver sub-account
`2100-00-0NN`. **Nothing to do with Faro, factoring or reserves.** $25 default line in the creator, X
to remove, its own subtotal.

**7 of 25 — DEADHEAD PAY CALCULATION.** The engine computed $0.00 on 31 of 67 lines while the signed
PDFs print empty-mile dollars. Fix the calculation.

**8 of 25 — G-09 ITEM CATALOG + MAPPING ENGINE.** 4 items missing, 4 name-drift, 2 booked to the wrong
item. Nothing downstream is right until the catalog is.

**9 of 25 — DOCUMENT-EXPENSE INGESTION ENGINE.** Reads a signed settlement document and creates its
expense lines against the item catalog. You build the engine; the owner runs it.

**10 of 25 — SETTLEMENT-LINE CATEGORIZATION ENGINE.** Every line gets its item, posting account and
category. Never NULL.

**11 of 25 — THE 9000 ASK MY ACCOUNTANT PATH.** Nothing lands in 9000 silently.

**12 of 25 — THE 1090 UNDEPOSITED-FUNDS CLEARING ENGINE.** Day-close assertion 14 forbids residue.
Find why it accumulates and close the path.

**13 of 25 — THE 2510 DREAMLINE PAYABLE PAYMENT SIDE.** The liability accrues with almost no payment
side. Build the payment side.

**14 of 25 — THE 6300 BANK-SERVICE-CHARGE PATH.** $174K of gross movement for $220 net means the
engine churns. Stop the churn.

**15 of 25 — G-16, COMMISSION THE CHECK CREATOR.** Built, never issued a check: 0 stock settings, 0
check numbers, 0 checks, every expense `print_status='not_set'`.

**16 of 25 — RECLASSIFY, THE INVOICE / BILL_PAYMENT LINE REWRITE.** Reported "not rewritten" while the
ledger still moves — a silent half-write.

**17 of 25 — E-17 FLEET ROSTER INTEGRITY.** **The fleet is 16 trucks, not 43 rows**; 7 belong to
TRANSPORTATION. Every cost-per-mile and fleet baseline on the maintenance boards is wrong until this
lands.

**18 of 25 — THE SETTLEMENT CREATOR.** Owner's five requirements: QuickBooks subtotals as a real
computed chain (gross pay, additions, deductions as negative, escrow, advances, NET PAY); escrow
default 25 with X to remove; **all totals in a block at the bottom** so he verifies against the
AlwaysTrack settlement before posting; PDF button printing **both** company and driver documents
identical to `docs/design/boards/settlements/SettlementDocumentDesigns.html`; complete linkage both
directions. **The totals he verifies must come from the same code path the post writes** — do not
create a second calculator.

**19 of 25 — VERIFY THREE THINGS YOU REPORTED BUILT**, in code, with guards: load-cancel settles
revenue recognition; import resolves the operating entity from the source, never a default;
`verify-no-cross-entity-loads` holds.

**20 of 25 — MAINTENANCE MODULE, END TO END.** Engines E-14 PM auto-WO (ruled once daily), E-15 PM
due, E-16 work-order linkage — plus all 9 screens identical to
`docs/design/boards/maintenance/`. FleetTable is already drawn on 16 units.

**21 of 25 — CASH FLOW MODULE, END TO END.** Engines and screens.

**22 of 25 — THE ZERO-RESET ENGINE.** Deletes every created document and transaction — loads,
dispatches, stops, driver bills, settlements and lines, A/P bills and payments, invoices and lines,
advances, reimbursements, deductions, every expense including fuel, DEF and tolls, and every journal
entry and posting behind them. **GL to zero, tables to zero, proven by assertion in the engine.**
Discovers its own dependent tables. Refuses to run if the preservation engines have not recorded
their rows or if any preserved table would be touched. One transaction.
**MASTER DATA SURVIVES UNTOUCHED:** customers, drivers, vendors, locations, units, trailers,
equipment, chart of accounts, items, pay rate templates, factors, users.
**BUILT, TESTED ON A THROWAWAY BRANCH, LEFT UNRUN. The owner runs it, when he decides.**

**23 of 25 — THE TABLE-AND-STAMP SNAPSHOT, AS EXCEL.** Every document and transaction table: row
count, and for each, **which linkage stamps are populated and which are null** — operating company,
load, driver, unit, trailer, customer, vendor, settlement, invoice, journal entry, item, account,
class, void and sample flags. One sheet per domain, headers a human reads. This is how the owner
confirms the engines stamp correctly **before** he feeds 48 settlements by hand. A stamp column null
across the board is an engine defect and comes back onto this queue.

**24 of 25 — FRONTEND AUTODEPLOY.** `ih35-tms-web` has `autoDeploy: no` / `autoDeployTrigger: off`, so
a failed web build is silent — six merged engines were invisible for an hour. Wire it to deploy on
merge, or make a failed web build fail loudly on the bus.

**25 of 25 — THE 4 APPLIED-BUT-NEVER-COMMITTED MIGRATIONS.** 202614420000, 202614430000,
202614560000, 202614570000 — in prod's ledger, absent from git history. Recover the real applied SQL
from the ledger and commit the exact bytes. **Never reconstruct from memory.**
