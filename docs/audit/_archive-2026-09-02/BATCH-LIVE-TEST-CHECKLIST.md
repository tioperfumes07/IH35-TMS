# BATCH LIVE-TEST CHECKLIST — Owner Single-Session Cert Gate

> **Purpose:** One login session, both entities (TRANSP → USMCA), exercises every
> D-layer picker + E-layer design-bar surface. This pass is the certification gate.
>
> **Instruction:** Log in as owner. Work through TRANSP first, then switch company to
> USMCA and repeat the entity-scoped rows. Check each box only after confirming the
> PASS criteria on screen. Any FAIL → note the row and stop (do not paper over).
>
> **Pre-requisites:** All 15 wave cards drained or N/A. All fixer PRs merged + deployed.

---

## PHASE 1 — TRANSP Entity

### §D — Picker Law (7 clauses, inline +Create exercise)

| # | Module | Navigate To | Picker | Exercise | PASS Criteria | ☐ |
|---|--------|-------------|--------|----------|---------------|---|
| D1 | Maintenance | `/maintenance` → Create WO | Vendor picker | Click "+ Add new vendor" in dropdown → fill → save | New vendor selected, survives reload, row in `mdata.vendors` | ☐ |
| D2 | Maintenance | `/maintenance` → Create WO | Roadside vendor | Click "+ Add new vendor" → fill → save | Same as D1, different field same component | ☐ |
| D3 | Safety | `/safety` → Internal Fines → Create | Driver picker | Click "+ Add new driver" → CreateDriverModal → save | New driver selected, in roster on reload | ☐ |
| D4 | Safety | `/safety` → Internal Fines → Create | Fine reason | Click "+ Add new" → InlineCreateDrawer → save | New reason selected, in dropdown on reload | ☐ |
| D5 | Fleet | `/fleet` → Unit detail | QBO Class picker | Open picker → confirm names (NOT UUIDs) → select → save | Class name displayed, persists on reload | ☐ |
| D6 | Legal | `/legal` → Create Contract | Driver picker | Click "+ Add new driver" → CreateDriverModal → save | New driver selected, persists in form | ☐ |
| D7 | Banking | `/banking` | Account selector | Click account chips | All 6 TRANSP accounts appear, txns load on select | ☐ |

**D-Layer Universal Checks (confirm for EACH picker above):**
- [ ] QB-STD-1: "+ Add new" is first row of open dropdown (visible before typing)
- [ ] QB-STD-2: No external button needed — create trigger is IN the dropdown
- [ ] QB-STD-3: On Save, record is returned already selected (no navigation away)
- [ ] QB-STD-4: Parent form data is NOT lost when inline create fires
- [ ] QB-STD-5: Created records survive full page reload

---

### §E — Design-Bar (28 surfaces, resize / filters / proportions)

