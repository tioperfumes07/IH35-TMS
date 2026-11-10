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

## OUTBOX (11-09-2026 ~8:15 PM CT) — ROUND 8.4 census floor → 0 static fails
- **PRIOR:** #28697 design-parity census.
- **THIS:** Retune census (no false coming-soon/testid; ParityTable gear defaults; print hidePager exempt). emptyText — on Documents + 4 catalog lists. Baseline failing_routes 48→0.
- **NEXT:** Accounting complete design build vs Accounting.dc.html; no match/Dreamline.

… older OUTBOX tips truncated for bus-diet cap.
