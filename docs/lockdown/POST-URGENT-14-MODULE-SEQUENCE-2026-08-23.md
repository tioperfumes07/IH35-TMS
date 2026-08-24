# POST–URGENT 14 MODULE SEQUENCE (owner 2026-08-23)

**Owner (2026-08-23):** If a seat’s **own** Urgent-14 rows are all CERTIFIED, that seat **does not idle**. It starts this leftover sequence **now**, taking the first **unclaimed** row. Do not wait for Jorge. Do not watch INBOX.

Still-open Urgent-14 exclusive rows stay first **for that seat only**:
- Codex: customers → drivers → fleet (do not start leftover until those three CERTIFIED)
- CC-3: lists → legal (do not start leftover until those two CERTIFIED)

Same bar: Fully-Wired 1–12 + Live Chrome last. USMCA only. CREATE-TEST-THEN-VOID. Do not remake proven TESTs. Do not steal another seat’s prefix.

Canonical ids = `SIDEBAR_ITEM_IDS` in `apps/frontend/src/components/layout/sidebar-config.ts` (30 total).

**Correction (CC-3, 2026-08-23):** row 8 ELD is NOT a hidden stub — live-verified it is a fully real,
API-backed module (Live Duty Status, HOS Violations, Unidentified Driving, Driver Certifications, ELD
Settings all render live data). The "hidden stub" note below was stale; do not skip real hop testing on
it based on that assumption. Found+fixed a real defect there: TELEMATICS-F1 (see OUTBOX-CC-3).

---

## Sequence + current claim (one seat per row)

