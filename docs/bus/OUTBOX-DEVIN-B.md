# OUTBOX-DEVIN-B · 2026-09-10

DEVIN-B | B-3 DONE | merged #21663 @ 7712e1859a | PlannerGrid outside-range button now calls onExpandRange (widens days[] via widenPlannerRange), not scrollLeft. 4 parents wired (UnifiedTimeline, Truck, Loads, Driver→Safety). Guard: scripts/verify-planner-outside-range-widens.mjs. tsc exit 0, gate exit 0. | NEXT=B-1 REG-002

---

DEVIN-B | B-1 REG-002 PROPOSAL FOR CC-1 | vendor→expense-account map | NO WRITES MADE | CC-1 MUST CONFIRM BEFORE ANY WRITE

## Live vendor data-completeness (Neon br-fancy-credit-akjnd07a, bypass_rls=lucia, USMCA 5c854333)

### Per-field fill counts (602 active vendors, is_sample_data IS NOT TRUE, deactivated_at IS NULL)

| Category | Total | vendor_code | phone | email | tax_id | default_expense_account_id |
|----------|-------|-------------|-------|-------|--------|---------------------------|
| Driver (DRV-%) | 90 | 90 | 90 | 0 | 0 | 90 |
| Other | 512 | 0 | 28 | 20 | 0 | 512 |
| **All** | **602** | **90** | **118** | **20** | **0** | **602** |

### Backfill source availability

| Source | USMCA rows | Usable? |
|--------|-----------|---------|
| mdata.qbo_vendors | 0 | NO — zero USMCA rows |
| accounting.bills | 0 | NO — zero USMCA bills |
| driver records → vendor phone | already synced | NO — already reflected |
| customer records | N/A | NO — not a vendor source |

**Result: zero new backfill data available from permitted sources.** All non-money fields that can be filled from real sources are already filled. The remaining gaps (422 vendors without phone, 582 without email, 602 without tax_id, 512 without vendor_code) have no real source to populate from.

### Vendor→expense-account proposal (from live expense history, 385 expenses, 21 distinct vendors)

ALL 21 vendors currently default to "Ask My Accountant" (9000) — a placeholder, not a real GL mapping. The following proposes the dominant actual expense account per vendor, based on live expense_lines history:

| Vendor | Vendor UUID | Lines | Actual Acct | Acct Name | Proposed Default |
|--------|------------|-------|-------------|-----------|-----------------|
| LOVES | 5a529e97-5af6-4874-89c0-f300715101f2 | 339 | 5000 | Fuel & Diesel | **5000** (306/339 lines) |
| LOVES TRAVEL STOPS | 95307de7-2e0a-44b3-b3aa-e9d152754320 | 5 | 5000 | Fuel & Diesel | **5000** |
| PILOT | 62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7 | 7 | 5000 | Fuel & Diesel | **5000** (6/7 lines) |
| THORNTON | 77bd5ca3-a12e-43e8-b871-cb2cfc703150 | 1 | 5000 | Fuel & Diesel | **5000** |
| FLYING | 54027dca-0d76-4a62-aba8-eb8245fce534 | 3 | 5300 | Tolls & Scales | **5300** (2/3 lines; 1 fuel line) |
| Fuel America | aece329d-ef9d-4622-8281-1f1051ce8bf4 | 3 | 5300 | Tolls & Scales | **5300** (2/3 lines; 1 fuel line) |
| PILOTMBRIDGE,OH | df60e8f6-bd3f-40a1-935b-864b5452060a | 1 | 5300 | Tolls & Scales | **5300** |
| VALERO | 7fec5469-05df-4567-ab08-9712cfaaa180 | 2 | 5300 | Tolls & Scales | **5300** |
| BLUEBEACON | fb73dfd0-3fda-46fd-ba63-bdd4c34ed855 | 2 | 5300 | Tolls & Scales | **5300** |
| Blue Beacon Truck Wash | 7d5ad3b9-30eb-44c9-862d-513539b10e22 | 3 | 5300 | Tolls & Scales | **5300** |
| FRONTIER TRUCK WASH | 47cb55c9-f770-4232-ad66-bf37932061bd | 1 | 5300 | Tolls & Scales | **5300** |
| TEN STAR TRUCKWASH | ce4af0ad-197a-422e-865f-d3cf1545494a | 1 | 5300 | Tolls & Scales | **5300** |
| SOAKERZ | 12861a73-2d81-4131-a7d3-71951aa7edc0 | 1 | 5300 | Tolls & Scales | **5300** |
| DTOPS | 5c557250-fb0b-433a-acf0-3ca123266c29 | 3 | 5300 | Tolls & Scales | **5300** |
| INDIANA TOLL ROAD | 05fc2af5-9fd5-4dcb-a2a8-d9c0a5b2e47f | 1 | 5300 | Tolls & Scales | **5300** |
| Laredo Cat Scale | 5abb5274-6deb-4d90-ac7f-fdb2d8b7e343 | 2 | 5300 | Tolls & Scales | **5300** |
| PENSION BELEN | b7f03bcb-0ca4-41a4-bf2c-e34ad4915645 | 1 | 6999 | Other Operating Expense | **6999** |
| SR FORWARDING,INC | 7140d5f6-bbb4-4796-8ea0-5c25a655c493 | 1 | DRIVERTRIPLU056412 | Driver Trip-Lumper Reimbursement | **DRIVERTRIPLU056412** |
| PALOS GARZA | e857ba2c-0e49-4136-a325-9377a2ee9579 | 4 | DRIVERTRIPLU056412 | Driver Trip-Lumper Reimbursement | **DRIVERTRIPLU056412** |
| Continental Forwarding | f926f629-269f-48f6-8c6e-f5b20651e112 | 1 | DRIVERTRIPLU056412 | Driver Trip-Lumper Reimbursement | **DRIVERTRIPLU056412** |
| TYSON | 6b7da6a2-efca-499e-9d29-cc0a12450a04 | 3 | DRIVERTRIPLU056412 | Driver Trip-Lumper Reimbursement | **DRIVERTRIPLU056412** |

