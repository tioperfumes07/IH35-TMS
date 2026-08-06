# LIVE TRANSACTION BATTERY — USMCA — 2026-08-06 (CC-3 / LIVE VERIFIER lane)

**Owner-directed (2026-08-06):** run every transaction type end-to-end through the ACTUAL app UI on the
**USMCA test entity only** — never TRANSP (real QBO books) — and for each confirm (a) it persists on reload
and (b) the expected balanced GL / subledger row appears on Neon prod.

This file is the CC-3 live-verifier handoff record. A FAIL here becomes an OPEN row on
`docs/audit/GUARD-WORKORDERS.md` for the owning builder lane (CC-1 money / CC-3 mechanical).
**Findings flow agent → board → agent, never through the owner** (PERMANENT LAW §1).

## Session context (verified live, not from memory)

| Fact | Value | How proven |
|---|---|---|
| Local branch / SHA | `main` @ `e6343f4c1` | `git rev-parse` after `git pull --ff-only` |
| Deployed prod SHA | `e6343f4` | `GET /api/v1/healthz/shallow` → `{"ok":true,"version":"e6343f4"}` |
| Deploy == tip of main | YES | SHAs match |
| Neon branch | `br-fancy-credit-akjnd07a` (project `tiny-field-89581227`, db `neondb`) | MCP `run_sql` |
| Entity under test | **USMCA** `5c854333-6ea5-4faa-af31-67cb272fef80` | `org.companies`; app header reads `Current: USMCA Freight` |
| TRANSP (NOT touched) | `91e0bf0a-133f-4ce8-a734-2586cfa66d96` | — |
| MCP role | **alternates** `ih35_app` / `neondb_owner` | `current_user` asserted in every statement |

**USMCA baseline before the battery:** vendors 4 · customers 2 · drivers 85 · bills 6 · invoices 4 ·
payments 1 · journal_entries 16.

## Results

| # | Item | Id | Persists on reload | GL / subledger | Verdict |
|---|---|---|---|---|---|
| 01 | Create vendor | `308f6434-0a51-4109-953e-c86ffb1f0999` | YES | N/A (master data — no posting expected) | **PASS** |
| 02 | Vendor-type picker (encountered during 01) | — | — | — | **FAIL → board row `LV-CAT-500`** |
| 03 | Edit vendor | `308f6434-…` | YES | N/A | **PASS** |
| 04 | Create bill (Repair, Section-A category line) | `5a1d7268-a5d8-4bc4-9ffe-50187674dd19` | YES | **balanced** DR 5400 / CR 2000 $743.21 | **PASS** |
| 05 | Duplicate bill accepted (same vendor+number+amount+date) | `55997ecb-2a81-4b01-ab70-c23f41d3829d` | YES | balanced, but **duplicates 04** | **FAIL → board row `LV-AP-DUP`** |

---

### 01 — Create vendor — PASS

- Created via `/vendors` → `+ Create Vendor` drawer → Save. App redirected to
  `/vendors/308f6434-0a51-4109-953e-c86ffb1f0999`.
- **Persistence:** re-navigated to the detail URL; page renders `CC3 Battery Vendor 20260806-01` with the
  Profile / A-P / Documents / Audit History / Tasks / W-9-1099 tabs.
- **Prod row (`mdata.vendors`):** `vendor_name = 'CC3 Battery Vendor 20260806-01'`,
  `operating_company_id = 5c854333-…` (**USMCA — correct entity, no cross-entity write**),
  `qbo_vendor_id IS NULL` (TMS-native, not a QBO clone), `created_at 2026-08-06T16:30:24.775Z`.
- **Count moved 4 → 5** for USMCA. UI list had shown `1-4 of 4` before the create, matching the prod count
  exactly — independent confirmation the list predicate is correctly entity-scoped.
- No GL row expected or required: creating a vendor is master data, not a transaction.

### 02 — `LV-CAT-500`: 21 of 22 generic catalog list endpoints return HTTP 500 — FAIL

