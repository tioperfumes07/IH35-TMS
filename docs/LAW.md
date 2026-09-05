# IH35-TMS — CURRENT STATE AND LAW
**The one document to read first. Written 2026-09-02, live-verified 2026-09-03 21:30.**

Every number in section 6 was read from live production. Every code reference was read from the
repository. Nothing here is from memory.

---

## 0. THE FINISH LAW — owner order, 2026-09-03. PERMANENT AND STRICT.

**A seat that begins a task finishes it before it begins anything else.**

Coding, wiring, building, migrating, sweeping — whatever it is, once a seat starts, that task owns
the seat until it is COMPLETE. Not "batch 6 of 11." Not "REMAINING: the tail." Complete.

**Complete means the definition of done in §0 of the standards skill:** the file exists, the route is
mounted, the migration is applied on production, the column is populated, the guard is written AND
wired into `scripts/verify-steps/`, and there is live proof. Merged is not done. CI-green is not
done. A surface that renders is not done.

**The one permitted interruption.** If another seat is blocked and needs a quick fix, the seat may
stop, make that fix, finish it to the same standard, and then **return to the original task
immediately**. It does not pick up a third thing. It does not start something new because the
original got boring or hard.

**What this law forbids, by name:**
- Leaving a numbered batch series half-run and moving to another module.
- Reporting `REMAINING:` on your own task and then taking a different assignment.
- Opening a new finding class while your current one is unclosed.
- "Parked", "deferred to next pass", "will pick up later" — on your own work.
- Splitting one task across seats mid-flight because it got long.

**If a task genuinely cannot be finished** — it needs an owner decision, another seat's migration
lane, or a column that does not exist — the seat says so IN WRITING, names the exact blocker, and
only then may it take new work. A blocker that cannot be quoted does not exist.

**Why this is law.** Six seats each 70% finished is zero finished features and six surfaces nobody
can trust. One seat finishing one thing is one thing that works. The register is long because work
was started, reported, and abandoned at the last 20%.

---

## 0b. SEAT OWNERSHIP — owner order, 2026-09-03. PERMANENT.

**One seat owns one surface. It builds the whole block — design, code, money wiring, guards, live
proof. No job is split across seats.**

**FIND IT, FILE IT, DO NOT FIX IT.** A seat WILL find a genuine bug outside its surface. Fixing it
is a violation **even when the fix is correct**, because the owner of that file gets an edit they
did not make in a file they are mid-way through. Post the finding to the owning seat and keep going.

| Seat | Surface | Money |
|---|---|---|
| Cursor | `pages/dispatch/**`, `components/dispatch/**`, `book-load.service.ts` | Yes |
| CC-1 | `pages/accounting/**`, `backend/accounting/**`, `dispatch/mileage/**`, `lane-mileage.service.ts` | Yes |
| CC-2 | `pages/banking/**`, `backend/banking/**` | Yes |
| CC-3 | `pages/safety/**`, `backend/compliance/**` | **No** |
| Codex | `pages/maintenance/**`, `backend/maintenance/**` | **No** |
| Cascade | `pages/lists/**`, `pages/reports/**` | **No** |

Enforced by `.github/CODEOWNERS` plus `scripts/verify-steps/verify-seat-surface-ownership.mjs`.
One escape hatch only: `SURFACE-BREACH-AUTHORIZED: <owner seat> <reason>`, which the owning seat
must post first.

**Why this is law.** `BookLoadModalV4.tsx` took **28 commits in 48 hours from four seats** — one of
them (`5a147c0f0`, +92 −128) literally titled "Book Load layout restore," a seat undoing another
seat's field move. `RoundTripsTimeline.tsx` was built by Cursor on Aug 29 (+164 new) and cut by
another seat on Aug 30 (+79 −123). That is the regression mechanism.

**The money contract binds the three money seats:** `REFERENCE/MONEY-CONTRACT-ALL-SEATS.txt`,
shipped 2026-09-03 in `docs/bus/packets/2026-09-03-16-P0-SEND/`. Integer cents. Every GL write
through `journal-entries.service`. Double entry or it does not post. Two-line driver pay.
Attribution rungs. Every money row traces to a document. **Where surfaces meet, the downstream seat
READS — it does not re-derive.**

---

## 1. SCOPE

**USMCA is the only company in scope.** `5c854333-6ea5-4faa-af31-67cb272fef80`.