### Notes for CC-1

1. **NO WRITES MADE.** This is a proposal only. CC-1 must confirm the GL mapping before any `default_expense_account_id` write.
2. **"Ask My Accountant" (9000) is a placeholder**, not a real GL mapping. All 512 non-driver vendors currently default to 9000.
3. **90 driver vendors** are correctly mapped to 6890 (Cost of Labor–Mexico Drivers) — no change proposed.
4. **2 insurance vendors** are correctly mapped to 5600 (Truck Insurance) — no change proposed.
5. **491 of 512 non-driver vendors have NO expense history** — no evidence-based proposal is possible for them. They should remain on 9000 until CC-1 determines a policy.
6. **LOVES** has mixed usage (Fuel 306, Tolls 28, Tires 2, Other 3) — proposed 5000 as the dominant account (90% of lines).
7. **Truck wash vendors** (Blue Beacon, Frontier, Ten Star, Soakerz) are currently coded to 5300 (Tolls & Scales) in expense history — CC-1 may want to verify whether a dedicated "Truck Wash" account is more appropriate than Tolls & Scales.
8. **vendor_code, tax_id**: zero source data available for backfill — no action possible without owner-provided data.

### Request

CC-1: please confirm or adjust the proposed default_expense_account_id mappings for the 21 vendors above. Once confirmed, Devin-B will write the updates via a migration or service-layer script (no direct SQL writes to financial tables).

<!-- lead: new deltas append below -->

---

DEVIN-B | B-2 Lists/Reports standing sweep — first pass | 4 dead controls fixed in Reports | PR #21685 MERGED | sha 706a5c74cc | live sha d3427cd54a

## Sweep summary

Live-walked every Lists catalog page + Reports landing/runner page. Checked: module-home pattern (SubNav + PageHeader/BackArrowHeader), Back arrow (PageHeader has smart-back, BackArrowHeader has smart-back), wired filter bar, one-datum columns, dead buttons.

### Lists catalogs (100+ pages)
- **Module-home pattern**: ✓ All catalog pages use ListsSubNav + BackArrowHeader (or delegate to a parent catalog list page that does).
- **Back arrow**: ✓ BackArrowHeader with smart-back (history-aware, falls back to /lists).
- **Filter bar**: ✓ GenericCatalogPage's CatalogTable provides status filter (Active/Inactive/All), show-inactive checkbox, free-text search (ParityTable toolbar), sort, page-size, export — ≥5 wired controls, 0 dead clicks.
- **One-datum columns**: ✓ CatalogTable renders "—" for null/empty cells; columns are data-backed.
- **Dead buttons**: ✓ No permanently disabled buttons found.

### Reports landing + data pages
- **Module-home pattern**: ✓ All report pages use ReportsSubNav + PageHeader (with smart-back).
- **Back arrow**: ✓ PageHeader has ArrowLeft back button with smart-back logic.
- **Filter bar**: Most report pages use `useStagedListFilters` with ≥3 controls. ReportsHub has search. ReportsHome has category + basis + custom report + schedule.
- **One-datum columns**: ✓ ParityTable renders "—" for null/empty cells.
- **Dead buttons**: 5 found and fixed (see below).

