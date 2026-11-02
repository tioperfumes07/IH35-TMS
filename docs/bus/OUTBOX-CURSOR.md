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
- **MERGED:** #28074 Trip Pairing Customer/Miles/Revenue · #28076 POD U12 · #28078–#28082 formatDateTimeUS sweeps (POD/Late/Fraud · Cursor surfaces · dispatch wave2 · Driver/Notification/Audit).
- **PRIOR:** #28065/#28067 U29 Company-Driver · Faro debtor.
- **HANDOFF:** Cascade InvoiceSearch multi-status + P&L URL seed — docs/bus/handoff/2026-11-02-cascade-invoice-search-pl-url.md
- **NEXT:** more U12/U29/U30 · remaining shells/engines; ACCT-R-04 Render UUIDs (operator); Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~6:10 PM CT) — Cursor engines + U12/U29 tip
- **MERGED:** #28065 Company/Driver picker U29 · #28067 Faro debtor Invoice/Load U29 · #28074 Trip Pairing Customer/Miles/Revenue engine + unbooked driver_id/live now · #28076 POD review status U12 MultiSelect + backend status[].
- **HANDOFF:** Cascade InvoiceSearch multi-status + P&L URL seed — docs/bus/handoff/2026-11-02-cascade-invoice-search-pl-url.md
- **NEXT:** more U12/U29/U30 · remaining shells/engines; ACCT-R-04 Render dashboard UUIDs (operator); Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~5:40 PM CT) — Cursor U29 wave tip
- **MERGED:** #28046–#28062 Fleet Covered · CashFlow+preset · Load Costs Truck · Dispatch queues · Fuel Integrity · Detention approval · Factoring Factor links (+ bus tip #28058).
- **HANDOFF:** Cascade InvoiceSearch multi-status + P&L URL seed — docs/bus/handoff/2026-11-02-cascade-invoice-search-pl-url.md
- **NEXT:** more U29 · remaining shells/engines; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~5:20 PM CT) — Cursor BUILD-FIRST tip catch-up
- **MERGED:** #28046 Fleet Covered dates · #28050 CashFlow format + report preset remount · #28054 Load Costs Truck U29 · #28056 Dispatch queues U29 · #28057 Fuel Integrity Unit/Vendor U29.
- **HANDOFF:** docs/bus/handoff/2026-11-02-cascade-invoice-search-pl-url.md (Cascade pages/reports).
- **NEXT:** more U29 · remaining shells/engines; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~4:20 PM CT) — Cursor CashFlow + InvoiceSearch + report preset
- **THIS WAVE:** CashFlowHomeTab matrix → formatUsdCents + formatDateUS; InvoiceSearch multi-status passes status[] to listInvoices (server OR before pagination); ReportFilterBar preset syncUrlMany; ProfitLoss URL seed; RouteContentBoundary Suspense key=pathname only (search no longer remounts staged filters).
- **GUARD:** verify-cashflow-home-money-date-format · verify-invoice-search-multistatus-server · verify-report-preset-atomic-url · verify-route-content-boundary-location-key (updated).
- **PRIOR:** #28046 Fleet Covered dates + Fleet Home status.
- **NEXT:** U28/U29 · SafetyReports residual · remaining shells/engines; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~4:00 PM CT) — Cursor Fleet Covered dates + Fleet Home status
- **MERGED:** #28046 FleetCoveredPage expiry + covered_since → formatDateUS; FleetHome Needs attention → humanizeEnumLabel; operator-facing limitation banner.
- **GUARD:** scripts/verify-fleet-covered-dates-format.mjs (+ --selftest).
- **NEXT:** CashFlow / InvoiceSearch / report preset (this tip above).

