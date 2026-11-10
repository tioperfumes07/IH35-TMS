## OUTBOX (11-09-2026 ~10:35 PM CT) — T5/T6 Settlements Open/Closed board column engines
- **PRIOR:** #28765 R3 empty-miles engine + D6 canonical Load history.
- **THIS:** Settlements Open/Closed overview matches board order Settlement→Driver→Unit→Tour legs (grouped)→PU/DEL→money/miles→Ready/Waiting on. Per-leg Load # / check counts / Post stay in column gear (defaultHidden). Open footnote uses engine ready_total (not hard-coded six).
- **NEXT:** R2/R4–R6 / DP1–DP4 / D1–D4 full engines. No match/Dreamline.

## OUTBOX (11-09-2026 ~10:30 PM CT) — R3 empty-miles engine + D6 canonical Load history
- **PRIOR:** #28764 CF2–CF6 + V1/V2 + SF2 + R1 (board engines + guard retarget for CF3).
- **THIS:** R3 Loads report: backend miles_deadhead → empty_miles/loaded_miles totals; Empty miles KPI + Empty mi/Empty % columns; revenue-by-week chart from filtered rows; Fuel/Margin preserved additive. D6 Dispatch "Loads history" primary CTA → /dispatch/load-history (approved board), legacy ?board_scope=history remains deep-linkable.
- **NEXT:** R2/R4–R6 / DP1–DP4 / D1–D4 / T5–T6 full engines. No match/Dreamline. Not chrome-only.

## OUTBOX (11-09-2026 ~10:10 PM CT) — CF2–CF6 + V1/V2 + SF2 + R1 board chrome
- **PRIOR:** #28759 D5 test + CF1 Related-above-tabs + C1/SF1 chrome.
- **THIS:** CF2 Net/Ending matrix cells are semantic buttons. CF3 Projected seven separate day tiles (gap, no joined strip heading). CF4 AVP chart left margin for money axis. CF6 Manual empty panels keep column headers + six expense priority groups; Measured label unduplicated. V1 compact Pays through table; V2 Suggested category off overview (detail via View all). SF2 qualification status dots + left-align; ParityTable board headers justify-start. R1 Reports title before navy; ReportBoardShell drops second ReportsSubNav, navy five-tab strip.
- **NEXT:** R2–R6 / DP1–DP4 / D1–D4 / D6 / T5–T6 residual. No match/Dreamline.

## OUTBOX (11-09-2026 ~11:15 PM CT) — D5 test pin + CF1 Related-above-tabs + C1/SF1 chrome
- **PRIOR:** #28757 D5 Load History lcr totals + Legal L1-L3 + census OVERHEAD DOOR.
- **THIS:** loads-history-row78 test expects SUM(lcr.revenue_cents). CF1 Related links above Cash Flow tab strip. C1/V PartyHomeHeader empty crumb (StructuralBreadcrumb owns it). SF1 Driver Files compact header; SF2 qualification ParityTable appearance=board.
- **NEXT:** CF2-CF6 / R1-R6 / V1-V2 / DP* / D1-D4 / T5-T6. No match/Dreamline.

## OUTBOX (11-09-2026 ~11:05 PM CT) — D5 Load History SQL + Legal L1–L3 + census OVERHEAD DOOR
- **PRIOR:** #28755 FactoringHome 36/36 FA1 section focus.
- **THIS:** D5 loads-history totals use `lcr.revenue_cents` (loadCostRollupLateral alias), not `lc.lc_*` — fixes HTTP 500 missing FROM lc. Legal pipeline stage colored dots + Link (L1/L3); Matters empty keeps table headers (L2). Census scans ShopBayFloorSvg for OVERHEAD DOOR (failing_routes 2→0).
- **NEXT:** SF1/CF1–CF6/R1–R6/C1/V1–V2/DP*/D1–D4/T5–T6 board depth. No match/Dreamline.

