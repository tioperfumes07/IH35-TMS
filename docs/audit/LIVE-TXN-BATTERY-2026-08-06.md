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

## 15 — MAINTENANCE: `LV-WO-NOSAVE` — "Create work order & Bill" is INERT — FAIL (major)

Attempted the full maintenance chain on USMCA: Repair WO → Section-A cost line → vendor →
`Create work order & Bill` (the form states *"Registers as a Bill (A/P) — payable later, 1099-tracked"*).

**Everything up to the submit is correct and several things are notably good:**

- **Board card #4048 (WO-vendor) — the picker half IS fixed.** The USMCA vendor
  `CC3 Battery Vendor 20260806-01` **appears in the WO vendor picker**. Under the original defect
  (validating against `mdata.qbo_vendors`, empty by design for non-QBO entities) no USMCA vendor could
  be found at all. The picker now reads canonical `mdata.vendors`.
- **`Load #` auto-populated to `L-20260806-0005`** the moment the unit was chosen — the WO
  auto-linked to the unit's **active trip**. That is exactly the §10 cross-module linkage we want,
  happening automatically (WO → unit → active load).
- **The cost-line validator fix is LIVE.** The pre-save panel shows **`✓ At least one cost line item`**
  with **only a Section-A category line** present. That is precisely the defect the board's
  "Cost-line-validator (C1, P1)" card was closed for — confirmed live on prod, not just on main.
- The pre-save validation panel is genuinely good: it blocked initially on
  `! Driver and unit required for non-PM operational types` and `! Vendor invoice # or vendor WO #
  required`, and cleared to **all 9 ✓** once satisfied.

**Then the submit does nothing.**

With all 9 validations green and the `Create work order & Bill` button **enabled** (green, not
disabled — verified visually and by it no longer being greyed):

1. Clicked. **No network request issued** — only `notifications?limit=20` and
   `notifications/unread-count` followed.
2. **No console error or exception** (console tracking active at click time).
3. **No UI feedback** — no toast, no error, no state change, drawer stays open.
4. **Nothing persisted:** `maintenance.work_orders` for USMCA = **0** (unchanged),
   USMCA `accounting.bills` = **8** (unchanged, no new bill).

Clicked twice with the button in its enabled state; identical result both times.

**Consequence: work orders cannot be created on USMCA at all**, so the whole maintenance chain
(WO → parts/labor → close → bill → GL) is unreachable, and **board card #4048 cannot be closed** — its
vendor-picker half is demonstrably fixed, but the create still fails, now at the CLIENT rather than in
the route. The card should be re-scoped accordingly rather than marked verified.

**Same failure shape as `LV-STOPS-NOSAVE` (item 12):** an enabled primary submit control that issues no
request and reports nothing. Two independent forms exhibiting the identical signature suggests a shared
cause (a submit handler not wired, or a guarded handler swallowing the call) and they should be
investigated together. Board row `LV-WO-NOSAVE` (CC-3).

### 15a — Class auto-derive renders the template, not the values — observation

With unit **and** driver both set, the green `Class (auto)` field reads the literal **`UNIT-DRIVER`**
(and read `UNIT-UNASSIGNED` before the driver was set). Per §7 the class auto-derive should be
`{UNIT}-{LASTNAME}` — here `TEST-UNIT-20260806-01-USMCA-Battery` or similar.

**Recorded as an observation, NOT filed as a defect, and deliberately so:** because the WO cannot be
saved (above), I could not read the persisted `class` value from `maintenance.work_orders` to see
whether the token substitution happens server-side on write. The display may be a placeholder that
resolves on save. **UNVERIFIED — needs live check once `LV-WO-NOSAVE` is fixed.** Note this is NOT the
same symptom as board card 611 (which was about raw **UUIDs** rendering); this is an un-substituted
template string, so do not treat 611 as re-opened on this evidence.

### 15b — `LV-WO-NOSAVE` cascades to maintenance expenses — and the linkage gate itself is a PASS

`Maintenance → + Create Expense` opens with **`Work order *` as a required first field** and the
explicit note: *"Select a work order so this expense carries Maintenance linkage (WO FK)."*

**That gate is correct and is a PASS** — it refuses to create a maintenance expense that is not linked
to a work order, which is exactly the §10 total-connectivity / G18-style enforcement we want (no
orphan expense records).

**But because `LV-WO-NOSAVE` means no work order can be created on USMCA, this path is blocked too.**
So the single inert submit button takes out: WO creation → WO→bill → WO parts/labor → close-WO→bill →
**and** maintenance expense creation. `LV-WO-NOSAVE` is therefore the blocker for the entire
Maintenance module on this entity, not one form.

**Scope note on the inert-submit class (measured, not assumed).** The signature is NOT universal —
these submits all worked and persisted this session: vendor create, vendor edit, customer create,
driver create, unit create, bill create (twice, with balanced GL), and the full Book Load wizard
(which created a load, an invoice and two consumed outbox events). The two confirmed inert submits are
**`Save stops`** and **`Create work order & Bill`**. So this is a specific defect in those handlers,
not a global regression — which is the useful scoping for whoever picks it up.

## ★★ 16 — OWNER ANSWERS LOCATED — the GL-DARK P0 needs NO owner decision; it is a BUILD

Owner directed (2026-08-06): *"there is no hold … all questions have been asked and answered … never
defer we always fix. all responses live here."* Located and read the answer set:

- `~/Downloads/OWNER-DECISIONS-FINAL-2026-07-26.md` (complete A–H answered set)
- `~/Desktop/CPA ANSWERS.docx`
- **in-repo:** `.block-ready/REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19.json`,
  `.block-ready/CPA-ANSWERS-PHASE1.json`, `docs/OWNER-RULING-flag-flips-sole-owner-decision-2026-07-11.md`

### 16a — Revenue recognition is OWNER-LOCKED as a TWO-EVENT LATCH (ASC 606)

From `.block-ready/REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19.json` (status BUILD, locked 2026-07-19):

| event | trigger | posting |
|---|---|---|
| **Event 1** | `delivered` / `delivered_pending_docs` | **DR Unbilled Revenue / CR Line-Haul Income** |
| **Event 2** | `completed_docs_received` (POD, via `docs.files`) | **DR A/R / CR Unbilled** |

Never one combined POD+delivered gate. Reversible on status revert. Entity scope locked: TRANSP seeds
Unbilled + enables first; **USMCA seeds Unbilled+Deferred, dormant until loads**; **TRK excluded**
(lease lessor, 42000-LEASE, no delivery trigger).

Corroborated by `CPA ANSWERS.docx` §7: *"revenue recognition should be the second the invoice is
created, and the invoice should be created on the day we pick up the load and closes the day we
deliver"*, and by `OWNER-DECISIONS-FINAL` **B2a/B2b** (auto-create a **Pro Forma Invoice** at booking,
call it that) and **B2d** (*"at POD auto-convert to Official Invoice + auto-send to factoring"*).

### 16b — ★ THE FLAGS ARE ALREADY ON FOR USMCA (verified live on prod, not assumed)

`lib.feature_flag_overrides` on `br-fancy-credit-akjnd07a`:

| flag | TRANSP | TRK | USMCA |
|---|---|---|---|
| `REVENUE_RECOGNITION_ENABLED` | true | true | **true** |
| `REVENUE_RECOGNITION_POST_ENABLED` | true | **false** | **true** |

**TRK = false is CORRECT**, matching the locked entity scope (lease lessor, no freight Unbilled/Deferred,
no delivery trigger). So the posting machinery is **armed for USMCA and waiting on a delivery event**.

### 16c — Conclusions that replace my earlier "UNVERIFIED / needs decision" framing

1. **`INV-2026-00005` sitting at `proforma` with 0 GL links is CORRECT** — it is the owner-specified
   Pro Forma at booking (B2a), and **Event 1 has not fired because the load has not been delivered**.
   This is expected state, not GL-DARK.
2. **No owner/architectural decision is pending on `CLS-SUBLEDGER-GL-DARK`.** The treatment is locked,
   the flags are on, and the work is a BUILD. Any board card still reading *"architectural decision
   needed"* or *"needs owner decision"* is stale and must not be used to defer.
3. **`LV-STOPS-NOSAVE` is the single thing standing between here and proving the whole revenue chain.**
   No delivery address → no `delivered` → Event 1 never fires → Event 2 never fires → no A/R posting.
   It is the top build priority on this board.

### 16d — DRIFT FLAGGED (§9): stale HOLD language in the locked revenue block

`.block-ready/REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19.json` still states:
*"Flag default OFF per-entity behind financial HOLD/JORGE-APPROVED + Neon proof before enable."*

That is **contradicted by three later sources**: the **OWNER LAW of 2026-08-03** (no holds, the
`JORGE-APPROVED` label is deleted, coders merge on green), the **live prod flag state above** (already
enabled for USMCA), and the **owner's direct instruction of 2026-08-06** (*"there is no hold"*).
Flagging both files rather than silently picking one, per §9. **Canonical = the owner law + live prod
state; the `HOLD/JORGE-APPROVED` clause in that block-ready JSON is stale and should be struck.**

### 16e — Owner-decision checks run against live prod while I was in there