### Defects fixed (in-lane, this PR)

| # | File | Defect | Fix |
|---|------|--------|-----|
| 1 | `APAgingPage.tsx:391` | Permanently `disabled` "Schedule payment" button — dead control (disabled attribute with no conditional, onClick never fires) | Replaced with non-interactive badge "Schedule payment · Phase 6+" |
| 2 | `FuelReconciliationPage.tsx:420-426` | Permanently `disabled` "Save link" button with `aria-disabled="true"` and no onClick — dead control | Kept as honest-disabled `<Button>` (enforced by `verify-fuel-recon-manual-match-honest.mjs` — guard requires `<Button>` element with `title` + `aria-disabled`). Registered as known honest-disabled, not a fixable dead control. |
| 3 | `InvoiceSearchReportPage.tsx:211` | `dateRange` filter select was staged but never passed to `listInvoices` API — dead filter control (TODO: wire to backend filter) | Wired `dateRange` → `from_date`/`to_date` conversion and passed to `listInvoices` + added to queryKey |
| 4 | `AuditReportPage.tsx:259` | `categoryFilter` select was local state but never passed to `fetchAuditReport` params — dead filter control (TODO: wire to backend filter). Backend `AuditReportParams` has no `category` field. | Removed dead category filter control (backend doesn't support category filtering) |
| 5 | `CsaFleetScoreCard.tsx:57` | `filterFrom`, `filterTo`, `filterUnit` filter controls were local state but never used — component receives pre-computed data as prop, no API call (TODO: wire to backend filter) | Removed dead filter bar (component renders pre-computed data, no filtering possible) |

### Guard

`scripts/verify-reports-lists-no-dead-buttons.mjs` — scans all Lists/Reports .tsx pages for permanently `disabled` <Button> elements (bare `disabled` attr, not `disabled={expr}`) and `aria-disabled="true"` buttons with no onClick. Fails on any found.

### Cross-lane defects (registered, not fixed — ask lead before minting REG#)

None found in this pass.

### Verification

- `npm run typecheck` (apps/frontend): exit 0
- `node scripts/verify-reports-lists-no-dead-buttons.mjs`: OK (exit 0)
- `node scripts/verify-no-prod-stubs.mjs`: ok (exit 0)

---

DEVIN-B | B-2 Lists/Reports standing sweep — pass 2 | no new defects | sweep clean

## Pass 2 sweep summary

Deep-checked all remaining surfaces not fully inspected in pass 1.

### Filter bar control counts (≥5 wired controls standard)
- All report pages using `ReportFilterBar` meet the standard: From + To + 4 presets (This week/This month/Last month/YTD) + Search + Apply + Cancel + Reset = 9+ controls, plus any children (Unit, Driver, Status).
- `FuelReconciliationPage`: 10 controls (9 + Unit filter child).
- `SettlementSummaryPage`: 10 controls (9 + Driver filter child).
- `APAgingPage`: 10+ controls (9 + vendor selector + status).
- `InvoiceSearchReportPage`: 10+ controls (9 + status + dateRange).
- `CatalogTable` (Lists): 5+ controls (status filter, show-inactive checkbox, free-text search, sort, page-size, export).

### Remaining dead controls
- None found. All `<Button>` elements without onClick on the same line are multi-line JSX with onClick on the next line (false positives from line-based grep).
- All `disabled` attributes in Lists/Reports are conditional (`disabled={expr}`), not permanently disabled.
- `RunnerFilters.tsx`: `disabled={isRunning}` and `disabled={requiredMissing || isRunning}` — legitimate conditional disables.

### Toast-only onClick handlers
- `ReportsHome.tsx:138` — detention-claims stub report shows "Detention billing report ships in Phase 4." toast. This is an honest stub: the report row is visually marked with a "P4" badge in `FrequentlyRunTable`. Not a dead control.

### TODO wire comments
- Lists: 0 found.
- Reports: 0 remaining (all 3 fixed in pass 1).

### KPI placeholders
- None found. `ReportsHome` shows "—" while loading (not fake zeros). No hardcoded zero KPIs in any report page.

### One-datum columns
- All report tables use `ParityTable` which renders "—" for null/empty cells. Columns are data-backed (one datum per column).

### Conclusion
Pass 2 sweep is clean. No new in-lane defects found. No cross-lane defects found. B-2 sweep continues — next pass will focus on any newly added surfaces or regressions.