| # | Module | Navigate To | Test: Resize | Test: Filter | Test: Proportion | ☐ |
|---|--------|-------------|-------------|-------------|-----------------|---|
| E1 | Home | `/home` | KPI tiles responsive ≤768px | Range selector (Today/7d/30d/MTD/YTD) | Typography tokens 12px/11px | ☐ |
| E2 | Dispatch | `/dispatch` | Column drag → width persists | Tab filters + search | Load card spacing, KPI alignment | ☐ |
| E3 | Maintenance | `/maintenance` | Column drag → width persists (localStorage) | Tab + search filters | KPI bar alignment, CTA spacing | ☐ |
| E4 | Safety | `/safety` | Fines table column resize | Reason/driver/date filter | KPI dual-row alignment | ☐ |
| E5 | Fleet | `/fleet` | All columns resizable, persist | Type tabs (All/Trucks/Trailers) + export | KPI bar alignment | ☐ |
| E6 | Legal | `/legal` | Contract table column resize | Tab filters | KPI tile alignment | ☐ |
| E7 | Compliance | `/compliance` | Column resize | Status filters (Overdue/Due Soon) | Color-coded KPI | ☐ |
| E8 | Settlements | `/settlements` | Column resize (was FAIL, FIXED #4030) | Payment Pipeline filter | KPI bar alignment | ☐ |
| E9 | Fuel | `/fuel` | N/A (dashboard) | Tab filters | KPI tile alignment | ☐ |
| E10 | Accounting | `/accounting` | Bills/Invoices/Expenses resize | Search + date + tab navigation | Trial Balance alignment | ☐ |
| E11 | Factoring | `/factoring` | Reserve/Recourse column resize | Tab filters | KPI tile alignment | ☐ |
| E12 | Vendors | `/vendors` | All 10 columns resizable | Search + type filter | Master-detail proportions | ☐ |
| E13 | Customers | `/customers` | All 10 columns resizable | Search filter | Master-detail proportions | ☐ |
| E14 | Drivers | `/drivers` | Column resize | Status filter (Active/Inactive) | KPI bar alignment | ☐ |
| E15 | Cash Flow | `/cash-flow` | N/A (chart) | Date navigation | Chart/KPI alignment | ☐ |
| E16 | Inventory | `/inventory` | All 9 columns resizable | Search + status filter | Table spacing | ☐ |
| E17 | Reports | `/reports` | N/A (card grid) | Category filter | Card alignment, BASIS toggle | ☐ |
| E18 | Docs | `/docs` | All 6 columns resizable | Entity tab filter | KPI tile alignment | ☐ |
| E19 | Users | `/users` | Column resize (was FAIL, FIXED #4030) | Status filter | KPI/badge alignment | ☐ |
| E20 | ELD | `/eld` | All 7 columns resizable | Tab filters | KPI tile alignment | ☐ |
| E21 | Help | `/help` | N/A (cards) | Search filter | Card layout alignment | ☐ |
| E22 | Program | `/program` | Column resize | Tab filters (Pending/In Progress) | KPI tile alignment | ☐ |
| E23 | Finance Hub | `/finance-hub` | N/A (gated) | N/A | Gate message styling | ☐ |
| E24 | Form 425C | `/form-425c` | N/A (form-fill) | N/A | Form field alignment | ☐ |
| E25 | Driver Hub | `/driver-hub` | N/A (card view) | Category tabs | Card spacing | ☐ |
| E26 | System | `/system` | N/A (dashboard) | N/A | Panel alignment | ☐ |
| E27 | Insurance | `/insurance` | N/A (KPI + cards) | N/A | KPI tile alignment | ☐ |
| E28 | Tasks | `/tasks` | N/A (calendar) | Date navigation | Calendar grid alignment | ☐ |

**E-Layer Universal Checks (confirm for tables with ParityTable):**
- [ ] Resize: Drag column-header border → column widens/narrows, persists after reload
- [ ] Density: Gear icon → Regular/Compact/Ultra → row height changes, persists
- [ ] Column Toggle: Gear → uncheck column → disappears → re-check → returns
- [ ] Sort: Click sortable header → asc → desc → unsorted
- [ ] Pagination: >15 rows → pager renders (First/Prev/numbered/Next/Last + per-page)
- [ ] Export: ⤓ button downloads CSV of visible columns (where exportFilename set)
- [ ] Sticky Header: Scroll down → header stays pinned

---

## PHASE 2 — USMCA Entity (Company Switch)

> Switch company in-app (top-right selector → USMCA). Repeat **entity-scoped** rows only.
> Module-agnostic surfaces (Help, Program, System) need NOT be re-tested on USMCA.

### §D — USMCA Pickers

| # | Module | Exercise | PASS Criteria | ☐ |
|---|--------|----------|---------------|---|
| D1u | Maintenance | Create WO → vendor picker → +Add | Vendor scoped to USMCA, persists | ☐ |
| D3u | Safety | Create Fine → driver picker → +Add | Driver scoped to USMCA drivers | ☐ |
| D5u | Fleet | Unit detail → QBO Class picker | Classes show names, USMCA-scoped | ☐ |
| D6u | Legal | Create Contract → driver picker → +Add | Driver scoped to USMCA | ☐ |
| D7u | Banking | Account selector | USMCA accounts (2) appear, txns load | ☐ |

### §E — USMCA Design-Bar (entity-scoped surfaces only)

| # | Module | Confirm | ☐ |
|---|--------|---------|---|
| E2u | Dispatch | Load board loads USMCA data (may be 0 rows — confirm empty state) | ☐ |
| E5u | Fleet | Units show USMCA-leased units | ☐ |
| E10u | Accounting | Bills/Invoices show USMCA data | ☐ |
| E12u | Vendors | Vendor list filters to USMCA (951 rows) | ☐ |
| E13u | Customers | Customer list filters to USMCA (1,247 rows) | ☐ |
| E14u | Drivers | Driver roster shows USMCA drivers (98) | ☐ |
| E16u | Inventory | Parts scoped to USMCA | ☐ |

---

## PHASE 3 — Certification Gate

| Condition | Status |
|-----------|--------|
| All §D pickers exercised (both entities) | ☐ |
| All §E surfaces exercised (TRANSP full + USMCA entity-scoped) | ☐ |
| Zero FAIL rows in this checklist | ☐ |
| All 15 wave cards status = `drained` or `N/A` | ☐ |
| `verify-wave-card-format` PASS | ☐ |
| `verify-no-false-green-certify` PASS | ☐ |
| `verify-module-completion` all modules PASS or documented-HOLD | ☐ |

**When all boxes checked → AUDIT CERTIFIED (30/30).**

---

## Notes

- **Do NOT rush.** If a picker fails, stop and note which row. Do not re-test until the fix lands.
- **Evidence format:** Screenshot or video of each PASS surface is ideal but not required. The owner's attestation on this checklist is the gate.
- **Estimated time:** ~45 minutes for the full pass (both entities).
- **Blockers:** If any D-layer picker crashes or doesn't persist, that module cannot certify until fixed.