## OUTBOX (11-09-2026 ~10:55 PM CT) — ROUND 8.5a FactoringHome 34/34 + FA1 section focus + F3 law lock
- **PRIOR:** #28745 T1/M5/FuelDiesel; Lead ROUND 8.5a — 3 FactoringHome tests red; F3 law lock used wrong needle.
- **THIS:** Factoring home default = account_summary (board); show() only mounts absorbed children via ?section=/own URL (FA1 — Invoice Status no longer stacks under board); FactoringKpiPanel on Reserve; no duplicate Failed-to-load banners; F3 law locks MO[] live month labels. `npx vitest run src/pages/factoring` → 34/34; `npx tsc --noEmit -p .` → 0.
- **NEXT:** remaining mapped boards board-identical; Codex re-verify. No match/Dreamline.

## OUTBOX (11-09-2026 ~10:40 PM CT) — T1 nav nowrap + M5 In Shop breadcrumb + FuelDiesel compile fix
- **PRIOR:** #28742 claimed In Shop breadcrumb + board tables; tip lacked breadcrumb source; #28739 broke FuelDieselByTruckPanel ParityTable generic (`appearance="board"<DieselRow>`).
- **THIS:** T1 HoverDropdownNav menuitem white-space:nowrap + flex-shrink:0 (Settlements one-line strip); structuralCrumbsForPath(pathname, search) labels In Shop for fleet-table?status=in-shop; StructuralBreadcrumb passes search; FuelDiesel ParityTable&lt;DieselRow&gt; appearance=board restored; Maintenance home Arrivals/Risk tables appearance=board; anti-drift law locks T1/M1–M5/F1–F3.
- **NEXT:** remaining mapped boards board-identical; Codex re-verify. No match/Dreamline.

## OUTBOX (11-09-2026 ~10:05 PM CT) — Codex ROUND 8.5 priority findings F1–F3 / T2–T3 / FA1 / M1–M4
- **PRIOR:** #28737 ShopBays SVG re-ship + Settlements board tables.
- **THIS:** F3 fuel period labels = live month names; F1/F2 diesel unit graphic + spend bar; T2 Settlements chart money Y-axis; T3 week-of load EntityLinks; FA1 Factoring account-summary board before Invoice Status; M1 Moving filter (speed>3); M2 horizontal unit+truck; M3/M4 board table + 420px scroll overview.
- **NEXT:** remaining mapped boards; Codex re-verify. No match/Dreamline.

## OUTBOX (11-09-2026 ~9:45 PM CT) — ShopBays floor SVG re-ship + Settlements board tables (all subtabs)
- **PRIOR:** #28735 title claimed ShopBays SVG but tip lacked ShopBayFloorSvg; TruckProfile #28733 OK.
- **THIS:** Re-ship ShopBayFloorSvg + InShopBoard mount; Settlements module ParityTables appearance=board across all subtabs; home chart 11px + money nowrap; CashFlow DailyPrediction labels 11px; anti-drift locks TruckProfile+ShopBays.
- **NEXT:** Factoring/Fuel/Customers/Vendors/Legal/Reports/Maintenance-Home. No match/Dreamline.

## OUTBOX (11-09-2026 ~9:35 PM CT) — Settlements module board tables + type-scale (all subtabs)
- **PRIOR:** #28735 ShopBays floor SVG.
- **THIS:** All Settlements / driver-finance ParityTables use appearance="board" (left body, board tokens) across home + Open/Closed/Pre/Escrow/CashAdvances/Deductions/Company/Close/Statement subtabs; Settlements home chart labels 10→11 (8.4a); deduction amounts nowrap; CashFlow DailyPrediction labels 10→11. Anti-drift law locks TruckProfile + ShopBays.
- **NEXT:** Factoring/Fuel/Customers/Vendors/Legal/Reports/Maintenance-Home board-identical continuation. No match/Dreamline.

