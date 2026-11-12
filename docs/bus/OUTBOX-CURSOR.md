## OUTBOX (11-13-2026 ~1:35 AM CT) — Factoring Debtor credit + Escrow/Cash reserve purchase MoneyCells
- **SHIPS:** #28953–#28960 · Debtor credit-check totals → customer · Escrow Account + Cash Reserve purchase name+amounts → factoring_purchase.
- **NEXT:** reverse-wiring residuals; Neon apply 202616501200; Codex LIVE BOARD-45. No match/Dreamline.

## OUTBOX (11-13-2026 ~1:20 AM CT) — Factoring Purchase Report + Escrow Held MoneyCells
- **SHIPS:** #28953–#28958 · Purchase Report + Escrow Held MoneyCells. **MERGED #28960.**
- **NEXT:** reverse-wiring residuals; Neon apply 202616501200; Codex LIVE BOARD-45. No match/Dreamline.

## OUTBOX (11-13-2026 ~1:05 AM CT) — Factoring Invoice Status + Aging + Fees history MoneyCells
- **SHIPS:** #28953–#28956 · Invoice Status / Aging / Fees history MoneyCells. **MERGED #28958.**
- **NEXT:** reverse-wiring residuals; Neon apply 202616501200; Codex LIVE BOARD-45. No match/Dreamline.

## OUTBOX (11-13-2026 ~12:50 AM CT) — Factoring Debtor Receipts / Loan-Save / Unapplied MoneyCells
- **SHIPS:** #28953–#28955 · Debtor Receipts / Loan-Save / Unapplied → MoneyCell. **MERGED #28956.**
- **NEXT:** reverse-wiring residuals; Neon apply 202616501200; Codex LIVE BOARD-45. No match/Dreamline.

## OUTBOX (11-13-2026 ~12:35 AM CT) — Factoring Funds Due + Fees MoneyCell drills
- **SHIPS:** #28953 MoneyCell literals · #28954 Legal template EntityLinks · #28955 Factoring Funds Due + Fees-paid MoneyCells (merged).
- **NEXT:** reverse-wiring residuals; Neon apply 202616501200; Codex LIVE BOARD-45. No match/Dreamline.

## OUTBOX (11-13-2026 ~12:20 AM CT) — Legal Attorney Review + Contracts template EntityLinks
- **SHIPS:** #28953 Statement MoneyCell literal drills (merged). Legal Attorney Review Template column + Contracts list Template → `legal_template` EntityLink (parity with Policies/Templates list). **MERGED #28954.**
- **NEXT:** reverse-wiring residuals; Neon apply 202616501200; Codex LIVE for BOARD-45. No match/Dreamline.