TRANSPORTATION (`91e0bf0a-133f-4ce8-a734-2586cfa66d96`) and TRUCKING
(`b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e`) are **frozen**. Do not read them. Do not write them.
Do not report on them.

Production is Neon project `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`.
Every read requires `SET LOCAL app.bypass_rls = 'lucia'`. A bare 0 under forced RLS is **MASKED,
not empty** — re-run before it is a verdict.

**Pre-flight before any built/done/pending claim:** list open PRs AND branches (work is usually in
an open PR, never judge from `main` alone), then the live DB count under bypass. Name which you ran.

---

## 2. STANDING OWNER DECISIONS

Rulings, not findings. They do not expire and are not re-litigated.

| Decision | Ruling |
|---|---|
| Who decides | **There is no CPA.** The owner is the sole financial decision authority. No `JORGE-APPROVED` label, no HOLD gate. Never re-introduce them. |
| Capitalize threshold | **$7,000.** At or above capitalizes; under expenses. Confirmed 2026-09-02. Supersedes the $2,500 in the older standards skill. |
| USMCA opening balances | **Zero.** TMS-authoritative from day one. There is no opening entry to make. |
| **USMCA ledger cleared** | **Deliberate, by the owner, before go-live.** USMCA's entire general ledger was voided and cleared so the entity begins genuinely clean — verified 2026-09-03: expenses 0, bills 0, invoices 0, journal entries 0, fuel transactions 0. **This is a decision, not a gap.** Nothing is missing and nothing is to be recovered. Do not hunt for it, do not migrate history in, do not raise it as a finding. The first USMCA transaction will be the owner's first hand-entered load. |
| **Guards before the first row** | Because the ledger is empty by design, **every money rule is enforced from row one rather than retrofitted.** `unit_id` mandatory on expenses, double entry, integer cents, two-line driver pay, attribution rungs — the guards land BEFORE the first transaction exists. The 27,070 frozen-entity expenses carrying no truck, no load and no driver on any row are the demonstration of what retrofitting costs. |
| **AlwaysTrack historical exports** | **Reference only, never import.** All seven load-history exports are "Invoiced By IH35 Transportation, LLC" — a frozen entity. They usefully describe field SHAPE and trip patterns; they are not USMCA data and must never be written into it. **There is no USMCA backfill of any kind** — not expenses, not tours, not lanes. |
| Bank history to categorize | **December 2025 through July 2026**, by the owner. |
| Escrow | **Wiped. Begin from zero.** Zeroed by void, never deleted. |
| Sample and demo data | **All removed.** Marked and quarantined, never destroyed. |
| QuickBooks write-back | **Never.** Reconcile only. |
| GL posting flags | **Intentionally ON.** Design, not misconfiguration. Never raise as a defect. |
| Period close | **Owner only.** |
| Deletion | **Nothing is ever permanently deleted.** Every void keeps a register. |
| Neon migrations | **Coders apply them.** The owner does not hand-apply. |
| Feature flag flips | **Owner only.** |
| Load number | **Plain.** No letter prefix, no date block. |
| Driver pay basis | **Short miles.** Two lines always — loaded and empty. `rate_empty_per_mile_cents` is its own config value; it equals the loaded rate today and that equality is never hardcoded. |
| **Driver advances — the three paths** | Owner ruling 2026-09-04, verbatim: *"we never send fuel advance to a driver, very rarely from the company. the broker might send us a cash advance to the driver, for the diesel fuel and deducts from the invoice. or it might send the driver money and we apply it as a bill payment to the driver. the fuel advance from us to the driver is a company expense. he is a company driver, not an owner operator."* **Three distinct events, never collapsed.** (1) **Broker → us**, diesel for the driver, deducted from the invoice — `accounting.broker_advances` category `diesel`; applies to `invoices.broker_advance_applied_cents`, reduces what the factor purchases, never the invoice face, never `driver_finance.*`. BUILT AND CORRECT — do not rewrite. (2) **Broker → the driver directly**, applied by us as a bill payment against his driver bill — the receipt side reduces what the factor purchases exactly as (1), the disbursement side settles part of `driver_finance.driver_bills`, both linked to the SAME `broker_advances` row by `instrument_reference`. One instrument, two sides, one trace. **NOT BUILT — this is the gap.** (3) **Us → the driver**, a fuel advance: **a COMPANY EXPENSE.** Rung 1 direct trace, DR fuel expense CR bank, and that is the whole entry. **There is no receivable from the driver, no `outstanding_balance`, no `recovered_in_settlement_id`, no amortization** — he is a B1 employee, not an owner-operator. For USMCA `economic_routing` resolves to `load_expense`; `driver_settlement` must be unreachable for a company driver, enforced at the SERVICE boundary, never only in React. |
| Deadhead | **A trip property, never a lane average.** Computed from the truck's previous delivery, chained across all entities. Blank when unknown — never zero. **Attribution settled 2026-09-03: deadhead belongs to the load that PICKS UP** — pickup-side matched 58/117 against the owner's own Empty Mi column, delivering-side 9/113. |
| **St. Miles is not shortest miles** | AlwaysTrack `St. Miles` = `L.Miles` + `E.Miles`, verified on 10,400 of 12,393 reference loads. **It has no destination column.** Mapping it to `miles_shortest` pays deadhead twice — once at the loaded rate inside the load line, again on the deadhead line. This caused the 2,142 impossible lanes in `catalogs.lane_mileage`. |
| **The round trip is the unit of settlement** | NB opens · TR extends (0..n) · SB closes it at Laredo. **Open = pre-settlement** (live revenue and costs). **Closed = settlement** (frozen, posts to GL, company and driver readouts). **Load costs is the cost column of the pre-settlement, not a separate feature.** Status is three states: `open` → `ready_to_close` → `closed`. Assignment is automatic and immediate; **closing is confirmed by a human, never automatic.** |
| **A tour has no unit** | A truck can break down mid-trip and dispatch swaps vehicles — still one trip, one settlement, two trucks. **The unit lives on the leg.** The real constraint is that no unit may hold two loads with overlapping active windows, enforced on loads. A trip may have more than one driver; settle each for the legs they drove, all linked to one company settlement. |
| Expense numbering | First cost on a load is the **bare load number**, then `-1`, `-2`. Single digit, never zero-padded. Derived from a per-load counter, never typed. |
| Accessorial income | **4200 Accessorial / Detention Income.** 4210 Detention, 4220 Layover, 4230 Lumper, 4240 TONU beneath it. |
| Company settlement grain | **One settlement number covering many loads**, with start and end dates. |
| Plain English | Every operator-visible surface is proper English. No underscores, no machine names, no all-capitals data. |
| Repository visibility | **`tioperfumes07/IH35-TMS` is PUBLIC, permanently.** Private metered Actions minutes, throttled CI and bottlenecked the merge queue — that bottleneck forced the FAST-MERGE 4-minute law. **Closed. Never re-raise it in any form.** What stays in scope: never commit a real secret. A 2026-09-02 scan found zero real token bodies in tracked files. |
| Column naming | `_id` is the house convention — 1,519 columns versus 79 `_uuid`; `driver_id` 125 tables versus `driver_uuid` 10. `bills.driver_id` is CORRECT. Renaming `expenses.driver_uuid` is optional and owner-decided. |
| Mileage engine | **Self-hosted OSM routing.** Certified at 0.67% median absolute error against 7,601 reference loads. **PC\*MILER is not needed and not the cause of anything** — `trimble-maps-client.ts` is geocoding only, the 30-day trial expired, `PCMILER_ENABLED` defaults off. **Google is excluded on licence** — its terms cap caching at 30 days (§19.3) and bar use with a non-Google map (§19.2); a mileage that pays a driver must be stored permanently. |