Surfaced while doing 01: the **Vendor type** dropdown rendered **zero options**, offering only
`+ Add new vendor type`, even though USMCA has 8 active vendor types on prod.

**This is not an empty catalog — the endpoint is throwing.** Full detail, root cause and the
19/2/1 partition are in the board row `LV-CAT-500` on `docs/audit/GUARD-WORKORDERS.md`.

Live proof (authenticated browser session against `https://api.ih35dispatch.com`, deploy `e6343f4`):

```
500 42703 column t.deactivated_at does not exist  ==> [19] lumper_providers, accident_types,
    workplace_incident_types, leave_types, cash_advance_types, pm_intervals, repair_locations,
    work_order_templates, air_bag_catalog, battery_catalog, tire_catalog, trailer_parts, truck_parts,
    def_stations, fuel_stations, relay_accounts, toll_providers, load_trailer_equipment, mx_customs_brokers
500 42703 column t.name does not exist            ==> [2]  vendor_types, customer_types
200 OK                                            ==> [1]  equipment_types  (POSITIVE CONTROL)
```

**Positive control passes:** `GET /api/v1/catalogs/fleet/equipment-types?operating_company_id=<USMCA>` →
**200**, 5 rows, first row `{code: "DRY_VAN", operating_company_id: "5c854333-…"}`. Auth, entity scoping and
the factory itself all work — the 21 failures are the two column bugs, not a session or permissions artifact.

**Not a false-empty.** The `catalogs.vendor_types` "no rows" read was re-run with the §0 completeness
discriminator on the same table: `visible = n_live_tup = 24`, `n_tup_ins = 24`, `n_tup_del = 0`,
`relrowsecurity = t`, `relforcerowsecurity = t`. Per entity: TRANSP 8 active / TRK 8 / **USMCA 8** /
`operating_company_id IS NULL` = 0. The data is there and correctly scoped; the API cannot read it.

**Not expected state.** These are seeded reference catalogs, not import-origin transactional rows, so the
origin test (owner ruling 2026-08-04) does not exempt them — a picker that cannot list a seeded catalog is a
defect, not legitimate emptiness.

### 03 — Edit vendor — PASS

Edited via `/vendors/308f6434-…` → Edit → set Vendor Code + Tax ID → Save.
Prod (`mdata.vendors`, txn with `SET app.operating_company_id` = USMCA): `vendor_code = 'CC3-BAT-01'`,
`tax_id = '99-8877665'`, `updated_at > created_at`, `operating_company_id` still USMCA.
Reload renders both values in the header and the profile rows.

Methodology note: the first read returned `[]` — a **false empty** from the MCP role alternating to
`ih35_app` under FORCED RLS with no company context. Re-run per §0 gave
`visible = n_live_tup = 2835`, `target_visible = 1`. A `SELECT current_user` in a zero-row result set
projects nothing, so the role is invisible exactly when you most need it — always assert it via a
scalar subquery.

### 04 — Create vendor bill (Repair, Section-A category line) — PASS

`+ Create → Bill → Repair Bill`. Vendor = the item-01 vendor (**master-data → transaction linkage
confirmed**: the newly created vendor was selectable in the bill picker). A/P Account = `2000 Accounts
Payable (A/P)`. Section A category line: `Repairs & maintenance`, qty 1, cost **$743.21**.

- **Persists:** `accounting.bills` id `5a1d7268-…`, `bill_number CC3-BILL-20260806-01`, `status unpaid`,
  `amount_cents 74321`, `total_amount 743.21`, `operating_company_id` USMCA, `qbo_bill_id IS NULL`
  (TMS-native), `voided_at IS NULL`.
