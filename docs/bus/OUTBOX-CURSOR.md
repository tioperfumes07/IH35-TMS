## OUTBOX (11-10-2026 ~7:10 PM CT) — Factoring Payments/Repurchase board tables
- **PRIOR:** #28818 Fuel diesel Spend bar track off slate.
- **THIS:** PaymentsToYouPanel (3) + RepurchaseDuePanel ParityTables appearance=board so money/party columns follow board anti-clip grammar. Engines unchanged. R4–R6 Cascade.
- **NEXT:** residual boards; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~7:00 PM CT) — Fuel diesel Spend bar track off slate
- **PRIOR:** #28817 Integrity Alerts Severity multi-select.
- **THIS:** FuelDieselByTruckPanel Spend bar track bg-slate-100 → #EEF0F3 (same locked track as Fuel Home F1/F2). Engines unchanged. R4–R6 Cascade.
- **NEXT:** residual boards/U12; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~6:55 PM CT) — Integrity Alerts Severity multi-select
- **PRIOR:** #28816 F1/F2 Fuel Home diesel board engines.
- **THIS:** IntegrityAlertsPage Severity SelectCombobox → MultiSelectDropdown (same U12 OR pattern as Status); API one-severity when 0/1, client filter when 2+. R4–R6 Cascade.
- **NEXT:** residual boards/U12; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~6:45 PM CT) — F1/F2 Fuel Home diesel board engines
- **PRIOR:** #28815 U12 Filings status tiles multi-select.
- **THIS:** FuelHome Diesel by truck gets FleetTruck unit graphic + Spend bar (F1/F2), appearance=board, kind money + nowrap; $/gal uses formatUsdRateTable (same engines as FuelDieselByTruckPanel). R4–R6 Cascade.
- **NEXT:** residual boards/U12; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~6:25 PM CT) — U12 Truck Planner Status multi-select
- **PRIOR:** #28811 U12 DVIR Defects triage Status multi-select.
- **THIS:** PlannerEntityFilters Status native select → MultiSelectDropdown (U12); entityFilters.status string[] (empty=all); TruckPlanner OR filter; chips join labels. D3 heading/Driver picker retained. R4–R6 Cascade.
- **NEXT:** residual U12/U28; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~6:15 PM CT) — U12 DVIR Defects triage Status multi-select
- **PRIOR:** #28810 U12 Road Service Status multi-select.
- **THIS:** DefectsInboxPage Triage status SelectCombobox → MultiSelectDropdown (U12); default pending; API one-status when 0/1, client OR when 2+. Staged CollapsedListFilters preserved. R4–R6 Cascade.
- **NEXT:** residual U12/U28; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~6:05 PM CT) — U12 Road Service Status multi-select
- **PRIOR:** #28809 U12 Truck Line Status multi-select.
- **THIS:** RoadServiceList Status pills → MultiSelectDropdown (U12); API one-status when 0/1 selected, client OR filter when 2+; staged CollapsedListFilters preserved. R4–R6 Cascade.
- **NEXT:** residual U12/U28 Cursor modules; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~5:55 PM CT) — U12 Truck Line Status multi-select
- **PRIOR:** #28806 CF4 AVP money-axis 11px.
- **THIS:** TruckLineBoard Status filter is MultiSelectDropdown (U12); empty = all trucks; OR across Rolling/Stopped/Signal stale/Appointment past/Available with counts from same legBuckets(); Clear resets. On-time station Combobox retained (D6). R4–R6 Cascade.
- **NEXT:** residual Cursor boards/U12/U28; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~5:40 PM CT) — CF4 AVP chart money-axis 11px
- **PRIOR:** #28805 CF5 Rolling Ledger board anti-clip.
- **THIS:** ActualVsProjected chart Y money labels 10→11 Inter (8.4a) with nowrap; left margin 96 retained. R4–R6 Cascade.
- **NEXT:** residual boards; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~5:35 PM CT) — CF5 Rolling Ledger board tables anti-clip
- **PRIOR:** #28804 Book Load dialog semantics.
- **THIS:** RollingLedger ParityTables appearance=board; Party/Payee/Amount whitespace-nowrap so carried income/expense party+money stay readable. Engines unchanged. R4–R6 Cascade.
- **NEXT:** residual boards; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~5:30 PM CT) — Book Load dialog semantics (role=dialog)
- **PRIOR:** #28803 Load History money/name nowrap.
- **THIS:** BookLoadModalV4 panel role=dialog aria-modal labelled by book-load-dialog-title (center+side). D1/D2 engines retained. R4–R6 Cascade.
- **NEXT:** residual Cursor-owned boards; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~5:25 PM CT) — Load History board anti-clip money/names
- **PRIOR:** #28800 T4 Settlements Week-of Closed status.
- **THIS:** Dispatch Load History ParityTable money/miles/names whitespace-nowrap + kind money/number so Rate/$/mi/Driver pay/lanes stay readable (board columns). Engines unchanged (loads-history lcr). R4–R6 still Cascade pages/reports.
- **NEXT:** residual Cursor-owned boards; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~5:20 PM CT) — T4 Settlements Week-of Closed status engine
- **PRIOR:** #28798 D3/D4 TruckPlanner filters + Driver header + side truck.
- **THIS:** Week-of Status uses tour-close + payment (weekOfBoardStatus): Closed unpaid tours read Closed (not payment Open); Paid/Held still win. CSV export matches. R4–R6 remain Cascade surface (pages/reports) — Cursor does not breach.
- **NEXT:** residual Cursor-owned boards; Cascade owns R*. No match/Dreamline.

