# THE TRANSACTION LINKAGE LAW
**Owner-stated, 2026-09-30. BINDING ON EVERY SEAT. Supersedes any per-table convention.**
**Enforced by `scripts/verify-transaction-linkage-law.mjs` and by table triggers. Not a guideline.**

---

## 0. THE OWNER'S WORDS — the source, kept verbatim so it can never be paraphrased away

> "almost all transactions must be linked to a driver, truck, trailer, load, settlement, etc.
>  all fuel expenses must, and any type of tolls etc. over the road repairs as well. accidents etc.
>  repair bills must be linked as well as expenses etc. maybe not all repairs and maintenance to
>  loads or settlements because it might be done while the driver is home or the truck is waiting
>  for a driver."

Two tiers live inside that sentence, and he drew the line himself. Tier 1 is a truck that is
WORKING. Tier 2 is something done to an ASSET. The difference is not the amount or the vendor —
it is whether a trip was underway.

---

## 1. THE HUBS — every transaction links to a subset of these, never to none

    org.companies              the operating entity            ALWAYS
    mdata.loads                the trip                        TIER 1
    mdata.drivers              the person                      TIER 1
    mdata.units                the truck                       TIER 1 and TIER 2
    mdata.equipment            the trailer / other asset       when the asset is the subject
    driver_finance.driver_settlements   the pay run            when it reaches the driver's pay
    maintenance.work_orders    the repair job                  TIER 2, and TIER 1 road repairs
    mdata.customers            the payer                       revenue side
    mdata.vendors              the payee                       cost side
    catalogs.accounts          the GL account                  ALWAYS
    accounting.journal_entries the posting                     ALWAYS, once it hits the books
    docs.files                 the evidence                    whenever paper exists

---

## 2. TIER 1 — A TRUCK THAT IS WORKING
**REQUIRED: unit AND driver AND load. No exceptions. A NULL is a missing link, not a blank field.**

    fuel purchase · DEF · reefer fuel
    tolls · bridge crossings · customs / broker crossing fees
    scale and weigh fees · lumper · detention paid out · layover paid out
    over-the-road repair · roadside service · tow · mobile tire
    accident · citation · overweight fine · driver-caused damage
    escort / pilot car · permits bought for a specific trip

**Why there is no exception:** a truck that burns fuel is moving. Moving means a driver and a load.
If the load is genuinely unknown the answer is to FIND IT, not to write NULL. A row that cannot
name its trip cannot enter cost-per-mile, cannot enter MPG, and cannot be attributed to a driver.

**Bobtail / deadhead with no revenue load** is the one shape that looks like an exception and is
not: it still has a unit and a driver, and it is linked to the load it is REPOSITIONING FOR.
If there is no such load, it links to the settlement period instead, flagged `no_load_reason`.
Never left blank.

---

## 3. TIER 2 — SOMETHING DONE TO AN ASSET, NOT TO A TRIP
**REQUIRED: unit (or trailer / equipment). Load and settlement are OPTIONAL and MUST NOT BE FORCED.**

    shop PM (PM-A, PM-B) · in-house repair · parts consumed on a work order
    tires replaced at the yard · alignment · brake job
    annual DOT inspection · state inspection · emissions
    truck wash · detailing
    insurance premium on a unit · registration · IRP · IFTA decal · unit-level permits
    depreciation · lease or note payment on the unit
    warranty work · recall work

**THE OWNER'S OWN REASON, AND IT IS THE CORRECT ONE:** the truck may be parked with the driver at
home, or waiting on a driver. Forcing a load onto that expense INVENTS A TRIP THAT NEVER HAPPENED.

**A guard that demanded a load here would be worse than the gap it closes** — it would push seats
to staple on the nearest load to go green, and the mileage, the cost-per-mile and the driver's
integrity numbers would all be quietly wrong. So the guard FAILS THE DEMAND, not the row: any code
requiring load_id on a Tier 2 object is itself the defect.

---

## 4. TIER 3 — THE COMPANY, NOT THE FLEET
**REQUIRED: company and GL account only. A unit link is a defect here, not an improvement.**

    office rent · utilities · software · bank fees · interest · professional fees
    general liability premium · owner draw · payroll for non-drivers

Do not attribute these to a truck to make a cost-per-mile look complete. A company cost spread
onto units is a fabricated allocation unless the owner has stated the allocation basis.

---

## 5. ROUTING — FORWARD
Every money row carries, at write time, the FK to each hub its tier requires. Forward routing is
the write. It is enforced twice:
  1. the guard, which stops the next commit
  2. a deferrable constraint trigger, which stops a row written by hand, by a script, or by an
     integration — because a guard only sees code, and money arrives by other doors

---

## 6. REVERSE ROUTING — AND THIS IS THE HALF THAT GETS FORGOTTEN
**Every hub must be able to answer, completely, "show me everything that touched me."**

    a UNIT      -> every fuel purchase, repair, WO, part, toll, accident, insurance premium,
                   registration, inspection, depreciation entry and lease payment, for its life
    a DRIVER    -> every load, settlement, advance, deduction, fuel purchase made on his card,
                   report he filed, complaint against him, accident, citation, escrow movement
    a LOAD      -> every revenue line, every cost line, driver pay, fuel burned, tolls, crossings,
                   detention, the invoice, the factoring advance and the cash that settled it
    a SETTLEMENT-> every load, every additional payment, every deduction, every advance recovered
    a TRAILER   -> every repair, tire, inspection, damage, and the loads it carried
    a VENDOR    -> every bill, expense, payment, work order and part supplied
    a CUSTOMER  -> every load, invoice, payment, dispute and credit