- **GL — BALANCED and correctly scoped:** 2 postings via `accounting.transaction_source_links`
  (`linked_object_type = 'bill'`, `relationship_role = 'source_transaction'`) →
  `accounting.journal_entry_postings`:

  | seq | dr/cr | amount | account |
  |---|---|---|---|
  | 1 | debit | $743.21 | **5400** Truck Repairs & Maintenance |
  | 2 | credit | $743.21 | **2000** Accounts Payable (A/P) |

  DR = CR exactly. Both the posting **and** the account row are `operating_company_id` = USMCA
  (`acct_same_entity = true`) — no cross-entity account FK.
- **Vendor linkage both ways:** `vendor_uuid` AND `mdata_vendor_id` both = `308f6434-…`. Note this
  **contradicts the "bills `mdata_vendor_id` NULL" board card for the post-#4062 save path** — on this
  run the denormalized mirror column IS populated. Recorded so that card can be re-scoped rather than
  built against a stale premise.
- Tax is display-only ($61.31 at 8.25%) and correctly **excluded** from the bill total — total equals
  the sum of lines, no invented tax GL, matching the form's own contract note.

### 05 — `LV-AP-DUP`: duplicate vendor bill accepted with no warning and posted twice — FAIL

Two bills now exist with the **same vendor, same bill number, same amount, same date**, created
10.3 s apart (`16:41:28.897Z` and `16:41:39.161Z`), both `status unpaid`, both USMCA, **both posted to
the GL**. Net effect: **$1,486.42** of expense and A/P recognised for a single $743.21 vendor invoice.

- `5a1d7268-a5d8-4bc4-9ffe-50187674dd19` (item 04)
- `55997ecb-2a81-4b01-ab70-c23f41d3829d` (the duplicate) — DR 5400 / CR 2000 $743.21, also balanced

No warning, no confirmation, no blocking. Confirmed on prod there is **no unique index** on
`accounting.bills` covering `bill_number` (`pg_indexes` filtered to UNIQUE + `bill_number` → `NONE`).

This is the classic AP duplicate-payment control gap. QuickBooks Online warns
*"Bill number already exists for this vendor"*; McLeod and NetSuite block or force an override.
Full board row: `LV-AP-DUP`.

**Note on how it surfaced:** this was not a scripted double-submit — the two submissions were 10 s
apart, so the gap is a missing duplicate-detection rule, not merely a missing button-disable. Both
would be worth fixing; the duplicate check is the material one.

### 06 — Create driver (TEST driver #1) — PASS

`/drivers` → `+ Create Driver`. Drawer correctly pre-defaults **Operating Company = USMCA - USMCA
Freight** and **Status = Probation**.

- **Prod (`mdata.drivers`):** id `10b66f79-fa2e-4e6e-aeb8-2eb9546cb419`, `first_name TEST`,
  `last_name Driver-One-20260806`, `cdl_number TEST-CDL-20260806-01`, `status Probation`,
  `operating_company_id` = USMCA.
- **Counts moved:** USMCA drivers 85 → 86; table-wide `visible_all` 180 → 181 **and
  `visible_all = n_live_tup`** (complete read, not an RLS-masked partial).
- **Persists on reload:** drivers list `All (79)` → `All (80)`, header shows `1 new in last 3 days`.

**RLS methodology note (important for anyone repeating this).** `mdata.drivers` returned **0 rows under
`ih35_app` even WITH `SET app.operating_company_id`** — the company GUC alone is not sufficient for this
table; `visible_all = 0` against `n_live_tup = 180` proved it was masking, not emptiness. Adding
`SET app.bypass_rls = 'lucia'` in the same transaction made the read complete. So on `mdata.drivers` the
lucia bypass IS effective (contrast with the AND-gated tables where §0 warns it is inert). Any battery
read of this table without the bypass will silently report zero.

### 07 — `LV-DRV-TAB`: drivers with the default `Probation` status appear in NO status tab — FAIL

The drivers list offers exactly four status tabs — `Active` / `Inactive` / `On Leave` / `Terminated` —
plus `All`. After creating TEST driver #1 the tabs read
`All (80) · Active (1) · Inactive (77) · On Leave (0) · Terminated (0)`: **the four tabs sum to 78 while
All is 80.** Two drivers are reachable only through `All`.

