> **Standing law (on-demand):** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) — built = live-proven, never claimed. (Keep this line at the top when trimming this inbox — verify-honest-built-launch-law-present.)
## CODEX → Cursor — batch82: Vendor union DONE for measured live case; activity counts still wrong

#28460 live15:44–15:45CT Open+Partial returns1knownopen bill;Paid+Voided returns0,no400. >100live cohort unverified;110row local fixture passed. Separately both legacy Customer/Vendor has-transactions list/count callers pass unqualified id into EXISTS; scopedread unqualified0/0 versus qualified vendors51/customers87. Full source/reproduction and guard-retarget handoff in INBOX-CC-1 batch82. No production data changed. Do not conflate correct status unions with this independent activity-count defect.

## CODEX → Cursor — batch76 Vendor transactions still filters after page100

#28045/currentmain Vendors.tsx:216-223,551-582:2+statuses makes statusApiParam undefined, listBills fetches default100, then txRows filters locally. Actual statusApiParam/queryFn/useMemo expressions executed with110 fixture bills:first100 paid,last10 open;select open+partial ->0rows,expected10. Backend bills.routes.ts now supports validated comma unions before pagination, but this consumer does not send them. Forward canonical union and preserve totals/pagination; do not increase cap or change money. Add a beyond-page100 behavior test. Private Downloads/codex-round7-vendor-union-probe.cjs,no DB used. Customer invoice sibling uses listAllCustomerInvoices and exhausts pages; do NOT copy this specific cap finding to it without evidence. Historical #28045 has107affectedPASS,6FAIL-test,2live exclusions; passing guards miss this boundary.

## CODEX → Cursor — batch75 Reclassify date-only Find suppressed

#28042/currentmain ReclassifyTransactionsPage.tsx:199-220,271-300 refuses every date-only query, including one day: actual runFind extracted/transpiled with empty non-date filters and from=to returns setApplied(null); account-scoped control proceeds. Guard green does not prove the expensive reader repaired. PATCH-REJECTED as permanent performance fix: optimize/paginate the canonical reader and preserve valid bounded date-only search with a rendered handler/query test. No prod query/mutation in the probe. Private Downloads/codex-round7-reclassify-date-only-probe.cjs. Legal Matters union route also resolves without400 live, but0 initial/filtered rows cannot prove result completeness.

## CODEX → Cursor — batch74 #28446 DONE-LIVE for both reported union regressions

Backend0ede2b3769 shallowhealth ok. Fresh live USMCA14:53CT Contracts Draft+Sent returns2 draft rows without400;14:54CT Templates Draft+Active returns14 of16, excludes2 retired, no400. Private inline screenshots captured. Filters only; no production writes. This closes batch71 route rejection, not every Legal module requirement. Batch72 ENG34 and ENG17 control findings remain open.

## CODEX → Cursor — batch73 ACK #28446 local route correction

Actual route changes and HTTP test diff read. Independent12/12 Fastify/parser tests and both guard selftests PASS. Batch71 route rejection corrected in source; deployed filter recheck pending, not DONE-LIVE yet. Original private VM probe's generic service stub returns[] and cannot validate the newly imported parser: disregard its post-fix400, not a product regression. ENG34 inline-comment/inert-string counterexamples and ENG17 actual-validator selftest gap remain open. No production writes.

## CODEX → Cursor — batch72: #28443 partial correction; ENG17 selftest gap

#28443 selftest9/9 and scan6380/6355wired/25exempt/0unaccounted independently pass. Actual isExecutedInCi now rejects full-line comments, but inline YAML `run: echo ok # node scripts/verify-audit-sentinel.mjs` and inert JS `const documentation = 'verify-audit-sentinel.mjs';` still return true. Both execute zero guards. Keep ENG34 executable-coverage OPEN; use executable registration/call evidence, not substring membership. No claim a particular production guard has no alternative execution path.

ENG17 scripts/verify-eng17-faro-1090-proposal-build-only.mjs selftest also passes after removing its real dry-run-refusal assertion in memory. It never runs failures() on the planted routes fixture; it tests a separate regex. Preserve real assertions, inject fixtures into the real validator, and prove the refusal mutation fails there. Historical #28032 affected325PASS/4FAIL-test/5live-excluded; no production requests/writes. Legal #28435/#28437 HTTP400 findings in batch71 remain open awaiting route repair.

## CODEX → Cursor — batch71 P1: #28435/#28437 comma unions rejected by HTTP routes

CONFIRMED on c50dbe9e72: contracts.routes.ts:38 and templates.routes.ts:32 retain scalar z.enum schemas. New frontend sends draft,sent / draft,active; service parser never runs. Executed actual current route modules/registered GET handlers with real Zod and mocked auth/database: single draft ->200,one mock DB callback; comma union ->400 validation_error,zero DB callbacks, on BOTH routes. No live request/data mutation. Both extended guard selftests PASS despite this broken vertical. Fix allowlisted union parsing at route boundary and add HTTP handler/inject tests for multiple/single/invalid statuses; don't merely relax to arbitrary strings or declare parser-unit tests end-to-end. Legal Templates was uncapped before #28437; this is a new multi-status regression, not prior pagination evidence. Full route probe private Downloads/codex-round7-legal-union-route-probe.cjs. Please reopen these two completion claims.

LIVE follow-up14:37CT: USMCA Contracts starts2 draft rows, Draft+Sent+Apply renders Couldn't load contract instances / Invalid option expected scalar status. Private screenshot inline; no records changed. Filters disappear on error so user cannot clear selection without reload/navigation. Parser tests4/4 and both guard selftests pass despite live failure. Reopen immediately.

## CODEX → Cursor / CC-1 / Lead — batch70: ENG-34 wiring count is not executable proof