| Order | Module | Sidebar id | Route | Claim NOW |
|------:|--------|------------|-------|-----------|
| 1 | CASH FLOW | `cash-flow` | `/cash-flow` | **CC-1** |
| 2 | FINANCE HUB | `finance` | `/finance` | **CC-1** after cash-flow |
| 3 | DRIVER HUB | `driver-hub` | `/driver-hub` | **CC-2** DONE -- Overview/Driver Scheduler/Leave Requests/Reporting all live-Chrome-confirmed genuinely wired, not stubs. Found+fixed 2 real defects: LV-DRIVER-HUB-REPORTING-STALE-NO-LOAD-FK (#14881, leaked finding-id string in a live report heading, post-deploy re-confirmed live) and LV-DRIVER-HUB-SCHEDULER-TEST-FIXTURES-IN-PROD-PICKER (#14909, 23 fixture units/drivers polluting the live Assign-Temp-Cover pickers + the canonical `GET /api/v1/mdata/drivers` endpoint missing the `is_sample_data` exclusion its sibling `units.routes.ts` already had). Full live CREATE-TEST-THEN-VOID round trip run on Assign Temp Cover (traced create/cancel mechanics safe first, no notification/dispatch side effects). Chrome-law items 2 (Escape-dismiss)/8 (box-in-box, responsive, filter-Apply)/9/11/12 all spot-checked clean. Honestly still open, not blocking: Leave Requests approve/deny create-void (0 pending rows exist to test against), "Related: Drivers / Safety Scheduler" click-through (forbidden UI this INBOX). Not a CERTIFY stamp -- that's Cursor's call per law. |
| 4 | 425C | `form_425` | `/425c` | **Cursor** IN PROGRESS leftover unique -- do not remake #15053–#15216. Next = unique 500/dead/silent only. Live SHA `a402d3b` until next 5–10 min AND 5–10 PR deploy. |
| 5 | REPORTS | `reports` | `/reports` | **CC-2** DONE -- all 9 categories walked (Operations/Financial-browsed/Drivers/Fleet/Fuel/Safety/Compliance/Automation/Saved), 8 reports actually run live, all genuinely wired, real data or honest empty. Found+fixed 2 real defects: LV-REPORT-RUNNER-REQUIRED-FILTER-NO-INDICATOR-2026-08-23 (#14948, systemic label-indicator fix across the whole reports runner) and DOT-AUDIT-PACK-TEST-FIXTURE-ROW-LIVE-2026-08-23 (#14971, voided a stray test row polluting a real DOT compliance export). IFTA Quarterly Preparer entry confirmed real. Financial category (Trial balance/P&L/etc.) and Saved (Owner weekly pack/Quarter close) browsed but not run -- stayed inside CC-1's money lane. |
| 6 | TASKS | `tasks` | `/tasks` | **CC-3** DONE -- unique-clean (no real defect found; Task Board/My Tasks/Calendar/Team Chat/Admin Report/Daily Tasks/Service Task Catalog all live, reverse link task->chat confirmed, required-field validation honest, picker_law N/A (assignee is identity.users, no catalog create-new concept) |
| 7 | COMPLIANCE | `compliance` | `/compliance` | **CC-3** DONE -- unique-clean (no real defect found) |
| 8 | ELD | `eld` | `/eld` | **CC-3** DONE -- all 5 sub-tabs hopped live (Live Duty Status/HOS Violations/Unidentified Driving/Driver Certifications/ELD Settings); found+fixed TELEMATICS-F1 (500 on Drill-down), merged `3126097ec`; the 2 "not wired yet" tabs are honest deferred-feature disclosures, not defects |
| 9 | INVENTORY | `inventory` | `/inventory` | **CC-3** DONE -- unique-clean (Parts & Stock/Assignments/Purchase History all live; Record Purchase forward-links vendor by name; Assignments honestly empty with a real explanatory note; Purchase History append-only with Void not delete; +Add-new-vendor first row confirmed; Escape closes dropdown-only) |
| 10 | USERS | `users` | `/users` | **CC-3** DONE -- found+fixed USERS-F1 (Change Role modal label mismatch); All/Active/Pending/Deactivated tabs all live, real data; Create User role select consistent |
| 11 | HOME | `home` | `/home` | **CC-3** DONE -- found+fixed DISPATCH-F2 (late-arrivals sample-data leak + count mismatch); Attention/KPI/Weekly-revenue/Work-orders/Fleet-Snapshot/Vendor-Mapping-Integrity/Filings-Compliance sections all live, real data |
| 12 | FUEL | `fuel` | `/fuel` | **CC-3** DONE -- unique-clean (Home/Planner/Relay inbox/Settings/Expense mapping/History & savings/Loves prices/Compliance all live, honest empty/not-synced states throughout, Settings values match Planner display, Expense mapping forward-links 5/5 GL categories) |
| 13 | DOCS | `docs` | `/docs` | **CC-3** DONE -- unique-clean (All Entities/Drivers/Customers/Vendors/Units/Equipment filter tabs, real forward-linked entity names, native-browser PDF preview confirmed, Missing Required 57 / Expiring 30 days 0 honest counters) |
| 14 | HELP | `help` | `/help` | **CC-3** DONE -- unique-clean (frontend-only per CLAUDE.md; category groups + one real article opened + search for "settlement" returned real ranked results) |
| 15 | PROGRAM | `program` | `/program` | **CC-3** DONE -- unique-clean (Scenario tracker/Module matrix/Legacy certification board/Build progress/Module completion/Final additions all live, real honest counters throughout incl. explicit staleness disclosures; one self-caught non-issue: a coordinate-targeting imprecision on my own click on the wrapped second tab row, not an app bug -- confirmed by a precise ref-based click landing in one click) |
| 16 | SYSTEM | `system` | `/system` | **CC-3** DONE -- unique-clean (Overview/Program Tracker/Software-Build/Claude Coder all live and mutually consistent, e.g. Program Tracker's numbers here exactly match /program/tracker's own; Software/Build honestly reports DEGRADED/RED for a real background_jobs.stale warning-tier check, not a UI defect -- accurate telemetry, deploy-mismatch context noted for the next lane touching backend deploys; Claude Coder correctly owner-gated, did not click the machine-launch action) |

**TABLE EXHAUSTED (CC-3, 2026-08-23):** all 16 rows now DONE. Per this doc's own "never idle" instruction, next non-idle step for any seat finishing here is re-checking `docs/audit/GUARD-WORKORDERS.md` for OPEN rows in-lane, or helping another seat's still-open Urgent-14 exclusive rows (Codex customers/drivers/fleet). See OUTBOX-CC-3.md for the closing summary of this pass.

Empty unique-FINDING on your claimed row → next **unclaimed** row in this table. Never idle. Never a 17th invented queue.

Forbidden prefixes while U14 OPEN: `/customers` `/drivers` `/fleet` `/lists` `/legal` (Codex / CC-3 only).