Prod confirms exactly why (`mdata.drivers`, USMCA, non-archived, `bypass_rls='lucia'`,
`current_user = neondb_owner`, complete read):

| status | rows (not archived) |
|---|---|
| Inactive | 78 |
| **Probation** | **2** |
| Active | 1 |

`Probation` is the **default status the Create Driver drawer itself assigns**, and there is no tab for it.
So every driver created through the UI lands, by default, in a bucket that no status filter surfaces — a
dispatcher or safety reviewer filtering by status will never see newly created drivers.

**Residual, honestly flagged:** the tab math still does not fully tie — prod shows 78 non-archived
`Inactive` but the tab reads 77, and non-archived total is 81 vs `All (80)`. So there is a second,
narrower filter in play beyond `archived_at` that I have **not** isolated. **UNVERIFIED — needs live
check**; the `Probation`-has-no-tab gap above is fully proven and is the reportable defect. Recorded
rather than guessed.

### 08 — Create customer (TEST customer #1) — PASS (after a real validation block)

`/customers` → `+ Create Customer`. First save attempt did **nothing and fired no network request** —
the cause was a genuine required-field block: **"Customer type is required"**. That is correct behaviour,
not a defect (the `Customer type` options `Broker` / `Direct shipper` are hardcoded in the form, NOT served
by the broken `customer_types` catalog endpoint — checked, because `LV-CAT-500` would otherwise have made
this required field unsatisfiable and blocked customer creation entirely).

- **Prod (`mdata.customers`):** id `01a29250-9bc1-4679-9613-79331056294d`,
  `customer_name TEST-Customer-One-20260806`, `operating_company_id` = USMCA,
  `qbo_customer_id IS NULL` (TMS-native).
- **Counts:** USMCA 2 → 3; `visible_all` 2697 → 2698 **and `visible_all = n_live_tup`** (complete read).

**Minor UX observation (recorded, not boarded):** the validation message renders at the very TOP of a long
scrolling drawer while the Save button sits at the very BOTTOM, with no scroll-to-error. The form looks
inert when it is in fact correctly refusing. Worth a fix, but it is a usability nit, not a data defect.

### 09 — Create unit (TEST unit #1) — PASS · entity-ownership model verified correct

`/fleet` → `+ Create Unit`. USMCA fleet already held `USMCA-001` (truck) and `USMCA-T01` (dry van).

- **Prod (`mdata.units`):** id `240be73b-d02e-4205-a566-bb0000d66180`,
  `unit_number TEST-UNIT-20260806-01`, `vin 1XKTESTUSMCA080601`.
- **`visible_all = n_live_tup = 183`** (complete read).
- **★ ENTITY MODEL CORRECT — this is the notable result:**
  `owner_company_id = b49a737b-…` = **TRK** (the asset holder) and
  `currently_leased_to_company_id = 5c854333-…` = **USMCA** (the lessee).

  The Create Unit drawer exposes **no** owner or lease field at all, yet the write landed on the correct
  two columns in the correct direction. This is live confirmation that **PERMANENT LAW §4 — "TRANSP /
  USMCA own no assets today"** is actually enforced by the create path, not merely documented, and that
  `mdata.units` is correctly keyed on `owner_company_id` / `currently_leased_to_company_id` rather than
  the `operating_company_id` that §4 warns is a recurring 500 source.

**`TEST-` unit-name guard — checked before creating, no conflict.** `scripts/verify-no-test-units-in-prod.mjs`
forbids `unit_number LIKE 'TEST-%'`, which on its face collides with the owner's standing order to name
records `TEST-…`. It does not, for two independent reasons: (a) its live DB scan is gated behind
`ENABLE_LIVE_DB_UNIT_TEST_GUARD === "true"`, and the script's own comment records that no workflow has ever
set it, so that branch has never run; (b) when it does run it sets
`app.operating_company_id = TRANSP_COMPANY_ID` and scans only TRANSP. A `TEST-` unit on **USMCA** is
outside its scope either way. Verified by reading the guard, not assumed.