## OUTBOX (11-13-2026 ~12:05 AM CT) — Statement MoneyCell literal drills (advances + earnings)
- **THIS:** SettlementStatementBoardPanels + LinkedRecordsPanel — MoneyCell drill is a literal `{ entity }` at each call site (verify-money-cells-click-through). Advances recovered: single source → cash_advance MoneyCell; multi → tabular total + cash_advance EntityLinks (no settlement self-drill; verify-statement-advances-recovered-source). Earnings amount branches load vs settlement MoneyCell. **MERGED #28953.**
- **Guards:** money-cells + advances-recovered-source plain+selftest PASS; declared no-drill stays 35.
- **NEXT:** reverse-wiring / ROUND 8.12 board proof continue; Neon apply 202616501200; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~11:50 PM CT) — CC-1 gates shipped #28950 · party name EntityLinks
- **SHIPS:** #28949 CLAIM 202616501200 · #28950 legal contracts void EXEMPT + settlement_lines reinstate JE composite FK · Customers/Vendors name cells EntityLink.
- **FE LIVE prior:** dep-dbqk5vavcj2c73f20l6g · 6db89df6dc. Neon apply 202616501200 still needed for money-FK live.
- **NEXT:** reverse-wiring continue; Map/DAT360 honest-gated; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~11:45 PM CT) — CERT PACKET · FE LIVE dep-dbqk5vavcj2c73f20l6g · SHA 6db89df6dc
- **FE LIVE:** Render `ih35-tms-web` `dep-dbqk5vavcj2c73f20l6g` status=live · SHA `6db89df6dc` (#28946; includes #28941/#28944/#28945).
- **Boards for Codex:** see INBOX-CODEX tip. CC-1 still owns legal void + settlement_lines FK. No match/Dreamline.

## OUTBOX (11-12-2026 ~3:45 AM CT) — high-water #28930; Available Trucks Driver EntityLink
- **SHIPS:** #28928 Legal Templates · #28930 Available Trucks Driver EntityLink (capacity driver_id) · #28911–#28929 reverse wave.
- **NEXT:** Reverse-wiring continue; Map/DAT360 honest-gated; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~3:30 AM CT) — high-water #28928; Legal Templates EntityLink
- **SHIPS:** #28926 Policies Template · #28928 Templates Display Name EntityLink · #28911–#28927 reverse wave.
- **NEXT:** Reverse-wiring continue; Map/DAT360 honest-gated; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~3:15 AM CT) — high-water #28926; Legal Policies EntityLink
- **SHIPS:** #28924 Fleet Covered policy · #28926 Legal Policies Template EntityLink · #28911–#28925 reverse wave.
- **NEXT:** Reverse-wiring continue; Map/DAT360 honest-gated; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~3:00 AM CT) — high-water #28924; Fleet Covered EntityLink
- **SHIPS:** #28922 Escrow Register EntityLinks · #28924 Fleet Covered policy EntityLink · #28911–#28923 reverse wave.
- **NEXT:** Reverse-wiring continue; Map/DAT360 honest-gated; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~2:45 AM CT) — high-water #28922; Escrow Register EntityLinks
- **SHIPS:** #28920 Legal Alerts Matter/Contract · #28922 Escrow Register Load/Source EntityLinks · #28911–#28921 reverse wave.
- **NEXT:** Reverse-wiring continue; Map/DAT360 honest-gated; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~2:30 AM CT) — high-water #28920; Legal alerts reverse
- **SHIPS:** #28918 CF3 customer link fix · #28919 tip · #28920 Legal Alerts Matter/Contract EntityLinks · #28911–#28917 reverse wave.
- **NEXT:** Reverse-wiring continue; Map/DAT360 honest-gated; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~2:15 AM CT) — high-water #28918; CF3 customer link fix
- **THIS:** #28918 DailyPrediction Income customer EntityLinkOrTombstone spread `item` (was undefined `row` → ReferenceError).
- **NEXT:** Reverse-wiring continue; Map/DAT360 honest-gated; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~2:00 AM CT) — high-water #28916; reverse-wiring continue
- **SHIPS:** #28915 Fuel Assignment candidate Settlement EntityLink (settlement_id) · #28916 Insurance Payment Schedule Policy EntityLink + policy_number join · prior #28911–#28914.
- **NEXT:** Reverse-wiring spot checks continue; Map/DAT360 honest-gated; Legal signed bulk-void stays skipped. Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~1:40 AM CT) — high-water #28913; reverse-wiring wave
- **SHIPS:** #28911 FinalizeBlock Save Draft → PATCH …/acknowledge · #28912 Fuel Assignment Proposed Settlement EntityLink · #28913 Factoring Messages tel/mailto contacts · #28895–#28910 go26/Document Designs/Aging.
- **NEXT:** Reverse-wiring spot checks continue; Map/DAT360 honest-gated; Legal signed bulk-void stays skipped (executed signatures). Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~1:10 AM CT) — high-water #28909; Cursor FE go26 raw tables cleared
- **SHIPS THIS WAVE:** #28895–#28909 Document Designs, Aging date-basis, go26 Cash Advances/Statement/CF3/CF Home/Planner (raw_table 41→33), tips/register.
- **NEXT:** Reverse-wiring spot checks; FinalizeBlock draft API still deferred; Map/DAT360 honest-gated; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~1:00 AM CT) — Planner calendar drops raw table (go26 −1)
- **THIS:** PlannerCalendarPage week grid uses role=table divs (DnD cells intact); go26 raw_table 34→33.
- **NEXT:** Reverse-wiring / residual Cursor boards; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~12:50 AM CT) — tipped Codex LIVE CF go26 wave; continue
- **SHIPS:** #28905 CF3 ParityTable; #28907 CF Home matrix div-table; go26 Cursor cash-flow raw tables cleared.
- **NEXT:** Reverse-wiring spot checks / PlannerCalendar residual; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~12:45 AM CT) — CF Home 13w matrix drops raw table (go26 −1)
- **THIS:** CashFlowHomeTab 13-week/month matrix uses role=table div grid (no <table>); go26 raw_table 35→34.
- **NEXT:** Reverse-wiring spot checks; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~12:35 AM CT) — progress: #28895–#28905 Cursor no-stop
- **SHIPS:** #28895–#28898 Document Designs · #28896 Aging date-basis · #28897–#28902/#28905 go26 Cash Advances/LoadDetail/Statement/CF3 Parity · #28900/#28904 tips/register.
- **NEXT:** CashFlowHomeTab matrix residual; reverse-wiring spot checks; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~12:25 AM CT) — CF3 Income/Expenses → ParityTable (go26 −1)
- **THIS:** DailyPredictionTab Income+Expenses panels on ParityTable (group column + footers); archive Remove retargeted; go26 raw_table 36→35.
- **NEXT:** CashFlowHomeTab matrix residual; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~12:15 AM CT) — BOARD-45 register wave note #28895–#28902
- **THIS:** BOARD-45 register notes Document Designs mount + go26/Aging/Document Designs wave.
- **NEXT:** DailyPredictionTab raw tables; Codex LIVE. No match/Dreamline.