## OUTBOX (11-10-2026 ~5:15 PM CT) — D3/D4 TruckPlanner entity filters + Driver header + side truck
- **PRIOR:** #28796 D1/D2 Book Load A–E rail + side-by-side charges.
- **THIS:** D3 Filters popover Status · Driver · Unit · Customer heading + Status select + Driver EntityPicker; entityFilters in PlannerRangeContext filter TruckPlanner rows. D4 PlannerGrid separate Driver columnheader (no Unit span); board PlannerSideTruckGlyph replaces lucide outline. Status/Action preserved additive.
- **NEXT:** R4–R6 / residual boards. No match/Dreamline. Not chrome-only.

## OUTBOX (11-10-2026 ~4:05 PM CT) — D1/D2 Book Load A–E rail + side-by-side charges
- **PRIOR:** #28769 DP1–DP4 Driver Profile board engines.
- **THIS:** D1 center Book Load sticky A–E section rail (jump to section anchors; side panel unchanged). D2 four charge amounts side-by-side grid (Linehaul/Fuel/Accessorial/Total) with live MoneyInput + engine totals; AccessorialEditor/extras stay additive. R2 Trial Balance left for Cascade surface. Guards: verify-book-load-money-and-controls (+selftest).
- **NEXT:** D3–D4 TruckPlanner / R4–R6 (Cascade owns R2 TB). No match/Dreamline. Not chrome-only.

## OUTBOX (11-09-2026 ~10:40 PM CT) — DP1–DP4 Driver Profile board engines
- **PRIOR:** #28767 T5/T6 Settlements Open/Closed board columns.
- **THIS:** DP1 navy V3.shell tab strip (not white underline). DP2 pay title "Pay this week · open pre-settlement" + compact asymmetric panel (net hero, gross/deductions, load EntityLinks). DP3 Trip Dates column + Rate (Pickup/Delivery folded into Dates). DP4 document status dots + board ParityTables. Real pre-settlement/dispatch/telematics engines; board-only + live tests retargeted.
- **NEXT:** R2/R4–R6 / D1–D4 full engines. No match/Dreamline. Not chrome-only.

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

