# IH35-TMS — CURRENT STATE AND LAW
**The one document to read first. Written 2026-09-02. Replaces the architecture, master handoff,
project knowledge, blueprint, law-of-the-land and standing-directive documents, all of which described
a phase that is over.**

Every number in section 6 was read from the live production database on 2026-09-02. Every code
reference was read from the repository at that date. Nothing here is from memory.

---

## 1. SCOPE

**USMCA is the only company in scope.** `5c854333-6ea5-4faa-af31-67cb272fef80`.

TRANSPORTATION (`91e0bf0a-133f-4ce8-a734-2586cfa66d96`) and TRUCKING
(`b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e`) are **frozen**. Do not read them. Do not write them.
Do not report on them. Any document describing their cutover, opening balances or parallel books
is history, not instruction.

Production is Neon project `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`.
Every read requires `SET LOCAL app.bypass_rls = 'lucia'`. The Neon connection is **read-only by
design** — do not work around it.

---

## 2. STANDING OWNER DECISIONS

These are rulings, not findings. They do not expire and are not re-litigated.

| Decision | Ruling |
|---|---|
| Who decides | **There is no CPA.** The owner is the sole financial decision authority. |
| Capitalize threshold | **$7,000.** At or above capitalizes; under expenses. Confirmed 2026-09-02. |
| USMCA opening balances | **Zero.** TMS-authoritative from day one, never part of the QuickBooks clone. **There is no opening entry to make.** |
| Bank history to categorize | **December 2025 through July 2026**, by the owner. |
| Escrow | **Wiped. Begin from zero.** Zeroed by void, never deleted. |
| Sample and demo data | **All removed**, insurance samples included. Marked and quarantined, never destroyed. |
| QuickBooks write-back | **Never.** Not now, not later. Reconcile only. |
| GL posting flags | **Intentionally ON.** This is the design, not a misconfiguration. Never raise it as a defect. |
| Period close | **Owner only.** Nobody else closes a period. |
| Deletion | **Nothing is ever permanently deleted.** Every void and cancellation keeps a register. |
| Neon migrations | **Coders apply them.** The owner does not hand-apply. |
| Feature flag flips | **Owner only.** |
| Load number | **Plain.** No letter prefix, no date block. |
| Driver pay basis | **Short miles.** The customer is billed the typed rate; practical miles only compute revenue per mile. |
| Accessorial income | **Account 4200 Accessorial / Detention Income**, ratified. 4210 Detention, 4220 Layover, 4230 Lumper, 4240 TONU sit under it. |
| Company settlement grain | **One settlement number covering many loads**, with a start and end date. The mirror of the driver settlement. Source: the owner's own Company Settlement 5753. |
| Plain English | Every operator-visible surface is proper English. No underscores, no machine names, no all-capitals data. Wire names stay in the table and the payload. |

---

## 3. ACCOUNTING ARCHITECTURE

**Parallel books.** The system runs its own general ledger. QuickBooks is the accountant's
environment and is never written to.

**Two-event revenue latch.** Delivery earns: debit Unbilled Revenue, credit Line-haul Income.
Conversion creates the receivable: debit Accounts Receivable, credit Unbilled Revenue. Both fire at
delivery because the proforma converts there.

**Expense versus bill.** Paid now: debit expense, credit bank. Owed: debit expense, credit Accounts
Payable, cleared later by a bill payment. A record with no payment account **and** no vendor is an
orphan and raises `PostingEngineError`.

**Factoring is secured borrowing with recourse** (ASC 860). Accounts receivable is never
derecognized. It closes only when the customer pays the factor.

**Three dates, three different columns, three different purposes.**

| Date | Column | What it drives |
|---|---|---|
| Incurred / earned | `bill_date`, `transaction_date` | Load margin, settlement, profit and loss |
| Due | `due_date` | Cash flow, accounts payable aging |
| Paid / cleared | payment date | Reconciliation only |

A cost is recognized exactly once, on the day it was incurred. A payment clears a liability and never
adds cost to a load. Any code path where a bill payment adds cost to a load is a double count.

**Driver chargebacks are created by the event, not by the company's payment terms**, and are always
pending until an authorized person approves them. Never automatic. Never silent.