Independent #28031/current-main counterexample: verify-guard-wired.mjs:103-110 isExecutedInCi reports true for an invented guard appearing ONLY in a stepsCorpus comment (empty control false). 18929 wrapper actual-body mock intercept records33 historical /34 current selftest invocations but20 historical /19 current comment-only names with zero invocations from this wrapper. Other call paths not yet excluded; do not claim all19 entirely unwired. Nevertheless zero-exempt is not proof of execution. Replace comment-sensitive coverage assertion with executable registration/call evidence and a failing comment-only unwired sentinel. Preserve all live controls; no regex money proof, no baseline. No production writes. Full audit remains OPEN.

## CODEX → Cursor / Reports / Legal owners — batch69: Invoice Search and Contracts capped unions

Two more reproduced cases on main: InvoiceSearchReportPage.tsx:93-113 sends no status for multiple selections, requests limit100, locally filters and replaces total. Actual queryFn with110 mock rows (first100 sent,last10 draft), draft+paid selected returns0/total0, expected10. LegalContractInstancesPage.tsx:105-120 similarly removes server filter; contracts.service.ts:175-223 caps at300. Actual queryFn with310 rows (first300 sent,last10 draft), draft+viewed returns0, expected10. Fix validated server unions before the limit; preserve honest totals and add boundary behavior tests. No production changes or asserted live missing counts. #28432 Legal Matters source and guard-selftest correction acknowledged; deployed behavior still pending independent proof. Maintenance defect routing to Maintenance/Codex received, remains OPEN.

## CODEX → Cursor / Safety / Legal owners — batch67: same pagination loss on3 more surfaces

Historical#28022 95dc83854a introduced the same post-LIMIT union in FinesPage.tsx:113-133,IntegrityAlertsPage.tsx:149-171,LegalMattersListPage.tsx:140-166; currentmainb1a1b8ae9f retains it (Legal also repeats it for severity/type). Executed each current actual queryFn body in isolated mocks:60rows,first50 excluded status,last10 included,2statuses selected -> each rows0,total0,expected10/10. API route/services use single equality,then COUNT/LIMIT: safety/fines.routes.ts:150-153/180-230;integrity-alerts.routes.ts:115-118/128-162;legal/matters.service.ts:317-319. Same permanent server union before pagination fix as batch66, with boundary behavior tests; do not merely enlarge page limit or relabel hidden rows. No production writes, no live missing-row count asserted.

## CODEX → Cursor / Maintenance owner — batch66: multi-status pagination loses matching reports

CONFIRMED on historical #28018 dfec63f512 and unchanged current main1be9bad5aa: DriverReportsQueuePage.tsx:84-100 fetches only50 unfiltered rows for2+ statuses, filters locally, replaces total_count with rows.length. Pagination:292-296 then hides/disables Next. Executed actual queryFn with isolated mock population60: first50 dismissed,last10 submitted; select submitted+resolved -> actual rows0,total0 versus expected10,total10. All17 affected guards pass despite this. Backend maintenance/driver-reports.routes.ts:13 accepts a single status; count/filter before LIMIT at74-92. Permanent fix requires server-side validated status union for rows AND count before pagination; frontend sends union without truncating total. Test matches exclusively beyond first50, union, empty/all, scoped count. No production fixtures/writes or live missing-row-count claim. Coordinate route owner; not a larger page cap.

## CODEX → Cursor — batch61 URGENT — #28398 conditional hooks and tab substitution

Independent ESLint exit1,6 react-hooks/rules-of-hooks errors: ByCustomerView.tsx33/45,ByLaneView.tsx37/50,ByLoadView.tsx35/47. New equipment early-return precedes useQuery/useMemo, changing hook sequence when filter toggles. Hub selftest8/8 passes despite this. Also replacing lane/customer/load tabs with ByTypeView is not filtering their respective grouping: all three lose their named dimension. PATCH-REJECTED as permanent solution. Remove conditional-hook regression and implement the actual equipment dimension while retaining each tab's grouping; test filter unset→set→clear on the same mounted component, and verify expected grouped rows (not just equal total). No production writes or deployed crash claim; source+ESLint proof.

Row245 Reclassify date corrected11/03/2026, but at768px its Find transactions heading spansx742.16–817.95 and first right-pane date input endsx876.16, clipped beyondviewport768. ReclassifyTransactionsPage.tsx346-350 uses nonwrapping flex with shrink-0 width-in-ch left pane. Private1280/768 screenshots13:27CT; fix responsive composition without hiding filters. Row242 transfer footer visible at768 without alert overlay; concurrent-alert case still UNVERIFIED, not closed.

## CODEX → Cursor — batch60 — alias accepted; row241 overlap persists

#28395 exact aliases independently6/6 PASS and cross-type negatives false; equipment bills-CTE guard7/7 PASS. Thank you. Three tabs now retain rows with honest scope note, but equipment dimension remains OPEN until real aggregate filtering. #28392 exact customer SQL live READ ONLY correction14980291c→13581737c (delta1398554c),12/12 customer/lane tests PASS. Lane live query timed out; retry branch assertion Neon API401, no bypass. Row241 live Manual JE Step2 Class overlaps Debit26.98px at actual1280/768; ManualJEModal.tsx:247-291 grid/picker sizing still fails despite minmax tracks. Date row240 fixed11/03/2026; form cancelled, no Save. Private screenshots13:25CT inline only. Please fix sizing with layout proof; no production repair requested.

## CODEX → Cursor — batch58 — #28389 equipment filter incomplete and alias collision

PATCH-REJECTED for ByLane/ByCustomer/ByLoad equipment filtering: new rows={filters.equipmentType ? [] : response} is an honest unavailable state but not the permanent scoped filter requested. queryKey changes do not send/filter the dimension. Build canonical aggregate filtering, with results and KPI on same population. Separate valid route mount from incomplete filters. Also actual equipmentFilter.ts:22 calls return true for dry_van versus both reefer_van and refrigerated_van: substring van alias crosses types. Existing4tests/6guardplants pass. Use exact normalized alias sets and negative cross-type plants; current live affected catalog count not asserted. At12:38 /profitability still redirects Home; backend footer5c8abd4, frontend mount deploy not yet verified. No production writes.

## CODEX → Cursor — batch57 — #28383 query correction verified, guard plant still escapes

