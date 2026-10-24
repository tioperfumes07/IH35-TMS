# 10-23-2026 · ROUND 443.280 · LEAD → CURSOR / CODEX / CC-3 · 4:45 PM CT (21:45 UTC)

Code audit of origin/main e8a9f02b against the 36 approved V3 boards (Lead, 10-23 4:30 PM CT). Verdicts: 8 REBUILT, 11 PARTIAL, 16 LAYERED/CHROME-ONLY, 1 NOT STARTED.
ROOT CAUSE of the layering: repo Rule 07 "NEVER DELETE — only ADD" was applied to page layouts; code comments say "Rule 07 keeps … below" (SettlementDetailPage L727, SettlementsToursRegister L168/L176, Reports ced05133).
LEAD RULING 443.280 (owner 10-23 8:19 AM CT "finish boards exactly"): Rule 07 protects DATA and CAPABILITIES, not layouts. An approved board REPLACES the page body. A function the board does not show moves to its own tab/route and stays reachable; it never renders on or under the board, not even in a collapsed <details> (a collapsed details still mounts and still fires its queries). No data row is ever deleted.

```
TO: CURSOR — 443.280-A  REBUILD, DO NOT LAYER (one PR per page, order below)
Each PR: page body = the board only; old sections listed here removed from the page (moved to their own tab only if the board lacks that function);
`cd apps/frontend && npx tsc -b` exit 0 + `node scripts/money-pr-local-gate.mjs` exit 0 pasted; Render web deploy id "live"; live screenshot beside
~/Downloads/lead-tmp/png/<Board>.png + element list. Never touch CashFlowHomeTab run-rate/actual-weeks code (Lead).
 1. Settlements-PreSettlements + Settlements-Deductions: stop mounting the whole DriversPage (Drivers header, 7 KpiCards, DRIVERS_SUBNAV) via
    SettlementsMountedPages.tsx. PreSettlements: Unit, Ready n/6, Waiting on read listTours (now hard "—", Panel L93-147); drop Period Begin/End,
    Liabilities, Status columns. Deductions: By-type split Escrow/Advances/Fines/Damages, Schedule panel, + New deduction.
 2. Settlements-Statement (SettlementDetailPage): board strip + 2x2 panels only; remove TourSettlementTab L719, identity strip L812, SettlementHeader
    L847, SettlementKpiGrid L869, old sections L1005-1023, the Detail View/Back to List bar; "paid on short miles" hardcoded L755-756 → driver pay_basis.
 3. Settlements-Close: working 7-step flow (steps clickable, Next works); remove the old single-page form under it (L648+) and the 6-tile strip.
 4. Settlements home: Payments view and old Button tab row (L562-630, L1045-1144) off the home; register renders as its own Open/Closed tabs.
 5. Settlements-CashAdvances, Settlements-Escrow (driver-only list, dedupe, total row, Open register →), Settlements-EscrowRegister (Release button,
    Target/Release from data not "—").
 6. Fuel home to the Fuel board (Diesel by truck table, Oct/Sep/YTD, 7-tab structure); the 10 Fuel sub-tabs: remove pagination tiles ("This page",
    "Page size") and duplicated tiles; one KPI row + one board table each.
 7. Cash Flow Rolling Ledger + Manual to their boards (two-sided Party/Doc-load/Due/Amount + day grid; remove CashFlowKpiStrip, old tables,
    Opening-cash editor); AvP: total row + chips in header + V3Panel; Home: remove TAB_CARDS L855-877, grey run-rate vs black committed cells,
    clickable cells, real Monthly roll-up.
 8. Factoring: FactoringKpiPanel/FactoringCashFlowPanel off (they render on every tab); fix the "not cleared" fallback (Board L446-470).
 9. Reports home: remove the old hub below the board (Management list, FrequentlyRun, Scheduled, IFTA card → own tabs); ☆ favorite works.
    TrialBalanceBoard L35-37: delete the hardcoded A/R "Measured" string; any note must be computed live.
10. Customers + Vendors: rebuild to their boards (columns, panels, Measured computed live); Customers "Collected" = payments applied, not billed − open.
Deadline: items 1-3 by 10-24 02:00 UTC, the rest by 10-24 14:00 UTC. Missed → CC-3 takes the surface.
```

```
TO: CODEX — 443.280-B  YOUR BOARDS: REMOVE THE LAYERS, THEN DRIVER PROFILE (NOT STARTED)
 1. Safety-DriverFiles: remove the collapsed <details> that still mount DriverSafetyCards (DriverFilesTab L53), DriversListPage L60, Training L62-86,
    SafetyLayout L194-231; KPI tiles → V3KpiTile with the board labels.
 2. Maintenance-Home: remove IntegrationsStrip L459, RMBucketsGrid L511, monitors details L560-570, embedded ArrivingSoon/PredictiveAlerts pages
    L605/L609, the second nav bar; RMStatStrip → V3KpiTile; panels → V3Panel.
 3. Maintenance-InShop: remove MaintKpiRows, PmCountdownCards, AlertsCard, DtcAutoWorkOrdersCard, FleetTablePage details, RecentActivityRow from the
    In Shop view; build the 4 bay cards + Open bay + per-bay progress (bay field from CC-3 if the source lacks it — post the field on the bus).
 4. DriverProfile board — NOT STARTED (route still mounts the 10-12 page): tabs Profile / QBO Mapping / Operations / Earnings & Debt / Equipment /
    Load History, live unit panel, Pay this week, Trip now + booked ahead, documents "not blocking".
 5. GUARD (permanent): scripts/verify-board-page-no-legacy-sections.mjs — per board page, a list of legacy components that must not be imported or
    mounted (incl. inside <details>); selftest with a planted legacy mount. This is what stops layering coming back.
Each PR: tsc -b 0 + money-pr-local-gate 0, Render live id, live screenshot vs board PNG. Deadline items 1-3 10-24 02:00 UTC, 4-5 10-24 14:00 UTC.
```

```
TO: CC-3 — 443.280-C  BOOK LOAD WIDTHS + TRUCK PLANNER BAR TEXT
 1. BookLoadModalV4 L1961-1970: center 1120px / side 660px vs board 1260 / 760 (Spec board "1,260 center or 760 side panel"). Use the board widths,
    reflow at 1280/1024/768. Load # right-aligned (LiveLoadIdBar L156).
 2. Truck Planner bars: add the lane ("Fort Morgan → Laredo") and "$3,000 · 1,075 mi · $2.79/mi" (planner-bars.ts L68), from the load hub.
After 443.279 (status vs stop evidence) and 13699's address. Live proof per item.
```
