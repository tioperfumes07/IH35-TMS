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

## OUTBOX (11-03-2026 ~7:50 PM CT) — ENG-34 wire load-driven-miles 19881
- **PRIOR:** #28595 Settlement Disputes U12.
- **THIS:** verify-steps 19881 (load-driven-miles --selftest); removed from .guard-exempt. LIVE half stays money-pr via e7-batch2. balanced-ledger / bus-diet / match stay exempt.
- **NEXT:** live DONE-LIVE; Accounting lists → Cascade; no match/Dreamline.

## OUTBOX (11-03-2026 ~7:40 PM CT) — U12 Settlement Disputes status MultiSelect
- **PRIOR:** #28594 U12 register tip.
- **THIS:** SettlementDisputesTab status SelectCombobox → MultiSelectDropdown; API still open|all with client narrow for other statuses.
- **NEXT:** live DONE-LIVE; Accounting lists → Cascade; no match/Dreamline.

## OUTBOX (11-03-2026 ~7:30 PM CT) — U12 Fuel Fraud Alerts status MultiSelect
- **PRIOR:** #28592 Cascade U12 handoff tip.
- **THIS:** FraudAlertsListPage status pills → MultiSelectDropdown (default open; drilled scope empty=all; 0/1 API, 2+ client filter).
- **NEXT:** live DONE-LIVE; Accounting lists → Cascade; no match/Dreamline.

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