## OUTBOX (11-02-2026 ~2:05 PM CT) — Cursor BUILD-FIRST tip (U30/U19/Expenses)
- **MERGED:** #28037 Banking Home U30 ParityTable · #28039 Expenses/Bills ReceiptAttach no fan-out + aging U30 + humanMemo · #28042 U19 Reclassify no unscoped Loading hang (appliedHasScope).
- **NEXT:** U12 residual status singles · U28 account multi-select · U29 click-through · remaining shells (QboStyleHome category breakdown, SafetyReports engines); Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~1:45 PM CT) — Cursor U30 Banking + Expenses fan-out + aging U30
- **MERGED:** #28037 Banking Home Accounts/Drift/Latest → ParityTable (U30); DrillKpiCard shows live values with unavailable=non-navigable; tip tsc reds cleared.
- **THIS WAVE:** Expenses/Bills ReceiptAttach `listWhen="open"` + `initialCount` from `attachment_count` (no 200× GET fan-out); Expenses memo → humanMemo; Accounting Hub aging sortable + formatUsdCents.
- **NEXT:** U19 Reclassify register; U28–U29; remaining shells/engines; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~1:25 PM CT) — Cursor U12 waves + ENG-17 BUILD-ONLY
- **MERGED:** #28018 Driver Reports U12 · #28022 Fines/Integrity/Legal/Inventory U12 · #28026 Policies/Templates/Loads/Invoice/Customers U12 · #28027 Finance+Legal Contracts U12 · #28032 ENG-17 Faro 1090 wire proposal engine + pick screen (`/factoring/1090-wire-proposals`) dry-run Accept; execute=true → 409 match_execution_deferred.
- **ENGINES:** ENG-17 proposal classifier PROPOSED/AMBIGUOUS/NO_EVIDENCE (read-only; no bank match written).
- **SHELLS:** U12 status multi-select sweep advanced across maintenance/safety/legal/inventory/insurance/reports/customers/finance.
- **NEXT:** Codex QA shells (premium label, customer dual Documents, Expenses KPI/fan-out, Fuel Home honesty, Banking U30); U28–U30; Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~3:15 PM CT) — Cursor BUILD-FIRST session tip
- **MERGED:** #28003 SubscriptionManager BoardSection · #28004 Q8 emailer null-Next + boards · #28005/#28008 DataPanel→BoardSection (0 opens left under pages/) · #28010 ROUND 7.13 orphan ledger DONE-LIVE · #28011 U18 detail breadcrumbs · #28013 U12 LoadHistory status multi-select.
- **ENGINES:** Q8 scheduled-reports emailer self-heals seeded null Next on every tick; 6 generators already existed.
- **SHELLS:** pages/ DataPanel grammar closed; insurance/factoring/maint/coming-soon/master-detail filled.
- **NEXT:** U12 remaining status singles · U28 account multi-select · U29/U30 · ENG-49/17 build-only · Dreamline/match deferred (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~2:35 PM CT) — Cursor ROUND 7.13 orphan migration ledger DONE-LIVE
- **APPLY:** DELETE 3 duplicate rows from `ih35_migrations.applied_migrations` (mirror) where canonical `_system._schema_migrations` already had the correct `.sql` filename:
  - `202610290000_disp01_escrow_abandon_trigger_text_cast.sql` (canonical `202610291200_…`)
  - `202614000000_mdata_locations_is_sample_data`
  - `202614690000_expense_lines_item_and_account_required`
- **ROW_COUNT:** 3 (asserted in DO block)
- **VERIFY:** `DATABASE_URL=… node scripts/verify-no-orphan-migration-ledger-entries.mjs` → `OK: no orphan ledger entries (excluding 24h grace)` at ~2:35 PM CT
- **ALSO SHIPPED earlier:** #28003–#28008 fill-not-shell BoardSection wave + Q8 emailer null-Next; **0** `<DataPanel` opens remain under `apps/frontend/src/pages/`.
- **NEXT:** U12/U18/U28–U30 app-wide; ENG-49/17 build-only; Dreamline/match deferred.

## OUTBOX (11-02-2026 ~2:20 PM CT) — Cursor master-detail BoardSection fill
- **SHIPPED:** #28005 DataPanel wave; shells13 CustomerDetail/VendorDetail/Drivers/UserDetail/Dispatch DataPanel→BoardSection (37 opens).
- **NEXT:** U12/U18/U28–U30 app-wide; ENG-49/17 build-only; Dreamline/match deferred.