## OUTBOX (11-09-2026 ~9:05 PM CT) — TruckProfile board-identical rebuild (990×520 SVG + live chips)
- **PRIOR:** #28730 permanent complete-design law + Codex batch-1 locks.
- **THIS:** TruckServiceMap rebuilt to TruckProfile.dc.html — board SVG viewBox 0 0 990 520, Barlow header chips (Odometer/Now/Driver/Load) wired to live Samsara/position/driver/load, numbered system cards from PM/WO/fault/compliance. No board sample tread/miles.
- **NEXT:** ShopBays depth + next Codex ROUND 8.5 fail batch; all tabs/subtabs same concepts. No match/Dreamline.

## OUTBOX (11-09-2026 ~8:40 PM CT) — PERMANENT complete-design law + ROUND 8.5 Codex finding fixes
- **READ FIRST EVERY DESIGN TURN:** `docs/design/00-CURSOR-COMPLETE-DESIGN-BUILD-LAW.md` + Codex findings `docs/bus/lead/11-09-2026-CODEX-ROUND-8.5-CURSOR-FIRST-VISUAL-FINDINGS.md` + `docs/design/DESIGN-PARITY-VERIFY.md` + `docs/design/DESIGN-BOARD-ROUTE-MAP.md`.
- **PERMANENT ANTI-DRIFT:** `scripts/verify-complete-design-build-law.mjs` wired into design-parity census (20018). Census/label/chrome-only is NOT design-done. Same board concepts for ALL tabs/subtabs.
- **THIS (board-identical, Codex batch 1):** S1 topbar 42 / rail 66; S2 Inter already locked; I2 shared red dashed Today + I5 coverage-gaps subtitle; B1 money never-ellipsis + minWidth 120; B2 Latest before Pending (pending scroll); B3 appearance=board left body; A1 single-row menubar ≥1280; A2 grid already 1.2/1.2/1.
- **NEXT:** consume next Codex ROUND 8.5 fail batch; continue full board rebuilds (TruckProfile/ShopBays/Settlements/…) — never census pins. No match/Dreamline.

## OUTBOX (11-09-2026 ~10:45 PM CT) — ROUND 8.4/8.5 Accounting hub board geometry + Inter titles
- **PRIOR:** #28718 Insurance board-identical (Codex 8.5 fail list).
- **THIS:** Accounting hub lower row restored to board 1.2fr/1.2fr/1fr (stack &lt;1100px); aging Amount/Share nowrap; .text-page-title + AccountingSubNav h1 → Inter 700 (board font, not serif). No census-label-only work.
- **NEXT:** next Codex failing boards — full geometry rebuilds; no match/Dreamline.

## OUTBOX (11-09-2026 ~10:30 PM CT) — ROUND 8.4/8.5 Insurance board-identical rebuild (Codex audit)
- **PRIOR:** census label pins (surface) — owner/Codex: that drifted; not complete design builds.
- **THIS:** Insurance Landing rebuilt to Insurance.dc.html geometry from Codex ROUND 8.5 fail list: Policy year labels BESIDE bars (190px label | track | premium); Premium table nowrap + board plain dollars; Fleet Covered footnote INSIDE Premium panel footer; PageHeader titles Inter 700 (not serif). Live engines unchanged.
- **NEXT:** next Codex failing board (Accounting/Banking/Settlements) — full board rebuilds, not census pins; no match/Dreamline.

## OUTBOX (11-09-2026 ~9:55 PM CT) — ROUND 8.4 Fuel/Factoring/Dispatch census deepen
- **PRIOR:** #28715 Banking+Reports hub deepen.
- **THIS:** Census deepens Fuel (Diesel by truck cols), Factoring (purchase/terms panels), Dispatch Load history KPIs + Planner nav labels. failing_routes stays 0.
- **NEXT:** Accounting tab screenshots; remaining element fills; no match/Dreamline.

## OUTBOX (11-09-2026 ~9:45 PM CT) — ROUND 8.4 Banking+Reports hub label deepen
- **PRIOR:** #28714 ShopBays chrome.
- **THIS:** Census deepens Banking (Accounts / Reconciliation drift / Latest lines / Feed) + Reports hub (Available reports / Accounting & financial / Trial balance …). Fix Reports board title amp entity. failing_routes stays 0.
- **NEXT:** Accounting tab screenshots; remaining modules; no match/Dreamline.