## ★★ 10 — DISPATCH CHAIN — book → assign → dispatch — PASS, and it DRAINS the WF064 board cards

Booked through the real Book Load wizard on USMCA. Load `L-20260806-0005`,
id `a0b1df25-e49e-4853-b8ee-a26b407e88ba`.

- **Prod (`mdata.loads`):** `status assigned_not_dispatched`, `trip_type NB`,
  **`rate_total_cents 245000` = $2,450.00** (GROSS customer rate, per §4), `operating_company_id` USMCA.
  `visible_all = n_live_tup = 7` (complete read).
- **★ TOTAL-CONNECTIVITY (§10) SATISFIED — every hop resolves, and to the records I created:**

  | link | value |
  |---|---|
  | driver | `88c04cf5-…` **Juan USMCA-Battery** |
  | customer | `01a29250-…` **TEST-Customer-One-20260806** (created in item 08) |
  | unit | `240be73b-…` **TEST-UNIT-20260806-01** (created in item 09) |
  | stops | **2** (pickup Laredo TX 78040 → delivery San Antonio TX 78201) |

### 10a — Pre-dispatch FMCSA/DOT compliance gate — PASS (works, and works well)

The wizard **blocked** the dispatch with `Active blocker(s) — override required`:

- `[WF-CDL-MISSING]` Juan USMCA-Battery: no CDL expiry on file — DOT requirement for dispatch
- `[WF-MED-CARD-MISSING]` Juan USMCA-Battery: no DOT medical card on file
- `[GAP-14-FMCSA-NO-NUMBER]` (advisory) customer has no MC#/DOT# for FMCSA verification