**A link that resolves one way and not the other is HALF A LINK and counts as unlinked.** A fuel
row carrying unit_id is worthless if the unit page cannot list that fuel row. Reverse routing is
proven by query, per hub, not asserted.

---

## 7. THE GL IS PART OF THE LINKAGE, NOT A SEPARATE STEP
Every transaction resolves to a GL account through the object's TYPE, never by free text:
  vendor type + expense category -> expense account -> P&L line
  unit-level capital spend       -> fixed asset account -> balance sheet, and its depreciation
  customer type + charge type    -> revenue account -> P&L line
  driver pay component           -> labor / advance-receivable / escrow-liability
A transaction whose type does not resolve to an account is HELD for coding, never posted to a
suspense account and never guessed. Categorization is automatic BECAUSE the types are wired —
that is the whole point of typing customers and vendors.

---

## 8. WHAT "LINKED" MEANS — the test, so no seat can argue it
A transaction is LINKED when all four hold:
  1. every FK its tier requires is NOT NULL
  2. every one of those FKs resolves to a live, non-voided row in the hub table
  3. the hub can list this transaction back (reverse routing, §6)
  4. it carries its GL account, and that account was reached by type, not typed by hand

Three of four is not linked.

---

## 9. MEASURED STATE AT THE MOMENT THIS LAW WAS WRITTEN
Live, br-fancy-credit-akjnd07a, USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`, 2026-09-30:

    fuel.fuel_transactions   177 live   load 177/177  driver 177/177  unit 125/177  trailer  71/177
    accounting.expenses      549 live   load 549/549  driver 343/549  unit 332/549  trailer 295/549
    expenses with no link of any kind: 0

726 of 726 money rows carry a load — the trip spine is solid. **The open hole is the truck: 52
fuel purchases name a load and a driver and no unit.** Assigned to CC-3 as T-22, resolved from the
load's assigned unit and the driver's assignment window — never forced.

---

## 10. STANDING
This law is versioned in the repo so it cannot be lost with a chat session. It is referenced from
`claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md`. Any seat proposing an exception posts it to
the Lead with the transaction type and the reason, and the Lead rules in writing. No seat grants
itself an exception by writing NULL.

---

# LINKAGE LAW §10-B — THE COMPLETE TARGET LIST (owner law 2026-10-01 11:25 CT / 16:25Z — "update all law docs so nothing is ever left out again")

Every record a coder creates, migrates, posts or renders links BOTH WAYS (forward FK on the record, reverse drill from the target) to EVERY applicable target below. A block that does not declare each target as LINKED or N/A(reason) is not done. Silence is a defect. This list is canonical in docs/trackers/01-LINKAGE-LAW.md and mirrored verbatim into every law doc; a change is made in all of them in the same commit.

**Parties:** customer (mdata.customers) · vendor (mdata.vendors) · driver (mdata.drivers; drivers-as-vendors where they are paid) · factoring company (vendor) · lessor/lessee (org.companies + vendor/customer) · user/actor (identity.users).
**Assets & operations:** unit/truck (mdata.units) · trailer/equipment (mdata.equipment) · load (mdata.loads, canonical hub) · stop (mdata.load_stops) · tour (dispatch tours) · pre-settlement link (presettlement_link) · settlement (driver_finance.driver_settlements) · driver bill (driver_finance.driver_bills) · work order (maintenance.work_orders) · fuel transaction (fuel.fuel_transactions) · insurance policy / claim · safety event / incident · legal contract / contract instance / legal matter · lease contract (accounting.lease_contract) · document (docs.files / documents.attachments).
**Money:** invoice + invoice line (A/R subledger; accounting.invoices / invoice_lines) · customer payment + application · bill + bill line + bill payment (A/P subledger; accounting.bills / bill_lines / bill_payments) · expense + expense line · chart-of-accounts account (catalogs.accounts; income / expense category / control role) · item or product/service (items) · class (catalogs.classes) · journal entry + postings (accounting.journal_entries / journal_entry_postings, source_transaction_type + id + line id) · bank line (banking.bank_transactions match + categorization) · deposit · transfer · factoring purchase / advance / reserve (escrow + cash) / fee / chargeback · escrow / cash advance / deduction / reimbursement · period (open/closed).
**Stamps (every record):** created_at + created_by · updated_at + updated_by · the business dates that apply (pickup, delivery, issue, due, sent, signed, start, end, commencement, posted, paid, cleared, wire, purchase, voided, reinstated, closed, locked, approved) · operating_company_id on every table with FORCED RLS (identity.is_lucia_bypass() OR app.operating_company_id) · one audit row (audit.audit_events / audit.row_changes, WORM) per mutation · trace_no / trace_key where the table carries them.
**Mechanics:** server-generated display ids · pickers are ReferenceSelect with the full catalog dropdown + inline +Create (customer, vendor, driver, unit, trailer, account, item, class) · multi-select where the document covers several assets (a lease covers many units and trailers) · MoneyInput for money, DatePicker for dates · EntityLink on every rendered id · click on any payment received/made opens that transaction and its bank match (QuickBooks parity) · PDF print design per document type (contract, lease, invoice, settlement, purchase report) created, printable and sendable from the app · FEED GATE (driver_finance.feed_intakes / feed_intake_checks) runs before a fed subject closes.
**Never:** payroll.* · settlement.* · bank.* · maint.* · accounting.qbo_* · mdata.qbo_vendors · catalogs.cancellation_reasons (RETIRE tables) · test/sample/demo rows in USMCA · a money line without an account · a document without its line · a status without its stamp · a mutation without its audit row.