---

## 3. ACCOUNTING ARCHITECTURE

**Parallel books.** The system runs its own general ledger. QuickBooks is never written to.

**Two-event revenue latch.** Delivery earns: DR Unbilled Revenue, CR Line-haul Income. Conversion
creates the receivable: DR Accounts Receivable, CR Unbilled Revenue.

**Expense versus bill.** Paid now: DR expense, CR bank. Owed: DR expense, CR Accounts Payable,
cleared later by a bill payment. A record with no payment account **and** no vendor is an orphan and
raises `PostingEngineError`.

**Factoring is secured borrowing with recourse** (ASC 860). A/R is never derecognized.

**Three dates, three columns, three purposes.**

| Date | Column | What it drives |
|---|---|---|
| Incurred / earned | `bill_date`, `transaction_date` | Load margin, settlement, profit and loss |
| Due | `due_date` | Cash flow, accounts payable aging |
| Paid / cleared | payment date | Reconciliation only |

A cost is recognized exactly once, on the day incurred. A payment clears a liability and never adds
cost to a load. Any path where a bill payment adds cost to a load is a double count.

**Cost attribution — use the highest rung a cost can reach.** Never skip to allocation because it is
easier.

| Rung | Method | Applies to |
|---|---|---|
| 1 | **Direct trace** | Fuel, tolls, scales, repairs, lumper, permits. One truck, one place, one date. Nothing to split. |
| 2 | **Trace to the leg**; the leg carries the truck | Driver pay and revenue. Each leg has its own linehaul and miles. |
| 3 | **Allocate**, basis MILES | Only costs that genuinely belong to the whole trip. Very few. |