`6 of 7 checks pass`. Override required a ≥10-char reason and states it is audit-logged. This is
best-in-class behaviour and is a genuine PASS for the compliance gate. Overridden deliberately with a
reason naming this as a USMCA live-verifier test; the **override textarea accepted keystrokes**, which
independently corroborates the merged owner-override keystroke fix (#4036) still working on prod.

### 10b — ★ WF064 / dispatch outbox: PRODUCER **AND** CONSUMER BOTH WORK — board cards are WRONG

Two board cards state the WF064 lifecycle is dead — *"the whole WF064 lifecycle is inert end-to-end —
wired, never executed"*, *"0 of 31,646 outbox events match `dispatch.*` / `%wf064%`"*, and
*"WF064-consumer dead (P1) … the settlement cycle never fires."*

**Live on prod, immediately after this single dispatch:**

| event_type | created_at | delivered_at | retry | outcome |
|---|---|---|---|---|
| `dispatch.load.dispatched` | 17:02:41.402Z | **17:02:46.213Z** | 0 | `driver_instructions_distributed` |
| `dispatch.wf064.override_notice` | 17:02:41.402Z | **17:03:10.184Z** | 1 | `override_notice_delivered_to_3_owner(s)` |

`dispatch.*` total went **0 → 2**; `%wf064%` total went **0 → 1**. Both rows have
`delivered_at NOT NULL` and `failed_at NULL` — i.e. **both were produced AND consumed successfully**,
within 5 and 29 seconds respectively.

**Correct conclusion: the WF064 lifecycle was never EXERCISED, not broken.** The prior "0 rows"
reading was accurate but was interpreted as "the producer never fires / the consumer is disconnected."
The real cause was simply that **no load had ever been dispatched in the TMS**, so nothing had ever
produced the event. This run is the exercise, and the chain works end to end. The cards should be
closed as *not-a-defect / never-exercised*, not built against.

This is the textbook shape of the `expected-state-recorded-as-failure` anti-pattern applied to an
event stream: an empty queue on a system that has never performed the triggering action is expected
state, and a zero there is not evidence of a broken consumer.

### 10c — `LV-OUTBOX-ERRCOL`: success detail is written into `last_error` — FAIL (minor, observability)

Both delivered rows carry a **success** string in **`last_error`** (`driver_instructions_distributed`,
`override_notice_delivered_to_3_owner(s)`). `last_error` is the failure-diagnosis column; putting
success detail there means any triage query of the form `WHERE last_error IS NOT NULL` returns healthy
rows, and — worse — the override-notice row has **`retry_count = 1`**, so its first attempt genuinely
did fail, and that real error message has been **overwritten by the later success string and is now
unrecoverable**. Board row `LV-OUTBOX-ERRCOL`.

### 10d — "Auto-create driver bill with short miles" did NOT produce a bill — UNVERIFIED

The wizard's ON SAVE panel promises five effects: create load with assigned status · **auto-create
driver bill with short miles** · queue QBO outbox invoice + bill · send driver dispatch message ·
prepare factoring packet. After dispatch: USMCA `accounting.bills` unchanged at **8** (0 new), and
`driver_finance.settlement_lines` = **0**.

**Deliberately NOT filed as a defect.** This load was booked with **0 miles** (no PC*MILER routing
entered) and **driver pay rate/mi = 0**, so suppressing a $0 driver bill may be correct behaviour. To
settle it, re-run the chain with real stop mileage and a non-zero pay rate and re-check. **UNVERIFIED —
needs live check.** Recorded rather than guessed.

### 11 — `LV-LOAD-UNASSIGNED`: load detail renders an ASSIGNED load as "Unassigned" — FAIL (major)

Opened the load detail for `L-20260806-0005` (`a0b1df25-…`). The Overview panel shows:

- **DRIVER: `Unassigned`**
- **TRUCK UNIT: `—`**
- **TRIP TYPE: `—`**

…while the load-board row *directly beside it on the same screen* correctly shows
`TEST-UNIT-20260806-01` / `Juan USMCA-Battery`, and prod has all three populated
(`assigned_primary_driver_id 88c04cf5-…`, `assigned_unit_id 240be73b-…`, `trip_type NB`).

**Root cause — isolated to the API, and the asymmetry is the smoking gun.**
`GET /api/v1/dispatch/loads/:id?operating_company_id=…` returns **200** with:

```
assigned_unit_id            : "240be73b-…"   <-- id present
assigned_primary_driver_id  : "88c04cf5-…"   <-- id present
assigned_secondary_driver_name : null        <-- a *_name field EXISTS for the SECONDARY driver
customer_name               : "TEST-Customer-One-20260806"   <-- customer IS resolved
drivers                     : []             <-- empty despite an assigned primary
```

There is **no `assigned_primary_driver_name`**, **no unit-number field**, and **no `trip_type`** key
anywhere in the payload. So the endpoint resolves `customer_id → customer_name` and even carries a
name field for the *secondary* driver, but never resolves the **primary** driver or the unit — the
frontend receives only UUIDs for those and correctly falls back to "Unassigned" / "—".

This is **not** a frontend rendering bug and **not** an RLS/entity-scope bug (the ids are correct and
correctly scoped) — it is a missing projection in the detail query.

**Why it matters:** a dispatcher opening an assigned load is told it is *Unassigned*. That invites a
double-assignment of the same driver/truck, which is the exact failure the assignment board exists to
prevent. It also silently hides `trip_type`, which drives NB/TR/SB settlement closure.

Board row `LV-LOAD-UNASSIGNED` (CC-3).

**Corroborating positive — total connectivity is otherwise well wired here.** Loading this one screen
fired scoped reads for `insurance/claims?load_id=`, `safety/incidents` (damage_report,
trailer_interchange, cargo_claim), `safety/accidents?load_id=` and `loads/:id/expenses`, each carrying
`operating_company_id=5c854333-…`. The §10 cross-module linkage from a load out to insurance, safety
and expenses is present and entity-scoped.

### 12 — `LV-STOPS-NOSAVE`: "Save stops" persists nothing and issues no request — FAIL (major)

On load `L-20260806-0005`, prod held pickup `100 Bridge Rd / Laredo / state ''` and a **completely
empty delivery stop** (`address_line1 ''`, `city ''`, `state ''`, `postal_code NULL`), even though the
Book Load wizard had been given `200 Commerce St / San Antonio / 78201`.

**Isolation test.** Rather than guess, I re-entered the values in the load detail **Stops** tab (which
has no load-number reservation timer, unlike the create wizard) and clicked **`Save stops`**:

1. All six fields visibly populated in the UI (pickup TX, dropoff `200 Commerce St / San Antonio / TX`).
2. `Save stops` clicked.
3. **Prod unchanged** — re-read as `neondb_owner` (complete read): delivery stop still
   `addr ''`, `city ''`, `state ''`; pickup state still empty.
4. **No save request was issued.** The only traffic after the click was `notifications?limit=20`,
   `notifications/unread-count` and `feature-flags/check?key=LOAD_WIZARD_V5` — no PUT/PATCH/POST.

So the button is inert. This **also exonerates my first hypothesis** (that the create wizard's
reservation-timer re-render, which regenerated the load number `0001→0002→0003→0005`, had discarded
the typed stop data). The stops write path fails on its own, with no timer involved. I record the
discarded hypothesis because it was the more obvious explanation and it was wrong.

**Impact:** a delivery address cannot be set or corrected on a load. No delivery address means no
routing, no POD location, no IFTA state miles, and `Est. leg miles ~145` is being derived from
something other than the stored stop. Board row `LV-STOPS-NOSAVE` (CC-3).

### 13 — `LV-LOAD-EDIT-BLANK`: the Edit-load form opens completely UNHYDRATED — FAIL (major, data-loss risk)

Clicking **Edit** on the live load opened the `Edit load` wizard with **every field empty**, for a load
that on prod is assigned and worth $2,450:

| field | Edit form shows | prod actually holds |
|---|---|---|
| Trip type | *nothing selected* | `NB` |
| Customer | `Select customer…` | `TEST-Customer-One-20260806` |
| Linehaul | **$0.00** | $2,450.00 |
| Total customer invoice | **$0.00** | $2,450.00 |
| Truck unit | `Select truck unit` | `TEST-UNIT-20260806-01` |
| Driver | `Select driver` | `Juan USMCA-Battery` |

The form's own banner reads: *"Editing persisted load details. Only fields you change are saved
(partial PATCH — untouched columns stay)."*

**Why this is dangerous, not merely cosmetic.** The partial-PATCH contract is the only thing standing
between this screen and destroying the load: a user who opens Edit, sees `$0.00` and `Select
customer…`, and re-enters what they believe is missing will be writing over correct data; and any
control that reports itself as "changed" on submit (a select that fires onChange when re-picking the
same value, a currency input that normalises `""`→`0`) will silently zero a real charge. The screen
presents a populated, dispatched, invoiced load as if it were an empty draft.

**I did not submit the form** — I closed it and re-verified on prod that nothing was written:
`updated_at` still `2026-08-06T17:02:46.215Z` (the original dispatch timestamp), `rate_total_cents`
still `245000`, driver/unit/customer/trip_type all intact. The risk above is therefore **reasoned, not
demonstrated** — I deliberately did not run the destructive confirmation on live data. Board row
`LV-LOAD-EDIT-BLANK` (CC-3).

**Same family as `LV-LOAD-UNASSIGNED` (item 11), and it is now clearly the broader defect:** the load
read/hydration path does not resolve driver, unit, customer, trip type or charges into the detail and
edit surfaces, even though the detail API returns the correct ids and prod holds correct values. Fix
the hydration once and all three symptoms (detail "Unassigned", blank Edit form, and plausibly the
stops editor) resolve together — they should be triaged as one block, not three.

## ★ 14 — AR CHAIN: load → invoice auto-created — PASS (linkage), GL posting NOT YET PROVABLE

**The dispatch auto-created the invoice.** `INV-2026-00005`, id `d921fbde-b6e2-4e65-9e21-8bcf4278a862`,
created at **`17:02:41.402Z` — the exact load-creation timestamp**, i.e. in the same transaction.

- `total_cents 245000` = **$2,450.00**, matching the load's `rate_total_cents` exactly.
- `qbo_invoice_id IS NULL` → TMS-native, not a QBO clone.
- **Reverse linkage PASS:** `source_load_id = a0b1df25-…` (my load) and
  `customer_id = 01a29250-…` (my customer). USMCA invoices 4 → 5.
- Invoice detail renders **Source Load `L-20260806-0005`** correctly — note this **contrasts with the
  LOAD detail**, which fails to resolve driver/unit (item 11). The invoice screen resolves its
  relation; the load screen does not.
- Line: `linehaul`, income account **4000 - Freight / Line-haul Income**, qty 1, $2,450.00.
- GL panel states honestly: *"No journal entries linked yet (unposted or posting reversed)."*
  `transaction_source_links` for this invoice = **0**.

### 14a — Is this the `CLS-SUBLEDGER-GL-DARK` P0? **NOT PROVEN — and the card needs re-scoping**

The invoice is `status = proforma` and has no GL posting. **A proforma legitimately should NOT post** —
under ASC 606 revenue is recognised when the performance obligation is satisfied, and this load has not
been delivered. So a zero here is **expected state**, not the GL-DARK defect.

I attempted to advance it: the invoice detail offers only `Print` · `View invoice PDF` · `Send` · `Void`.
**`Send` is `disabled: true`** (verified in the DOM, not inferred from styling). Clicking it did nothing —
prod re-read confirms `status` still `proforma`, `updated_at` still `17:02:41.402Z` (unchanged from
creation), `gl_links` still 0.

**Most likely correct design:** proforma → final is gated on **delivery / POD**, which is exactly right.

**Critical-path consequence — this is the useful finding:**
`LV-STOPS-NOSAVE` (item 12) means the load has **no delivery address**, so the load cannot be
delivered → the invoice cannot leave `proforma` → **the AR → GL posting path cannot be exercised at
all.** The stops defect is therefore a **blocker for proving the highest-dollar open card on the
board.** It should be prioritised on that basis, not just as a dispatch annoyance.

**Verdict recorded honestly: `CLS-SUBLEDGER-GL-DARK` remains UNVERIFIED for the TMS-native AR path.**
I could not reach a finalized invoice, so I can neither confirm nor clear it. What IS now established:
the load → invoice hop works, amounts and both-way linkage are correct, and the income account maps to
4000. Re-test once `LV-STOPS-NOSAVE` is fixed and a load can be delivered.

### 14b — `LV-SEND-NOREASON`: disabled `Send` gives no reason — FAIL (minor UX)

`Send` is disabled with **no `title`, no `aria-disabled`, and no helper text** anywhere on the page.
A user cannot tell whether the invoice is not ready, they lack permission, or the button is broken —
and an assistive-technology user gets no signal at all, since `aria-disabled` is absent. If the gate is
"deliver the load first", say so. Board row `LV-SEND-NOREASON` (CC-3).

### 14c — `LV-INV-UUID`: invoice line shows a raw load UUID in customer-facing text — FAIL (minor)

The invoice line description reads
`Linehaul · Load a0b1df25-e49e-4853-b8ee-a26b407e88ba` — a raw UUID — while the header of the same
page correctly renders `L-20260806-0005`. This text is on a document that goes to a customer
(`View invoice PDF` / `Send`). It should read the load number. Same class as the existing
"Class-UUID renders in picker" card. Board row `LV-INV-UUID` (CC-3).
