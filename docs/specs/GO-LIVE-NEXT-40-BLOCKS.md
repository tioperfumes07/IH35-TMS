# IH35-TMS — Next 40 Blocks (go-live roadmap)

**Compiled:** 2026-06-16 (CT). Real-data dispatch starts TOMORROW → Phase A is the go-live wall.
Sources: dispatch GUARD walkthrough bug log (#1–#14), this session's audits, Path B runbooks, tracker rows 876–885.
Lane lock holds: **Lane B = Path B financial (catalogs.accounts/accounting.*/finance./migrations)**; everything else is Lane A.

Legend — Lane: FE frontend · BE backend · DATA prod-data (Jorge executes per §1.6) · FIN financial-cluster (GUARD-gated, Jorge merges).
Status: ◑ in progress · ○ not started · ● design-ready.

---

## PHASE A — GO-LIVE BLOCKERS (Blocks 1–14) — for tomorrow

| # | Block | Lane | Status | Source |
|---|---|---|---|---|
| 1 | **DATA-TRUTH backend** — drivers/units/customers/vendors list `total` + driver deactivation reconcile+CHECK | BE | ◑ #1034 draft (backend done) | #11,#14 |
| 2 | **DATA-TRUTH frontend wiring** — Drivers+Units (+Cust/Vend) UI → server pagination (limit/offset) showing real total "1–15 of N" | FE | ○ (next on #1034) | #11 |
| 3 | **Active-filter everywhere** — dispatch driver/truck/trailer dropdowns + Active/Available KPIs filter `deactivated_at IS NULL` | FE+BE | ○ | #14,#1C |
| 4→LAST | **DEMO/TEST DATA PURGE** — **SEQUENCED LAST** (= canonical Block 6): purge only AFTER every fix is tested against demo data, right before go-live. DEMO-L001-3, L-20260616-0002, DEMO-101-106/TEST-TRUCK-3, DEMO-WO-001/2, demo drivers (Juan/Maria/Carlos/Ana *Demo*), "3 Rivers" → exact void/delete + counts; **Jorge executes** | DATA | ○ | bug log |
| 5 | **Dropdown close-on-outside-click (app-wide)** — single-open + click-outside/blur on ALL select/filter controls (3 stacked open observed) | FE shared | ○ | #4,#10 |
| 6 | **Samsara TRAILERS import** — pull trailers (trucks-only today) so Trailer dropdown/fleet have real trailers | BE/integration | ○ | #13 |
| 7 | **Unit-type filter** — Truck dropdown = power units only; trailers → Trailer field (Great Dane 53ft wrongly in trucks) | FE+DATA | ○ (dep 6) | #5 |
| 8 | **Money/currency format (app-wide)** — auto thousands + 2-decimal accounting format on EVERY money field (QBO convention) | FE shared | ○ HIGH | #8 |
| 9 | **Numeric input hardening** — no leading zeros + thousands on weight/pieces/qty (saw "024000") | FE | ○ | #9 |
| 10 | **Book-Load date/time split** — separate date + time pickers (pickup/delivery windows) | FE | ○ | #6 |
| 11 | **Book-Load UI polish** — template double-border (#1), "250MS DEBOUNCE" debug copy (#3), verify template save path (#2) | FE | ○ | #1-3 |
| 12 | **Address autocomplete + estimated mileage** — interim provider (Google Places/Mapbox/HERE), editable override, provider-abstraction for PC*MILER swap | BE+FE | ● design-first (provider decision) | #7 |
| 13 | **Responsive-fit** — kanban + others overflow viewport → horizontal scroll; fit to viewport | FE | ○ | RESPONSIVE-FIT-BUG |
| 14 | **Pagination-gap audit + capped-list fixes** — finish PAGINATION-GAP-AUDIT.md; fix Safety HOS/DOT/DriverScoring/IntegrityAlerts/RandomPool, accounting audit-trail (limit 50), banking-tx (200), vendor-balances (200), amortization slice(0,12) | FE+BE | ◑ audit paused | PAGINATION-GAP-AUDIT |

## PHASE B — PATH B FINISH + FINANCE (Blocks 15–22) — FIN, GUARD-gated, Jorge merges

| # | Block | Status | Source |
|---|---|---|---|
| 15 | **Path B Stage 4** — per-entity unique index `(operating_company_id, system_purpose) WHERE deactivated_at IS NULL` + #6999 runtime guard | ● design-ready | runbook |
| 16 | **Path B Stage 5** — seed USMCA's own chart + system accounts (0 today; blocks July launch) | ● (dep 15) | tracker 881 |
| 17 | **COA account_number per-entity unique (A2)** — global→`(operating_company_id, account_number)` OneWorld number-space | ○ | tracker 882 |
| 18 | **TRK canonical QBO connection** — TRK has 2; pick before TRK live posting | ○ | tracker 883 |
| 19 | **Map TRK's 14 accounts to QBO** — qbo_account_id NULL today | ○ (dep 18) | tracker 884 |
| 20 | **TRK expense-category scope** — accountant: should asset-holder TRK carry driver_pay/fuel/toll? | ○ | tracker 885 |
| 21 | **COA-ACCOUNTS-UNAUDITED** — audit.row_changes capture on catalogs.accounts | ○ | tracker 877 |
| 22 | **EXPENSE-VOID block-if-linked Gate 3** — MUST land before VOID_ENFORCEMENT_ENABLED ever flips on | ● design | tracker 879 |

## PHASE C — DISPATCH DEPTH + SAMSARA (Blocks 23–32)

| # | Block | Status | Source |
|---|---|---|---|
| 23 | **Samsara reference inventory** (ARCH-2) — doc the 88-file live integration (endpoints/shapes/auth/reusable) | ○ | ARCH-2 |
| 24 | **Samsara feature map** (ARCH-4) — wired/stubbed/net-new + downstream dependents | ○ | ARCH-4 |
| 25 | **Samsara ELD/HOS wire** — /eld + 5 tabs (E1 stub→real) | ○ | tracker E1 |
| 26 | **Reefer 15-min poller** (Block F) — reefer hours from Samsara | ○ | Block F |
| 27 | **Live mileage ingest + odometer history** (Block E) | ○ | Block E |
| 28 | **Services catalog / ETA engine** — needs Samsara mileage | ○ (dep 27) | #13-Block-E |
| 29 | **Dispatch walkthrough — remaining tabs** (Kanban/List/Assignments/At-Risk/Detention/Border/Late/Live Map/Planning/Settlements/Documents) → bug fixes | ○ | bug log |
| 30 | **Dispatch P6-Lanes** | ○ | tracker |
| 31 | **Dispatch P7-Disp-Mobile** | ○ | tracker |
| 32 | **mdata sibling pagination** — extend Block-1 total pattern to parts/trailers/locations | ○ | this session |

## PHASE D — HARDENING + BACKLOG (Blocks 33–40)

| # | Block | Status | Source |
|---|---|---|---|
| 33 | **SEC: prod app off neondb_owner** — it bypasses RLS; tenant isolation relies on app WHERE only (P1) | ○ | tracker 878 |
| 34 | **SETTLEMENT_CAPPED flag override-aware** — reads default_enabled only, ignores company/user overrides | ○ | this session |
| 35 | **Amortization flag overrides** — write FH-3 AMORTIZATION overrides (tab visibility) | ○ | this session |
| 36 | **INS-COVERAGE-ASSETS-VS-UNITS** — coverage-gap reads mdata.assets with mdata.units ids → silent no-gap | ○ | tracker 876 |
| 37 | **/check default oci server-side** — feature-flag resolution robustness for the money-path flip | ○ | this session |
| 38 | **Guard-suite backfill** — verify-* guards for each bug class found (every-bug-a-guard) | ○ | constitution §2 |
| 39 | **Master tracker v29** — fold #1029–1034+ + new rows; regenerate xlsx | ○ | trackers |
| 40 | **Go-live smoke + rollback runbook** — pre-cutover smoke checklist + per-block rollback | ○ | go-live |

---

## Recommended order for TONIGHT (go-live wall)
1 → 2 → 3 (data truth: real rosters visible + deactivation correct) · 5 (dropdowns) · 8 + 9 (money/number format) ·
11 + 10 + 6/7 (book-load) · 13 (responsive) · 14 (pagination fixes) · **THEN 4 = DEMO PURGE LAST** (you execute,
only after everything above is tested against demo data — matches canonical Block 6).
Phase B/C/D are post-go-live except where a financial gate is already open.

**Already shipped this session (not counted):** Path B Stages 1–3 (#1029/1030/1032, GUARD-verified), flag/API-base fix + 36-site sweep + CI guard (#1033), docs/tracker rows 880–885 (#1031).