**Fixed monthly costs — insurance, plates, the truck note — do not belong on a trip at all.** They
are period costs on the unit. Forcing them into a settlement makes trip margin meaningless.

**The test for any attribution rule:** could you point a CPA at a document, or only at a formula you
chose? Point at a document.

**Driver chargebacks are created by the event, not by payment terms**, and stay pending until an
authorized person approves them. Never automatic, never silent.

**Load-required is category-driven, not a table default.** `accounting.line_category_load_required`
holds the 9 categories (diesel, DEF, toll, scale, lumper…) that demand a load. `load_required`
defaults **false** on both `bill_lines` and `expense_lines` — blanket true would force a load onto
office supplies. Enforced by trigger `enforce_load_fk_invariant` on both tables.

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

**Hubs every record links back to:** `org.companies`, `identity.users`, `mdata.drivers`,
`mdata.units`, `mdata.loads`, `catalogs.accounts`, `mdata.customers`, `maintenance.work_orders`,
`mdata.vendors`, `accounting.journal_entries`, `docs.files`, `mdata.equipment`.

**A block with no linkage declaration is not done.**

Every new table carries `operating_company_id` with FORCED RLS and the 0065 grants pattern.
Migrations are idempotent and CREATE-only. Never DROP.

`mdata.units` has **no** `operating_company_id` — scope through `owner_company_id` /
`currently_leased_to_company_id`. The Fleet screen showing all 196 units to USMCA is a **scoping
defect, not a data problem.** Never delete units to fix it.

**WORM delete refusal** — `trg_worm_refuse_delete` → `refuse_financial_row_delete()` is present on
all 7 document-number tables: bills, credit_memos, expenses, factoring_advances, invoices, payments,
vendor_credits. **Verified complete 2026-09-03.** Never author a second refuse function.

**81 files write `accounting.journal_entries`; only 26 go through `journal-entries.service`, and 13
use raw INSERT.** Those 13 are grandfathered only until touched — a seat editing one converts it in
the same PR. No new raw INSERTs.

---

## 5. NUMBERING

The load number is the spine.

```
Load 12225
  -> proforma invoice 12225          created at PICKUP, converts at DELIVERY
  -> expenses 12225, 12225-1, 12225-2   the first is the bare load number
  -> driver bill 12225                  equals the load number, no B- prefix
  -> pre-settlement -> close -> driver settlement AND company settlement
```

Every transaction creator has an **empty, editable number box**, as QuickBooks does. Typed value
wins verbatim. Blank means the system assigns.

**Two numbers on a vendor document, always.** Ours and theirs.

Duplicate payment is prevented by two live **partial** unique indexes —
`uq_expenses_tms_native_vendor_document_number` and `uq_bills_tms_native_vendor_bill_number`.
Do not build a second control.

Seven generators in `accounting/display-id.ts` use `MAX()+1`. Correct under never-delete, protected
by advisory locks and the WORM triggers. **Do not replace with sequences.**

`expense-number.ts:8-14` is **correct** — challenged 2026-09-02, challenge withdrawn. Leave it alone.

---

## 6. LIVE STATE — 2026-09-03 21:30, under `bypass_rls='lucia'`

**USMCA's ledger is empty BY DESIGN (see §2). Masters are loaded; transactions are not.**

