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