- **C2b escrow cap $2,500 — PASS.** `ESCROW_CAP_CENTS = 250_000` in
  `apps/backend/src/driver-finance/escrow-resolver.service.ts:38`, and prod
  `driver_finance.escrow_settings.escrow_target_cents = 250000` for **both TRANSP and USMCA**. The
  owner's note that "code caps $2,000 today" is now historical — it has been implemented. Not a defect.
- **A4-D5 "require a Work Order on every repair" — PASS**, and it is enforced live: the maintenance
  Create Expense drawer requires `Work order *` before anything else (item 15b).

## 17 — SAFETY: accident created with FULL linkage — PASS

`/safety/accidents` → `+ Create Accident`. Created on USMCA.

- **Prod (`safety.accident_reports`):** id `b99b9461-e593-4376-a501-21bb36453a41`,
  `operating_company_id` = USMCA, `status open`, `record_type accident`,
  `location 'I-35 N mile marker 22, Laredo TX'`.
- **★ §10 TOTAL CONNECTIVITY — every hop resolves:**

  | link | value |
  |---|---|
  | driver | `88c04cf5-…` **Juan USMCA-Battery** |
  | unit | `240be73b-…` **TEST-UNIT-20260806-01** |
  | load | `a0b1df25-…` **L-20260806-0005** |

- **Canonical table note:** the accident landed in **`safety.accident_reports`**, NOT `safety.accidents`.
  My first read hit `safety.accidents` and returned 0 — which the discriminator immediately exposed as
  a wrong-table read rather than a failure: `safety.accidents` has **`n_tup_ins = 0`**, i.e. it has
  never had a single row inserted, as has `safety.incidents`. Both look like RETIRE tables. **Anyone
  querying `safety.accidents` for accident data will get a permanent, misleading zero.**
- **The load picker in this form resolves MORE than the load's own detail page does** — it rendered
  `L-20260806-0005 · TEST-Customer-One-20260806 · Laredo` (load + customer + city). That is further
  evidence `LV-LOAD-UNASSIGNED` (item 11) is specific to the dispatch load-detail endpoint, not a
  general resolution failure.
- **The accident DETAIL form hydrates completely** — driver, unit, load, location and memo all
  populated on reopen. This is the direct counter-example to `LV-LOAD-EDIT-BLANK` (item 13) and
  confirms that hydration defect is **specific to the load edit surface, not systemic**.

## 18 — `LV-SPAWN-LIABILITY-NOSAVE`: "Spawn Liability" is INERT — FAIL (major)

The accident detail offers `Spawn Liability`, `Spawn WO` and `Add Photo`. Clicking **`Spawn Liability`**:

1. **No network request issued** — only `notifications?limit=20` and `notifications/unread-count`.
2. **No modal, no form, no toast, no error, no state change.**
3. **Nothing created.** Every claim/liability table on prod is untouched, and the discriminator is
   conclusive — these are not "empty right now", they have **never had a row inserted**:

   | table | n_live_tup | **n_tup_ins** |
   |---|---|---|
   | `insurance.claim` | 0 | **0** |
   | `driver_finance.driver_liabilities` | 0 | **0** |
   | `accounting.insurance_claim_recovery_postings` | 0 | **0** |
   | `maintenance.warranty_claims` | 0 | **0** |
   | `safety.accident_cost_lines` | 0 | **0** |

   `safety.accident_reports.insurance_claim_id` remains NULL for the accident.

**This is the THIRD control with the identical signature** — after `Save stops` (item 12) and
`Create work order & Bill` (item 15): an enabled primary action that issues no request, logs no error,
shows no feedback, and writes nothing. Three independent forms, one signature.

**Consequence:** the entire **Safety → Insurance → Legal → Accounting** chain is unreachable. Accident
exists and is correctly linked, but no claim can be spawned → no matter → no claim cost → no GL. The
`n_tup_ins = 0` across every claim table shows this chain has **never once been exercised** in the
system's history — the same "never exercised, not broken" shape as WF064 (item 10b), except here the
producer genuinely is dead, because the button that would produce it does nothing.

Board row `LV-SPAWN-LIABILITY-NOSAVE` (CC-3), to be fixed with the other two inert submits.

## 19 — BANKING: real density found, and a UI banner that contradicts prod

`/banking` on USMCA is the first module with **real data density**: Plaid 2 accounts (last sync
`8/6/2026 10:32:24 AM`), **163 transactions**, **112 uncategorized**, `USMCA FREIGHT ••••3224`
$93.68, Relay Fuel Wallet $0.00. Tabs: `For review · 112` / `Categorized · 3` / `Excluded · 0`.
This is the population `CLS-BANK-MATCH-DENSITY` needs.

**Much of this module is exemplary.** It carries honest self-disclosure banners rather than implying
completeness — e.g. *"Bank row attachments and notes are not wired yet"*, and it explicitly warns that
`matched_journal_entry_id` is **not** proof that bank-feed GL posting is live because recon Match can
also stamp it when `ledger_entry_kind = 'je'`. That distinction is exactly right and is the kind of
honesty this audit usually has to discover the hard way.

### 19a — `LV-BANKFLAG-STALE`: the banner states the OPPOSITE of live prod — FAIL

The banner asserts:

> *"Categorize tags are not ledger posts — **`BANK_FEED_GL_POSTING_ENABLED` stays OFF by default**"* …
> *"the flag-gated bank-feed poster is a separate path (**default OFF**)"* …
> *"A JE link with the flag **OFF** is a match/link, not 'posting is on.'"*

**Live on prod (`lib.feature_flag_overrides`, br-fancy-credit-akjnd07a):**

| flag | TRANSP | TRK | USMCA |
|---|---|---|---|
| **`BANK_FEED_GL_POSTING_ENABLED`** | **true** | **true** | **true** |
| `BANK_TX_SPLIT_GL_POSTING_ENABLED` | true | true | true |
| `BANK_TX_SPLIT_ENABLED` | true | true | true |
| `BANK_DRIVER_ADVANCE_ENABLED` | true | true | true |
| `BANK_DRIVER_EXPENSE_DEDUCTION_ENABLED` | true | true | true |
| `BANK_ACCOUNT_HIDE_ENABLED` | true | true | true |

**The stated nuance is real but the banner does not carry it.** It is true that the flag *key* DEFAULT
is OFF and that per-entity `lib.feature_flag_overrides` drive the ON state (standards §6) — that is
the same distinction preserved during the 2026-08-06 governance cleanup. But the operator is looking
at **USMCA, where the override is ON**, and the banner reports the key default as if it were the
effective state.

**Why this is material, not pedantic:** an accountant reading this page is being told that
categorizing a bank transaction does **not** write to the ledger. If the poster is in fact armed for
this entity, that belief drives real errors — double-posting a categorised transaction manually,
or treating the GL as untouched during reconciliation. A banner about whether the books are being
written must state the **effective, per-entity** state, never the key default.