---

## 4. CANONICAL TABLE LAW

Write to the left. Never write to the right. Repoint the **writer**; never drag the FK.

| CANONICAL — write here | RETIRED — never write |
|---|---|
| `driver_finance.*` | `payroll.*` and `settlement.*` |
| `mdata.qbo_*` | `accounting.qbo_*` |
| `banking.*` | `bank.*` |
| `maintenance.*` | `maint.*` |
| `mdata.vendors` | `mdata.qbo_vendors` |
| `catalogs.load_cancellation_reasons` | `catalogs.cancellation_reasons` |
| `mdata.loads` — the canonical hub | |

**Hub tables every record links back to:** `org.companies`, `identity.users`, `mdata.drivers`,
`mdata.units`, `mdata.loads`, `catalogs.accounts`, `mdata.customers`, `maintenance.work_orders`,
`mdata.vendors`, `accounting.journal_entries`, `docs.files`, `mdata.equipment`.

Every record links **both ways** to its financial primitives and its operational modules — safety,
insurance, legal, maintenance, dispatch, driver, unit, trailer, load — plus the hub tables.
**A block with no linkage declaration is not done.**

Every new table carries `operating_company_id` with FORCED row level security and the 0065 grants
pattern. Migrations are idempotent and CREATE-only. Never DROP.

`mdata.units` has **no** `operating_company_id` column — scope unit queries through the row that
carries the company.

Primary key column names are not uniform. Most tables key on `id`. These key on `uuid`:
`dispatch.cargo_sensor_readings`, `maintenance.brake_projections`, `maintenance.tire_projections`.

---

## 5. NUMBERING

The load number is the spine. Everything is cut from it.

```
Load 12225
  -> proforma invoice 12225          created at PICKUP, converts to invoice at DELIVERY
  -> expenses 12225, 12225-1, 12225-2   the first is the bare load number
  -> driver bill 12225                  equals the load number
  -> pre-settlement -> close -> driver settlement AND company settlement
```

Every transaction creator has an **empty, editable number box**, exactly as QuickBooks does. Typed
value wins verbatim. Blank means the system assigns.

**Two numbers on a vendor document, always.** Ours and theirs.
- Expense: `expense_number` is ours, `vendor_document_number` is the vendor's receipt.
- Bill: `display_id` is ours (`BILL-2026-00001`), `bill_number` is the vendor's invoice.

Duplicate payment is already prevented by two live partial unique indexes —
`uq_expenses_tms_native_vendor_document_number` and `uq_bills_tms_native_vendor_bill_number`.
Do not build a second control.

---

## 6. LIVE STATE, 2026-09-02

**The books.** 415 bank transactions, of which **8 are categorized** and **28 are dated in the
future** (furthest 2027-07-05). 176 drivers. 1,232 customers. 8 insurance policies. 3,375 seeded
lanes. **One load, and it is cancelled.** Zero expenses. Zero bills.

**The software.** 584 screens (437 of them not deep-linkable), 150 modals and drawers, 2,136
endpoints, 1,046 backend files that touch the database, 634 tables and views across 76 schemas.

**Nobody has clicked Book Load in a real browser.** Every test so far is a test the software wrote
about itself.

---

## 7. WHAT IS BEING BUILT

The queue is `GO-19-BUILD-QUEUE-AND-ORDER-2026-09-02` — twenty vertical slices in dependency order.
The eight half-built features are specified in `GO-20-BUILD-THE-EIGHT-FEATURES-2026-09-02`.

**Every fix is a vertical slice**: its own table change, backend rule, endpoint, screen, guard and
proof. It is done when somebody clicks it in a browser and sees the right thing happen. No layer
work. No partial slices.

First three, and why they are first: the load number becomes plain (every child number is cut from
it, and after the first real load those numbers are on live money); the 34 fake bank rows come out
(real matching is about to start); the child numbers follow.

---

## 8. OPERATING RULES FOR SEATS