```
USMCA MASTERS — loaded and real
  customers  1,232      vendors    603      drivers   167
  accounts     144      locations    9      units owned/leased  43
  telematics: 43 USMCA-tied units, 505,235 pings

USMCA TRANSACTIONS — zero, deliberately
  loads 1  (13508, a wizard test DRAFT — no unit, no driver. Report, never delete.)
  expenses 0   bills 0   invoices 0   journal_entries 0   fuel_transactions 0
  settlements 0   posting_batches 0   load_id_reservations 0
  bank_transactions 395, categorized 0        <- owner categorizes these

EVERYTHING ELSE BELONGS TO THE FROZEN ENTITIES — do not touch
  Transportation  expenses 27,070 ($33.8M) · bills 3,196 · invoices 11,980 · JEs 1,779
  Trucking        bills 13,051 · JEs 6

OTHER LIVE FACTS
  lib.trace_counters  LOAD = 13560 · IN = 1
  load_stops with location_id: 0 of 2        <- picker built, never proven on a load
  fixed_asset_default role for USMCA: NO ROW <- repairs >= $7,000 will 409
  escrow_liability_default: 2 rows (1 inactive, 1 active) — cosmetic duplicate

  driver_finance.driver_advance_accounts: 12 ACTIVE USMCA rows, verified 2026-09-04
    account_type Asset, "Driver Cash Advance- <driver name>",
    DRIVERCASHAD896665-007 .. -020, created 2026-08-21
    -> per-driver RECEIVABLE accounts: the owner-operator model pointed at B1
       company employees. Contradicts the §2 driver-advance ruling.
    driver_finance.driver_advances = 0 rows for USMCA, so NOTHING has posted.
    Corrected BEFORE the first row (§2 guards-before-the-first-row), never
    unwound after. Deactivate the 12 accounts — never delete (§2 deletion law).

  catalogs.lane_mileage REBUILT 2026-09-03 20:48Z
    3,092 lanes · short_miles NULL on every row · 0 impossible lanes (was 2,142)
    High 472 / Check ZIP 404 autofill ON · Thin 2,216 OFF
    TWO OPEN DEFECTS: the confidence rule scores ABSOLUTE spread, so the busiest lanes
    do NOT autofill (Phenix City AL -> Laredo, 367 runs, spread 42.2 mi, OFF);
    and practical_min / practical_max are NULL on every row.

  mdata.drivers 264 rows — cdl_number 160 · cdl_expires_at 9 · dot_medical_expires_at 9
    -> the CDL and medical gates fire on ~255 of 264 drivers
    -> duplicates: ANGEL ALFONSO SOSA 3 rows, Raul Esmeregildo Perez 3,
       Armando Perez 3, Ruben Pedro Perez Garcia 2
  15 Licencia Federal de Conductor PDFs in ~/Downloads dated 2026-08-31, unloaded
```

**Nobody has clicked Book Load on a real load.** Everything built is code-verified and
database-verified, not browser-verified.

---

## 7. OPERATING RULES FOR SEATS

- **§0 THE FINISH LAW and §0b SEAT OWNERSHIP govern everything below.**
- No seat creates money records in USMCA production, including for proof.
- Migration lanes: CC-1 hours 00–11 UTC, Cursor hours 12–23 UTC. One author per migration.
- Only CC-2 writes the verified flag.
- Never trigger a deploy. Cursor only.
- `ignacio.munoz@ih35trucking.net` must never be deleted, suspended or merged — embezzlement evidence.
- Mask secrets by pattern: `npg_`, `napi_`, `GOCSPX-`, `rnd_`, `sk-`. Never paste `DATABASE_URL`.
- **A claim about a rendered surface is made by READING the component, never by grepping a label you
  guessed.** A claim about data is made by `information_schema` or a live count.
- Evidence before "done". A screenshot beats an assertion.
- FAST-MERGE order: Gate (exit 0) → Push → PR → Merge → **Neon (step 5, after merge)** → Next.

**Entity independence is a HARD rule.** TRANSP, TRK and USMCA are independent legal entities with
different tax IDs and owners. They are customers and vendors to each other. No commingling of
entity-scoped data. `catalogs.accounts` is correctly per-entity — that finding is cleared and must
not be re-raised.

**Twelve do-not-touch modules:** Home, Maintenance, Dispatch, Safety, Accounting, Banking,
Factoring, Lists, Reports, Form 425C, Electronic Logs, Driver App. The other six — Customers,
Vendors, Legal, Documents, Users, Help — may be iterated on, additive-only.

**Additive-only.** Never delete or remove modules, pages, sidebar entries, sections, cards, fields,
columns, tabs, routes or features. Only add. Sidebar locked at 18 items. The only exception is the
owner saying "remove X" in words. *(He has: Load from template, Legacy load reference #,
Class T120-SMITH, the trip-type classification banner, and the ranked driver / next-load deadhead
suggestions — all ordered removed 2026-09-03.)*

**Maker is not checker on the general ledger.** The coder builds and tests; an independent seat
verifies live. No approval gate — proof is the safeguard.

**Research before building.** For any module, research how QuickBooks, NetSuite, McLeod and Alvys
actually do it — fresh, never from memory — before proposing a design.

---

## 8. KNOWN TRAPS