## OUTBOX (11-02-2026 ~2:05 PM CT) — Cursor BoardSection wave (accounting/vendors/customers)
- **SHIPPED:** #28004 Q8 emailer null-Next; shells12 DataPanel→BoardSection across vendor reverse sections, accounting detail panels, COI/PortalUsers, BookLoad validation, pending deductions.
- **NEXT:** remaining master-detail shells (CustomerDetail/VendorDetail/Drivers/Users/Dispatch); U12/U18/U28–U30; no match/Dreamline.

## OUTBOX (11-02-2026 ~1:50 PM CT) — Cursor Q8 emailer + BoardSection fill
- **SHIPPED:** #28003 SubscriptionManager BoardSection; shells11 — ensureActiveSubscriptionNextScheduledAt in runDue (null-Next seed self-heal) + FE names live emailer; Insurance Claims/PaymentSchedule, FactoringDetail, ServiceLocation, ComingSoon → BoardSection.
- **VERIFY:** vitest scheduled.test 11/11; verify-subscription-manager-delivery-banner normal+selftest; insurance claims/payment guards PASS.
- **NEXT:** fill-not-shell remaining DataPanel shells; U12/U18/U28/U29/U30; ENG-49/17 build-only; Dreamline/match deferred.
- **OWNER:** BUILD-FIRST — no bank match / month reconcile.

## OUTBOX (11-02-2026 ~1:10 PM CT) — Cursor tip
- **MERGED:** #27990–#27997 — ENG-13 AUTH-473 DONE-LIVE · ENG-22 prevention · Profitability hub fill · MapView BoardSection · ELD cert/settings BoardSection · INBOX tip.
- **ENG-36:** verify-18841 PASS still 21/≤21 negatives (ENG-25b fuel/expense class).
- **NEXT:** remaining shells (Banking auto-vendor engine when product locks schema); ACCT-R-04 Render dashboard UUID values; Dreamline later; **no match / no month lock** (owner BUILD-FIRST).

## OUTBOX (11-02-2026 ~12:55 PM CT) — Cursor
- **MERGED:** #27990 claim 18930 · #27991 ENG-13/22 · #27993 claim 18932 · #27994 Profitability hub fill-not-shell.
- **NEXT:** MapView BoardSection + ELD cert/settings engines; ACCT-R-04 Render UUIDs; ENG-36 re-measure; Dreamline later; no match/reconcile.

## OUTBOX (11-02-2026 ~12:45 PM CT) — Cursor fill-not-shell Profitability hub
- **SHIPPED (this PR):** Profitability By Lane/Type/Customer/Load + KPI wired to live engines; equipment-type-profitability GET; verify-profitability-hub-wired; unavailable KPI budget 5→4.
- **NEXT:** remaining shells (MapView tiles, ELD cert/settings backends, Banking auto-vendor); ENG-36 re-measure; ACCT-R-04 Render UUIDs; Dreamline later.

## OUTBOX (11-02-2026 ~12:20 PM CT) — Cursor ROUND 7.2
- **SHIPPED:** ENG-13 AUTH-473 apply DONE-LIVE; ENG-22 Book/Edit prevention + guard 18930; CODED-QUEUED→DONE-LIVE (ENG-19/55/62, 443.319, AUTH ledger); AUTH-473 CLOSED.
- **NEXT:** fill-not-shell remaining modules/tabs; ACCT-R-04 Render UUID values (operator); ENG-22 cancelled residual apply waits owner AUTH; ENG-36 re-measure; Dreamline later; no month lock.

# OUTBOX-CURSOR

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — MultiEntity + QBO reconcile boards (batch 3)

- **STATUS:** SHIPPING
- **DELTA:** Multi-entity Scope/KPIs/by-company/accounts · QBO reconcile ParityTables (health/captures/conflict fields/runs) → BoardSection. Engines unchanged. Guard verify-fill-batch3-boards via 1747. Prior #27872 MERGED.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-fill-batch3-boards PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Banking Transactions/Recon bare panels; Chrome close PARTIAL
- **Files Modified:** MultiEntityAccountingPage · QboReconcileCapturesPage · verify-fill-batch3-boards.mjs · 1747 · OUTBOX

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Collections/VendorBalances/Waterfall/ImportFuel (batch 2)