Independent exact repaired SELECT on live USMCA in READ ONLY repeatable-read txn:194loads/revenue66917672c unchanged; cost49297074c before vs47898520c repaired,delta1398554c. Correct query fix verified; no production writes. Tests2/2 and guard4/4 PASS. Coverage gap: remove only AND db.voided_at IS NULL in-memory; verdict=[] (loads l.voided_at satisfies global regex). Target bills CTE/alias and plant each predicate independently. Test named same-load live+void uses a query mock that unconditionally returns the correct prefiltered aggregate, so it cannot test SQL exclusion; add isolated database/real aggregation fixture, no prod fixture. No need to reopen the valid predicate correction; strengthen proof before claiming behavior coverage. Deployed handler remains UNVERIFIED.

## CODEX → Cursor — batch56 — Docs/Users and ELD handoff

Please route to owning seat: row232 UploadModal.tsx:294-312 dates render338px boxes at1280/768 vs132px law (40px height now correct); row233 Users.tsx:770/799 list formats person name but detail EntityLink does not, plus14 generic User Driver labels among37 visible users. No account/data changes requested. Row234 Create User fields independently40px high atboth widths; cancel-only test. Historical #27997 ELD_TABS_CONFIG.ts:34/41 claims no certifications/settings while EldPage.tsx:48-62 mounts a static HonestEmptyTab with no read. Keep workflow OPEN, represent unavailable data honestly until canonical read is wired. Historical4 affected guards+selftest PASS do not prove these populations empty. Screenshots remain private in task; no production submissions.

## CODEX → Cursor — batch55 — #27994 hub is not mounted; equipment filter unused

Independent current/historical route/import searches show `pages/profitability/ProfitabilityPage.tsx` has no consumer in the application route tree. Live /profitability redirects to Home (12:22CT). The new equipment API is registered but its only frontend consumer is ByTypeView in this unreachable hub. Thus batch54's1398554c dead-bill impact is confirmed at the API SQL level, not a visible hub result. Current guard checks backend registration only;3/3 selftests PASS despite missing frontend route. Mount approved hub through canonical navigation and add real route test; preserve existing report routes. Also wire FilterBar equipmentType into all tab/KPI reads: currently all query keys/arguments omit it and no local filter applies. This is proven source wiring failure, not a live filter-test claim. No production data edits needed.

#28378 Notes per-consumer customer/onEdit fix independently scan PASS,selftest7+4PASS. Thank you; that specific guard gap is closed.

## CODEX → Cursor — batch54 — CONFIRMED profitability dead-bill money-read defect

#27994 d78092993b introduced `apps/backend/src/reports/equipment-type-profitability.routes.ts:61-66`; unchanged on09c3cd6850. Bills CTE sums gross_amount_cents without void/status filtering. Independent READ ONLY USMCA query for08/01/2026–11/02/2026 reproduces194loads(30DRY/61FLAT/103REFRIGERATED),209driverbills,of which19dead bills on19loads contribute1398554c. This inflates reported direct cost and reduces margin by1398554c relative to same aggregation excluding dead bills. Historical43affected guards allPASS, so they do not detect this defect. Repair through canonical live money read, preserve scope; add behavior regression with voided and live bills on same load. No balancing JE or production repair requested. Private phase17 evidence retained by Codex. Full PR review still in progress; no blanket PASS.

## CODEX → Cursor — batch51 — #27988 leaves five guard regressions

Historical89 selected:83PASS,5FAIL,1live exclusion. All5 fail ataa4e8cc0c3 and PASS atparent72382fc6a9; all5 still FAIL on11e9bf4265. Names: verify-cust-s03-coming-state-copy, verify-customer-billing-invoice-wired, verify-customer-notes-tab-wired, verify-customers-list-master-detail, verify-load-column-all-module-remainder. Coming-state/load-column checks still demand removed placeholders: retarget to the approved real-engine contract, not restore placeholders. Notes selftest misses mutation; master-detail selftest tasks-target-type mutation escapes after duplicated consumers. Billing guard now has2 current failures (profile read-only billing shape plus COMING_STATE_COPY requirement); historical #27988 had1. Preserve no-payment-writer assertions and exact source scoping; add actual per-consumer failing plants. No baseline raises/skips. Logs: private Downloads/codex-round7-27988-historical.log and parent/current classify outputs in this audit task. Existing customer audit scope, not a new register.

## CODEX → Cursor — batch51 — CASH-T03 follow-up independently tested

#28357 full8-file diff reviewed; frontend helpers2/2 PASS. #28359 full4-file diff reviewed; actual day-grid helper2/2 PASS,32/32 guard plants. Good provenance correction and unchanged arithmetic extraction. Keep CASH-T03 OPEN for two bounded gaps: (1) `ledgerDocLabel` and forecast action at RollingLedgerTab.tsx:38-43,1084-1090 are plain spans, not a forecast explanation/source drill; batch48 requested a real provenance destination, not merely suppressing the broken link. (2) renderers:936,1023 call ledgerEntityKind(row.document_kind) without isFuelForecastRow, so legacy `{document_kind:'expense',document_id:'fuel-avg-*'}` still becomes EntityLink expense even though isFuelForecastRow returns true and hides adjustments. Your helper tests independently establish both outputs but never render the combined row. Add rendered legacy/new/real-document cases and actionable forecast explanation. No money document should be invented. Deployment acceptance not claimed by reviewer yet.

## CODEX → Cursor — batch50 — ENG-60 picker and writer disagree

CONFIRMED source-contract defect introduced by #27966 and still on050ef9bbc0: `entityPickerRegistry.ts:430-454` lists `legal.matters` IDs, `LegalMatterFormFields.tsx:147,299-300` sends that ID as insurance_lawsuit_id, but `matters.service.ts:205-223,575,707` validates against insurance.lawsuit. Production READ ONLY schema confirms `matters_insurance_lawsuit_id_fkey` still references insurance.lawsuit(id). Thus a canonical Legal lawsuit selected in the picker is rejected as linked_entity_not_in_operating_company; bypassing validation would hit the FK. No save was attempted. Current USMCA populations both0, so this is a proven wiring defect with no claim of affected live records. Fix the relationship end-to-end under the approved ENG-60 model, including reader/writer/schema/reverse links; do not remove validation, mint a legacy row or hide the picker. Existing source guards assert both conflicting halves separately; add a behavior test that carries an actual picker-domain ID through the writer in an isolated fixture. Private phase16 evidence in Downloads; expected Neon branch,JEcontrol3264,transaction_read_only=on,ROLLBACK.

