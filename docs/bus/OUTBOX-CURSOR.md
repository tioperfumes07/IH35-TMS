## OUTBOX (11-03-2026 ~11:55 AM CT) — ENG-36 re-measure (18841 still 21/≤21)
- **PRIOR:** #28269 OptimalDrivers quantity; #28268 deadhead guard; #28266 DF need-company.
- **THIS:** LIVE re-run `verify-steps/18841` PASS — still 21 of ≤21 negative company settlements. ENGINE-REGISTER ENG-36 evidence stamped 11-03. No balancing JE. Further → ENG-25b.
- **ENG-21 stays DONE-LIVE** (owner skip rate-con). **NEXT:** more Cursor engines; ENG-22 cancelled residual waits AUTH; Dreamline/match deferred. ENG-34 LIVE/tool ~29 remain.

## OUTBOX (11-03-2026 ~11:40 AM CT) — deadhead guard retarget + DeadheadOptimizer score quantity
- **PRIOR:** #28266 DF board need-company.
- **THIS:** verify-deadhead-pay-line plants retarget settlementDetailLineMaps; escrow-pending ParityTable selftest plant fixed; DeadheadOptimizer ¢/mi score → formatQuantityTable(,2).
- **ENG-21 stays DONE-LIVE** (owner skip rate-con). **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. AccountingHub → CC-1. ENG-34 LIVE/tool ~29 remain.

## OUTBOX (11-03-2026 ~11:25 AM CT) — DF board need-company wave (pre-settle/cash/deductions/detail)
- **PRIOR:** #28265 dwell SAVEPOINT behavior (Codex #27976).
- **THIS:** SettlementsPreSettlements / CashAdvances / Deductions / EscrowDeductionsPending / SettlementDetail / SettlementWorkflow need-company BoardSections. fill-shell guard extended.
- **ENG-21 stays DONE-LIVE** (owner skip rate-con). **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. AccountingHub → CC-1. ENG-34 LIVE/tool ~29 remain.

## OUTBOX (11-03-2026 ~11:10 AM CT) — ENG-29/53 dwell SAVEPOINT behavior test (Codex #27976)
- **PRIOR:** #28262 FactorAdmin + DF settlements need-company; #28261 Faro1090; #28260 border/TripProfit; #28259 Notify/POD/xfer/history.
- **THIS:** Extract `persistDwellEvidenceInSavepoint`; vitest fake-client proves dwell failure → ROLLBACK TO SAVEPOINT, miles stay committed, txn usable; plant without rollback leaves 25P02. Source-shape order retained.
- **ENG-21 stays DONE-LIVE** (owner skip rate-con). **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. AccountingHub Codex note → CC-1. ENG-34 LIVE/tool ~29 remain.

## OUTBOX (11-03-2026 ~10:00 AM CT) — NotifyPreferences + POD/xfer/history need-company
- **PRIOR:** #28257 SET-RATE selftest plant.
- **THIS:** NotifyPreferences / PodReview / EquipmentTransfer / LoadHistory empty-company BoardSection; EquipmentTransfer created_at → formatDateTimeUS; LoadHistory linked-docs/timeline → BoardSection. verify-91190 TARGETS 27→30; datetime guard adds EquipmentTransfer.
- **ENG-21 stays DONE-LIVE** (owner skip rate-con). **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-03-2026 ~11:00 AM CT) — SET-RATE selftest plant retargets settlementDetailLineMaps
- **PRIOR:** #28256 ENG-34 wave 5 (34→29).
- **THIS:** verify-settlement-line-rate-consistency --selftest plant now mutates settlementDetailLineMaps (mapper moved off SettlementStatementWorkflowPage); --selftest exits before LIVE half.
- **ENG-21 stays DONE-LIVE**. **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-03-2026 ~10:50 AM CT) — ENG-34 shrink wave 5 (34→29 exempt)
- **PRIOR:** #28251 detention quantity · #28254 CLAIM-RESERVE 19812–19820.
- **THIS:** Wired 5 more no-DB CI-safe exempts (no-test-units · single-migration-dir · sql-read-targets · stalled-queue-reaper · trial-balance-contract). LIVE/tool remain.
- **ENG-21 stays DONE-LIVE**. **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-03-2026 ~10:35 AM CT) — Detention billable minutes house quantity
- **PRIOR:** #28249/#28250 ENG-34 shrink 53→34.
- **THIS:** DetentionBoardPage billable minutes → formatQuantityTable. Guards extended.
- **ENG-21 stays DONE-LIVE**. **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-03-2026 ~10:25 AM CT) — ENG-34 shrink wave 4 (53→34 exempt)
- **PRIOR:** #28247 escrow names / Faro labels / weekly revenue; #28248 CLAIM-RESERVE 19774–19810.
- **THIS:** Wired 19 static/selftest-passing exempts into verify-steps 19774–19810 (accident-wizard · coa-roles · double-entry · escrow-sign · item-line · LDT-3/D · master-data · no-sample · one-source · purge-exemption · scheduler · seed-doc · service-location · settlement-close-gl · statement-export · task-link · truck-line · wizard-section). LIVE/tool exempts left (canonical cust/vend, party-boards, eng27 ceiling, feed-day, faro repurchase, etc.).
- **ENG-21 stays DONE-LIVE**. **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-03-2026 ~10:05 AM CT) — Escrow holder names + Faro dry-run labels + weekly revenue axis
- **PRIOR:** #28245 SelectCombobox shrink + dispatch quantity/rate house format.
- **THIS:** SettlementsEscrowBoard joins getEscrowDriverBalances names when holder_label is null (D076). Faro1090 dry-run note drops UUID slices. WeeklyRevenueChart YAxis uses en-US. Guards extended.
- **ENG-21 stays DONE-LIVE** (owner skip). **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-03-2026 ~9:45 AM CT) — SelectCombobox shrink + dispatch quantity/rate house format
- **PRIOR:** #28242 ENG-21 CLOSED (owner skip rate-con) + house money wave 7.
- **THIS:** Raw `<select>` 6→2 (CustomerProfileForm · ClaimCreateModal recovery/repair · PolicyDetail status → SelectCombobox). TourSettlementTab p/m + period/closed stamps · LoadUnitCostSplitPanel miles · DeadheadOptimizer miles → house formatters. Guards extended (selector + currency + cursor-surfaces).
- **ENG-21 stays DONE-LIVE** (owner skip). **NEXT:** more Cursor engines; ENG-22 AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

## OUTBOX (11-03-2026 ~9:30 AM CT) — ENG-21 CLOSED (owner skip rate-con) + house money wave 7
- **ENG-21 DONE-LIVE:** load 13699 delivery already Copamex / 195 S Euclid Ave / Bradley IL 60915 (street+ZIP). Rate-con missing — **OWNER 11-03: skip rate-con, OK**. No Edit Load. ENGINE-REGISTER LEAD-ENG-21 → DONE-LIVE.
- **THIS:** MarkDisbursedModal bank labels · ManualJEList Debits/Credits → house formatters. Guard extended. (BankingHome Balance left for CC-2 seat surface.)
- **NEXT:** more Cursor engines; ENG-22 residual cancelled apply waits AUTH; Dreamline/match deferred. Safety/CC-3 stays off Cursor.

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