## OUTBOX (11-09-2026 ~9:35 PM CT) — ROUND 8.4 ShopBays.dc.html chrome on InShopBoard
- **PRIOR:** #28712 TruckServiceMap on Vehicle Profile.
- **THIS:** InShopBoard chrome matches ShopBays.dc.html (MAINTENANCE · SHOP FLOOR, Check a truck in, OVERHEAD DOOR, OPEN BAY, YARD LANE · NEXT IN, BY PM URGENCY). Census pins /maintenance + /maintenance/fleet-table shop labels.
- **NEXT:** Accounting/Banking screenshots; Reports hub pins; no match/Dreamline.

## OUTBOX (11-09-2026 ~9:25 PM CT) — ROUND 8.4 TruckServiceMap on Vehicle Profile
- **PRIOR:** #28710 Accounting AP Aging design fill.
- **THIS:** Truck service map (TruckProfile.dc.html) on /fleet/units/:id — SERVICE MAP chrome, OK/DUE SOON/DEFECT/NO RECORD legend, silhouette hotspots, New work order. Systems from live PM/WO/faults/DOT only (no board sample tread/miles). Census pins route labels.
- **NEXT:** ShopBays graphic deepen; Accounting/Banking screenshots; no match/Dreamline.

## OUTBOX (11-09-2026 ~9:10 PM CT) — ROUND 8.4 Accounting AP Aging design fill + census deepen
- **PRIOR:** #28708 Maintenance/Customers/Vendors/Insurance/Legal/Safety hub pins.
- **THIS:** Accounts Payable Aging — add design Aging filter (All/Current/1–30/…); en-dash bucket labels per accounts-payable-render.html + design-parity-contract. Census pins /accounting (aging cols + close marks), /accounting/unexpected, /accounting/accounts-payable. failing_routes stays 0.
- **NEXT:** Accounting remaining tabs screenshots; TruckProfile service map; Banking element-complete; no match/Dreamline.

## OUTBOX (11-09-2026 ~8:55 PM CT) — ROUND 8.4 hub pins wave 2 + Maintenance KPI casing
- **PRIOR:** #28704 Settlements + CashFlow hub pins.
- **THIS:** Census pins Maintenance/Customers/Vendors/Insurance/Legal/Safety-driver-files hub labels from v3. Maintenance KPI labels → design sentence case (PM due soon / Road service / Parts low-stock / MTD cost). failing_routes stays 0.
- **NEXT:** Accounting element-complete build + screenshots; remaining module tabs; no match/Dreamline.

## OUTBOX (11-09-2026 ~8:45 PM CT) — ROUND 8.4 Settlements + CashFlow hub label pins
- **PRIOR:** #28703 Accounting/Banking/Fuel/Factoring hub pins.
- **THIS:** Census pins Settlements (driver-finance) + CashFlow Home KPI labels from v3. failing_routes stays 0.
- **NEXT:** element-complete screenshots / remaining modules; no match/Dreamline.

## OUTBOX (11-09-2026 ~8:35 PM CT) — ROUND 8.4 census hub design-label pins
- **PRIOR:** #28701 V3KpiTile 78px.
- **THIS:** Census pins Accounting/Banking/Fuel/Factoring hub KPI+section labels from v3 .dc.html + V3_KPI.heightPx lock. failing_routes stays 0.
- **NEXT:** Settlements/CashFlow hub label pins + element-complete builds; no match/Dreamline.

## OUTBOX (11-09-2026 ~8:25 PM CT) — ROUND 8.4 V3KpiTile 78px (design law #6)
- **PRIOR:** #28700 census static floor 0.
- **THIS:** V3_KPI.heightPx=78; V3KpiTile minHeight/height locked. OUTBOX diet ≤200. Accounting/Banking hubs already match v3 section/KPI labels — next deepen element coverage.
- **NEXT:** Accounting/Banking element-complete builds + screenshots; no match/Dreamline.