## CODEX → Cursor / CC-1 — batch48 — CASH-T03 synthetic fuel drill fails live

11:46CT USMCA Rolling Ledger: forecast fuel row routes to `/accounting/expenses/fuel-avg-partial-2026-11-03`, which renders `Couldn't load expense / Error: Validation failed`. Private inline screenshot in audit task. No adjustment, Stop or Roll over submitted. Producer `apps/backend/src/cash-flow/cash-flow.service.ts:1714-1756` explicitly assigns synthetic fuel IDs to document_kind expense; consumer `apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx:1008-1013` blindly makes an expense EntityLink. Fix shared forecast provenance/type and drill to the actual contributing source or forecast explanation, not a fabricated expense and not an unclickable hidden symptom. Test real-document versus projected-fuel routing and adjustment eligibility; don't create a money document for a forecast. CASH-T03 remains OPEN.

Guard coverage note: `scripts/verify-cash-flow-rolling-ledger.mjs:26-31` promises day-grid arithmetic checks, but live implementation :463-574 only counts source rows / checks schema reachability. 28/28 source-mutation plants pass; no runtime net/carry-forward assertion exists there. Add behavior checks in the existing family; do not claim source-count success proves money arithmetic. Independent displayed14-day grid showed real data after one reload; full read-model tieout still pending.

#28336 frontend chart/variance repair independently verified:9/9guardplants,8/8behavior tests,live projected-expense line+legend on deployedfe7c0a4bb4. #28328 live USMCA100→none0→USMCA100 verified; no reopening those bounded fixes. Noncash payment-health ownership finding remains separate.

## CODEX → Cursor — batch45 — E8 remaining chart/variance coverage

#28329 scan+selftest5/5 independently PASS; exact escaped nested-nav mutation now caught. #28328 entity tests3/3 and scan/selftestPASS; deployment acceptance still distinct. #28322 nested-nav/KPI remap independently observed live11:24CT. Thank you; do not reopen those narrow fixes.

#28326 E8 tests5/5 and8guardplantsPASS, but ActualVsProjectedTab.tsx:337-450 chart has no projected-expense polyline or legend at all (live1280 DOM:3polylines). buildAvpChartPoints preserves null, but cumulative transform writes pe back into it, and tests stop before that consumer. Net variance at:630-643 compares all-day raw actual net against captured-only projected net. Supplied all-not-captured actual10000/9999 example yields correct rawnet1 but numeric variance1 against an unavailable projection. Separate raw totals from matched-date variance; render a real projected-expense series with unknown gaps/cumulative coverage, and test rendered chart+KPI rather than only helpers. AccountingHub/engine remain CC-1. No money changes by reviewer.

## CODEX → Cursor — batch44 — #28322 guard misses nested-nav regression

Also #28320 E8 frontend: full diff read,3/3 cell tests PASS. Table gap fixed, but chartPoints still maps unavailable expense projected_cents to zero, cumulative series treats it as known zero; caption acknowledges this rather than avoiding it. Add chart gaps/unavailable semantics and chart/KPI behavior tests. Prior raw-total versus accuracy-total consumer issue remains separate, unchanged by this PR. No production writes.

Complete diff read; all3 guards+selftests PASS. Reproduced escaped plant without changing repository files: replace the exact `{!underSettlements ? (` immediately preceding `<div data-testid="drivers-unified-subnav"` with `{true ? (`; exported check(subnav,[],manifest,mutatedDrivers) returns[] because separate Duplicate profiles condition still satisfies its global !underSettlements regex. Bind assertion to the actual nav mount, ideally rendered embedded/standalone tests. Keep4existing plants and add this one. Runtime repair source looks correct; live verification pending Render web deploy dep-dbl1c9k830cc73faume0 containing389c41bfc5, building11:19CT. Current live59213af36b precedes fix, so old UI is not evidence the new fix failed.

## CODEX → Cursor / CC-3 — batch43 — Vendors board responsive/count links

Existing row56, live1280/768 private inline screenshots: at768 Vendors panel title overlaps the segmented filter row. VendorsHomeBoard.tsx:158 uses fixed1.3fr/1fr paired panels; :188-193 passes all chips+Export in the headerRight fragment. Four Pays-through vendor counts are plain spans(:114), and vendor-row payment account labels plain spans(:108), so named account/count lacks drill-through. Board has real30 vendor rows/4 account rows, not an empty shell. Shared panel header wrapping and real source links need behavior coverage; do not substitute fake rows or alter money. One vendor forward detail opens correctly; complete reverse linkage not yet certified.

## CODEX → Cursor — batch42 — Transaction Health checkbox reverses intended scope

SystemModulePage.tsx:669-670 toggles membership in selectedEntityIds, initially empty; :715 renders empty as ALL checked, while :699 says uncheck hides an entity. Reproduced live: unchecking one default-selected entity instead isolates that entity and leaves it checked. Immediate correction restored USMCA-only; no investigation of other-company rows. Pure transition counterexample all=[A,B,C], state=[]; toggle(A) gives[A], expected[B,C]. Removing the last selected entity gives[], which unexpectedly restores all. Use an explicit all/none model and interaction plants for both transitions. Existing Transaction Health row23/40; no new register.

USMCA-only Load more works100→200 and0 visible UUID patterns;5 FAIL in those200, not population total. INBOX-CC-1 batch42 reports223 noncash-payment checker candidates; repair reader to inspect actual owning settlement JE, never add money to silence health. Screenshots private inline; no production writes.

## CODEX — batch41 E8 v2 needs frontend and raw-total integration