- **STATUS:** MERGED [#27872](https://github.com/tioperfumes07/IH35-TMS/pull/27872) @ `0faec95a3a`
- **DELTA:** Collections filters/queue/detail · Vendor balances vendors/bills/payments · Company waterfall · Import Fuel selected+WEX plan → BoardSection. Pay/sync/import engines kept. Guard verify-fill-batch2-boards via 1747. Prior #27867 MERGED.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-fill-batch2-boards PASS · verify-settlement-detail-reference PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** QboReconcile/MultiEntity if still bare; Chrome close PARTIAL rows when authorized
- **Files Modified:** CollectionsPage · VendorBalancesPage · CompanyWaterfallSection · ImportFuelTransactionsModal · verify-fill-batch2-boards.mjs · verify-settlement-detail-reference.mjs · 1747 · OUTBOX

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Settlements detail + Accounting remaining boards (horizontal)

- **STATUS:** MERGED [#27867](https://github.com/tioperfumes07/IH35-TMS/pull/27867) @ `d9ccaea90c`
- **DELTA:** Settlement detail sections (Earnings · Deadhead · Extra pay · Reimbursements · Deductions · Fuel · Loads) → BoardSection (Add buttons kept as headerRight). Accounting Month close · Sales tax · Opening balances · Create multiple bills · Daily recon · Account register → BoardSection. Engines unchanged. Guard verify-fill-remaining-boards-batch via 1747; settlement-detail-reference accepts BoardSection testId.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-fill-remaining-boards-batch PASS · verify-settlement-detail-sections PASS · verify-settlement-detail-reference PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Remaining PARTIAL depth (Unexpected already BoardSection; popup 222; Collections/VendorBalances); Chrome close when authorized
- **Files Modified:** driver-finance/*Section.tsx · MonthClosePage · SalesTaxPage · OpeningBalanceRegisterPage · CreateMultipleBillsPage · DailyReconPage · AccountRegisterPage · verify-fill-remaining-boards-batch.mjs · verify-settlement-detail-reference.mjs · 1747 · OUTBOX

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Banking Home BoardSection panels (real code)

- **STATUS:** MERGED [#27858](https://github.com/tioperfumes07/IH35-TMS/pull/27858) @ `2da5eaff04`
- **DELTA:** BankingHome Accounts bank-list · Factoring virtual · Inspect · Relay · Statement Import · Plaid · Settings panels → shared `BoardSection`. Honesty banners unchanged. Statement account select → FORM_SELECT_CLASS. Engines (reorder/inspect/StatementUpload/Plaid) kept. New verify-banking-home-boards via step 12561. Prior ACCT-F220 tools #27843 MERGED.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-banking-home-boards PASS · verify-banking-bare-plus-accessible-label PASS · verify-banking-home-preview-parity PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Settlements Open/Closed/Escrow Register PARTIAL depth; popup 222; Accounting 220 remaining audit
- **Files Modified:** BankingHome.tsx · verify-banking-home-boards.mjs · 12561-verify-banking-home-preview-parity.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Accounting tools BoardSection + Factoring FORM_INPUT (real code)

- **STATUS:** MERGED [#27843](https://github.com/tioperfumes07/IH35-TMS/pull/27843) @ `385e220d78`
- **DELTA:** Reclassify (account tree · filters · grid · batches) · Batch Expenses (type · toolbar · grid) · Accounting Escrow (accounts · postings) → shared `BoardSection`. Factoring Home profile edit inputs → `FORM_INPUT_CLASS`. Engines (applyReclassify / createExpense / escrow list) unchanged. New verify-acct-220-tools-boards (wired via step 1747). Pending 220 PARTIAL; Factoring Home stays CODED.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-acct-220-tools-boards PASS · verify-b5-reclassify-batch PASS · verify-v3-board-grammar-every-surface PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Settlements Open/Closed/Escrow Register PARTIAL depth; Banking Home bare panels; popup 222 remaining
- **Files Modified:** ReclassifyTransactionsPage · BatchExpensesPage · EscrowPage · FactoringHome · verify-acct-220-tools-boards.mjs · 1747-verify-acct-surf-02-expenses.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Settlement Creator BoardSection (real code)

- **STATUS:** MERGED [#27838](https://github.com/tioperfumes07/IH35-TMS/pull/27838) @ `ffc1ad4478`
- **DELTA:** SettlementCreatorDrawer `Section()` + Post result + Settlement totals + JE Preview → shared `BoardSection`. Money engines / Preview / Post / subtotals / PDF tie-out unchanged. New verify-settlement-creator-board-sections (wired via step 3424). Pending Open/Closed stay PARTIAL (tabs already BoardSection+engines; creator was the bare-card gap).
- **VERIFY:** tsc -b EXIT 0 · verify-settlement-creator-board-sections PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Settlements Open/Closed remaining depth if any; Factoring profile FORM_INPUT; Accounting Reclassify/Batch
- **Files Modified:** SettlementCreatorDrawer.tsx · verify-settlement-creator-board-sections.mjs · 3424-verify-settlements-qbo-chrome-surfaces.mjs · OUTBOX-CURSOR.md


## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Accounting 220 money-list BoardSection (real code)

- **STATUS:** MERGED [#27835](https://github.com/tioperfumes07/IH35-TMS/pull/27835) @ `4e9322a488`
- **DELTA:** Real `BoardSection` register wraps on 12 Accounting money-list tabs (Expenses · Receipts · Checks · Invoices · Payments · Bill payments · Vendor credits · Credit memos · Manual JE · Factoring advances · Prepaid · Fixed assets). kpiStrip + moneyListKpiCard + void/create engines unchanged. Prior Expenses tip was guard-only — this ships the page code. New guard verify-acct-220-money-list-boards; receipts/checks/expenses guards ratcheted. Pending 220 PARTIAL.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-acct-surf-02-expenses PASS · verify-acct-receipts-leaf PASS · verify-checks-list-shows-every-check PASS · verify-acct-220-money-list-boards PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Settlements Open/Closed PARTIAL depth; remaining Accounting tabs (Escrow/Unexpected already BoardSection; Reclassify/Batch/Hub)
- **Files Modified:** ExpensesListPage · ReceiptsPage · CheckListPage · InvoicesListPage · PaymentsListPage · BillPaymentsListPage · VendorCreditsPage · CreditMemosPage · ManualJEListPage · FactoringListPage · PrepaidExpensesPage · FixedAssetsPage · verify-acct-220-money-list-boards.mjs · verify-acct-surf-02 · verify-acct-receipts-leaf · verify-checks-list · OUTBOX-CURSOR.md


## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Expenses list BoardSection (443.293-C) — SUPERSEDED

- **STATUS:** SUPERSEDED — tip claimed BoardSection but page code was absent (guard-only); replaced by FILL-ACCT-220-MONEY-LIST-BOARDS

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — FuelAssignmentPopup ModalSection → BoardSection

- **STATUS:** MERGED [#27802](https://github.com/tioperfumes07/IH35-TMS/pull/27802)
- **DELTA:** Fuel assignment popup sections (Fill / Evidence / Proposed / Change) → shared `BoardSection` (source as subtitle). Confirm/choose/keep engines unchanged. Guard ratcheted. Pending rows 44/49/53 → CODED.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-fuel-assignment-popup PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Accounting 220 depth; Settlements Open/Closed PARTIAL
- **Files Modified:** FuelAssignmentPopup.tsx · verify-fuel-assignment-popup.mjs · CURSOR-PENDING-ROWS-FINAL.md · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL batch tip (engines + BoardSection)

- **STATUS:** MERGED — #27765 · #27769 · #27780 · #27787 · #27792 · #27794 · #27796 · #27797 · #27799 · #27800 · #27801 (+ OUTBOX diet #27793)
- **DELTA:** Fuel Home board KPIs period-synced; By-truck period sync; Settlements Payments V3; Fuel FORM_INPUT; Fuel/Factoring/Escrow empties; SubmitToFactor BoardSection+FORM_INPUT+DataPanel unwrap; Close expense BoardSection; Fuel fraud/overage/planner empties; Submit edit banner. Engines/actions kept. Guards ratcheted.
- **VERIFY:** each PR: tsc -b · vite build · surface guards PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Accounting 220 (Receipts already Bills-grammar); Settlements Open/Closed PARTIAL depth; Fuel assignment popup 443.295
- **Files Modified:** OUTBOX-CURSOR.md · CURSOR-PENDING-ROWS-FINAL.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — SubmitToFactor edit banner BoardSection

- **STATUS:** SHIPPING
- **DELTA:** Edit-purchase banner + non-posted block → `BoardSection` (Cancel in headerRight). Engines unchanged. Guard ratcheted.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-factoring-submission-queue-routed
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** SubmitToFactorTab.tsx · verify-factoring-submission-queue-routed.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Fuel fraud/overage/planner need-company BoardSection

- **STATUS:** MERGED [#27800](https://github.com/tioperfumes07/IH35-TMS/pull/27800)
- **DELTA:** Fraud alerts / Card overage / Fuel planner shell need-company → `FuelBoardSection`. Guard ratcheted. Engines unchanged.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-fuel-home-dashboard-wired
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** FraudAlertsList · CardOverageQueuePage · FuelPlannerHome · verify-fuel-home-dashboard-wired · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — DataPanel unwrap Submit/Repurchase + Close expense BoardSection

- **STATUS:** MERGED [#27799](https://github.com/tioperfumes07/IH35-TMS/pull/27799)
- **DELTA:** SubmitToFactor Purchase/Faro actuals/Override/Totals + RepurchaseDuePanel → `BoardSection` (DataPanel removed). Settlement Close expense load confirmations → `BoardSection`. Decide/create/post engines unchanged. Guards ratcheted.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-factoring-submission-queue-routed · verify-settlements-qbo-chrome-surfaces
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell remaining Factoring/Settlements layers
- **Files Modified:** SubmitToFactorTab · RepurchaseDuePanel · SettlementCloseArrivalPage · guards · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — SubmitToFactor BoardSection + FORM_INPUT

- **STATUS:** MERGED [#27797](https://github.com/tioperfumes07/IH35-TMS/pull/27797)
- **DELTA:** SubmitToFactor owner-only + purchase-posted → `BoardSection`; selects/textarea → `FORM_INPUT_CLASS` / `FORM_TEXTAREA_CLASS`. Create/post/send engines unchanged. Guard ratcheted.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-factoring-submission-queue-routed · verify-91056 leftover
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements Close + Factoring remaining DataPanel unwrap
- **Files Modified:** SubmitToFactorTab.tsx · verify-factoring-submission-queue-routed.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Fuel/Factoring/Escrow empty → BoardSection

- **STATUS:** MERGED [#27796](https://github.com/tioperfumes07/IH35-TMS/pull/27796)
- **DELTA:** Fuel Cards/Integrity/Unmatched/Wallet need-company → `FuelBoardSection`; Factoring no-factor → `BoardSection`; Escrow Measured note → `BoardSection`. Guards ratcheted. Engines unchanged.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-fuel-home-dashboard-wired · verify-settlements-escrow-board-rebuild · verify-factoring-layout-tabs-first
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements Close + Factoring Home remaining
- **Files Modified:** FuelCards/Integrity/Unmatched/Wallet · FactoringHome · SettlementsEscrowBoard · guards · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Settlements Payments V3 KPIs + Fuel create/import FORM_INPUT

- **STATUS:** MERGED [#27794](https://github.com/tioperfumes07/IH35-TMS/pull/27794)
- **DELTA:** Settlements Payments Pending Acks / Held Deductions → `V3KpiTile` (removed local `KpiCard`); CreateFuelTransactionModal + ImportFuel kind select → `FORM_INPUT_CLASS` / `FORM_SELECT_CLASS` (40px). Engines/focus filters/import/create unchanged. Guards ratcheted.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-settlement-fe-honesty PASS (+ --selftest) · verify-fuel-office-create-modal PASS · verify-fuel-history-import-wired PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements Home/Close/Escrow + Factoring Home remaining
- **Files Modified:** SettlementsPage.tsx · CreateFuelTransactionModal.tsx · ImportFuelTransactionsModal.tsx · verify-settlement-fe-honesty.mjs · verify-fuel-office-create-modal.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Fuel By-truck period-sync KPIs

- **STATUS:** MERGED [#27792](https://github.com/tioperfumes07/IH35-TMS/pull/27792)
- **DELTA:** By-truck tab shares one Oct/Sep/YTD `byTruckPeriod` between `FuelBoardKpiStrip` and `FuelDieselByTruckPanel` (controlled period props). Same diesel aggregate engine. Guard ratcheted on verify-fuel-home-dashboard-wired board shell.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-fuel-home-dashboard-wired PASS (+ --selftest)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements Home/Close/Escrow + Fuel modals FORM_INPUT
- **Files Modified:** FuelPlannerHome.tsx · FuelDieselByTruckPanel.tsx · verify-fuel-home-dashboard-wired.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Fuel Home board KPIs (443.280)

- **STATUS:** SHIPPING
- **DELTA:** Fuel Home replaces planner `FuelKpiRow` with period-synced `FuelBoardKpiStrip` (Diesel spend / Gallons / Avg $/gal / Fills without a load / Open questions) from diesel aggregate + assignment-questions engines; need-company → `FuelBoardSection`; Love's sync fail-loud kept. Guard ratcheted. Import fills / + Add fill stay on module chrome.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-fuel-home-dashboard-wired PASS (+ --selftest) · verify-cap-11-fuel-fraud · verify-fuel-expense-identity-honesty
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements Home/Close/Escrow + Fuel sub-tabs
- **Files Modified:** FuelHome.tsx · FuelBoardKpiStrip.tsx · verify-fuel-home-dashboard-wired.mjs · OUTBOX-CURSOR.md · CURSOR-PENDING-ROWS-FINAL.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — CashFlowPanel unlayer nested card

- **STATUS:** SHIPPING [#27780](https://github.com/tioperfumes07/IH35-TMS/pull/27780)
- **DELTA:** FactoringCashFlowPanel drops nested `rounded-sm border` card (parent Purchase-report BoardSection owns shell). Collapse/totals/engines unchanged.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-factoring-r315-home-cash-flow PASS (+ --selftest)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** FactoringCashFlowPanel.tsx · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — SubmissionQueue → BoardSection

- **STATUS:** MERGED [#27769](https://github.com/tioperfumes07/IH35-TMS/pull/27769)
- **DELTA:** SubmissionQueue need-company + filters + queue table → `BoardSection`. Submit/reserve engines unchanged.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-factoring-submission-queue-parity-surface-bar PASS · wave-c-liability
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** SubmissionQueue.tsx · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Home/Wizard/Planner empty states → BoardSection

- **STATUS:** MERGED [#27765](https://github.com/tioperfumes07/IH35-TMS/pull/27765)
- **DELTA:** FactoringHome loading/need-company → `BoardSection`; BatchWizard need-company + body → `BoardSection`; Fuel planner settings loading/unavailable → `FuelBoardSection`. Engines unchanged.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-fill-shell-empty-states PASS · layout-tabs-first · fuel-planner-active-routes · wave-c-liability · settings-lifecycle
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** FactoringHome.tsx · BatchWizard.tsx · FuelPlannerHome.tsx · verify-fill-shell-empty-states.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — BatchDetail → BoardSection

- **STATUS:** MERGED [#27767](https://github.com/tioperfumes07/IH35-TMS/pull/27767)
- **DELTA:** BatchDetail summary/invoices/reserve + loading/error/unavailable → `BoardSection`. Engines/reserve KPI unchanged. New guard verify-factoring-batch-detail-board.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-factoring-batch-detail-board PASS · paritytable · wave-c-liability
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** BatchDetail.tsx · verify-factoring-batch-detail-board.mjs · OUTBOX-CURSOR.md