**The entity-filter trap. This one cost a full session on 2026-09-03.** A table can be full and still
be empty for USMCA. `accounting.expenses` holds 27,070 rows — **every one of them Transportation.**
An entire expense-attribution work block was written against those rows before anyone filtered by
`operating_company_id`, and frozen-entity trip statistics were carried into a settlement design the
same way. **Every count, every export and every statistic must be filtered by entity before it
becomes a premise.** A file header naming the entity — "Invoiced By IH35 Transportation, LLC" — is
part of the data. Read it.

**The false-empty trap.** `pg_constraint contype='u'` **misses partial unique indexes.** Use
`pg_index WHERE indisunique`. This produced three wrong answers in one week.

**RLS masks aggregates.** Aggregates return counts while row SELECTs return `[]` on
`catalogs.lane_mileage`, `accounting.expenses`, `mdata.drivers` and the settlement tables. Wrap
every read: `WITH b AS (SELECT set_config('app.bypass_rls','lucia',false)) SELECT ... FROM b, <table>`.
**Empty is a question, not an answer** — check the entity, the filter, the bypass, the join and the
spelling before reporting something missing.

**Silent empty versus missing.** A screen that shows nothing without saying why is a defect. The
Fuel Planner is the reference: returns null rather than zero, says on screen that values are
unavailable and not zero, refuses rather than showing an empty page.

**Zero is a claim.** A 0 in a money or mileage field asserts the value IS zero. A producer that
cannot compute returns NULL with a reason and the UI renders the reason.
`BookLoadModalV4.tsx:396-398` defaulting mileage to 0 while validation demands > 0 is the live
example — it looks filled and fails.

**Document numbering reuses on hard delete.** Safe only because voided rows are retained and the
WORM triggers refuse deletes. Keep both.

**Team loads are 20.4% of history.** Revenue per mile is per driver; driver pay is the combined
total. Dividing without halving doubles the miles.

**Hardcoded literals masquerading as data.** `BookLoadModalV4.tsx:2014` renders
`Class T120-SMITH` — a string literal bound to nothing, on every load, confirmed live in production.
Number-shaped things on screen that came from nowhere are the most dangerous defect class in this
system.

**City text is not a location.** `LAREDO -> LAREDO` spans 3.6 to 1,098.8 miles across 12 loads.
`LAREDO -> YOAKUM, TX` resolved to Yoakum *County* on 10 loads — +116% error, no error raised. A
typo that resolves to a real WRONG place is silent poison. Store latitude and longitude on the stop;
city text is a fallback and every fallback is recorded.

**The settled-decision trap.** Public repository visibility (§2), GL posting flags ON (§2), and the
global-chart-of-accounts claim (§7) have each been "discovered" and raised more than once by a seat
meeting them fresh. Check §2 and §7 before filing anything as a finding. A ruling re-raised as a
finding costs the owner time and earns nothing.

**The stale-document trap.** Three wrong claims in one session came from reading a document that
recorded a defect already fixed — including the expense mint, which `expense-number.ts:12` has
handled correctly all along. **If you are about to report a defect, open the source file first.**
A document describes what was true when it was written.

---

## 9. THE STANDARDS SKILL HAS DRIFTED

`ih35-tms-standards` (rev 2026-08-05) contradicts this document in three places. **This document
wins**; the skill needs updating:

1. Skill says capitalize **≥ $2,500**. Owner ruled **$7,000** on 2026-09-02.
2. Skill describes **three entities in scope**. USMCA only; TRANSP and TRK are frozen.
3. Skill says CC-2 and Cascade produce **no builder PRs**. The owner's turbo order has both shipping
   builder PRs; that restriction is lifted.

---

## APPENDIX — PRIOR REPO STUB

Pointers carried over from the 12-line stub this document replaced, preserved so nothing is lost:

- Canonical always-apply Cursor law: `.cursor/rules/00-IH35-LAW.mdc`
- Display IDs: `.cursor/rules/03-display-ids.mdc`
- Product instructions (Claude project): `docs/lockdown/PROJECT-INSTRUCTIONS-2026-09-02.md`
- Build queue: `docs/lockdown/GO-20-EIGHT-FEATURES.txt` · seat `docs/bus/INBOX-<SEAT>.md`
- Capitalize threshold is **$7,000** (never $7,500).
- Never seat fixtures. Never POST Book Load.
- Older `.cursor/rules/*.mdc` files are kept (never-delete) but are **not** always-apply.