- No seat creates money records in USMCA production, including for proof.
- Migration lanes: CC-1 hours 00–11 UTC, Cursor hours 12–23 UTC. One author per migration.
- Only CC-2 writes the verified flag.
- Never trigger a deploy. Cursor only.
- `ignacio.munoz@ih35trucking.net` must never be deleted, suspended or merged — embezzlement evidence.
- Mask secrets by pattern: `npg_`, `napi_`, `GOCSPX-`, `rnd_`, `sk-`.
- Never paste `DATABASE_URL` or `DATABASE_DIRECT_URL` into a message.
- Evidence before "done". Green CI is the floor, not the proof. A screenshot beats an assertion.

---

## 8b. ABSORBED FROM THE RETIRED MEMORY ENTRIES (2026-09-02)

These were carried inside memory entries that were deleted because their headline facts had gone
stale. The rules themselves stand.

**Entity independence is a HARD rule.** TRANSP, TRK and USMCA are completely independent legal
entities — different federal tax IDs, different owners. They share nothing. They are customers and
vendors to each other. No commingling of any entity-scoped data: chart of accounts, vendors,
customers, journals, settlements, uncategalized accounts. Any constraint, index or resolver on
entity-scoped data must be per-entity, never global.

**`catalogs.accounts` is correctly per-entity** — verified live: it carries `operating_company_id`,
RLS is enabled **and forced**, and both policies (`accounts_entity_select`, `accounts_entity_write`)
are scoped. The old "the chart of accounts is global" finding is cleared and must not be re-raised.

**Twelve do-not-touch modules:** Home, Maintenance, Dispatch, Safety, Accounting, Banking,
Factoring, Lists, Reports, Form 425C, Electronic Logs, Driver App. The other six — Customers,
Vendors, Legal, Documents, Users, Help — may be iterated on, additive-only.

**Additive-only.** Never delete or remove modules, pages, sidebar entries, sections, cards,
indicators, fields, columns, tabs, routes or features. Only add. The sidebar is locked at 18 items.
If something is redundant, add the consolidation alongside and leave the original. The only
exception is the owner saying "remove X" in words.

**Post-merge forensic five-point before anything is called shipped:** the merge commit is on main,
CI is green, the deploy is live, production state reflects it, and nothing regressed. Surface UI is
not done. Green CI is not done. Saved to memory is not done.

**Fix-then-flip, always.** Never enable a money flag while a known posting defect is unfixed.
**Maker is not checker on the general ledger** — the coder builds and runs the tests; an independent
seat verifies live. The owner is the sole decisionmaker on go-live. There is no approval gate, no
owner label, no hold: proof is the safeguard, not approval.

**Research before building.** For any module, research how QuickBooks, NetSuite, McLeod and Alvys
actually do it — fresh, never from memory — before proposing a design. The audit phase is over; the
research discipline is not.

---

## 9. KNOWN TRAPS

These have each produced a wrong answer before. Check them.

**The false-empty trap.** `pg_constraint contype='u'` **misses partial unique indexes.** Use
`pg_index WHERE indisunique`. This produced three wrong answers in one week — including a report that
duplicate-payment protection did not exist when it did.

**Silent empty versus missing.** A screen that shows nothing without saying why is a defect. The Fuel
Planner is the reference implementation: it returns null rather than zero, prints on screen that
values are unavailable and are not zero, returns a refusal rather than an empty page, and labels its
fallback as a fallback.

**Document numbering reuses on hard delete.** Seven generators in `accounting/display-id.ts` use
`MAX()+1`. They are safe only because voided rows are retained and an advisory lock serializes them.
A hard delete from any of those tables reuses a number.

**Team loads are 20.4% of history.** Revenue per mile is per driver; driver pay is the combined
total. Dividing without halving doubles the miles.

**Short miles include deadhead.** Driver pay basis is roughly 0.9718 × (loaded + empty). It is not a
fixed ratio — only 8.7% of loads land within 1% of it.

---

## 10. WHAT THIS DOCUMENT REPLACED

Superseded and removed from the project on 2026-09-02: the architecture blueprint, master project
knowledge, master handoff, law of the land, operating doctrine, standing directives, module audits,
guard findings, block specifications, coder work orders and status snapshots from June, July and
August. That phase — auditing the software and writing blocks against it — is over. The work now is
the build queue in section 7.

The full historical record remains in the repository under `docs/`. Nothing was lost; it was moved
out of the working set so it stops being re-read on every message.