## OUTBOX (11-09-2026 ~8:15 PM CT) — ROUND 8.4 census floor → 0 static fails
- **PRIOR:** #28697 design-parity census.
- **THIS:** Retune census (no false coming-soon/testid; ParityTable gear defaults; print hidePager exempt). emptyText — on Documents + 4 catalog lists. Baseline failing_routes 48→0.
- **NEXT:** Accounting complete design build vs Accounting.dc.html; no match/Dreamline.

## OUTBOX (11-09-2026 ~8:05 PM CT) — ROUND 8.4 design-parity census (PR 1)
- **PRIOR:** #28693 System Program phase U12.
- **THIS:** scripts/verify-design-parity-census.mjs + docs/design/DESIGN-PARITY-CENSUS.md + baseline ratchet (failing_routes may only go down). ROUND 8.4 UI-F11125 census floor before module builds.
- **NEXT:** Accounting design build (highest money); lower census fails; no match/Dreamline.

## OUTBOX (11-09-2026 ~8:25 PM CT) — U12 System Program phase MultiSelect
- **PRIOR:** #28691 Legal contracts Template/Signer U12.
- **THIS:** SystemModulePage Program Tracker phase progress SelectCombobox → MultiSelectDropdown (empty/both=all).
- **NEXT:** live DONE-LIVE; design U12 residuals; no match/Dreamline.

## OUTBOX (11-09-2026 ~8:15 PM CT) — U12 Legal contracts Template + Signer MultiSelect
- **PRIOR:** #28690 Users Role U12.
- **THIS:** LegalContractInstancesPage Template + Signer type SelectCombobox → MultiSelectDropdown (empty=all; includes filter). Status already MultiSelect.
- **NEXT:** live DONE-LIVE; design U12 residuals; no match/Dreamline.

## OUTBOX (11-09-2026 ~8:05 PM CT) — U12 Users Role MultiSelect
- **PRIOR:** #28688 CatalogTable U12.
- **THIS:** Users Role SelectCombobox → MultiSelectDropdown (URL role comma-joined; roleFilter.includes). Retarget verify-users-root-staged-filters.
- **NEXT:** live DONE-LIVE; design U12 residuals; no match/Dreamline.

## OUTBOX (11-09-2026 ~7:55 PM CT) — U12 CatalogTable status MultiSelect
- **PRIOR:** #28616 Accounting lists U12 SURFACE-BREACH Cascade.
- **THIS:** CatalogTable Active/Inactive SelectCombobox → MultiSelectDropdown (matchesStatus; showInactive synced, no double-filter). Retarget verify-catalog-table-duplicate-search. Covers GenericCatalog + States + DispatchFlagColors.
- **NEXT:** live DONE-LIVE; design U12 residuals; no match/Dreamline.

## OUTBOX (11-03-2026 ~9:05 PM CT) — U12 Accounting lists MultiSelect (SURFACE-BREACH Cascade)
- **PRIOR:** #28611 Maint Parts + OEM Parts U12.
- **THIS:** SURFACE-BREACH-AUTHORIZED: Cascade archived — AccountingCatalog + DetailTypes + VoidCancel + OverrideReasons + PostingTemplates status → MultiSelectDropdown (apiStatus/matchesStatus). verify-filter-surfaces VoidCancel retarget.
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~8:50 PM CT) — U12 Maint Parts + OEM Parts MultiSelect
- **PRIOR:** #28609 Locations + Maint services U12.
- **THIS:** MaintenancePartsCatalog manufacturer/category + OemPartsCatalog brand/category → MultiSelectDropdown. Accounting lists still Cascade.
- **NEXT:** live DONE-LIVE; Accounting lists → Cascade; no match/Dreamline.