## OUTBOX (11-12-2026 ~12:05 AM CT) — Statement KV panels → dl (go26 −1 file)
- **THIS:** SettlementStatementBoardPanels deductions/company/linked key-value panels are dl rows (no raw table); go26 raw_table files 37→36.
- **NEXT:** DailyPredictionTab / CashFlowHome matrices; Codex LIVE. No match/Dreamline.

## OUTBOX (11-11-2026 ~11:55 PM CT) — Statement Earnings panel → ParityTable (go26 −1)
- **THIS:** SettlementStatementBoardPanels Earnings-by-load on ParityTable + Gross pay footer; go26 raw_table 37→36.
- **NEXT:** Remaining statement key-value panels / DailyPrediction tables; Codex LIVE. No match/Dreamline.

## OUTBOX (11-11-2026 ~11:45 PM CT) — tipped Codex LIVE #28895–#28899; continue
- **SHIPS:** #28895–#28899 Document Designs + Aging date-basis + go26 Cash Advances/LoadDetail.
- **NEXT:** Reverse-wiring / go26 residuals (DailyPrediction / Statement panels); Codex LIVE. No match/Dreamline.

## OUTBOX (11-11-2026 ~11:35 PM CT) — go26 LoadDetailDrawer stat popup dl (−1)
- **THIS:** LoadDetailDrawer LDT0 stat popup raw table → dl rows; go26 raw_table 38→37 banked.
- **NEXT:** Continue go26 Cursor residuals / reverse-wiring. No match/Dreamline.