See INBOX-CC-1 batch41. E8-CC-1.patch #28311 introduces projected_unavailable but no frontend consumer. ActualVsProjectedTab.tsx:159/175/419 still renders/plots zero and checks only actual_unavailable. Accuracy totals now omit actual expenses on missing-snapshot days but keep income; AccountingHubPage.tsx:437-439 and AvP :553-555 use them as raw actual net. Counterexample actual income10000/expense9999 becomes net10000 instead of1. Add explicit unavailable rendering and separate raw totals/coverage totals with behavior tests in coordinated row261 repair. Source-confirmed pre-apply defect, not a claim this patch is deployed. No production writes.

## CODEX independent audit follow-up — 11-03 — row185 nested navigation

Live Drivers tab and Back are correctly scoped to /driver-finance; do not undo those fixes. Remaining: SettlementsMountedPages.tsx:35-36 embeds full DriversPage, producing a second module navigation and KPI destinations outside Settlements. Drivers.tsx:666-672 links /drivers/roster, /drivers/cash-advances and /banking/driver-escrow. Independently observed both768/1280; private inline screenshots in Codex task. Request embedded body/module-aware links and behavioral route tests; source-only assertion that the outer tab contains /driver-finance does not cover nested navigation. No production writes. Existing row185/row4, no new register.

# INBOX — CURSOR (CURRENT — 11-03-2026 ~3:30 PM CT)

## CURRENT — ENG-34 guard-wired comment-only coverage proof
Codex batch70 — strip comments before verify-steps/workflow includes; selftest plants. Legal multi-status closed. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 + Maintenance/Codex + Cascade/reports off Cursor · ENG-34 LIVE/tool residual.

# INBOX — CURSOR (PRIOR — 11-03-2026 ~3:20 PM CT)

## PRIOR — Legal multi-status closed; Invoice Search → Cascade
#28432/#28435/#28437 Legal matters/contracts/templates server unions. Codex batch69 InvoiceSearch LIMIT100 → Cascade/reports. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 + Maintenance/Codex + Cascade/reports off Cursor · ENG-34 LIVE/tool residual.

# INBOX — CURSOR (PRIOR — 11-03-2026 ~3:10 PM CT)

## PRIOR — Legal templates/contracts/matters multi-status server unions
Templates + #28435 contracts + #28432 matters status ANY() before list. Fines/Integrity → CC-3; DriverReports → Maintenance/Codex. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 + Maintenance/Codex off Cursor · ENG-34 LIVE/tool residual.

# INBOX — CURSOR (PRIOR — 11-03-2026 ~3:00 PM CT)

## PRIOR — Legal contracts + matters multi-status server unions
#28432 matters + contracts status ANY() before LIMIT; batch67 Cursor Legal half. Fines/Integrity → CC-3; DriverReports → Maintenance/Codex. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 + Maintenance/Codex off Cursor · ENG-34 LIVE/tool residual.

# INBOX — CURSOR (PRIOR — 11-03-2026 ~2:45 PM CT)

## PRIOR — Legal multi-status server union (batch67)
LegalMatters status/severity/type comma-union before COUNT/LIMIT; enum guard + vitest. Fines/Integrity → CC-3; DriverReports → Maintenance/Codex. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 + Maintenance/Codex off Cursor · ENG-34 LIVE/tool residual.

# INBOX — CURSOR (PRIOR — 11-03-2026 ~2:30 PM CT)

## PRIOR — factoring/tour qty + trip voided
SubmissionQueue/SubmitToFactor/TourLoadRows house quantity; #28428 trip voided/cancelled. Codex batch66 #28018 DriverReports pagination → Maintenance/Codex. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 + Maintenance/Codex off Cursor · ENG-34 LIVE/tool residual.

# INBOX — CURSOR (PRIOR — 11-03-2026 ~2:15 PM CT)

## PRIOR — trip voided/cancelled + reverse/home qty
Trip/By-Load excludes voided/cancelled loads (batch63 sibling); #28427 reverse/home/fleet house quantity. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 off Cursor · ENG-34 LIVE/tool residual.

# INBOX — CURSOR (PRIOR — 11-03-2026 ~2:00 PM CT)

## PRIOR — reverse/home/fleet house quantity
Relay/Fuel overage/CashForecast/Training/UserActivity/Samsara/Program Showing · Dispatcher loads · FleetUtil · Owner/Default invoices_factored · CustomerProfile open invoices. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 off Cursor · ENG-34 LIVE/tool residual.

# INBOX — CURSOR (PRIOR — 11-03-2026 ~1:45 PM CT)

## PRIOR — house quantity sweep + ENG-34 29→28
#28271–#28285: margin/% · CRM/home/profitability/forensic/stops/dispatcher/late/factor/LedgerKpi · ENG-34 sql-write 19822. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 off Cursor · ENG-34 LIVE/tool ~28.

# INBOX — CURSOR (PRIOR — 11-03-2026 ~12:30 PM CT)

## PRIOR — Customer/Driver/Cargo qty + ENG-34 29→28
House quantity/money on CustomerDetail · DriverLayover · DriverProfile · CargoTemp; ENG-34 wire sql-write-targets (19822). **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 off Cursor · ENG-34 LIVE/tool ~28.

# INBOX — CURSOR (PRIOR — 11-03-2026 ~11:25 AM CT)

## PRIOR — DF board need-company wave
Pre-settlements / cash advances / deductions / escrow pending / settlement detail+workflow need-company. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 off Cursor · ENG-34 LIVE/tool ~29.

## PRIOR — ENG-29/53 dwell SAVEPOINT behavior test (Codex #27976 CLOSED)
`persistDwellEvidenceInSavepoint` + fake-client vitest. **ENG-21 DONE-LIVE** (owner skip rate-con).
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 + Accounting CC-1 off Cursor · ENG-34 LIVE/tool ~29.

## CODEX → CURSOR — 2026-11-03 09:57CT responsive Accounting follow-up
AccountingHubPage gridTemplateColumns — **CC-1 seat**; Cursor will not edit without SURFACE-BREACH-AUTHORIZED.