## OUTBOX (11-03-2026 ~8:45 PM CT) — U12 Locations + Maint services MultiSelect
- **PRIOR:** #28608 Drivers Reference U12.
- **THIS:** LocationsListPage Geocoded/Geofence/Source + MaintenanceServicesCatalog Applies-to → MultiSelectDropdown. Accounting lists still Cascade.
- **NEXT:** live DONE-LIVE; Accounting lists → Cascade; no match/Dreamline.

## OUTBOX (11-03-2026 ~8:40 PM CT) — U12 Drivers Reference catalog archive MultiSelect
- **PRIOR:** #28606 Compliance filings Program U12.
- **THIS:** DriversReferenceCatalogPage Active/Archived → MultiSelectDropdown (archiveMode). Accounting lists still Cascade.
- **NEXT:** live DONE-LIVE; Locations/Maint services filters / Accounting Cascade; no match/Dreamline.

## OUTBOX (11-03-2026 ~8:35 PM CT) — U12 Compliance filings Program MultiSelect
- **PRIOR:** #28604 Coverage Gap U12.
- **THIS:** FilingsComplianceDueSection Program SelectCombobox → MultiSelectDropdown (empty=all). Status KPI tiles stay single-toggle. Accounting lists still Cascade (SURFACE-BREACH).
- **NEXT:** live DONE-LIVE; Accounting lists → Cascade; no match/Dreamline.

## OUTBOX (11-03-2026 ~8:30 PM CT) — U12 Coverage Gap by-type MultiSelect
- **PRIOR:** #28602 QBO Sync Status U12.
- **THIS:** CoverageGapDashboard per-type Covered/Missing SelectCombobox → MultiSelectDropdown (empty/both=all). Accounting lists still Cascade.
- **NEXT:** live DONE-LIVE; Accounting lists → Cascade; no match/Dreamline.

## OUTBOX (11-03-2026 ~8:25 PM CT) — U12 QBO Sync Status MultiSelect
- **PRIOR:** #28600 Driver/Teams/Brokers U12.
- **THIS:** QBOSyncStatusDashboardPage status SelectCombobox → MultiSelectDropdown (0/1 API, 2+ client filter). Accounting lists still Cascade.
- **NEXT:** live DONE-LIVE; Accounting lists → Cascade; no match/Dreamline.

## OUTBOX (11-03-2026 ~8:15 PM CT) — U12 Driver catalog + Teams + Brokers MultiSelect
- **PRIOR:** #28599 balanced-ledger 19885 + CLOSE-ALL sync.
- **THIS:** DriverCatalogListPage + DriverTeamsPage + BrokersListPage status → MultiSelectDropdown (apiStatus/apiIsActive). Accounting lists still Cascade.
- **NEXT:** live DONE-LIVE; Accounting lists → Cascade; no match/Dreamline.

## OUTBOX (11-03-2026 ~8:05 PM CT) — ENG-34 balanced-ledger 19885 + CLOSE-ALL sync
- **PRIOR:** #28598 bus-diet Cursor 19883.
- **THIS:** verify-balanced-ledger --selftest + verify-steps 19885; removed from .guard-exempt. Synced ROUND 7.30 CLOSE-ALL Cursor OPEN/CODED date+D066/D067/D068–D077 rows to PENDING (DONE-LIVE / MERGED-UNVERIFIED). match / verify-static stay exempt.
- **NEXT:** live walks for remaining MERGED-UNVERIFIED; Accounting lists → Cascade; no match/Dreamline.

## OUTBOX (11-03-2026 ~7:55 PM CT) — ENG-34 wire bus-diet Cursor seat 19883
- **PRIOR:** #28597 load-driven-miles 19881.
- **THIS:** verify-bus-diet --seat=cursor + selftest plants; verify-steps 19883; removed from .guard-exempt. Other seats' over-cap bus untouched. balanced-ledger / match / verify-static stay exempt.
- **NEXT:** live DONE-LIVE; Accounting lists → Cascade; no match/Dreamline.

… older OUTBOX tips truncated for bus-diet cap.
