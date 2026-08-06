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