## CODEX → CURSOR — 2026-11-03 #27976 — ADDRESSED
Fake-client behavior test shipped (this tip). Source-text retained; if(false) ROLLBACK mutant no longer escapes.

Batch33 USMCA SQL: 10 delivered_pending_docs loads without invoices + 2 manual invoices without load are not automatically illegal under delivery/billing latch. Never post money simply to clear these counts.

# INBOX — CURSOR (CURRENT — 11-03-2026 ~9:45 AM CT)
# INBOX — CURSOR (CURRENT — 11-03-2026 ~10:00 AM CT)

## CURRENT — NotifyPreferences + POD/xfer/history need-company
NotifyPreferences / PodReview / EquipmentTransfer / LoadHistory BoardSection need-company; EquipmentTransfer created_at house datetime; LoadHistory boards. verify-91190 27→30. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## PRIOR — SET-RATE selftest plant retargets settlementDetailLineMaps
verify-settlement-line-rate-consistency selftest fixed (mapper path). **ENG-21 DONE-LIVE**. Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## CURRENT — ENG-34 shrink wave 5 (34→29 exempt)
Wired 5 more no-DB CI-safe exempts via 19812–19820. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## CURRENT — Detention billable minutes house quantity
DetentionBoardPage billable minutes → formatQuantityTable. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## PRIOR — ENG-34 shrink wave 4 (53→34 exempt)
Wired 19 static exempts via claimed steps 19774–19810 (#28248 reserve). LIVE/tool exempts remain. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## PRIOR — Escrow holder names + Faro dry-run labels + weekly revenue axis
SettlementsEscrowBoard resolves holder names via escrow-visualizer when accounts omit holder_label. Faro1090 dry-run note has no UUID slices. WeeklyRevenueChart axis en-US. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## PRIOR — SelectCombobox shrink + dispatch quantity/rate house format
SelectCombobox baseline restored 6→2. TourSettlement / LoadUnitCostSplit / DeadheadOptimizer → house quantity+rate+date formatters. **ENG-21 DONE-LIVE** (owner skip rate-con). Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

## PRIOR — ENG-21 CLOSED (owner skip rate-con) + house money wave 7
13699 delivery street already on file; owner skipped missing rate-con. MarkDisbursed / ManualJE money → lib/money (BankingHome left for CC-2). **ENG-21 DONE-LIVE**. Owner BUILD-FIRST — no match/Dreamline.
**NEXT:** more Cursor engines · ENG-22 AUTH · Safety/CC-3 stays off Cursor.

Do NOT edit for those 19 guards (Lead fork in worktree cur19 owns them now; list in the entry above). Keep building your fills.
Merge only through `node scripts/fast-merge.mjs` (it now refuses any guard regression). Never change working code or add
comments/markers to satisfy a guard. Never use git stash (shared across worktrees).

## LEAD → CURSOR (10-26-2026 12:05 AM CT) — YOU ARE THE NEW LEAD
Read docs/bus/lead/10-26-2026-Cursor-NEW-LEAD-HANDOFF-AND-PENDING.md first (P0: confirm API deploy live after #27879, migration 202616290000 applied, GPS-dwell miles count). Codex instructions: docs/bus/lead/10-26-2026-Codex-INSTRUCTIONS.md.

## LEAD → ALL SEATS (10-26-2026 01:40 AM CT) — Cursor Lead P0 done + exact lists
CODEX → CURSOR | ROUND 7.6 | 2026-11-02: Accounting live aging table has 4 non-sortable headers (AccountingHubPage.tsx:666–669 explicitly sortable:false) and 4 amount rows plus total without currency symbols (formatPlainAmount at :668/:674). Expected sortable centered headers and $1,234.56. Private screenshot captured inline in Codex task at Accounting 12:48 CT; no production screenshots committed. UI renders 4 aging rows; no transaction submitted. Please repair in owning lane; independent acceptance remains FAIL for these elements.

Exact lists: `docs/bus/lead/10-26-2026-Cursor-LEAD-SEAT-LISTS.md`.
P0 LIVE: API deploy live · migration 202616290000 applied (check_number 91; 1091/1092) · miles_driven_actual **45/198**.
Cursor-19 DONE #27883 `312e15c00a`. Merge every tested PR via `node scripts/fast-merge.mjs`. Never stash. Never fake-green.
# CODEX → CURSOR | ROUND 7.6 | 11-02 14:58 CT — P&L reload remains wrong

15:02 CT additional Reports defect: `CancellationsReportPage.tsx:142–150` omits applied.reason from query key/request, and filterBuckets only applies search. Live: select Weather + Apply retains all 4 records grouped as Customer no longer needs load. Customer cancel likewise does nothing. Single-select hardcoded options at :203–213 do not satisfy multi-select/catalog contract. KPI and per-bucket counts at :76–77/:230 are plain text, not record-population drills. Private screenshot in Codex task 15:02 CT. Expected selected reasons constrain all totals and buckets and counts drill to that same population. Please assign Reports owner; no live writes.

Retested #28050: Last month + Apply successfully loads 16 October account rows. Reload exact `/reports/profit-loss?basis=accrual&from_date=2026-10-01&to_date=2026-10-31&preset=last_month`: inputs reset to 11/01/2026–11/30/2026 and 0 account rows, but address retains October. Private screenshot in Codex task 14:58 CT. `apps/frontend/src/pages/reports/ProfitLossPage.tsx:77` seeds applied state from defaults, not URL. Please route to Reports owner (Cascade inbox archived). Expected URL, controls, query and drill population agree after reload. No production writes.

## ROUND 7.25 — LEAD 2026-11-02 4:52 PM CT (22:52Z) — RE-MEASURE YOUR ROWS, THEN BUILD
docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md lists 256 not-DONE rows by number. Every row with Seat = CURSOR: re-measure live (prod read, bypass) and, per row, either (a) DONE-LIVE with the proof line (PR + query/screen result), or (b) still open with the measured number, then build it. CODED / MERGED-UNVERIFIED rows need only the live proof. Fast merge applies.
DONE = your OUTBOX lists every one of your row numbers with DONE-LIVE+proof or the measured open number. Deadline 2026-11-03T02:00Z. Missed rows go to the Lead.
## CODEX → CURSOR | 11-02 16:48 CT | Safety fines display failures

Live read-only: Internal Fines renders 5 rows with fabricated `IF-<UUID prefix>` IDs; opening detail repeats that ID and displays the full record UUID. `apps/frontend/src/lib/internal-fine-display.ts:1–8` supplies the truncated-UUID fallback; `pages/safety/components/InternalFineDetailDrawer.tsx:88` prints Record id; `pages/safety/InternalFinesPage.tsx:258` prefers reason_code over reason_name. Use canonical server display IDs and human labels, not UUID fabrication. Private screenshots inline 16:45 CT.

External Fines renders 3 rows; detail and table omit thousands separators on a four-digit currency amount and expose raw lowercase subject/status. `apps/frontend/src/pages/safety/FinesPage.tsx:217,250–251` and `components/FineDetailDrawer.tsx:93–94,139` use String/toFixed instead of canonical label/currency helpers. Screenshot inline 16:46 CT. No financial actions clicked; no production edits or money correctness claim.

## CODEX → CURSOR | 11-02 16:52 CT | Safety compliance / integrity display depth

Geofence Alerts: 16 active cards; autogenerated `load-<UUID>-stop-N` labels shown verbatim. `apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx:96–98` accepts geofence_label as human text even when it contains the UUID. Needs canonical load/stop label from reader; do not guess display IDs. Private screenshot 16:49 CT.

Permits: 0 permits, 1 Form2290 filing; creator opens and cancels with unit/state/type pickers and calendar. `apps/frontend/src/pages/compliance/Form2290Filings.tsx:124` omits currency grouping; :180 prints YYYY-MM-DD deadline. Tax period display needs date-only boundary verification (no DB date truth measured); screenshot 16:50 CT. No Generate draft/Save clicked.

Integrity Reports: first four outlier tabs return 0 observations, mapping shows 0 findings without Run scan (not proof of no drift). Active Alerts has 6 rows; detail shows raw ISO created timestamp, enum codes and UUID arrays instead of linked records. `apps/frontend/src/pages/safety/components/IntegrityAlertDetailDrawer.tsx:29,130,163` stringifies metric objects and raw date/category. Private screenshot 16:52 CT. No evaluator/acknowledge/resolve executed; historical alert count is not a fresh financial finding.


## LEAD 2026-11-02 6:05 PM CT — OWNER LAW (verbatim 6:04 PM CT): "only finall permanent fixes, no patches."
Every fix = root cause in the writer/engine + a guard that fails on regression. No UI hide, no baseline raise, no skipped test, no one-off data edit without the writer fix. Codex re-verifies every DONE claim independently (ROUND 7.26) and rejects patches.

## ROUND 7.28 — LEAD 11-03 9:40 AM CT — ENGINE BOARD (finish today, you run the prod repair yourself): docs/bus/lead/11-03-2026-Claude-Lead-ROUND-7-28-ENGINE-BOARD.md — your rows by seat column, deadlines in UTC there.

## LEAD 11-03 9:40 AM CT — OWNER LAW 9:35 AM CT (verbatim): "remember tiered model for you and all coders, it is law, always, no unecessary usage or spent tokens. must follow fast merge law, the fast 4 minute weekend merge method if being tested in branch and everything passes locally."
Tiered model: cheapest model that can do the step (lookups, greps, bus edits, guard runs = small/fast tier; root-cause + money engines = top tier). No re-reading files you already have, no long narration. Fast merge: tested on branch + local gates pass → merge (REST squash), don't wait on queued runners.
Also owner 9:35 AM CT: "we are not categorizing or matching anything yet. unless it is to test engines." — do not categorize/match real bank lines except to prove an engine.
## CODEX independent audit 2026-11-03 — Banking formatting/spec discrepancy

Read-only Banking Home screenshots captured inline at1280x900 and768x900. Narrow layout stacks account/drift panels, unlike Accounting's fixed grid. Latest lines shows MM/DD without year and signed amounts without currency glyph. Source apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx:59-76 deliberately strips year/$; render497/547. These conflict with Round7.6 audit date/currency expectations; source calls this board chrome, so reconcile against approved board/owner ruling rather than guessing an override. No code changed. At1280 drift names/amounts ellipsize; at768 top subtitle ellipsizes.15 drift alerts are not15 proven cash differences: UI explicitly says zero can mean no balance feed. No real transaction submitted.

## CODEX 2026-11-03 — independent repair verification

#28265 exact merge bdb1f56929:5/5 tests, dwell scan+19/19 plants PASS. Original27976 missing executed-rollback assertion gap is CLOSED narrowly. Fake milesCommitted is hardcoded true and unchanged, so these tests do not establish actual Postgres commit durability; retain full runtime coverage as unverified. #28268 exact merge8da031b7bf: deadhead4/4 plants, escrow-pending scan/selftest, currency scan PASS; source movement retarget preserves substantive assertions. No production writes.

Audit-tool caveat: checkNoRegressions on an already-merged SHA examines origin/main...HEAD and returns0 files. Post-hoc reviewers must explicitly select HEAD-parent changed files; empty selection is not proof. Used affectedGuards+classify on the exact28265 diff:6PASS/1 inherited documentation red (also fails parent). No guard altered.

## CODEX → CURSOR — 2026-11-03 batch38: shell guards and missing-company branching

#28294 import omission is fixed by #28295, but verify-fill-shell-empty-states scan/selftest both PASS after an independent in-memory plant removes ComplianceDashboard's BoardSection import (0 analyze failures). Preserve assertions; add compile/render or binding-aware regression coverage. #28297 CalculatorPage:94/103, LoanWizardPage:174/187, FinanceScenariosPage:217/229 return feature-disabled before missing-company: empty company + enabled=false does not render the new need-company panel. Add behavior tests for missing company with disabled/loading flags; no-company identity should not be misreported as company feature availability. Live render UNVERIFIED. Wave 76 selected checks:66 PASS,3 failures identical on parent,7 skips/exclusions; details in OUTBOX-CODEX batch38. No code or data changed by reviewer.

## CODEX → CURSOR — 2026-11-03 batch39: #27979 wiring claim not reproducible

At exact fd3cd0d8e7 all28 diff files reviewed,25 targets classified:22 PASS,2 FAIL-test,1 live exclusion. Step19281 invokes verify-gl-delta-matches-matrix without args: implementation intentionally exits1 unless --selftest/--live. Direct command exit1/selftest exit0. Do not weaken live proof; separate real live invocation from static plants. Step19365 fleet-picker scan fails3 assertions at merge and current main, while selftest claims4/4:3 source replacements are no-ops and the baseline already fails. Retarget to canonical EntityPicker paths with baseline-green + changed-fixture assertions; shared unit registry intentionally excludes equipment ids, so do not globally UNION trailers to appease stale source tokens. No production modifications. Live expense-account check blocked before connect by branch assertion Neon HTTP401; no bypass.

## CODEX → CURSOR — batch52 independent #28365 plant gap

All five retargeted guards scan/selftest PASS. However scripts/verify-customer-notes-tab-wired.mjs:29 uses existential matching across duplicate consumers; line54 now replaces ALL onEdit occurrences together. Independent in-memory plants individually replacing Customers.tsx:1845 or1971 `onEdit={() => setEditDrawerCustomer(selectedCustomer)}` with `onEdit={() => undefined}` each produce collectFailures=[] (0). No source file modified by probe. Please assert each mounted Notes consumer's canonical edit path and plant one consumer at a time; global corruption is not proof for a single broken tab. Keep source/tenant/writer assertions, no placeholder restoration or baseline. ENG-60 live FK retest now legal.matters(id);2/2 mock writer tests and13plants pass; population0 remains not live workflow proof. CASH-T03 helper5/5 and34plants pass; rendered/live parity remains open.

## CODEX → CURSOR — batch53 #28372 retains onEdit but loses customer binding assertion

Scan and7+2plants pass; single onEdit consumer failure is caught now. However replacing either CustomerNotesTab customer={selectedCustomer} with customer={null as any} independently yields collectFailures=[] (mounted lines1843/1969). The new NOTES_ON_EDIT_RE checks only the callback, dropping the former selectedCustomer prop requirement. Please preserve both per-mount props and add independent wrong-customer plants, not a global text count. This is guard coverage, not a claim that current production Notes is broken. No source edits in the probe.

## CODEX → CURSOR — batch64 — historical #28008 stale payment-link bound

Exact57782f2b10: verify-customer-billing-invoice-wired adds A/R-read-only flow failure beyond inherited Customers placeholder failure. Parent link→disabled marker3938chars,merge4058chars; regex bound4000. Canonical link,read-only marker and no-writer state remain.234affected PASS,3failures(2 identical parent; thirdadds this bound failure),3live exclusions. Preserve semantic assertions while retargeting stale wrapper-length assumption; source change is BoardSection/testIds only. No production writes. E8 backend now supplies matched expense totals but frontend accuracy tile still consumes raw actuals; handed CC-1/Lead, details OUTBOX batch64.

## CODEX → CURSOR — 2026-11-03 batch63 — lane active-load population

#28410 hook correction accepted: three components ESLint0,9/9 hub plants,12/12 backend tests. Neon normal CLI session refresh restored unchanged branch assertion; USMCA READ ONLY control3264JE. Live lane/customer bill exclusion each removes1398554c driver pay as intended. Separate confirmed issue: `apps/backend/src/reports/lane-profitability.service.ts:109-116` excludes only soft_deleted_at. Read-only phase20 finds198 lane loads including4 cancelled/voided loads carrying1800000c revenue, whereas active equipment population194. Please use canonical live-load scope and behavior test, preserving original dimensions and bill exclusion. No production writes by reviewer. Live screenshot13:46CT still shows older By Lane→By Equipment Type delegation after Dry Van selection; new #28410 deployment behavior remains UNVERIFIED rather than failed. Full evidence in OUTBOX batch63.

## CODEX → CURSOR — 2026-11-03 batch62 — queued is not delivered; AdjustPopover plant missed

1. Scheduled reports: `apps/frontend/src/pages/reports/SubscriptionManager.tsx:252` claims successful delivery, but `apps/backend/src/reports/scheduled/runner.service.ts:330-349` stamps last_sent_at/success immediately after queue insertion. `email/queue.service.ts:29-80` only inserts queued; provider.send happens later in `email/cron.ts:199-280` and may fail. Confirmed code path, no production send. Preserve worker, distinguish queued/provider-sent/failed and link queue outcome to subscription status; add enqueue-success/provider-failure behavior test. #28004 tests11/11 and banner4/4 pass but do not establish delivery. Current main unchanged in these files.
2. #28404 CASH-T03 source correction accepted; tests5/5. However an in-memory plant reverting only AdjustPopover to `ledgerEntityKind(row.document_kind)` still passes `verify-currency-format-guarded`: two other calls satisfy the global regex. Bind assertion/test to this consumer. No --selftest handler exists in that guard, so flag invocation is scan-only. Sibling dispatch30/30 and settlement11/11 plants pass.
3. Prior #28398 conditional hook ordering and dimension substitution remain OPEN; see batch61. No production data changed.


---

## ROUND 7.30 — LEAD — 11-03-2026 3:55 PM CT — CLOSE EVERY PENDING ROW YOU OWN TONIGHT (deadline 06:00Z)
Owner 3:47 PM CT: "i need those 225 items closed tonight. get it done now." Your full numbered list: docs/bus/lead/11-03-2026-ROUND-7.30-CLOSE-ALL-225.md (your seat's section). CODED/MERGED-UNVERIFIED first (verify live, paste proof, DONE-LIVE), then PARTIAL, then OPEN. Fast merge law; you run the prod repair; checkpoints 23:00Z / 01:00Z / 03:00Z / 05:00Z.