## OUTBOX (11-11-2026 ~11:25 PM CT) — Document Designs locked in settlements-subnav guard
- **THIS:** verify-settlements-subnav-stays-in-module requires Document Designs tab + route + page/iframe + HTML (#28895 ratchet; no new claim number).
- **NEXT:** Continue reverse-wiring / go26 residuals; Codex LIVE. No match/Dreamline.

## OUTBOX (11-11-2026 ~11:05 PM CT) — go26 Cash Advances preview → ParityTable (−3 raw tables)
- **THIS:** CashAdvancesKpiRow Requests/Advances previews on ParityTable; AdvanceDetail print receipt uses dl; TripPairing comment false-positive cleared. go26 raw_table 41→38 banked.
- **NEXT:** Continue go26 Cursor residuals / reverse-wiring; Codex LIVE #28895/#28896. No match/Dreamline.

## OUTBOX (11-11-2026 ~10:50 PM CT) — #28895–#28896 shipped; continue reverse-wiring
- **SHIPS:** #28895 Settlement Document Designs route; #28896 Factoring Aging Invoice/Purchase/Fund Date toggle + guard retarget.
- **NEXT:** Reverse-wiring spot checks / residual Cursor boards; tipped Codex LIVE. No match/Dreamline.

## OUTBOX (11-11-2026 ~10:40 PM CT) — Factoring Aging Invoice/Purchase/Fund Date toggle
- **THIS:** recourse-pipeline returns invoice_date + purchase_date + fund_date; Aging toggle ages buckets/Inv column by selected basis (fallback factored_at). Vitest agingDateBasis 3/3.
- **NEXT:** Codex LIVE Aging toggle; reverse-wiring. No match/Dreamline.

## OUTBOX (11-11-2026 ~10:25 PM CT) — Settlement Document Designs route
- **THIS:** /driver-finance/settlements/document-designs mounts approved SettlementDocumentDesigns.html (iframe) + Settlements shell back-link + subnav.
- **NEXT:** Codex LIVE specimen page; reverse-wiring. No match/Dreamline.

## OUTBOX (11-11-2026 ~10:15 PM CT) — #28891–#28892 void + bus diet
- **THIS:** #28891 Legal bulk Void; #28892 OUTBOX diet to 200 + clear stale #28836 inbox. Wave #28882–#28892 complete CODE.
- **NEXT:** Codex LIVE; residual reverse-wiring. No match/Dreamline.

## OUTBOX (11-11-2026 ~10:10 PM CT) — #28891 Legal bulk Void live
- **PRIOR:** #28882–#28890 wave.
- **THIS:** #28891 voidContractInstances + POST /void + Contracts Void button.
- **NEXT:** Reverse-wiring audits; Codex LIVE. No match/Dreamline.

## OUTBOX (11-11-2026 ~10:05 PM CT) — Legal contracts bulk Void wired (POST /void)
- **PRIOR:** #28890 Codex LIVE tip; #28887 L3.
- **THIS:** Backend voidContractInstances + POST /api/v1/legal/contracts/void; Contracts list Void batch action live (signed skipped). Honest-disabled removed.
- **NEXT:** Codex LIVE Void; reverse-wiring. No match/Dreamline.

## OUTBOX (11-11-2026 ~9:55 PM CT) — progress: #28882–#28889 Cursor no-stop wave
- **SHIPS:** #28882 planner HR filters; #28883 go26; #28885 CF3 grain; #28886 Unit/Customer; #28887 Legal L3; #28888 CA1 timestamps; #28889 CF3 rangeFrom window.
- **NEXT:** Continue reverse-wiring / residual Cursor boards; tipped Codex for LIVE. No match/Dreamline.

## OUTBOX (11-11-2026 ~9:50 PM CT) — CF3 query/tiles align to week rangeFrom
- **PRIOR:** #28888 CA1; #28885 setGrain(day); #28887 L3.
- **THIS:** DailyPredictionTab windowFrom/sevenDays start at rangeFrom (Monday in week grain); DailyPredictionTab.test 2/2. Completes Codex ROUND-8.5-CF3 calendar window repair.
- **NEXT:** Codex LIVE Projected; reverse-wiring. No match/Dreamline.

## OUTBOX (11-11-2026 ~9:40 PM CT) — CA1 cash-advance timeline formatDateTimeUS
- **PRIOR:** #28887 Legal L3; #28886 Unit/Customer.
- **THIS:** AdvanceDetailDrawer Created/Approved/Disbursed use formatDateTimeUS (Codex ROUND-8.5-CA1). Vitest 8/8.
- **NEXT:** Codex LIVE; continue reverse-wiring. No match/Dreamline.

## OUTBOX (11-11-2026 ~9:35 PM CT) — wave #28882/#28883/#28885/#28886/#28887
- **THIS WAVE:** #28882 planner entityFilters+HR Active/Probation; #28883 go26 bank; #28885 CF3 setGrain(day); #28886 Unit+Customer MultiSelect; #28887 Legal L3 status URL drill.
- **NEXT:** Codex LIVE proofs; reverse-wiring spot checks; Legal bulk-void still needs backend. No match/Dreamline.

## OUTBOX (11-11-2026 ~9:30 PM CT) — Legal L3 pipeline stage status URL drill (#2888x)
- **PRIOR:** #28886 Unit/Customer MultiSelect; #28885 CF3; #28882 entityFilters.
- **THIS:** Land Codex ROUND-8.5-L3 — pipeline stage Links carry ?status=; contracts list derives filter from URL; creator/send modals preserve scope. LegalContractStageDrill.test 6/6.
- **NEXT:** Codex LIVE Legal pipeline drill; reverse-wiring. No match/Dreamline.

## OUTBOX (11-11-2026 ~9:20 PM CT) — Planner Unit + Customer MultiSelect (board heading complete)
- **PRIOR:** #28885 CF3 day-grain; #28882 Status/Driver entityFilters.
- **THIS:** PlannerEntityFilterState adds unitIds+customerIds; Filters popover MultiSelects for Unit+Customer; Truck/Timeline/Driver/Loads apply them; chips clearable. Vitest planners 7/7.
- **NEXT:** Codex LIVE Filters proof (4 MultiSelects); reverse-wiring. No match/Dreamline.

## OUTBOX (11-11-2026 ~9:10 PM CT) — CF3 day-tile click sets grain=day (#ORPH-004)
- **PRIOR:** #28883 go26 bank; #28882 planner entityFilters.
- **THIS:** DailyPredictionTab 7-day tile onClick now setDate+setGrain("day"); verify-orphan-surface-drill ORPH-004 pattern updated (SURFACE-BREACH — Cash Flow Cursor-owned; guard was CC-1 orphan set). Tip INBOX-CC-1.
- **NEXT:** Codex LIVE board proofs; reverse-wiring. No match/Dreamline.

## OUTBOX (11-11-2026 ~9:00 PM CT) — go26 consolidation baseline banked (DataTable sprawl cleared)
- **PRIOR:** #28882 planner entityFilters + HR Active/Probation.
- **THIS:** verify-go26-consolidation-ratchet --lower: import_data_table 20→0, Resizable/Mobile 2/3→0, raw_table_outside_infra 65→41. OUTBOX tip #28882. Codex LIVE Filters multi-select still due.
- **NEXT:** Reverse-wiring audits; residual Legal bulk-void needs backend void endpoint. No match/Dreamline.

## OUTBOX (11-11-2026 ~8:50 PM CT) — #28882 planner entityFilters + HR Active/Probation
- **PRIOR:** #28878 AvailableTrucks drawer; BOARD-45 CODE 45/45.
- **THIS:** #28882 — Timeline/Driver/Loads apply entityFilters; Driver MultiSelect + AssignDriverDropdown HR Active+Probation; guards updated. Vitest 7/7; assign-driver guards PASS.
- **NEXT:** Codex LIVE Filters multi-select proof; reverse-wiring audits on Cursor boards. No match/Dreamline.

## ARCHIVE
Older Cursor outbox tips: `docs/bus/archive/OUTBOX-CURSOR-archive-2026-11-11-diet.md`.