**FIX:** render the effective resolved flag state for the currently selected entity (e.g. "bank-feed
GL posting: **ON** for USMCA"), not the key default. Same defect class as the one
`verify-no-stale-approval-gate` was built for — a law/UI surface asserting flags are OFF when prod
says ON — but here it is operator-facing rather than agent-facing.

Board row `LV-BANKFLAG-STALE` (CC-1 money — it concerns whether the GL is being written).

**NOT YET PROVEN, stated honestly:** I have **not** demonstrated that the poster actually fires on
categorize. The flag being enabled is necessary, not sufficient — the code path may still no-op. The
decisive test is to categorize one transaction and check for a balanced JE on prod.
**UNVERIFIED — needs live check.** What IS proven is the contradiction between the banner text and
`lib.feature_flag_overrides`.

### 19b — ★ RESOLVED: bank categorize DOES post a balanced JE — `LV-BANKFLAG-STALE` CONFIRMED

Item 19a left this **UNVERIFIED**. It is now **proven**, and the banner is actively wrong.

Categorized bank transaction `49e3a071-d63e-40a4-a167-e80a54b4be4c` (Monthly Fee Business Adv
Fundamentals, 08/03/2026, **$16.00 money out**, USMCA FREIGHT ••••3224) to account
**6300 Bank Service Charges & Wire Fees** via the real UI, then pressed **Post**.

**Prod (`banking.bank_transactions`):** `categorized_at 2026-08-06 21:52:41.211105+00`,
`coa_account_id de553cc4-…`, `matched_journal_entry_id 0eb02ac8-69f7-480b-b1da-208535418d79`.

**The JE is a real, balanced posting** (`accounting.journal_entry_postings`):

| seq | dr/cr | amount | account | source_transaction_type |
|---|---|---|---|---|
| 1 | debit | $16.00 | **6300** Bank Service Charges & Wire Fees | `bank_categorization` |
| 2 | credit | $16.00 | **1000** Bank of America - Operating (USMCA) | `bank_categorization` |

**DR = CR exactly.** Both postings and both accounts are `operating_company_id` = USMCA
(`acct_same_entity = true`) — no cross-entity account FK.

**★ The page's own caveat is ruled out.** The banner warns that `matched_journal_entry_id` is not
proof of posting because *"recon Match can also stamp it when `ledger_entry_kind = 'je'`"*. That
escape hatch does not apply here: **`source_transaction_type = 'bank_categorization'`** on both
legs, which can only come from the categorize path. This was a Post from the Categorize tab, not a
Match.

**Verdict: `BANK_FEED_GL_POSTING_ENABLED` is ON for USMCA and the poster fires on categorize.** The
banner telling the operator it *"stays OFF by default"* is not merely imprecise — it states the
opposite of live behaviour on the entity being viewed. `LV-BANKFLAG-STALE` upgraded from
UNVERIFIED to **CONFIRMED (major)**.

**Battery PASS recorded:** bank categorize → balanced GL. This drains the categorize half of
`CLS-BANK-MATCH-DENSITY`; the match-to-bill / match-to-invoice half remains.

**Module quality note (fair to the builders):** apart from the banner, this module is the best-built
surface encountered in the battery. The match engine returns real scored candidates from live ledger
data (bills, expenses, journal entries, with amount/date gaps and scores), the row carries
Driver/Unit/Trailer/**Trip (load)** linkage fields inline per §10, and it discloses its own limits
honestly ("Bank row attachments and notes are not wired yet"; "Draft fields below are not Law §9
links until Post / Categorize commits them"). The defect is the stale banner text, not the machinery.

### 19c — Bank MATCH: test INCOMPLETE (not a failure) — method correction recorded

Attempted the match half of `CLS-BANK-MATCH-DENSITY` on the 08/03/2026 `Wire Transfer Fee` $15.00.

**Result: no match persisted** — all four USMCA $15.00 rows still show `matched_bill_id`,
`matched_invoice_id` and `matched_journal_entry_id` = NULL.

**I am NOT recording this as a defect, because the test was invalid.** Two reasons, both verified:

1. **The browser tab died immediately after the click**, so the non-persistence could not be cleanly
   attributed to the app.
2. **More importantly, I clicked the wrong control.** The `find` tool reported a per-candidate
   "Match" button on the `USMCA-RB-002` bill card (`ref_241`). A direct DOM inspection disproves
   that: the expanded panel's complete button set is **`Match`, `Categorize`, `Split`, `Cancel`,
   `Post`, `Search all`, `Open match drawer`** — `Match`/`Categorize` are the row-level MODE toggle,
   not an apply. The candidate cards are **informational links to the bill**, with no apply action.
   Applying a match evidently goes through **`Open match drawer`**, which I did not reach.

So the correct method for the match test is: expand row → `Match` (mode) → **`Open match drawer`** →
select target → apply. **Re-run that way before any verdict.** Recorded as a method correction so the
next session does not repeat the same invalid attempt and mistake it for a finding.

**Lesson worth keeping:** the accessibility-tree `find` tool named a button that does not exist. On
this codebase, an a11y-tree claim about an actionable control must be confirmed in the DOM before it
is used as evidence — the same "verify, don't trust the convenient reading" rule that applies to a
0-row query.

### 19d — Categorize persistence re-proven across a full browser restart — PASS

The Chrome tab was lost and the session re-established from scratch. On reload the banking page still
reads **`For review · 111` / `Categorized · 4`** (from 112/3 before item 19b), with USMCA still the
selected entity. The categorize from 19b therefore survives a full client restart — server-side
persistence, not client state.

### 19e — ★ RESOLVED: bank MATCH is GATED BY DESIGN, not broken — no defect

Re-ran the match test through the correct path (expand row → `Match` → **`Open match drawer`**). The
drawer is the real apply surface: each candidate carries a radio + a **`Confirm match`** button, plus
an explicit gate label. Live state for the 08/03/2026 `Wire Transfer Fee` $15.00:

| candidate | amount | gate label shown | `Confirm match` |
|---|---|---|---|
| BILL `USMCA-RB-002` | $1.00 | **"Posting available after CHAIN-04"** | **disabled** |
| BILL `USMCA-TEST-BILL-05` | $0.05 | **"Posting available after CHAIN-04"** | **disabled** |
| JE `Bank categorization 49e3a071… posting` | $16.00 | "Variance posting pending balanced-JE proof (Tier-1)" | enabled |
| EXPENSE / JE (variance) ×5 | $1.00–$1,200 | "Variance posting pending balanced-JE proof (Tier-1)" | mostly disabled |

Drawer header states the contract outright:
> *"Exact-amount matches can be confirmed to link and clear — **no journal entry is posted**. Bill
> payments and any amount variance **stay held**. Candidates are live production ledger rows — never
> fixtures."*

**Conclusion — NO DEFECT.** Three facts, all from the running DOM:

1. **Bank → bill match is gated behind a named, disclosed dependency (`CHAIN-04`)** and the control is
   correctly **disabled**, not silently inert. That is the opposite of the `LV-*-NOSAVE` class.
2. **Amount-variance matches are deliberately held** pending Tier-1 balanced-JE proof — a conservative,
   correct stance for a money surface.
3. **My test could never have succeeded:** every candidate for this $15.00 row carries a variance
   ($1.00 to $1,185.00). There is no exact-amount candidate, and only exact-amount matches are
   confirmable. The earlier non-persistence (19c) is fully explained and was never app misbehaviour.

**Match ≠ posting, by design** — "confirmed to link and clear, no journal entry is posted". That is
consistent with the page banner's distinction and with `source_transaction_type='bank_categorization'`
being the thing that actually posted in 19b.

**`CLS-BANK-MATCH-DENSITY` — status recorded honestly:**
- **categorize half: DRAINED** (19b, balanced JE DR 6300 / CR 1000, persisted across a browser restart).
- **match half: BLOCKED UPSTREAM on `CHAIN-04`**, not failing. It cannot be drained by this lane until
  CHAIN-04 lands; re-test then with an **exact-amount** candidate. Not a board row — there is no defect
  to assign.

**Note for whoever owns `CHAIN-04`:** the bank-match half of this class is waiting on it, and USMCA now
has the density (163 transactions / 111 for review) to exercise it the moment it ships.

## 20 — FACTORING: cannot be exercised on USMCA — EXPECTED STATE, no defect

Battery item "factoring advance (link customer + invoice + reserve)". **It is not creatable on USMCA,
and that is correct.**

**Prod (`bypass_rls='lucia'`, discriminator on the same tables):**

| table | rows | n_live_tup | **n_tup_ins** |
|---|---|---|---|
| `accounting.factoring_advances` (all entities) | 0 | 0 | **0** |
| `accounting.factoring_advances` (USMCA) | 0 | — | — |
| `factoring.factor` (all entities) | **1** | — | — |
| `factoring.factor` (**USMCA**) | **0** | — | — |

**`factoring.factor` = 1 row globally and ZERO for USMCA — USMCA has no factor configured.** The Home
widget says the same in words: *"This entity has no factoring contract."* Per `ih35-entity-facts`,
Faro is **TRANSP's** factor; USMCA is not on a factoring agreement.

**So the zero is the correct answer, not a gap.** An advance cannot be linked to a customer/invoice/
reserve for an entity with no factor, and inventing one would be fabricating a financial relationship
that does not exist — exactly what the owner ruling on import-origin/expected-state forbids.

**`accounting.factoring_advances` `n_tup_ins = 0` across ALL entities** means no advance has ever been
recorded in the TMS by anyone. That is a real observation about system-wide coverage, but on **USMCA**
specifically it is expected and unactionable.

**No board row filed** — there is no defect to assign. This battery item is closed as **NOT APPLICABLE
TO USMCA**; it must be exercised on TRANSP, which this lane is forbidden to touch (real QBO books).
Recording that boundary explicitly so a later session does not "fix" it by seeding a fake factor.

**Module quality note:** the factoring tab is again exemplary about its own limits — *"zeros here are
not 'factoring healthy'… Use Recourse Pipeline / Reserve Tracker / Chargebacks for live Faro truth.
Do not invent Advances funded MTD from cash posting KPIs"* — and it names the canonical table
(`accounting.factoring_advances`) rather than implying health from a KPI tile.

## 21 — `LV-EXP-NOLOAD`: Record Expense cannot link a load — G18 unsatisfiable on this path — FAIL

**Expense → GL posting works** (confirms the board's GUARD-VERIFIED "Expense posting — record-expense
calls poster" card): USMCA has 2 expenses, both `Posted` with JE refs `ff286e60` / `b927818f`, GL
column `Posted`.

**But the create form cannot set the load link.** `/accounting/expenses` → `+ Create` → `Record
expense` offers exactly: Vendor · Category · Payment Date · Amount (USD) · **Truck/Unit (optional)** ·
Description · Payment method\* · Payment account\* · Receipts & documents. **There is no Load / Trip
field at all.**

**Why this matters — it is a documented hard rule, not a preference.** §4 of the standards:
*"Every diesel/roadside expense MUST FK to a load (G18, critical)."* On this path that FK **cannot be
supplied by the person recording the expense**. The Expenses list even renders a **`Load` column** —
which reads `—` on both existing USMCA rows, because nothing in this form can populate it.

**The capability exists elsewhere, which is what makes this an inconsistency rather than a missing
feature:** the **bank categorize** panel (item 19) carries inline **`Driver` / `Unit (truck)` /
`Trailer` / `Trip (load)`** fields on the bank row. So load-linking is built and wired there, but
absent from the dedicated expense-entry form.

**Consequence:** the battery item *"fuel expense WITH load link (IFTA)"* is **not creatable through
the accounting Record Expense path**. IFTA state-mileage attribution and per-load fuel cost both
depend on that FK.

**Scope stated honestly:** I have **not** established that NO path can create a load-linked expense —
the fuel module and the bank-categorize row are both plausible alternatives, and the maintenance
expense path requires a WO instead (item 15b). What is proven is that the **primary, general-purpose
expense-entry form omits the field**, while the list it feeds displays a column for it.
**UNVERIFIED — needs live check** on whether the fuel module supplies it.

Board row `LV-EXP-NOLOAD` (CC-2 mechanical/FE).

## 22 — FUEL module: GL mapping complete (PASS) · `LV-EXP-NOLOAD` scope RESOLVED

**PASS — Fuel → GL mapping coverage is complete for USMCA: `5 of 5 categories mapped`** —
`Diesel` · `DEF` · `Reefer fuel` · `Oil` · `Misc fuel`, each showing `mapped`. The page states its own
limit honestly: *"Read-only check of the expense category map (no GL posting is performed here)."*
Fuel Home KPIs are all zero (Active plans 0, MTD spend $0, Fleet MPG 0.0, Loves sync Never) with
`0` open fraud alerts and `0` card-overage queue.

**`LV-EXP-NOLOAD` scope question — now SETTLED (was UNVERIFIED in item 21).** The fuel module offers
tabs `Home · Planner · Relay inbox · Settings · Expense mapping · History & savings · Loves prices ·
Compliance` and an `IMPORT RELAY HISTORY` control. **There is no manual fuel-transaction create
anywhere in it** — the module is relay/import-driven, which matches the prod census on the board
(all 1,548 `fuel.fuel_transactions` are `relay_ingest`).

So the full picture across every expense entry path on USMCA:

| path | can set load link? |
|---|---|
| `/accounting/expenses` → Record expense | **NO** — no Load/Trip field (item 21) |
| Fuel module | **NO manual create at all** — relay/import only |
| Maintenance → Create Expense | requires a **Work order** first, and WO creation is dead (`LV-WO-NOSAVE`) |
| **Bank categorize row** | **YES** — inline `Driver` / `Unit (truck)` / `Trailer` / **`Trip (load)`** |

**Conclusion:** the ONLY surface on which a user can attach a load to an expense is the **bank
categorize row**. `LV-EXP-NOLOAD` therefore stands and is now fully scoped — it is not that the
capability is missing from the product, it is that it is reachable from exactly one screen, and not
from the screen actually named "Record expense". G18 (*every diesel/roadside expense MUST FK to a
load*) cannot be satisfied by someone entering an expense directly.

The board row `LV-EXP-NOLOAD` is updated from "UNVERIFIED on the fuel module" to **fuel module
confirmed to have no manual create path**.

## 23 — ★ COMPLIANCE: regulatory calendar correct + driver→compliance auto-linkage — PASS

`/compliance` on USMCA: `6 OVERDUE · 0 DUE SOON · 3 UPCOMING · 0 NOT YET TRACKED`. **Every row is
`Entity = USMCA`** — correctly scoped.

**★ The regulatory calendar is CORRECT against the actual federal/state rules** (checked against
`ih35-fmcsa-compliance`, not assumed):

| program | detail shown | due date | correct? |
|---|---|---|---|
| **Form 2290 / HVUT** | Annual Heavy Vehicle Use Tax filing | **08/31/2026** | ✅ 2290 tax period runs Jul 1–Jun 30, filing due Aug 31 |
| **IFTA Quarterly Fuel Tax Return** | **Q3 2026** return | **10/31/2026** | ✅ Q3 (Jul–Sep) is due Oct 31 — the correct quarter *and* the correct deadline |
| **Texas Business Personal Property Tax Rendition** | 2027 rendition, **Tax Code §22.23, due Apr 15** | 04/15/2027 | ✅ statute cited correctly |
| **Drug & Alcohol Clearinghouse Query** ×3 | annual query, **49 CFR §382.701** | — (Overdue) | ✅ correct CFR cite |
| **Annual MVR Review** ×3 | annual motor vehicle record review, **49 CFR §391.25** | — (Overdue) | ✅ correct CFR cite |

This matters because the board records a prior defect class where *"a regulatory calendar lived in
nobody's head (e.g. the IFTA wrong-quarter bug)."* On this entity, live, **the quarter and the
deadline are both right**, and the statutes are cited rather than paraphrased.

**★ DRIVER → COMPLIANCE AUTO-LINKAGE CONFIRMED (§10).** The overdue rows include
**`TEST Driver-One-20260806`** — the driver I created in item 06 — with **both** an annual
Clearinghouse query (§382.701) and an annual MVR review (§391.25) generated for it, alongside the
same two obligations for `TEST DRIVER-USMCA` and `Juan USMCA-Battery`. **Creating a driver
automatically spawned its federal compliance obligations, with no manual step.** That is exactly the
total-connectivity behaviour §10 requires, working end to end.

**Battery PASS.** No defect. This is the strongest module result so far: correct regulation, correct
dates, correct citations, correct entity scoping, and automatic driver→obligation wiring.

Note the 6 "Overdue" items are **expected state**, not a defect — they are annual obligations for
drivers that have just been created in a test entity with no prior query/review history. Flagging
them as overdue is the correct behaviour.

## 24 — ★ REQUIRED DOCUMENTS: FMCSA matrix correct + owner decision E1/W-8BEN implemented — PASS

`/compliance?tab=required_docs` → sub-tabs `Drivers · Units · Customers · Vendors`. Header states the
model plainly: *"Which documents are required per record. Warn-first; promote any to a hard block.
Seeded from FMCSA/IRS defaults."* Drivers tab, 6 rows, all `Source = Regulatory default`,
`Enforcement = Warn`, each with a `Make hard block` action:

| document | authority | expiry |
|---|---|---|
| Commercial Driver License (`cdl`) | **FMCSA §383** | Tracked |
| DOT Medical Certificate (`med_cert`) | **FMCSA §391.41** | Tracked |
| Motor Vehicle Record (`mvr`) | **FMCSA §391.25** | Tracked |
| Drug & Alcohol Clearinghouse (`clearinghouse`) | **FMCSA §382.701** | Tracked |
| Driver Employment Application (`driver_application`) | **FMCSA §391.21** | — |
| **Form W-9 (or W-8BEN if foreign)** (`w9`) | **IRS** | — |

**Every citation is correct** — §383 CDL, §391.41 medical certificate, §391.25 MVR, §382.701
Clearinghouse, §391.21 employment application. Checked against `ih35-fmcsa-compliance`, not assumed.

**★ OWNER DECISION IMPLEMENTED — verified, not asserted.** `CPA ANSWERS.docx` §12 states:
*"We need to include the wben8 treasure form to confirm that the person does exist in Mexico, it
should go in the driver file when hiring and renew every year."* And `OWNER-DECISIONS-FINAL`
**E1 — "no withholding from anyone; W-8BEN on file + in Legal."** The **`Form W-9 (or W-8BEN if
foreign)`** row is live in the driver required-documents matrix under IRS authority. **The owner
decision is built, not pending.** This is exactly the driver model the standards describe — Mexican
B1 1099 contractors, so a W-8BEN rather than a W-4.

**The warn-first / promote-to-hard-block design is the right control shape**: it surfaces the gap
without blocking operations by default, and lets the carrier escalate any single document to a hard
dispatch block. That matches how McLeod/Alvys handle driver-qualification enforcement.

**Battery PASS.** No defect.

**Minor note (recorded, not boarded):** navigating directly to `/compliance/required-documents`
silently redirects to `/home` rather than resolving or 404-ing; the tab is reachable only via
`/compliance?tab=required_docs`. A deep link that quietly lands somewhere unrelated is a small
usability wart, not a data defect.

## 25 — REQUIRED DOCUMENTS · UNITS tab: vehicle matrix correct — PASS

`Units` sub-tab, 5 rows, all `Regulatory default` / `Warn` / `Tracked` expiry:

| document | authority | correct? |
|---|---|---|
| Vehicle Registration (cab card) (`registration`) | State DMV | ✅ |
| **Annual DOT Inspection** (`annual_inspection`) | **FMCSA §396.17** | ✅ §396.17 is the annual-inspection rule |
| IFTA License / Decal (`ifta`) | IFTA | ✅ |
| **Form 2290 (HVUT) Schedule 1** (`form_2290`) | **IRS Form 2290** | ✅ Schedule 1 is the proof-of-payment doc |
| Insurance / Cab-card proof (`insurance`) | State / FMCSA | ✅ |

Every vehicle-side requirement in the FMCSA/IRS matrix is present and correctly attributed — annual
DOT inspection, registration, IFTA, 2290 Schedule 1, insurance. Combined with the Drivers tab
(item 24), the required-documents matrix covers **both** the driver-qualification file and the
vehicle file with correct authorities throughout.

**Battery PASS.** No defect. The compliance module (items 23–25) is the strongest area verified in
this battery: correct regulatory calendar, correct CFR/IRS citations on both drivers and units,
correct entity scoping, automatic driver→obligation generation, and an implemented owner decision
(W-8BEN). Nothing here needed a board row.

## 26 — `LV-CREDITMEMO-NOPATH`: AR credit memo and AP vendor credit have NO create path — FAIL

Battery items *"AR … credit memo"* and *"AP … vendor credit"*. **Neither can be created.**

**UI — exhaustively checked, not sampled.** On `/accounting/invoices`:
- `+ Create ▾` offers exactly: `New Bill` · `Expense` · `Invoice` · `Receive payment` · `Journal entry`.
- The `More ▾` accounting menu was enumerated from the DOM — **120 distinct menu items** — and the
  only credit/memo/refund match is the string **`Memo`**, which is a table COLUMN HEADER, not a
  route. There is **no Credit memo and no Vendor credit anywhere in accounting navigation**.
- The invoice detail (item 14) offers only `Print` · `View invoice PDF` · `Send` · `Void`.

**Prod — the tables exist, so this is unrouted, not undesigned:**

| table | rows | **n_tup_ins** | meaning |
|---|---|---|---|
| `accounting.credit_memos` | 0 | **0** | exists, **never written by anyone, ever** |
| `accounting.vendor_credit_applications` | 0 | **0** | exists, never written |
| `accounting.vendor_credits` | **6** | 6 | see origin below |
| `mdata.qbo_vendor_credits` (mirror) | 6 | 6 | — |

**Origin census on `accounting.vendor_credits` (the discriminator that settles it):** all **6 rows are
`TRANSP`**, **`qbo_id IS NOT NULL` on all 6**, **`tms_native = 0`**, `source_system = 'qbo'`.
**USMCA has zero.** So every vendor credit in the system is a QBO clone on the real-books entity —
**the TMS has never originated a vendor credit, and has never written a credit memo at all.**

**Expected-state test applied (owner ruling 2026-08-04):** the 6 QBO-origin rows are legitimately
imported and are NOT a defect — no backfill, no invented data. **The defect is the absent create
path**, which is a different thing and is not exempted by the origin rule.

**Consequence:** AR cannot issue a customer credit, and AP cannot record a vendor credit, through the
product. For a system targeting QuickBooks/NetSuite parity these are baseline AR/AP documents —
QBO has both as first-class create actions.

Board row `LV-CREDITMEMO-NOPATH` (CC-2 mechanical/route; **CC-1 to confirm the posting treatment**
before the route is wired, since a credit memo is GL-affecting).

## 27 — RECURRING BILL TEMPLATE — PASS (first ever created in the system)

`/accounting/recurring-transactions` → redirects to `/accounting/bills/recurring` → `+ Create`.
Full-page form (not a drawer): Template Name\* · Vendor\* · Amount\* · Memo · Frequency\* ·
First Generation Date\* · End Date · **`Auto-post bill to ledger when generated`** · Line Items.

**Created and verified on prod (`accounting.recurring_bill_templates`):**

| field | value |
|---|---|
| `uuid` | `17f2ab49-c4d0-4bc0-99d1-e8bfb0ed0e8a` |
| `template_name` | TEST Recurring Bill 20260806 - CC3 battery |
| `amount` | **425.00** |
| `frequency` | `monthly` |
| `next_generation_date` | **2026-09-06** |
| `auto_post` | **true** (checkbox honoured) |
| `is_active` | true |
| `vendor_uuid` | `308f6434-…` → **CC3 Battery Vendor 20260806-01** |
| `vendor_opco` | `5c854333-…` **= USMCA** |
| `operating_company_id` | `5c854333-…` **USMCA** |

**★ `n_tup_ins` went 0 → 1 — this is the FIRST recurring bill template ever written in this system,
on any entity.** The table existed and had never been exercised.

**Both-way linkage correct (§10):** the template's `vendor_uuid` resolves to the vendor created in
battery item 01, and **the vendor's own `operating_company_id` is USMCA — same entity as the
template**, so there is no cross-entity vendor reference. The `auto_post` flag persisted as checked,
which is the control that decides whether generated bills hit the ledger.

**Battery PASS.** No defect.

**Observation recorded, not boarded:** there are three recurring tables —
`accounting.recurring_bill_templates` (now 1 row), `accounting.recurring_bill_generation_log`
(`n_tup_ins` 0) and `accounting.recurring_templates` (`n_tup_ins` **0**). The write landed in
`recurring_bill_templates`; `recurring_templates` has never been written by anything and looks like a
RETIRE/superseded table. Worth confirming against the §10 canonical map before any future block
targets it — a builder picking `recurring_templates` by name would write to a dead table.

**Not yet provable:** whether generation actually fires on `2026-09-06` and whether `auto_post`
produces a balanced JE. That is a **future-dated cron behaviour** — it cannot be observed today
without waiting or forcing the job. **UNVERIFIED — needs a live check on/after 2026-09-06**, or a
forced generation run. Recorded rather than assumed.

## 28 — ★★ `LV-VOID-NO-REVERSAL`: bills are VOIDED but NEVER REVERSED — $1,643.21 still on the USMCA books — FAIL (critical, money)

**The void-reversal pass found the most serious defect of this battery.**

Another lane ran a duplicate-void remediation at **`2026-08-07 00:33:50.999787+00`** (all four voids
share that exact timestamp), voiding one of each duplicate pair and leaving the sibling live —
including the `LV-AP-DUP` pair I reported. **The void half is correct. The reversal half never
happened.**

**Evidence 1 — the voided bill's own postings.** `55997ecb-2a81-4b01-ab70-c23f41d3829d`
(`voided_at 2026-08-07 00:33:50`) still carries **only its two ORIGINAL postings**:
DR 5400 $743.21 / CR 2000 $743.21, created `2026-08-06T16:41:39.304Z`. Both rows read
**`reversed_by_line_id = NULL`** and **`reversal_of_line_id = NULL`**. **No reversing entry exists.**

**Evidence 2 — the aggregate across every voided USMCA bill:**

| measure | value |
|---|---|
| voided bills (USMCA) | **4** |
| voided bills that carry GL postings | **3** |
| postings sitting on voided bills | **6** |
| **reversal postings among them** | **0** |
| **cents still on the books from voided bills** | **164,321 = $1,643.21** |

**Evidence 3 — the account balances, which is what an auditor would see:**

| account | net (all) | **net from VOIDED bills** | share |
|---|---|---|---|
| **2000 Accounts Payable (A/P)** | $3,138.47 Cr | **$1,643.21 Cr** | **52% of A/P is voided-bill residue** |
| **5400 Truck Repairs & Maintenance** | $2,837.47 Dr | **$1,643.21 Dr** | **58% of the expense is voided-bill residue** |

**This violates the single most-repeated law in this repo.** PERMANENT LAW §4 and standing-order
rule 5: **"VOID = reversal; nothing is deletable."** A void that sets `voided_at` without posting a
reversing JE does not undo anything — it hides the document while leaving the money on the ledger.
The books now show A/P and expense overstated by **$1,643.21** on USMCA.

**Note the figure:** `$1,643.21` is exactly the overstatement named in CC-1's PR **#4614**
(*"ACCT-F142 — the TMS can enter the same vendor bill twice; $1,643.21 overstated A/P live on prod"*).
So the duplicate was correctly identified and the bills were correctly marked void — **but the
overstatement it was meant to correct is still there**, because the void produced no reversal.

**What is NOT wrong (stated fairly):** the originals are preserved — all four voided bills still
exist as rows with `voided_at` set, none deleted. That half of WORM holds. Siblings are untouched
(`5a1d7268`, `304f5fa3`, `0fe49cd0` all still `(live)`). The defect is precisely and only the
missing reversing entry.

**FIX REQUIREMENT (CC-1, money):** the void path must post a reversing JE — DR 2000 / CR 5400 for
each voided bill's original amount, same entity, linked to the original via
`reversal_of_line_id` / `reversed_by_line_id`, reusing the existing poster (**write no new GL math**).
Then back-post reversals for the 3 already-voided bills carrying live postings so the $1,643.21 clears.

**GUARD:** assert no bill with `voided_at IS NOT NULL` has un-reversed postings — i.e. for every
voided source transaction, `SUM(debit) - SUM(credit) = 0` across original + reversal, and every
original posting has a non-null `reversed_by_line_id`. This is a shrink-only ratchet and would have
caught this the moment the void ran.

Board row `LV-VOID-NO-REVERSAL` — **CC-1, critical**.

### 28a — `LV-VOID-NO-REVERSAL` extends to AR: it is the VOID PATH, not a bill-specific bug

Checked every USMCA invoice for the same shape:

| invoice | status | total | voided_at | postings | **reversals** | verdict |
|---|---|---|---|---|---|---|
| INV-2026-00001 | void | $1.00 | 2026-08-05 23:16:48 | **2** | **0** | ❌ **same defect — un-reversed** |
| INV-2026-00002 | void | $1.00 | 2026-08-05 23:16:48 | 0 | 0 | ✅ nothing to reverse (never posted) |
| INV-2026-00004 | void | $0.00 | 2026-08-05 23:14:59 | 0 | 0 | ✅ nothing to reverse |
| INV-2026-00003 | partial | $1,200.00 | (live) | 2 | 0 | ✅ live, correctly posted |
| INV-2026-00005 | proforma | $2,450.00 | (live) | 0 | 0 | ✅ correct — Event 1 has not fired (item 16) |

**So the defect is in the VOID PATH ITSELF, across document types** — AR and AP both. `INV-2026-00001`
was voided on **2026-08-05**, two days before the bill voids, and is *also* un-reversed. This is not a
one-off from the recent duplicate remediation; it is how void has been behaving.

**Materially:** the AR residue is only **$1.00**, so the dollar exposure remains dominated by the
$1,643.21 on the AP side. But the *fix* must be made at the void path, not patched per-document-type,
or the next voided invoice reintroduces it at whatever amount that invoice happens to carry.

**WORM checklist result for the void pass — 3 of 5 PASS:**

| requirement | result |
|---|---|
| a. reversing JE posted, DR=CR nets zero | ❌ **FAIL — no reversal exists on any voided doc** |
| b. original preserved (`voided_at` set, not deleted) | ✅ PASS — all 4 bills + 3 invoices still exist as rows |
| c. append-only audit row written | ✅ PASS — **4 `audit.row_changes` rows on `bills`** at the exact void timestamp, one per voided bill (audit table 2,312,528 rows total) |
| d. siblings untouched | ✅ PASS — `5a1d7268`, `304f5fa3`, `0fe49cd0` all still `(live)` |
| e. entity balance reflects the net correctly | ❌ **FAIL — $1,643.21 residue in 2000/5400** |

Both failures are the same single missing behaviour. Everything else about void is correct.

### 28b — ★ The reversal flag was ON. "It was gated off" is NOT the explanation.

Before CC-1 investigates `LV-VOID-NO-REVERSAL`, the obvious first hypothesis — *the reversal was
gated off* — is **ruled out on prod**:

| flag | TRANSP | TRK | **USMCA** |
|---|---|---|---|
| **`MONEY_CONTROL_VOID_REVERSAL_ENABLED`** | true | true | **true** |
| `VOID_ENFORCEMENT_ENABLED` | true | true | **true** |
| `WO_VOID_ENABLED` | true | true | **true** |
| `VOID_QBO_MIRROR_ENABLED` | false | false | **false** ✅ correct — no QBO write-back |

**The void-reversal control is ENABLED for USMCA and the reversal still did not post.** So this is a
code defect in the void path, not a configuration state. (Note the same key-default-vs-override
pattern as `LV-BANKFLAG-STALE`: CI logs describe this key as "per-entity, default OFF", and the
per-entity override is ON — the effective state is what matters.)

`VOID_QBO_MIRROR_ENABLED = false` on all three is **correct and should stay** — QBO write-back is
never on (parallel books). Nothing in the fix should change that flag.

### 28c — Void/cancel pass: remaining voidable inventory on USMCA

| document | total | voided/cancelled |
|---|---|---|
| customer payments | 1 | 0 |
| journal entries | 19 | 0 |
| driver settlements | **1** | 0 |
| vendor credits | **0** | — (no create path, item 26) |
| loads | 3 | 0 |
| work orders | **0** | — (cannot be created, `LV-WO-NOSAVE`) |

Two battery items are **structurally unreachable**, not skipped: **vendor-credit void** (nothing can
create a vendor credit — item 26) and **work-order cancel** (nothing can create a WO — item 15).
Recorded so they are not later mistaken for untested.

`driver_settlements` moved 0 → **1** since the previous baseline — another lane created one. Noted per
the diff-don't-assume rule.

### 28d — The three inert submit handlers are STILL UNFIXED on the current deploy

Prod advanced twice this session (`e6343f4` → `251eaf7` → `bf1a21c`). **No fix has landed for any of
the three.** Verified by reading `origin/main` history rather than re-clicking the UI: the only
work-order commit in the window is `68c32e162` (MNT-F05, entity scope on the WO load number) — not
the submit handler. Nothing touches the stops save or the liability spawn.

So `LV-STOPS-NOSAVE`, `LV-WO-NOSAVE` and `LV-SPAWN-LIABILITY-NOSAVE` remain OPEN and still block
delivery→revenue, the whole Maintenance module, and Safety→Insurance→Legal. **Re-testing them in the
browser would prove nothing while the code is unchanged** — cheaper and more honest to say so than to
re-run the clicks and report the same failure as if it were new evidence.

**Landed this session and relevant:** `915ab9b43` (CC-1 ACCT-F142 — the duplicate-bill fix, which is
what performed the voids in item 28) and `df429772e` (CI-DEPENDABOT — matches my `LV-CI-DEPENDABOT-RED`).

## 29 — ★★ `LV-REVREC-NOT-FIRING`: Event 1 of the two-event revenue latch does NOT fire on delivery — FAIL (critical, money) — resolves the GL-DARK P0

Item 16 left `CLS-SUBLEDGER-GL-DARK` **UNVERIFIED** because I could not reach a delivered load
(`LV-STOPS-NOSAVE` blocked it). **Two USMCA loads have since reached delivery status**, so the test
is now runnable — and it fails.

**All four preconditions are satisfied, verified individually on prod:**

| precondition | state |
|---|---|
| 1. Owner-locked rule exists | ✅ `.block-ready/REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19.json`: **Event 1 at `delivered` / `delivered_pending_docs` → DR Unbilled Revenue / CR Line-Haul Income** |
| 2. Flags enabled for USMCA | ✅ `REVENUE_RECOGNITION_ENABLED` **true**, `REVENUE_RECOGNITION_POST_ENABLED` **true** (item 16b) |
| 3. **The account exists** | ✅ `catalogs.accounts` **USMCA `1150` "Unbilled Revenue"**, type Asset (TRANSP has `1240`) |
| 4. **A load is in the trigger state** | ✅ `LUSMCAFREIGHT-20260806-0001` = **`delivered_pending_docs`**; `L-20260802-0258` = **`delivered`** |

**And the posting is absent:**

| account | postings | net | source types |
|---|---|---|---|
| **1150 Unbilled Revenue (USMCA)** | **0** | — | — |
| 4000 Freight / Line-haul Income | 3 | $1,200.00 Cr | **`invoice` only** |

**Zero postings to Unbilled Revenue.** Every dollar of revenue on USMCA arrived via
`source_transaction_type = 'invoice'` — the direct invoice path — **not one came from a delivery
event.** Event 1 has never fired.

**This is the GL-DARK P0, now proven rather than inferred.** The earlier honest verdict was
"UNVERIFIED — could not reach a delivered load." That obstacle is gone, and with the account present,
the flags on, and a load sitting in the exact trigger state the locked spec names, the conclusion is
no longer avoidable: **the delivery→revenue latch is not wired to fire.**

**Why the account check mattered:** had `1150` been missing, this would have been a seeding gap, not
a posting gap — a completely different fix owned by a different lane. I checked before concluding;
the account is present, so the defect is the trigger.

**Secondary gap recorded:** the locked spec says *"USMCA seeds Unbilled **+ Deferred** flagged dormant
until loads."* USMCA has **Unbilled (1150) but NO Deferred Revenue account** — TRANSP has
`QBO-340 Deferred Revenue`, USMCA has none. Event 2 / deferred treatment may need it. Flagged, not
assumed to be a defect: it may be legitimately unnecessary until deferred revenue actually arises.

Board row `LV-REVREC-NOT-FIRING` — **CC-1, critical**. Note this is a **different defect** from
`LV-VOID-NO-REVERSAL` (item 28) — that one is the void path, this one is the delivery trigger — but
both share a shape worth naming: **a flag is ON, the machinery is present, and the posting simply
never happens.** Two independent money paths with that shape suggests checking whether other
flag-gated posters are equally inert.

## 30 — `LV-PAY-SETTLE-NOPOST`: a live customer payment and a CLOSED settlement both have ZERO GL — FAIL (money)

| document | id | state | GL postings |
|---|---|---|---|
| customer payment | `a0b83bf5-c9fb-485c-a646-9090b8630bb0` | **$250.00, `voided_at` NULL — LIVE** | **0** |
| driver settlement | `d3ff8ea3-4acd-4792-b3ad-fdad6383fbb2` | **status `closed`** | **0** |

Both are money documents in a **final** state carrying **no ledger entry at all**. A received customer
payment should post DR Cash / CR A/R; a closed driver settlement should post its earnings, deductions
and escrow contribution. Neither did.

### 30a — ★ I must correct my own speculation from item 29

In item 29 I suggested the "flag ON + machinery present + posting never happens" shape might be
**systemic**. **The evidence says it is not, and I am correcting that.** Poster census on USMCA
(`journal_entry_postings` grouped by `source_transaction_type`):

| poster | postings | JEs | works? |
|---|---|---|---|
| `bill` | 16 | 8 | ✅ |
| `bank_categorization` | 8 | 4 | ✅ |
| `invoice` | 4 | 2 | ✅ |
| `expense` | 4 | 2 | ✅ |
| `prepaid_purchase` | 2 | 1 | ✅ |
| `transfer` | 2 | 1 | ✅ |
| `(null)` | 2 | 1 | ⚠️ posting with **no `source_transaction_type`** — minor data-quality note |

**Six posters demonstrably fire.** The money engine broadly works. So the correct characterisation is
**four specific inert paths**, not a systemic failure:

1. **revenue-on-delivery** (Event 1) — item 29
2. **void-reversal** — item 28
3. **customer payment** — this item
4. **driver settlement** — this item

That distinction matters for whoever picks this up: it is four targeted wirings against a working
poster, **not** a rebuild of the posting engine. Overstating it as systemic would have sent a builder
down the wrong path — which is why the census was worth running before repeating the claim.

**Caveat stated honestly:** a settlement in `closed` state *should* have posted, and a live customer
payment *should* have posted — but I have **not** read the code to confirm those are the intended
trigger points, and there may be a further "paid"/"disbursed" step for settlements. **The zero-GL
facts are proven; the exact intended trigger is UNVERIFIED.** CC-1 should confirm the trigger before
wiring.

Board row `LV-PAY-SETTLE-NOPOST` (CC-1, money).

## 31 — ★ LOAD CANCEL — PASS on all five WORM criteria, with a working cascade

Cancelled `L-20260806-0005` (`a0b1df25-…`, assigned-not-dispatched — the realistic cancel case)
through the real UI. The modal is well built: **Cancellation Reason (required)**, **Notes (min 20
chars, required)**, **Billable to customer**, optional **Cancellation charge**, and `Confirm Cancel`
**disabled until a reason is selected**.

**Cancellation-reason catalog loads correctly** with real codes — `CUST_NO_LONGER_NEEDED`,
`CUST_RATE_TOO_LOW`, `CUST_NO_SHOW_AT_PICKUP`, `CUST_DOUBLE_BROKERED`, "No available unit" — plus an
inline `+ Create cancellation reason` (the §7 inline-create pattern). Note this catalog works while 21
others 500 (`LV-CAT-500`) — it is served by a different endpoint.

**Result on prod:**

| check | result |
|---|---|
| a. reversing entry | **N/A — correctly** (the linked invoice was a `proforma` with **0 postings**; there was nothing to reverse) |
| b. original preserved | ✅ `status = cancelled`, **`soft_deleted_at` NULL — not deleted** |
| c. append-only audit row | ✅ **1,828 audit rows** in the window, covering **`loads` AND `invoices`** — both the cancel and the cascade were audited |
| d. siblings untouched | ✅ `LUSMCAFREIGHT-20260806-0001` still `delivered_pending_docs`; `L-20260802-0258` still `delivered` |
| e. entity balance correct | ✅ no GL impact — the proforma never posted, so nothing to unwind |

**★ THE CASCADE WORKS:** cancelling the load **auto-voided its linked invoice** —
`INV-2026-00005` moved to `status = void`. Load→invoice cascade is wired, and it did the right thing
(a proforma for a cancelled load should not survive).

### 31a — ★ This is the diagnostic contrast CC-1 needs for `LV-VOID-NO-REVERSAL`

**The CANCEL path is correct. The VOID path is not.** Same system, same entity, same WORM law:

| | cancel (item 31) | void (item 28) |
|---|---|---|
| original preserved | ✅ | ✅ |
| audit row written | ✅ | ✅ |
| siblings untouched | ✅ | ✅ |
| **reversal posted** | ✅ N/A, nothing to reverse | ❌ **$1,643.21 left on the books** |
| cascade to linked docs | ✅ invoice auto-voided | — |

So the void defect is **not** a missing framework — cancel demonstrates the surrounding machinery
(audit, preservation, cascade) all works. **CC-1 should diff the cancel implementation against the
void implementation**; the cancel path appears to do correctly what void omits. That is a far cheaper
starting point than writing reversal logic from scratch, and it satisfies "reuse the existing poster,
write no new GL math."

**Caveat:** cancel was tested on a load whose invoice had **zero postings**, so it never had to emit a
reversal. This proves cancel's preservation/audit/cascade behaviour, **not** that cancel would post a
correct reversal if there were postings to unwind. **UNVERIFIED** on that specific point — do not read
this as proof that cancel reverses correctly.

### 28e — ★ `LV-VOID-NO-REVERSAL` verified at the JOURNAL-ENTRY level too — the ledger never learns the bill was voided

I originally proved this at **posting** level (`reversal_of_line_id` / `reversed_by_line_id` NULL).
`accounting.journal_entries` also carries its own reversal columns (`reversed_by_je_id`,
`reverses_je_id`, `voided_at`, `void_reason`), so I re-checked there before letting my own finding
stand. **It holds, and the JE-level view is the cleaner statement of the defect.**

**USMCA journal entries, whole-entity census:** 19 total, **all `status = posted`**,
**0 voided**, **0 with `reversed_by_je_id`**, **0 that are themselves a reversal (`reverses_je_id`)**.
There is no reversing journal entry anywhere on this entity.

**The three JEs behind the voided bills — every one still fully posted:**

| bill | amount | bill `voided_at` | JE | **JE status** | JE voided | reversed_by |
|---|---|---|---|---|---|---|
| CC3-BILL-20260806-01 | $743.21 | 2026-08-07 00:33:50 | `811cb8bc-99dd-41ab-8822-1a9219d94a6c` | **posted** | not voided | none |
| TEST-BILL-0806-A | $450.00 | 2026-08-07 00:33:50 | `570ba3b6-7795-4cd7-98c5-596af46a501e` | **posted** | not voided | none |
| TEST-BILL-0806-A | $450.00 | 2026-08-07 00:33:50 | `faeccb0d-cbc3-4fc0-b2b8-9be7206cf7b5` | **posted** | not voided | none |

$743.21 + $450.00 + $450.00 = **$1,643.21** — matching the residue measured in item 28 exactly, from
an independent direction.

**The sharpest way to state the defect: the bill is voided, but its journal entry is still
`status = posted`, not voided, and has no reversal. The ledger never learns the bill was voided at
all.** Voiding currently touches only the subledger document; the GL is left untouched.

**This gives CC-1 three exact JE targets** for the back-post, and tells them the fix must address the
journal entry (void or reverse it), not merely stamp `voided_at` on the bill.

**Method note:** I checked the JE-level columns specifically because finding the defect at posting
level did not rule out the reversal being recorded elsewhere. Had `reversed_by_je_id` been populated,
my original finding would have been wrong. It was worth the one query to be sure of my own claim
before CC-1 spends time on it.

### 28f — ★★ REFINEMENT: invoice-void DOES reverse. Bill-void does not. There is a working reference implementation.

The Manual Journal Entries screen surfaced JE `43b3ed80-c2f6-4fa1-a53d-6ba0d480697c`, memo
**"Void reversal of invoice e4d2ebdd-…"**, dated **2026-08-02**. Verified on prod:

| field | value |
|---|---|
| status / source | `posted` / `auto` |
| **legs** | **`1100 credit $1.00` \| `4000 debit $1.00`** — a correct flip of an invoice posting (DR A/R / CR Revenue reversed) |
| `reverses_je_id` | **NULL** |
| `reversed_by_je_id` | **NULL** |

**Two conclusions, and they change the shape of `LV-VOID-NO-REVERSAL`:**

**1. The reversal capability EXISTS and has fired correctly — for INVOICE void.** An automatic,
balanced, correctly-flipped reversing JE was produced on 08/02. So this is **not** a missing
framework and **not** "reversal has never worked." **Bill void (08/07) simply does not do what
invoice void does.** CC-1 has a working reference implementation to copy rather than logic to invent
— which is both cheaper and satisfies "reuse the existing poster, write no new GL math."

**2. Even the working reversal leaves `reverses_je_id` NULL.** The reversing JE is not linked to the
entry it reverses. So there is **no programmatic way to walk reversal → original**; the relationship
survives only as free text in the memo. That is a real audit-trail weakness independent of the bill
defect: a reversal that cannot be traced to its original is not a complete audit chain, and any
report or guard trying to net originals against reversals cannot do it by join.

**Revised statement of the defect for CC-1:**
- **(a)** bill void does not emit the reversing JE that invoice void does — **copy the invoice-void path**;
- **(b)** when a reversal IS emitted, populate `reverses_je_id` / `reversed_by_je_id` so the chain is
  traceable — currently the only link is prose in `memo`.

**Correcting my own earlier wording:** items 28/28e said "no reversing journal entry exists anywhere
on this entity." That was true of the **`reverses_je_id` census** but **overstated as prose** — a
reversal JE does exist (43b3ed80); it simply isn't *linked*, which is why the column-based census
returned zero. The measurement was right, my sentence around it was too broad, and the corrected
version above is what CC-1 should work from.

## 32 — ★★ JE VOID — PERFECT WORM REVERSAL (PASS) — and it pinpoints the bill-void defect exactly

Voided JE `ff286e60` (Expense posting, $1.00) through the real UI. The drawer states its contract
up front: *"Voiding posts an **equal-and-opposite reversing entry** and keeps the audit trail. This
can't be undone."* Reason required (min 3 chars). **It delivers exactly that.**

**Prod result — the pair:**

| | original `ff286e60-f3d2-4912-8e3d-15dbc5f5b8a8` | reversal `ea6a0f05-39df-465d-ba69-1385ccdf57ab` |
|---|---|---|
| memo | Expense 2b520d35… posting | **"Reversal of journal entry ff286e60-…"** |
| legs | **6160 debit $1.00 \| 1000 credit $1.00** | **6160 credit $1.00 \| 1000 debit $1.00** ← exact opposite |
| status | `posted` (preserved, not deleted) | `posted` |
| `reversed_by_je_id` | **`ea6a0f05…`** ✅ forward link | (NULL) |
| `reverses_je_id` | (NULL) | **`ff286e60…`** ✅ back link |
| `void_reason` | — | **"CC3 live battery - WORM reversal verification…"** ✅ captured |
| net | 0 (balanced) | 0 (balanced) |

USMCA JEs 19 → **20**. Every WORM criterion met: equal-and-opposite reversal, original preserved,
reason recorded, **bidirectional linkage populated**, nets to zero.

### 32a — ★★ THE DISCRIMINATOR: three void implementations, three quality levels

This is the most actionable form of `LV-VOID-NO-REVERSAL`. The same system contains **three different
void behaviours**:

| void path | posts reversal? | links `reverses_je_id` / `reversed_by_je_id`? | evidence |
|---|---|---|---|
| **JE void** | ✅ **yes, equal-and-opposite** | ✅ **yes, BOTH directions** | `ff286e60` ↔ `ea6a0f05` (this item) |
| **Invoice void** | ✅ yes | ❌ **no — NULL both ways** | `43b3ed80` (item 28f) |
| **Bill void** | ❌ **no reversal at all** | ❌ n/a | `811cb8bc`, `570ba3b6`, `faeccb0d` (items 28/28e) |

**So the reversal service exists and is CORRECT — bill void simply never calls it.** The fix is not to
write reversal logic; it is to make bill void do what **JE void** already does. JE void is the
best-in-class reference in this codebase: it reverses, preserves, records a reason, and links both
ways.

**I must correct my own earlier statement again:** in item 28f I wrote that `reverses_je_id` is
"never populated." **That was wrong** — it is populated correctly by the JE-void path; only the
invoice-void path leaves it NULL. The corrected picture is the quality ladder above, and it is more
useful than either of my earlier framings.

**Recommended order for CC-1:** (1) point bill void at the JE-void reversal service — that clears the
$1,643.21; (2) add the linkage population to invoice void so its reversals are traceable too;
(3) back-post reversals for the three already-voided bills.

## 33 — Controlled reproduction: bill → GL still PASSES on the current deploy

Created bill `CC3-VOIDTEST-20260807-01` (`7ccd431e-8e85-433a-a5e0-4425011ffb5e`) on deploy `9c62278`:
**$88.77**, Section-A category line `Repairs & maintenance`, vendor = the item-01 vendor.
**Prod: 2 postings, DR 5400 $88.77 / CR 2000 $88.77 — balanced, USMCA-scoped.**

So the bill→GL poster is **still working on the current deploy** — this is a fresh PASS, not a
carry-over from the earlier sample.

## 34 — ★★ `LV-AP-OPEN-INCLUDES-VOIDED`: the Open Bills KPI counts VOIDED bills — $1,766.66 overstated — FAIL (money)

The Bills screen headline reads **`OPEN BILLS $3,174.14 · 11 open`**. Prod says:

| measure | count | amount |
|---|---|---|
| all bills | 11 | **$3,174.14** |
| **live** (`voided_at IS NULL`) | **7** | **$1,407.48** |
| **voided** (`voided_at IS NOT NULL`) | **4** | **$1,766.66** |

**The UI's "OPEN BILLS" figure is `total_all` — it is the ALL-bills total, voided included.** Open
payables are overstated by **$1,766.66**, which is **56% of the displayed figure**. The count is wrong
the same way: 11 shown vs 7 actually live.

**Root cause is the same defect family as `LV-VOID-NO-REVERSAL`, and this makes it concrete:**
**every bill on this entity still has `status = 'unpaid'`, including all 4 voided ones.** Void sets
`voided_at` and nothing else — it does not move `status` to `void`, and the Open-Bills query filters
on `status`, not on `voided_at`. So a voided bill remains "open" everywhere that reads `status`.

Cross-check that the numbers hang together: the $1,766.66 of voided bills = the **$1,643.21** GL
residue (item 28) **+ $123.45** for the fourth voided bill, which had no GL postings.
Both measurements agree.

**Operational impact:** AP aging, cash-requirement forecasting and any vendor-payables report reading
`status` will overstate what the company owes. On the real-books entity this would misstate payables.

Board row `LV-AP-OPEN-INCLUDES-VOIDED` (CC-1, money). **Fix note:** setting `status = 'void'` on void
is likely the single change that corrects both this and the list display — but it must be done
**with** the reversing JE (item 32), not instead of it; correcting the label without correcting the
ledger would hide the $1,643.21 rather than clear it.

## 35 — `LV-BILLS-VENDOR-UUID`: the Bills list Vendor column shows raw UUIDs for every row — FAIL

The Bills list **Vendor** column renders the raw vendor UUID on **every row**, never a name:
`308f6434-0a51-4109-953e-c86ffb1f0999`, `d9bb802f-fad4-421c-a41e-a1e834e33362`,
`40fc1104-896b-4c42-9a5d-971a9e468a…`. Not one vendor name appears in a column headed "Vendor".

The AP bills list is therefore unusable for its primary purpose — telling an operator **who** each
bill is owed to. The data is present and resolvable (the same vendor renders correctly by name in the
bill create drawer and on the vendor detail page), so this is a projection/display defect, not
missing data.

Same class as `LV-INV-UUID` (raw load UUID on the invoice line) and the historical
"Class-UUID renders in picker" card — **resolve ids to human identifiers, entity-scoped**.

Board row `LV-BILLS-VENDOR-UUID` (CC-2 mechanical/FE).

## 36 — ★★ `LV-BILLVOID-DATE-ERROR`: the Void Bill action FAILS with a date-parse error — FAIL (critical) — and it re-diagnoses `LV-VOID-NO-REVERSAL`

Attempted the controlled reproduction: voided the fresh bill `CC3-VOIDTEST-20260807-01`
(`7ccd431e-8e85-433a-a5e0-4425011ffb5e`, $88.77, JE `6f63081e`) through the real UI on deploy
`fb0920c`, with a valid reason.

**The drawer returned a hard error:**

> **`invalid input syntax for type date: "Thu Aug 06"`**

That is a **Postgres date-parse failure**. A date is being sent to the database as the human-formatted
string **`"Thu Aug 06"`** (JavaScript `Date.prototype.toDateString()` shape, and note it is even
truncated — no year) instead of an ISO date. **The void never executes.**

**Prod confirms nothing happened:** the bill is still `voided_at (live)`, `status = 'unpaid'`, its 2
original postings intact, **0 reversal postings**, JE `6f63081e` still `status = posted` with
`reversed_by_je_id` NULL. USMCA JEs went 20 → 21, but the new JE is the bill's **own creation
posting** (`6f63081e`, "Bill CC3-VOIDTEST-20260807-01 posting", DR 5400 / CR 2000 $88.77) — **not a
reversal**. I checked that specifically rather than reading the count as success.

### 36a — ★ This RE-DIAGNOSES `LV-VOID-NO-REVERSAL`, and the correction matters

I had assumed the 4 previously-voided bills went through this UI path and that the path simply
omitted the reversal. **That cannot be what happened — this path cannot complete at all.**

So the accurate picture is:

- **The UI "Void Bill" action has never successfully run** — it dies on date parsing before doing anything.
- **The 4 bills that carry `voided_at` were therefore voided by some OTHER route** — almost certainly
  a direct SQL/script step in CC-1's ACCT-F142 duplicate remediation (all four share the identical
  timestamp `2026-08-07 00:33:50.999787+00`, which is the signature of a single UPDATE, not four user
  actions).
- **That explains the missing reversals cleanly:** a script that sets `voided_at` directly bypasses
  the reversal service entirely. It was never a case of the void path "forgetting" to reverse.

**Revised guidance for CC-1 — two separate defects, in this order:**
1. **`LV-BILLVOID-DATE-ERROR` (this item)** — fix the date serialisation so Void Bill can run at all.
   Until then the UI void is untestable and unusable.
2. **`LV-VOID-NO-REVERSAL`** — the **$1,643.21 already on the books** still needs back-posted
   reversals, because the rows were voided out-of-band. And once (1) is fixed, the UI path must be
   re-verified to confirm it actually emits the reversal its own drawer promises.

**The drawer's promise is now a stated contract:** *"Voiding posts an equal-and-opposite reversing
entry and keeps the audit trail."* Identical wording to the JE-void drawer, which **does** honour it
(item 32). So the bill-void drawer advertises behaviour that currently cannot execute.

**Honest note on my own earlier framing:** items 28/28e/28f/32 described bill void as "does not
reverse." That was a correct description of the *observed data* but an incorrect inference about the
*mechanism* — the UI path doesn't reverse because it doesn't run. The residue and the dollar figures
are unchanged and still stand; the causal story is now right.

Board row `LV-BILLVOID-DATE-ERROR` — **CC-1, critical** (blocks the void path entirely).