… older OUTBOX tips truncated for bus-diet cap.
## OUTBOX (11-03-2026 ~7:25 PM CT) — U12 Cursor wave tip; Cascade handoff Accounting lists
- **PRIOR:** #28591 EDI U12.
- **THIS:** Cursor U12 MultiSelect landed CardOverage/DriversTable/Fuel/Fleet/Maint/Safety/Dispatch/Termination/LoadCancel/LoadException/EDI. Residual Active-Inactive on pages/lists/accounting/** (AccountingCatalog/DetailTypes/VoidCancel) → Cascade seat surface; do not steal without SURFACE-BREACH-AUTHORIZED: Cascade.
- **NEXT:** live DONE-LIVE walks; no match/Dreamline.

## OUTBOX (11-03-2026 ~7:20 PM CT) — U12 EDI Transaction Log status MultiSelect
- **PRIOR:** #28590 Load cancel/exception U12.
- **THIS:** EdiTransactionLog status SelectCombobox → MultiSelectDropdown (0/1 API, 2+ client filter). Shared integrations surface.
- **NEXT:** Accounting list Active-Inactive need SURFACE-BREACH Cascade/CC-1; live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~7:15 PM CT) — U12 Load Cancellation + Exception Reasons MultiSelect
- **PRIOR:** #28589 Dispatch/Termination U12.
- **THIS:** LoadCancellationReasonsListPage + LoadExceptionReasonsListPage status → MultiSelectDropdown; filter-surfaces matchesStatus retarget.
- **NEXT:** Accounting/DetailTypes/VoidCancel (CC-1) / live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~7:10 PM CT) — U12 Dispatch + Termination Reasons MultiSelect
- **PRIOR:** #28588 Safety catalog U12.
- **THIS:** DispatchCatalogListPage + TerminationReasonsListPage status → MultiSelectDropdown; filter-surfaces Termination matchesStatus retarget.
- **NEXT:** Accounting/VoidCancel/LoadCancellation Active-Inactive (CC-1/dispatch siblings) / live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~7:05 PM CT) — U12 Safety catalog status MultiSelect
- **PRIOR:** #28587 Maintenance catalog U12.
- **THIS:** CatalogStatusFilterCombobox → MultiSelectDropdown; apiStatusFromMulti in shared; SafetyGeneric + 6 scoped Safety catalog lists. filter-surfaces Safety fetchMust retargeted.
- **NEXT:** remaining list Active/Inactive singles / live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~7:00 PM CT) — U12 Maintenance catalog status MultiSelect
- **PRIOR:** #28586 Fuel+Fleet catalog U12.
- **THIS:** MaintenanceCatalogListPage Active/Inactive → MultiSelectDropdown + apiStatus; filter-surfaces retarget; U12 register residual → Safety CatalogStatusFilterCombobox.
- **NEXT:** Safety catalog shared Combobox → MultiSelect; live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~6:55 PM CT) — U12 Fuel+Fleet catalog status MultiSelect + bus-diet
- **PRIOR:** #28584 DriversTable U12.
- **THIS:** FuelCatalogListPage + FleetCatalogListPage Active/Inactive → MultiSelectDropdown (API maps 0/2→all, 1→scalar); Show voided syncs both. Also archived older OUTBOX tips under post-28584-diet.
- **NEXT:** more catalog/list U12 / live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~6:45 PM CT) — U12 DriversTable status MultiSelect
- **PRIOR:** #28582 Card Overage U12 re-ship.
- **THIS:** DriversTable status Combobox → MultiSelectDropdown; retarget verify-driver-roster-status-filter-combobox to U12 contract.
- **NEXT:** catalog Active/Inactive singles / more live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~6:40 PM CT) — U12 Card Overage MultiSelect (re-ship after empty #28581)
- **PRIOR:** #28581 empty squash (push flake; title only).
- **THIS:** Re-land CardOverageQueuePage status → MultiSelectDropdown + U12 register note (code that #28581 missed).
- **NEXT:** more U12 residuals / live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~6:35 PM CT) — U12 Fuel Card Overage status MultiSelect
- **PRIOR:** #28580 #57/#159 DONE-LIVE.
- **THIS:** CardOverageQueuePage status pills → MultiSelectDropdown (default pending_review; 0/1 API pass-through, 2+ client filter). Owner UI register U12 note: PoliciesList already multi. (#28581 landed empty — see re-ship tip.)
- **NEXT:** more U12 residuals / live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~6:30 PM CT) — #57/#159 Settlements DONE-LIVE (Codex batch96)
- **PRIOR:** #28579 cash-basis wire.
- **THIS:** PENDING/ROUND #57/#159 → DONE-LIVE — Codex batch96 17:20CT selected-week caption + week identity CLOSED after #28561. Non-CT browser not claimed.
- **NEXT:** U12 residuals / more live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~6:25 PM CT) — ENG-34 wire cash-basis pair 19877/19879
- **PRIOR:** #28578 batch70 static 19871/73/75.
- **THIS:** verify-steps 19877 (cash-basis-pl-from-transactions) + 19879 (cash-basis-drill-answers); removed from .guard-exempt. LIVE leftovers stay exempt.
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~6:20 PM CT) — ENG-34 wire batch70 static orphans 19871/73/75
- **PRIOR:** #28577 bus-diet Cursor.
- **THIS:** verify-steps 19871 (every-poster --selftest/static), 19873 (one-fuel-to-load-helper), 19875 (row-actions-clickable); removed from .guard-exempt. LIVE leftovers stay exempt (balanced-ledger / load-driven-miles / bus-diet global / match).
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~6:10 PM CT) — bus-diet Cursor INBOX/OUTBOX
- **PRIOR:** #28575 #241 DONE-LIVE.
- **THIS:** Archived fat Cursor inbox/outbox under docs/bus/archive/*-pre-diet.md; hot OUTBOX 162≤200, INBOX 12≤40 (standing law kept). Other seats' bus files still over cap (not Cursor-owned).
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~6:05 PM CT) — #241 DONE-LIVE (Codex batch94)
- **PRIOR:** #28574 ENG-34 match exempt.
- **THIS:** PENDING/ROUND #241 → DONE-LIVE — Codex live USMCA 17:14CT Class/Debit 4px gap both viewports after #28557 reload.
- **NEXT:** more live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~6:00 PM CT) — ENG-34 match orphan exempt; tip #57/#159 week TZ
- **PRIOR:** #28572 wire rows-250-255.
- **THIS:** verify-match-vendor exempt (OWNER BUILD-FIRST no match); PENDING #57/#159 cite #28561 company-calendar week + selected-week deductions. ENG-34 orphans → 0.
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~5:55 PM CT) — ENG-34 wire rows-250-255
- **PRIOR:** #28571 System need-company.
- **THIS:** verify-steps 19869 wires verify-rows-250-255. ENG-34 orphans → match residual only.
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~5:50 PM CT) — System EngineStatus + SystemModule need-company
- **PRIOR:** #28570 tip #29/#241.
- **THIS:** EngineStatusBoardPage + SystemModulePage BoardSection need-company; fill-shell plants.
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~5:45 PM CT) — tip #29/#241 ROUND sync
- **PRIOR:** #28568 tip #27.
- **THIS:** ROUND #29/#241 → MERGED-UNVERIFIED; PENDING #241 cites #28557 + Lead min-w-0.
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~5:40 PM CT) — tip #27 after #28566
- **PRIOR:** #28566 CreateMultipleBills + VendorBillCreate need-company.
- **THIS:** PENDING/ROUND tip #27 MERGED-UNVERIFIED (~69 surfaces).
- **NEXT:** live DONE-LIVE; no match/Dreamline.

## OUTBOX (11-03-2026 ~5:35 PM CT) — #27 CreateMultipleBills + VendorBillCreate need-company
- **PRIOR:** #28564 ENG-34 live-fails wire.
- **THIS:** CreateMultipleBillsPage + VendorBillCreatePage BoardSection need-company early return; fill-shell plants (~69). SURFACE-BREACH CC-1 for ROUND 7.30 #27. Reclassify/match/LoadCosts still skipped.
- **NEXT:** live DONE-LIVE; no match/Dreamline.


## ARCHIVE
Older Cursor outbox tips: `docs/bus/archive/OUTBOX-CURSOR-archive-2026-11-03-pre-diet.md` + `docs/bus/archive/OUTBOX-CURSOR-archive-2026-11-03-post-28584-diet.md` (bus-diet OUTBOX≤200).
## OUTBOX (11-02-2026 ~12:45 AM CT) — Load Costs rate selftest plant (formatUsdRateTable)
- **PRIOR:** #28234 house money wave 6.
- **THIS:** verify-load-costs-board-no-truncation-no-wrap --selftest plants drop of formatUsdRateTable (toFixed(4) plant was vacuous after wave 6).
- **ENG-21 BLOCKED.** NEXT: more Cursor engines; ENG-22 AUTH; Dreamline/match deferred.

## OUTBOX (11-02-2026 ~12:35 AM CT) — Cursor house money wave 6 (Load Costs/escrow/liabilities)
- **PRIOR:** #28228–#28233 house money waves 1–5.
- **THIS:** LoadCostsBoardPage rates · DriverEscrowLedger balance tiles · LiabilitiesKpiRow · TourSettlement leg rates → house formatters. Guard extended.
- **ENG-21 BLOCKED:** rate con not on file for 13699 — no Edit Load.
- **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-02-2026 ~12:20 AM CT) — Cursor house money wave 5 (driver reverse + TotalsStack)
- **PRIOR:** #28228–#28232 house money waves 1–4.
- **THIS:** DriverCashAdvancesReverse (FIX: requested_amount_cents was treated as dollars) · DriverSettlementFinanceReverse · SettlementDispute List/Resolve · LoadDetailCostsTab rate · DispatchChat cash-advance card · TotalsStack → lib/money. Guard + TotalsStack vitest updated.
- **ENG-21 BLOCKED:** rate con not on file for 13699 — no Edit Load.
- **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-02-2026 ~12:05 AM CT) — Cursor house money wave 4 (Driver Hub CSV)
- **PRIOR:** #28228–#28230 house money waves 1–3.
- **THIS:** DriverHubReportingPage CSV approved volume → formatUsdCents. Guard extended.
- **ENG-21 BLOCKED:** rate con not on file for 13699 — no Edit Load.
- **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-02-2026 ~11:50 PM CT) — Cursor house money wave 3 (parts/inventory)
- **PRIOR:** #28228–#28229 house money waves 1–2.
- **THIS:** VendorPartsHistory · UnitPartsHistory · InventoryPartsStock unit_cost → formatUsd. Guard extended.
- **ENG-21 BLOCKED:** rate con not on file for 13699 — no Edit Load.
- **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-02-2026 ~11:35 PM CT) — Cursor house money wave 2 (drivers/dispatch/CRM)
- **PRIOR:** #28228 FuelAssignment/BookLoad/SettlementProfitability/formatMoneyCents/InsuranceHome/useLiveDebt.
- **THIS:** EarningsTab · FinesDeductionsCard · LoadQualityEvents · LoadStopsRecord lumper · TourSettlement rate/perMile · CustomerDetail quality/invoice/FSC → lib/money. Extended verify-currency-format-guarded.
- **ENG-21 BLOCKED:** rate con not on file for 13699 — no Edit Load.
- **NEXT:** more Cursor engines; ENG-22 AUTH apply; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-02-2026 ~11:15 PM CT) — Cursor house money (dispatch/fuel/insurance/DF)
- **PRIOR:** #28192–#28220 SelectCombobox baseline 2 · ENG-21 BLOCKED tip (#28222).
- **THIS:** FuelAssignmentPopup · BookLoadModalV4 · SettlementProfitabilityCard · dispatch formatMoneyCents/Dollars USD → formatUsdCents/formatUsd (MXN Intl kept) · InsuranceHomeBoard unify lib/money · useLiveDebt displayDebt → formatUsd. Extended verify-currency-format-guarded + verify-fuel-assignment-popup.
- **ENG-21 BLOCKED:** rate con not on file for 13699 — no Edit Load.
- **NEXT:** more Cursor engines; ENG-22 AUTH apply; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-02-2026 ~10:00 PM CT) — Cursor BUILD-FIRST tip (#28192–#28205)
- **SHIPPED THIS CONT:** #28192 CRM/Drivers format · #28195 shared format · #28198 inventory/integrations/forensic/payroll · #28200 System qty+U18 · #28201 Driver Bill U18 · #28203 SelectCombobox shrink · #28204 PolicyDetail Demand dollars · #28205 Load History epoch guard + Lawsuits deep-link.
- **ENG-21 BLOCKED:** load 13699 delivery already Bradley IL/Copamex; rate con not on file — no Edit Load.
- **NEXT:** more Cursor engines; ENG-22 AUTH apply; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-02-2026 ~9:35 PM CT) — Cursor PolicyDetail Demand dollars (not cents)
- **PRIOR:** #28203 Faro/Fuel SelectCombobox shrink.
- **THIS:** PolicyDetail lawsuit Demand → formatUsd for amount_claimed_against_us (dollars); reserve fallback formatUsdCents. Vitest dollar assertion.
- **NEXT:** more Cursor engines; ENG-22 AUTH; ENG-21 BLOCKED; Dreamline/match deferred.

## OUTBOX (11-02-2026 ~9:25 PM CT) — Cursor SelectCombobox shrink + DF bill U18
- **PRIOR:** #28200 System/U18 · #28201 Driver Bill Detail backHref `/driver-finance` (back-arrow green).
- **THIS:** Faro1090 wire candidates + Fuel Import kind → SelectCombobox; verify-every-selector-multi-select BASELINE 11→10.
- **NEXT:** more Cursor engines; ENG-22 AUTH; ENG-21 BLOCKED; Dreamline/match deferred.

## OUTBOX (11-02-2026 ~9:00 PM CT) — Cursor System qty + Integrations U18
- **PRIOR:** #28198 inventory/integrations/forensic/payroll format.
- **THIS:** SystemModule drift qty → formatQuantityTable · EDI Transaction Log backHref → /integrations/edi · Samsara driver mapping backHref → /integrations/samsara (+ FILE_MODULE map). Guard extended.
- **NEXT:** more Cursor engines; ENG-22 AUTH; ENG-21 BLOCKED; Dreamline/match deferred.

## OUTBOX (11-02-2026 ~8:40 PM CT) — Cursor inventory/integrations/forensic/payroll format
- **PRIOR:** #28195 shared Cursor surfaces format.
- **THIS:** Inventory assignments/purchases · Samsara · Forensic · Advance print · QBO sync detail/label · profitability miles · MaintServices miles · SidebarPagination · payroll money → house formatters. Guard extended.
- **NEXT:** more Cursor engines; ENG-22 AUTH; ENG-21 BLOCKED; Dreamline/match deferred.

## OUTBOX (11-02-2026 ~8:20 PM CT) — Cursor shared format wave (tasks/docs/fleet/cash-advances)
- **PRIOR:** #28192 CRM/Drivers + ENG-21 BLOCKED tip.
- **THIS:** TasksTab/NotificationLog/ValidationPanel/UserActivity/Docs Version+Preview datetime · oos-display/MilesRec/Locations/CashAdvances dates · FleetTable/odometerHonesty/VendorFuel/Driver mph/CappedListNotice qty · SettlementsSection money. Extended cursor-surfaces datetime guard.
- **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. ENG-21 still BLOCKED (rate con not on file).

## OUTBOX (11-02-2026 ~8:00 PM CT) — Cursor CRM/Drivers house format + ENG-21 BLOCKED
- **ENG-21 (load 13699 / Copamex):** BLOCKED — live Neon measure: delivery stop already `{ city: 'Bradley', state: 'IL', facility_name: 'Copamex' }`; `docs.files` for the load only has driver-instructions PDFs; load.notes say **"rate con not on file"**. No Edit Load — signed rate-con is not in the system (do not invent). Needs rate-con upload/find before document-decides close.
- **THIS WAVE:** CustomerDetail/VendorDetail/Drivers/UnitDriverHistory/CoiTab/PortalUsers/DocumentAlerts/Vendors+Customers SyncPanels/FMCSA modal/FreeTimeDetention/Customers+Vendors KPI miles/CreatorMilesChoicePanel → house formatDateUS/formatDateTimeUS/formatQuantityTable. Extended `verify-cursor-surfaces-datetime-format` (already wired).
- **NEXT:** more Cursor engines/U18–U31 leftovers; ENG-22 apply waits AUTH; Dreamline/match deferred (owner BUILD-FIRST). Safety/CC-3 inbox stays off Cursor.

## OUTBOX (11-02-2026 ~7:35 PM CT) — Cursor BUILD-FIRST format tip (#28188+)
- **PRIOR:** #28174–#28188 shells/U18/format waves.
- **THIS:** Archived DispatchList dates → formatDateUS/formatDateTimeUS. Cursor seat locale leftovers now only America/Chicago machine clocks (plannerTimeAxis todayYmd · hosClocks fmtLocalClock).
- **NEXT:** ENG-21 rate-con · ENG-22 AUTH apply · Dreamline/match deferred.

## OUTBOX (11-02-2026 ~7:15 PM CT) — Cursor BUILD-FIRST format tip (#28185+)
- **PRIOR:** #28174–#28185 shells/U18/format waves (CRM/Dispatch/Tasks/Legal/Fuel/boards/LoadDetail).
- **THIS:** BankingHomeBoard Latest lines MM/DD + signed amounts via formatUsdCentsTable (no toLocaleString).
- **NEXT:** more engines; ENG-21 rate-con (live docs); ENG-22 AUTH apply; Dreamline/match deferred. Safety/CC-3 inbox items stay off Cursor seat.

## OUTBOX (11-02-2026 ~7:00 PM CT) — Cursor BUILD-FIRST format tip (#28184+)
- **PRIOR:** #28179–#28184 house date/money/quantity waves across Dispatch/Fuel/Legal/Docs/boards.
- **THIS:** Home print footers formatDateTimeUS; TaskPlannerGrid MD headers MM/DD (no locale).
- **REMAINING intentional:** plannerTimeAxis TZ keys · hosClocks America/Chicago · calendar weekday/month chrome · BankingHomeBoard signed cents design · archived DispatchList.
- **NEXT:** more engines/U18–U31; ENG-21 rate-con; ENG-22 AUTH apply; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~6:45 PM CT) — Cursor BUILD-FIRST format tip (#28183+)
- **PRIOR:** #28179–#28183 house date/money waves.
- **THIS:** Load detail tabs (BOL/settlement/stops/geofence/audit/fines/docs) + Tour miles + Relay fills gallons + QboStyleHome reconciled date.
- **NEXT:** more engines/U18–U31 leftovers; ENG-21 rate-con; ENG-22 AUTH apply; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~6:30 PM CT) — Cursor BUILD-FIRST format tip (#28181+)
- **PRIOR:** #28179–#28181 house date/money waves (Factoring/Fuel/boards/Legal/Docs).
- **THIS:** LoadDetailDrawer + TourLoadRows miles + CargoSensorTimeline ticks → formatDateTimeUS/formatQuantityTable.
- **NEXT:** more engines/U18–U31 leftovers; ENG-21 rate-con; ENG-22 AUTH apply; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~6:15 PM CT) — Cursor BUILD-FIRST format tip (#28180+)
- **PRIOR:** #28179 Factoring/Fuel/MatchDrawer · #28180 Driver boards/Kanban format.
- **THIS:** Legal/Docs/Reconciler/Settlements KPI/LegalHome/HomeFleetRestore house date+money formatters.
- **NEXT:** more engines/U18–U31 leftovers; ENG-21 rate-con; ENG-22 AUTH apply; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~6:00 PM CT) — Cursor BUILD-FIRST format tip (#28179+)
- **PRIOR:** #28173–#28177 BoardSection/U18 · #28179 Factoring/FleetOos/Fuel/MatchDrawer dates.
- **THIS:** DriverOverview/Hub boards + DispatchKanban quantity · DriverCommunications/FuelVerdicts datetime+money.
- **NEXT:** more engines/U18–U31 leftovers; ENG-21 rate-con; ENG-22 AUTH apply; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~5:45 PM CT) — Cursor BUILD-FIRST shells tip (#28173–#28177)
- **MERGED:** #28173 Drivers need-company · #28174 CRM/Dispatch BoardSection · #28175 Inbox/Earnings + Dispatch U18 · #28177 Tasks/Legal/Drivers U18.
- **THIS:** FactoringTab/FleetOos/Fuel reverse/MatchDrawer house date+quantity formatters; cursor-surfaces + fuel-reverse guards.
- **NEXT:** more engines/U18–U31 leftovers; ENG-21 rate-con (live docs); ENG-22 AUTH apply; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~5:20 PM CT) — Cursor BUILD-FIRST shells tip (#28152–#28164)
- **MERGED:** Claims · Fleet/DF · Dispatch queues+CF · Load History epoch + Identity · Planners/map/settings · Chat/Docs/DHUB · U18 home · Legal need-company BoardSection (#28152–#28164).
- **NEXT:** more engines/U18–U31 leftovers; ENG-21 rate-con (live docs); ENG-22 AUTH apply; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~5:05 PM CT) — Cursor shells wave tip (#28152–#28160)
- **MERGED:** #28152 Claims need-company · #28154 Fleet/DF profiles · #28157 Dispatch queues+Cash Flow · #28158 Load History epoch + Identity captured_at · #28160 Dispatch planners/map/settings BoardSection.
- **THIS:** Chat + Driver Hub reporting + Docs Home need-company BoardSection.
- **NEXT:** more engines/U18–U31; ENG-21 rate-con; ENG-22 AUTH apply; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~4:55 PM CT) — Cursor Load History epoch + Identity format + more need-company shells
- **PRIOR:** #28157 Dispatch queues + Cash Flow BoardSection · #28154 Fleet/DF need-company · #28152 Claims need-company.
- **THIS WAVE:** Load History formatWhen epoch/gap → em dash (no 12/31/1969) · IdentityStatusHeader captured_at formatDateTimeUS · Owner override / Load banking / Round trips / Overview / Cargo sensors / Settlements escrow BoardSection need-company.
- **NEXT:** more Cursor shells/engines; ENG-21 rate-con; ENG-22 apply waits AUTH; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~4:45 PM CT) — Cursor BUILD-FIRST shells wave (owner: engines first, no match)
- **PRIOR:** #28137 Relay wallet · #28138 Fuel Home diesel fail-loud.
- **THIS WAVE:** #28144 Fleet Covered + Roster Integrity BoardSection/U18 + RL CSV formatUsdCents · #28145 Coverage Gap + Type Catalog BoardSection/U18 · #28146 ENG-22 dry-run per-load listing + settlements/escrow/fuel CSV house money · #28148 Insurance Policies + Landing BoardSection/U18 · #28149 Faro Import (drop dark shell) + 1090 U18 back.
- **NEXT:** more Cursor shells/engines; ENG-21 needs live rate-con; ENG-22 apply waits AUTH; Dreamline/match deferred (owner BUILD-FIRST). No match/reconcile.

## OUTBOX (11-02-2026 ~11:10 PM CT) — Cursor Relay wallet drill + deposit format guard
- **PRIOR:** #28136 Fleet Transfers board · #28134 Factoring debtor behavior.
- **THIS WAVE:** RelayWallet KPI→day drill · doc EntityLink/inbox links · formatUsdCents · relay-deposit-format render-call plant.
- **NEXT:** ENG-21 rate-con / ENG-22 AUTH; more shells; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~10:55 PM CT) — Cursor Fleet Transfers BoardSection
- **PRIOR:** #28134 Factoring debtor behavior · #28132 Cash Flow pct · #28130 Fuel KPI.
- **THIS WAVE:** TransfersInProgressPage → BoardSection + ParityTable + formatDateTimeUS acks.
- **NEXT:** more Cursor shells/engines; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~10:40 PM CT) — Cursor Factoring debtor filter behavior
- **PRIOR:** #28132 Cash Flow pct · #28130 Fuel KPI · #28127–#28128 quantity waves.
- **THIS WAVE:** filterPurchaseReportByDebtors extracted + behavioral exclude-third guard; CappedListNotice at purchase-lines 2000 cap.
- **NEXT:** more Cursor shells/engines; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~10:20 PM CT) — Cursor Cash Flow pct format
- **PRIOR:** #28130 Fuel KPI house formatters · #28128/#28127 quantity waves.
- **THIS WAVE:** CashFlowHome matrix % + ActualVsProjected formatPct → formatQuantityTable.
- **NEXT:** more Cursor shells/engines; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~10:05 PM CT) — Cursor Fuel KPI house formatters
- **PRIOR:** #28128 margin selftest · #28127 quantity/pct · #28123 Settlements KPI.
- **THIS WAVE:** FuelKpiRow → formatUsd/formatUsdRateTable; Compliance/FactorAdmin/BatchWizard/CargoSensor → formatQuantityTable; fuel-kpi-money-format accepts house money.
- **NEXT:** more Cursor shells/engines; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~9:45 PM CT) — Cursor quantity/pct leftovers wave
- **PRIOR:** #28123 Settlements KPI/waterfall · #28121 MilesStrip/settlements boards · #28120 planner/factoring/fuel.
- **THIS WAVE:** Close Arrival / Company Settlements / Fuel gallons tables / Insurance share / Factoring true-cost / TripProfitability / MultiStop hours → formatQuantityTable (+ rate table where $/gal).
- **NEXT:** more Cursor shells/engines; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~9:25 PM CT) — Cursor Settlements KPI + planner miles format
- **PRIOR:** #28121 MilesStrip/AtRisk + settlements boards · #28120 PlannerCalendar/Factoring/Fuel.
- **THIS WAVE:** SettlementsPage KPI/source-changed · HomeBoardPanels money · CompanyWaterfall gallons/pct · TripPairing/planner-bars/LoadsPlanner quantities.
- **NEXT:** more Cursor shells/engines; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~9:05 PM CT) — Cursor MilesStrip + settlements format wave
- **PRIOR:** #28120 PlannerCalendar MMM-DD + Factoring/Fuel/BookLoad formatters · #28118 Geofences syntax.
- **THIS WAVE:** MilesStrip/AtRisk quantities · Settlements tours/pre/cash-advances/loads/company-driver/statement/escrow/workflow canonical money+miles+dates.
- **NEXT:** more Cursor shells/engines (SettlementsPage KPI leftovers); Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~8:45 PM CT) — Cursor planner/factoring/fuel format engines
- **PRIOR:** #28118 Geofences unterminated string (deploy unblock) · #28117 planners money/dates · #28113 tip.
- **THIS WAVE:** PlannerCalendar MMM-DD · FactoringHome formatUsd/formatDateUS · BookLoad formatDateTimeUS · Fuel transactions/KPI/trip strips formatQuantityTable/formatUsdRateTable · geofences deeplink guard ratchet (no `/` after ring color).
- **GUARDS:** extended verify-geofences-deeplink-beyond-page + verify-k5-planner-calendar-mmm-dd (no new orphan).
- **NEXT:** more Cursor shells/engines; Dreamline/match deferred (owner BUILD-FIRST). Cascade InvoiceSearch/P&L + Audit/DriverQual.

## OUTBOX (11-02-2026 ~7:45 PM CT) — Cursor BUILD-FIRST engines tip
- **MERGED:** #28087 CashFlow matrix→RL week/type · #28089 RL chip MM/DD/YYYY · #28091 Factoring debtor filter · #28092 Fuel Relay format · #28094 Geofences deeplink · #28097 NavyPageSubNav portal · #28100 Reimburse/ExtraPay formatUsd · #28103/#28104 disputes/payrun/deductions/floor/loan money · #28106 Settlements home week/money · #28108–#28111 Fuel savings/planner/stop/route formatUsd.
- **HANDOFF:** Cascade InvoiceSearch/P&L + Audit date-boundary + DriverQual reports. LAW: new verify-*.mjs must claim+wire same PR (#28096).
- **NEXT:** more Cursor shells/engines (FuelTransactions leftovers, insurance, dispatch); Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~7:25 PM CT) — Cursor BUILD-FIRST engines + submenu tip
- **MERGED:** #28087 CashFlow Home matrix → Rolling Ledger week/type (`rl_*`) · #28089 RL chip MM/DD/YYYY · #28091 Factoring Purchase Report Filter by Debtor · #28092 Fuel Relay deposit formatDateUS/formatUsdCents · #28094 Geofences deep-link pin beyond page 1 · #28097 NavyPageSubNav portal mousedown/hover keep-open.
- **THIS WAVE:** Settlement Reimbursements + Extra Pay → formatUsd.
- **HANDOFF:** Cascade InvoiceSearch multi-status + P&L URL seed — docs/bus/handoff/2026-11-02-cascade-invoice-search-pl-url.md. Reports Audit date-boundary + DriverQualification controls → Cascade/reports lane.
- **NEXT:** more Cursor shells/engines (driver-finance money leftovers, insurance, fuel); ACCT-R-04 Render UUIDs (operator); Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~6:35 PM CT) — Cursor shell datetime + engines tip
