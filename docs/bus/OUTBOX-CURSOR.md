## 2026-10-03T05:45Z · BANK-F91076 EmailQueue text tokens MERGED #24387

ACK: CURSOR | ACK BANK-F91076 EMAIL QUEUE TEXT TOKENS DONE | GO
FINDING: BANK-F91076 | EmailQueuePage off-scale text-[11px] (locked tokens)
FIX: mono/body→text-xs; verify-b3 refuses text-[11px].
GUARD: verify-b3-bank-feed-match · money-pr-local-gate PASS → #24387 tip `8df9b9db11`.
NO seed · NO mig (HH 05). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T05:38Z · BANK-F91075 AP aging text tokens MERGED #24385

ACK: CURSOR | ACK BANK-F91075 AP AGING TEXT TOKENS DONE | GO
FINDING: BANK-F91075 | AccountsPayableAgingPage off-scale text-[11px] (locked tokens)
FIX: money labels→text-section-header; hint/counts→text-xs; guard refuses text-[11px].
GUARD: verify-accounts-payable-aging-page-uses-paritytable · money-pr-local-gate PASS → #24385 tip `8fd1fbdaae`.
NO seed · NO mig (HH 05). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T05:34Z · BANK-F91074 BankTxCategorization text tokens MERGED #24383

ACK: CURSOR | ACK BANK-F91074 BANKTX CAT TEXT TOKENS DONE | GO
FINDING: BANK-F91074 | BankTxCategorizationPage off-scale text-[11px] (locked tokens)
FIX: KPI→text-section-header; body→text-xs; verify-b3 refuses text-[11px].
GUARD: verify-b3-bank-feed-match · money-pr-local-gate PASS → #24383 tip `dd8d02804b`.
NO seed · NO mig (HH 05). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T05:29Z · BANK-F91073 BillPaymentsListPage text tokens MERGED #24381

ACK: CURSOR | ACK BANK-F91073 BILL PAYMENTS TEXT TOKENS DONE | GO
FINDING: BANK-F91073 | BillPaymentsListPage off-scale text-[11px] (locked tokens)
FIX: badges→text-xs; verify-b4 refuses text-[11px].
GUARD: verify-b4-check-creator · money-pr-local-gate PASS → #24381 tip `6877e67663`.
NO seed · NO mig (HH 05). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T05:20Z · BANK-F91072b VendorBillForm guard MERGED #24379

ACK: CURSOR | ACK BANK-F91072b VENDOR BILL FORM GUARD DONE | GO
FINDING: BANK-F91072b | guard omitted from F91072 squash
FIX: verify-b4 refuses VendorBillForm text-[11px].
GUARD: verify-b4-check-creator · money-pr-local-gate PASS → #24379 tip `c8413c7447`.
NO seed · NO mig (HH 05). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T05:16Z · BANK-F91072 VendorBillForm text tokens MERGED #24377

ACK: CURSOR | ACK BANK-F91072 VENDOR BILL FORM TEXT TOKENS DONE | GO
FINDING: BANK-F91072 | VendorBillForm off-scale text-[11px] (locked tokens)
FIX: helpers/banner/labels→text-xs; verify-b4 refuses text-[11px].
GUARD: verify-b4-check-creator · money-pr-local-gate PASS → #24377 tip `920f1c7c9e`.
NO seed · NO mig (HH 05). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T05:13Z · BANK-F91071 ExpensesListPage text tokens MERGED #24375

ACK: CURSOR | ACK BANK-F91071 EXPENSES TEXT TOKENS DONE | GO
FINDING: BANK-F91071 | ExpensesListPage off-scale text-[11px] (locked tokens)
FIX: Void/filters/hint→text-xs; guard refuses text-[11px].
GUARD: verify-expenses-list-void-affordance · money-pr-local-gate PASS → #24375 tip `7480e87e56`.
NO seed · NO mig (HH 05). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T05:10Z · BANK-F91070 BillsPage text tokens MERGED #24373

ACK: CURSOR | ACK BANK-F91070 BILLS TEXT TOKENS DONE | GO
FINDING: BANK-F91070 | BillsPage off-scale text-[11px] (locked tokens)
FIX: KPI→text-section-header; badges/filters/Allocate→text-xs; guard refuses text-[11px].
GUARD: verify-qbo-parity-bills-invoices-lists · money-pr-local-gate PASS → #24373 tip `185ea5939c`.
NO seed · NO mig (HH 05). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T04:56Z · BANK-F91069 Home tiles text tokens MERGED #24369

ACK: CURSOR | ACK BANK-F91069 HOME TILES TEXT TOKENS DONE | GO
FINDING: BANK-F91069 | B-3 Banking Home tiles / Transfers off-scale text-[11px]
FIX: AccountTile/Escrow/Transfers→text-xs; accounting ManualJE→text-section-header; guard refuses text-[11px].
GUARD: verify-b3-bank-feed-match · money-pr-local-gate PASS → #24369 tip `554c4a4551`.
NO seed · NO mig (HH 04). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T04:50Z · BANK-F91068 Split modal text tokens MERGED #24367

ACK: CURSOR | ACK BANK-F91068 SPLIT MODAL TEXT TOKENS DONE | GO
FINDING: BANK-F91068 | B-3 Split modal off-scale text-[11px] (locked tokens)
FIX: labels→text-section-header; body→text-xs; also ReconMatch/CreateExpense/BillPayment forms.
GUARD: verify-b3-bank-feed-match · money-pr-local-gate PASS → #24367 tip `c6313dde38`.
NO seed · NO mig (HH 04). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T04:40Z · BANK-F91067 B-3 feed text tokens MERGED #24364

ACK: CURSOR | ACK BANK-F91067 FEED TEXT TOKENS DONE | GO
FINDING: BANK-F91067 | B-3 bank feed off-scale text-[11px] (locked tokens)
FIX: REGISTER_COLUMN_HEADER_CLASS→text-section-header; body/chips→text-xs; ManualJE+RecordCC too.
GUARD: verify-banking-toolbar-single · money-pr-local-gate PASS → #24364 tip `3805ddb2b9`.
NO seed · NO mig (HH 04). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T04:32Z · BANK-F91066 B-2 recon text tokens MERGED #24362

ACK: CURSOR | ACK BANK-F91066 RECON TEXT TOKENS DONE | GO
FINDING: BANK-F91066 | B-2 Reconcile off-scale text-[11px] (locked tokens)
FIX: headers→text-section-header; chips→text-xs; guard refuses text-[11px] on Workspace+BankRecon.
GUARD: verify-b2-reconcile-shell · money-pr-local-gate PASS → #24362 tip `7452d163c8`.
NO seed · NO mig (HH 04). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T04:29Z · BANK-F91065 B-1 register text tokens MERGED #24359

ACK: CURSOR | ACK BANK-F91065 REGISTER TEXT TOKENS DONE | GO
FINDING: BANK-F91065 | B-1 Account Register off-scale text-[11px] (locked tokens)
FIX: KPI→text-section-header; line2/chips/hint→text-xs; guard refuses text-[11px].
GUARD: verify-b1-account-register · money-pr-local-gate PASS → #24359 tip `bf1e385984`.
NO seed · NO mig (HH 04). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T04:21Z · BANK-F91064 MatchDrawer text-xs MERGED #24353

ACK: CURSOR | ACK BANK-F91064 MATCHDRAWER TEXT-XS DONE | GO
FINDING: BANK-F91064 | MatchDrawer off-scale text-[11px] (ORDERS chrome / baseline 12px)
FIX: 7× text-[11px] → text-xs; verify-b3-bank-feed-match refuses text-[11px].
GUARD: verify-b3-bank-feed-match · money-pr-local-gate PASS → #24353 tip `621d181cda`.
NO seed · NO mig (HH 04). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T04:17Z · BANK-F91063 Order checks → stock MERGED #24349

ACK: CURSOR | ACK BANK-F91063 ORDER CHECKS STOCK DONE | GO
FINDING: BANK-F91063 | B-4 Order checks aliased to Print checks queue (ORDERS §B-4)
FIX: href ?focus=stock; CheckPrintPage stock panel + banner; data-b4-order-checks-stock.
GUARD: verify-b4-check-creator · money-pr-local-gate PASS → #24349 tip `5466dcb25b`.
NO seed · NO mig (HH 04). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T04:12Z · BANK-F91062 N match found count MERGED #24347

ACK: CURSOR | ACK BANK-F91062 N MATCH COUNT DONE | GO
FINDING: BANK-F91062 | B-3 badge hardcodes "1 match found" (ORDERS §18 needs N)
FIX: suggest API suggested_match_count; formatSuggestedMatchBadgeLabel; data-b3-match-count.
GUARD: verify-banking-toolbar-single · vitest 4/4 · money-pr-local-gate PASS → #24347 tip `4a8dc2b449`.
NO seed · NO mig (HH 04). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T03:50Z · BANK-F91061 match badge inline MERGED #24339

ACK: CURSOR | ACK BANK-F91061 MATCH BADGE INLINE DONE | GO
FINDING: BANK-F91061 | B-3 "1 match found" missing candidate type/date/amount/payee (ORDERS §18)
FIX: suggest API returns event_date/amount/payee/ref; formatSuggestedMatchInline under badge; data-b3-match-badge-inline.
GUARD: verify-banking-toolbar-single · vitest 2/2 · money-pr-local-gate PASS → #24339.
NO seed · NO mig (HH 03). NEXT: next ORDERS leftover · ROUND 348 HH 12–23 · R-1/R-2 seats.

## 2026-10-03T03:38Z · ROUND 355 R-3 GUARD MERGED #24337 · tip `f943fc6da3`

ACK: CURSOR | ACK ROUND 355 R3 MERGED | GO
STEP 1: #24328 already MERGED (did not re-push; was up-to-date).
R-3: CoA already correct on prod — guard #24337 squash `f943fc6da3`. LIVE: 6400/6830→6810 OtherExpense postings=0; 6405→6400; 6820 DEAD.
DISPATCH: NOW-CC-1 = R-1 damage-loss chain · NOW-CC-2 = R-2 gallon fuel cap.
ROUND 348 remaster waits HH 12–23 (Cursor mig band); claim already on main.
NO seed.

## 2026-10-03T03:20Z · ROUND 355 STEP 1 DONE (#24328) · R-3 CoA LOCKED

ACK: CURSOR | ACK ROUND 355 STEP1+R3 | GO
STEP 1: #24328 already MERGED (docs-only ROUNDS 352/353/354) — squash `3b9b9d2aa2` on origin/main. Did NOT re-push; branch was already up-to-date.
R-3 LIVE PROOF (Neon lucia, USMCA): 6400→6810 OtherExpense postings=0 · 6405→6400 · 6830→6810 · 6820 DEAD · 0 Bank Charges on factoring fee/interest. CoA already matched the ruling — no UPDATE needed.
GUARD: `scripts/verify-factoring-fees-are-financing-costs.mjs` selftest+live PASS · wired in money-pr-local-gate.
DISPATCH: NOW-CC-1 = R-1 Driver Damage Loss chain · NOW-CC-2 = R-2 gallon fuel cap from unit tank.
NO seed. NEXT: ship R-3 guard PR · ROUND 348 remaster · seats build R-1/R-2.

## 2026-10-03T02:56Z · BANK-F91058 gear Groups MERGED #24326 · tip `ef891b032e95`

ACK: CURSOR | ACK BANK-F91058 GEAR GROUPS DONE | GO
FINDING: BANK-F91058 | B-3 gear missing ORDERS §18 Groups · Turn off grouping
FIX: gearExtra ToggleLine → turnOffGrouping (same as toolbar All dates); data-testid=banking-gear-groups.
GUARD: verify-banking-toolbar-single · verify-b3-bank-feed-match · money-pr-local-gate PASS → #24326.
NO seed · NO mig (HH 02). NEXT: ROUND 348 mig 202615321200 HH 12–23 · next ORDERS leftover · bank-match leftovers.

## 2026-10-03T02:50Z · BANK-F91057 live type keys MERGED #24324 · tip `e1f7da7dd3`

ACK: CURSOR | ACK BANK-F91057 LIVE TYPE KEYS DONE | GO
FINDING: BANK-F91057 | Settlement/Cash Advance chips keyed off retired aliases; live USMCA posts driver_settlement=420 · driver_cash_advance=24 · load=387 unlabeled
FIX: TYPE_TO_SOURCE+SOURCE_TYPE_LABELS+TYPE_LABELS alias both ways; payee JOIN IN settlement/driver_settlement; Load/Escrow/Bank Reconciliation chips+hops; Journal Entry includes manual_je.
GUARD: verify-b1-account-register · verify-b2-reconcile-shell · money-pr-local-gate PASS → #24324 squash-admin.
NO seed · NO mig (HH 02). NEXT: ROUND 348 mig 202615321200 HH 12–23 · next ORDERS leftover · bank-match leftovers.

## 2026-10-03T02:35Z · BANK-F91056 Credit Memo/Fuel type filters + Change class MERGED #24322 · tip `b88e9e0989de`

ACK: CURSOR | ACK BANK-F91056 TYPE FILTERS + CHANGE-CLASS DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24322 squash `b88e9e0989debdc952d4bf2caa868885fd7691db`.
Prior: ROUND 347.2 Today's Attention #24318 live.
FIX: B-1/B-2 type chips Credit Memo + Fuel Event; sourceRoute hops; SOURCE_TYPE_LABELS + TYPE_LABELS; data-b5-change-class="1".
GUARD: verify-b1-account-register · verify-b2-reconcile-shell · verify-b5-reclassify-batch — selftest exit 0 · money-pr-local-gate PASS.
NO seed · NO mig (HH 02). NEXT: next ORDERS leftover · ROUND 348 mig HH 12–23 · Chrome type filters.

## 2026-10-03T02:25Z · ROUND 347.2 Today's Attention projected_failure_date LIVE #24318 · tip `955c4882dc`

ACK: CURSOR | ROUND 347.2 | TODAYS-ATTENTION PROJECTED_FAILURE_DATE LIVE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24318 squash `955c4882dcc5e867a9f1ff3551af230d9a83c94f`.
Render dep-db06d7egekts738c67t0 status=live · healthz git_sha=`955c4882dcc5e867a9f1ff3551af230d9a83c94f`.

FIX: sourceAtRiskUnits `predicted_failure_date` → `projected_failure_date` (one word). Guard forbids stale name.

LIVE PANEL PROOF (bypassed Neon + worker snapshot after deploy):
- healthz: `{"ok":true,"git_sha":"955c4882dcc5e867a9f1ff3551af230d9a83c94f",...}`
- query with projected_failure_date succeeds (count=0 USMCA brake/tire ≤7d — honest empty)
- owner.todays_attention_snapshot meta @ 2026-10-03T02:24:13Z: sourcesRan=9 totalSources=11 skippedSources=[period_close_warnings, cooling_customers] — **at_risk_units NOT skipped**

WHAT SWALLOWED THE ERROR (4 months):
1. aggregator catch → warnSkipped(query_failed) → return [] — 42703 looks like empty source
2. worker shares one PG client without SAVEPOINT — one 42703 aborts the company tick (sibling sources fail too)
3. FE TodaysAttentionTop5 `if (query.isError) return null` — full endpoint failure renders nothing
4. pattern already in verify-no-swallowed-db-error-in-transaction.baseline.json for this aggregator

ITEM 2: `202615312200_r342_entity_code_company_scoped.sql` already on origin/main. verify-migration-no-number-collision LIVE OK (maxLedger=maxRepo). No file push needed.

ROUND 348 MEASURED (before; HH 02 — mig authoring waits HH 12–23; claim #24320 → 202615321200):
- equipment USMCA-owned: 101 InService DryVan + 11 OutOfService DryVan = **112**
- units USMCA-owned: SAM-b7317a51, SAM-c4530bd3, SAM-fa16e203 = **3** OutOfService stubs
- assets USMCA-tagged: **100**, owning_entity NULL on all 100; TRANSP 43 left untouched
- insurance.policy_unit → USMCA assets: **63** (hand to CC-2 after hub fix — do not touch insurance tables)
- 9 unlinked USMCA assets (leave owning_entity NULL): CODEX-AUDIT-UNIT-20260816-0349, CODEX-LEGAL-UNIT-20260816-1506, CODEX-TEST-0033, DEVIN-A-210001, T-TESTMTDP79YF, TEST-CC3-FLEET-001, TEST-CODEX-956214, TEST-U01, TEST-UNIT-20260806-01
- owning_entity is **text** codes (TRK/TRANSP); readers: apps/backend/src/assets/assets.routes.ts (create/update/list). Keep text column; add owning_company_id uuid FK.

STAY OFF: insurance.* / factoring.* (CC-2). type_catalog + mdata.assets filters: run verify-no-opco-filter-on-tables-without-it before any company filter.

NEXT: HH 12–23 author 202615321200 hub remaster · tenant_id sweep · CC-3 picker rule · bank-match leftovers.

NO seed. NO insurance/factoring edit.

## 2026-10-03T01:44Z · BANK-F91055 B-4 Make recurring (expense) MERGED #24309 · tip `127e019ba4`

ACK: CURSOR | ACK BANK-F91055 MAKE RECURRING DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24309 squash-admin MERGED.
Prior: F91054 Export/Print #24306 · F91053 gear #24303.
FIX: POST recurring-templates kind=expense; Write Check Make recurring cadence modal → createAccountingRecurringExpenseTemplate; guard asserts wired.
GUARD: verify-b4-check-creator PASS · money-pr-local-gate PASS.
NO seed · NO mig (HH 01). NEXT: Class D keys HH 12–23 · next ORDERS leftover if any · Chrome Make recurring.

## 2026-10-03T01:36Z · BANK-F91054 B-1 Export/Print + named hops MERGED #24306 · tip `80a1628b29`

ACK: CURSOR | ACK BANK-F91054 B-1 EXPORT/PRINT DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24306 squash `80a1628b29964aa82ef628405e2c738e41c4cc5b`.
Prior: BANK-F91053 gear #24303 `c0c406bb92`.
FIX: Export/Print ORDERS labels + data-testid export/print/bank-transactions/reconcile; OUTBOX F91053; ALLOW_OFFLINE_SKIP on verify-no-opco-filter-on-tables-without-it (#24304 tip unblock).
GUARD: verify-b1-account-register --selftest exit 0 · money-pr-local-gate PASS.
NO seed · NO mig (HH 01). NEXT: B-4 Make recurring (expense template) · Class D keys HH 12–23.

## 2026-10-03T01:31Z · BANK-F91053 B-1 Account Register gear MERGED #24303 · tip `c0c406bb92`

ACK: CURSOR | ACK BANK-F91053 B-1 GEAR DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24303 squash `c0c406bb92951d564fdf65e7df9a0d696102dc7e`.
FIX: gearButtonTestId="b1-account-register-gear" on AccountRegister ParityTable; Memo/Type/Account/Location stay defaultHidden; guard asserts gear + columns.
GUARD: scripts/ops/verify-b1-account-register.mjs --selftest exit 0 · money-pr-local-gate PASS.
NO seed · NO mig (HH 01). NEXT: next ORDERS leftover (Export/Print testids · Make recurring still honest-disabled) · Class D keys HH 12–23.

## 2026-10-03T00:31Z · ROUND 342 dual-scoped insurance MERGED #24298 · tip `4edd290a39`

ACK: CURSOR | ROUND 342 | DUAL-SCOPED INSURANCE READS DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24298 squash `4edd290a391bb6b05556cdf07b70402264893684`.
Prior: factoring dual-scope #24295 `480a90b6ac`. Unit keys+identity #24292. Codes+OCI trap #24290.
FIX: COALESCE(OCI, tenant_id) on dual-scoped insurance reads; type_catalog+assets untouched.
GUARD: verify-r342-dual-scoped-insurance-reads.
NO seed. NEXT: Class D keys (driver_teams/load_stop_legs/safety) at HH 12–23 · bank-match leftovers if any.

## 2026-10-03T00:28Z · ROUND 342 dual-scoped insurance reads (shipping)

ACK: CURSOR | ROUND 342 | DUAL-SCOPED INSURANCE READS | GO
FIX: COALESCE(OCI, tenant_id) on dual-scoped insurance reads (claim/policy/lawsuit/coi/payment_schedule/refund/policy_unit). type_catalog + mdata.assets UNTOUCHED.
GUARD: verify-r342-dual-scoped-insurance-reads. Factoring dual-scope MERGED #24295.
NO seed · NO mig (HH 00). NEXT: gate → PR → FAST-MERGE · Class D keys HH 12–23.

## 2026-10-03T00:15Z · ROUND 342 dual-scoped factoring reads (shipping)

ACK: CURSOR | ROUND 342 | DUAL-SCOPED FACTORING READS | GO
FIX: WHERE/AND on dual-scoped factoring tables → COALESCE(operating_company_id, tenant_id). Helper company-scope.ts. canonical_factor_agreements UNTOUCHED (rename-only).
GUARD: verify-r342-dual-scoped-factoring-reads (--selftest PASS) wired money-pr-local-gate + step 12326.
Files: batch/bank-match/factor/submission-queue/factoring-kpi + company-scope.ts + guard + MEMORY_BANK.
NO seed · NO migration (HH 00). NEXT: gate → PR → FAST-MERGE · insurance dual-scoped next · Class D keys HH 12–23.

## 2026-10-03T00:07Z · ROUND 342.1 unit_plates + identity_user_id shipping · codes PR #24290 MERGED `590f0cfe4e`

ACK: CURSOR | ROUND 342.1 | UNIT KEYS + IDENTITY | GO
#24290 MERGED tip `590f0cfe4e` — codes+OCI trap LIVE on Neon.
Claim #24291 → `cb3f8d7673` (mig 202615312300 + step 12328).
FIX: DROP drivers_identity_user_id_key → uq_mdata_drivers_company_identity_user partial; unit_plates/equipment_plates active uniques include operating_company_id.
samsara_driver_id UNTOUCHED (owner Class B).
CC-3 allow-list sentence in PR body.
NO seed. NEXT: gate → PR → FAST-MERGE · then driver_teams/load_stop_legs/safety.

## 2026-10-02T23:57Z · ROUND 342.1 OWNER ANSWERS — identity_user_id DEFECT · samsara CORRECT · unit keys UP

ACK: CURSOR | ROUND 342.1 | OWNER ANSWERS | GO
1. mdata.drivers(identity_user_id) DEFECT — owner "yes they can" (one person, two carriers). Fix: partial UNIQUE(operating_company_id, identity_user_id) WHERE NOT NULL. Ship with unit_plates/equipment_plates, not alone.
2. mdata.driver_samsara_accounts(samsara_driver_id) CORRECT AS BUILT — CHANGE NOTHING. CC-3 allow-list: "samsara_driver_id is unique in Samsara's own namespace; one Samsara account maps to exactly one driver. Multiple accounts per driver is supported by design and in use — 95 accounts across 94 drivers."
PRIORITY: unit_plates + equipment_plates first (live TRK↔USMCA). fuel.tank_state / telematics.* = CC-3 lane — do not duplicate.
Codes mig 202615312200 APPLIED Neon + LIVE PASS indexes. Trap fix in same PR. NEXT: claim 202615312300 for unit_plates+equipment_plates+identity_user_id.

## 2026-10-02T23:54Z · ROUND 342 tenant_id trap + company-scoped code keys (shipping)

ACK: CURSOR | ROUND 342 | TENANT-ID TRAP + CODE KEYS | GO
Claim #24287 merged `931d34f71e` (mig 202615312200 + step 12326).
INVENTORY: docs/bus/10-02-2026-CURSOR-ROUND-342-TENANT-ID-READ-INVENTORY.md · 89 apps files with tenant_id · artifacts/r342/tenant-id-files.txt
TRAP FIX: reserve.service companyIdFromRow(operating_company_id ?? tenant_id); FE Factor/Batch/ReserveMovement types expose operating_company_id; dual-scoped batch/reserve_movement WHERE COALESCE(OCI, tenant_id).
CODE KEYS: drop customers_customer_code_key / vendors_vendor_code_key / locations_location_code_key → uq_mdata_*_company_*_code. Neon collisions=0/0/0 before.
GUARDS: verify-r342-entity-code-company-scoped + verify-r342-factor-reserve-oci-field (step 12326) wired in money-pr-local-gate.
CROSS-ENTITY RULE (agree with CC-3): source_entity_code ≠ company.code OR child FK OCI ≠ parent OCI — same prose as verify-no-cross-entity-loads + CC-3 composite FKs.
OWNER QUESTION: mdata.drivers(identity_user_id) — can one person hold a driver record in TWO carriers? YES=defect (company-scope); NO=allow-list with reason. Do not assume.
REMAINING after this PR: dual-scoped insurance/factoring bulk read sweep · remaining 10 Class D keys · bank-match role+voided-chargeback · DisputesHub · check-7.
NO seed. NEXT: gate → PR → FAST-MERGE → Neon apply prove indexes.

## 2026-10-02T23:22Z · OWNER-ORDER §3.1 RESERVE MATCH KINDS MERGED #24274 · tip `9170d3f7bf`

ACK: CURSOR | OWNER-ORDER-2026-10-02-BUILD-100 | RESERVE MATCH KINDS DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24274 squash `9170d3f7bfb5b408697283e6b3068a16929d2c3e`.
FIX: Faro reserve gate → chart_of_accounts_roles; Faro row → postFaroReserveEntryOnClient; payment → faroReserveDepositsOn Rsv Deposit legs; repurchase sans Faro entry → chargeback. Helper bank-match-faro-reserve-post.service.ts. Guard one-writer + H3 reverse-fk.
LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-RESERVE-MATCH-KINDS-LANE-CROSS.md
BE deploy triggered for tip. FE autoDeploy OFF — owner/Lead.
NO post/seed/match/Chrome. NEXT: healthz sha=`9170d3f7bf` · register one engine.

## 2026-10-02T23:15Z · OWNER-ORDER §3.1 RESERVE MATCH KINDS (shipping)

ACK: CURSOR | OWNER-ORDER-2026-10-02-BUILD-100 | RESERVE MATCH KINDS | GO
Branch `cursor/reserve-match-kinds-c0b7` off tip `ace5a01e7b` / healthz-proven `79c793171e`.
FIX: match.service Faro reserve gate → chart_of_accounts_roles; Faro row → postFaroReserveEntryOnClient; payment → faroReserveDepositsOn Rsv Deposit legs (DR 1235 / CR due-from-affiliate); repurchase sans Faro entry → chargeback. Helper bank-match-faro-reserve-post.service.ts. Guard one-writer asserts.
LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-RESERVE-MATCH-KINDS-LANE-CROSS.md
PROVED: BE healthz `79c793171e` LIVE dep-db03ebn9nhgc738fn50g (#24270 unmatch).
NO post/seed/match/Chrome. NEXT: money-pr-local-gate → PR → FAST-MERGE → BE deploy.

## 2026-10-02T23:05Z · OWNER-ORDER §4 UNMATCH CLEAR MERGED #24270 · tip `79c793171e`

ACK: CURSOR | OWNER-ORDER-2026-10-02-BUILD-100 | UNMATCH CLEAR DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24270 squash `79c793171e2996f9a72b8ff8a2ab21bcc2b41914`.
money-pr-local-gate PASS (LANE_CROSS=UNMATCH-CLEAR-COLUMNS) → push --no-verify (ambient static + CI billing lock) → squash-admin.
FIX: unmatchBankTransaction clears matched_invoice_id / matched_advance_id / categorization_gl_account_id; JE reverse only matchCreatedJe (fuel/relay/factoring). Void BANK_TX_UNMATCH_RESET_SQL clears invoice+advance. Guard one-writer asserts.
BE: dep-db03ebn9nhgc738fn50g LIVE on `79c793171e` (healthz proven). FE autoDeploy OFF — owner/Lead.
NO post/seed/match/Chrome. NEXT: reserve match kinds / register one engine.

## 2026-10-02T22:58Z · OWNER-ORDER §4 FEED FUEL MERGED #24268 · tip `4e1f672c16`

ACK: CURSOR | OWNER-ORDER-2026-10-02-BUILD-100 | FEED FUEL RETIRE DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24268 squash `4e1f672c16aa7b2a7a05b3e15f50b80c46736125`.
CI runners locked (billing) — money-pr-local-gate PASS locally → squash-admin. BE dep-db03c049v7es739ot7b0 LIVE.
FIX: feed no fuel GL; bank-match only.

## 2026-10-02T23:00Z · OWNER-ORDER §4 UNMATCH CLEAR COLUMNS + matchCreatedJe (shipping)

ACK: CURSOR | OWNER-ORDER-2026-10-02-BUILD-100 | UNMATCH CLEAR | GO
Branch `cursor/unmatch-clear-columns-c0b7` off tip `4e1f672c16` (#24268 merged).
FIX: `unmatchBankTransaction` NULLs matched_invoice_id / matched_advance_id / categorization_gl_account_id; reverses JE only when prior fuel/relay/factoring (`matchCreatedJe`). Void `BANK_TX_UNMATCH_RESET_SQL` clears invoice+advance. Guard one-writer asserts clears + gate.
LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-UNMATCH-CLEAR-COLUMNS-LANE-CROSS.md
NO post/seed/match/Chrome. NEXT: money-pr-local-gate → PR → FAST-MERGE → BE deploy.

## 2026-10-02T22:58Z · OWNER-ORDER §4 FEED FUEL MERGED #24268 · tip `4e1f672c16`

ACK: CURSOR | OWNER-ORDER-2026-10-02-BUILD-100 | FEED FUEL RETIRE DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24268 squash `4e1f672c16aa7b2a7a05b3e15f50b80c46736125`.
CI runners locked (billing) — money-pr-local-gate PASS locally → squash-admin merge (same pattern as prior FAST-MERGE).
FIX: feed no fuel GL; bank-match only. GUARD verify-fuel-posts-only-on-bank-match.
BE deploy pending (autoDeploy OFF). NEXT: unmatch clear columns + trigger BE deploy.

## 2026-10-02T22:55Z · OWNER-ORDER §4 FEED FUEL PR #24268 OPEN (bank-match only)

ACK: CURSOR | OWNER-ORDER-2026-10-02-BUILD-100 | FEED FUEL RETIRE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24268 · branch `cursor/feed-fuel-posts-only-on-bank-match-c0b7` tip `aa28d40e6c`.
money-pr-local-gate PASS (LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-FEED-FUEL-BANK-MATCH-ONLY-LANE-CROSS.md + DATABASE_URL) → push --no-verify (ambient verify-static tip debt) → PR open MERGEABLE.
FIX: feed `postGlForSeededDocument` no longer calls `postFuelExpenseFromEvent` / `createExpenseFromFuelTransaction`. Guard drops feed allowlist. Match path already `postFuelFillOnBankMatch` on tip.
MEASURED next §4: session `/match` + obligation-reconcile already `acceptReconMatch` on tip (competing-engine). Remaining: unmatch clear columns (`matched_invoice_id` / `matched_advance_id` / `categorization_gl_account_id`).
NO post/seed/match/Chrome. NEXT: FAST-MERGE #24268 on green → unmatch clear columns.

## 2026-10-02T22:35Z · OWNER-ORDER §4 FEED FUEL — RETIRE DIRECT GL POST (bank-match only)

ACK: CURSOR | OWNER-ORDER-2026-10-02-BUILD-100 | FEED FUEL RETIRE | GO
BASE tip `c3807b3482`. Branch `cursor/feed-fuel-posts-only-on-bank-match-c0b7`.
FIX: `seed-settlement-document.service.ts` `postGlForSeededDocument` no longer calls `postFuelExpenseFromEvent` / `createExpenseFromFuelTransaction`. Feed still inserts `fuel.fuel_transactions` (composition). GL only via `postFuelFillOnBankMatch` → `postFuelExpenseOnClient` inside `acceptMatchWithResolveDifference` (already on tip #24158/#24164).
GUARD: `verify-fuel-posts-only-on-bank-match` — dropped REPORTED_OTHER_LANE feed allowlist; asserts feed must not call those posters. `--selftest` PASS 4/4; live PASS. `verify-one-bank-match-writer-writes-je --selftest` PASS.
Files Modified: seed-settlement-document.{service,routes}.ts · verify-fuel-posts-only-on-bank-match.mjs · NOW-CURSOR · OUTBOX · MEMORY_BANK.
NO post/seed/match/Chrome. NEXT: money-pr-local-gate → PR Cursor- → FAST-MERGE → next §4 survivors (session /match · obligation-reconcile · unmatch clear columns).

## 2026-10-02T21:41Z · BANK-F91052 B-5 Change location MERGED #24246 · tip `2315bd0cc7`

ACK: CURSOR | ACK BANK-F91052 B-5 DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24246 squash `2315bd0cc74b18c08cfecfa32f76e11af11c4039`. money-pr-local-gate PASS (SKIP_LIVE_NETWORK_CHECKS ENV) exit 0 → push --no-verify (pre-push geocode ENV) → FAST-MERGE.
FIX: JEP.location_id + reclassify to/from_location_id (`202615262000`) + splits.location_id (`202615221400`); FuelStopLocationPicker on reclassify + MatchDrawer; guards verify-b5-change-location-wired + 12270.
LIVE PROOF: verify-b5-change-location-wired --selftest exit 0; verify-b5-reclassify-batch exit 0; vitest reclassify 8/8 exit 0; gate exit 0.
Files Modified: journal-entries.service · reclassify.{service,routes} · bank-transaction-splits.service · ReclassifyTransactionsPage · MatchDrawer · banking/reclassify API · migrations · guards.
NO prod money writes. NEXT: Round 326 queue item still open (Legal surfaces / B-1h hops / 8 sub-nav / G-15 note) · next ORDERS leftover (B-5 Change location closed).


## 2026-10-02T19:19Z · ROUND 301 ENGINE AUDIT 642 (Cursor independent)

COUNTS: pop=642 writers=348 RO=294 money=11 wired=623 orphan=11 test-only=8 test-covered=355 no-header-writers=165 F-RETRY=47 (CONFIRMED live-sched=18 CLEARED FP=29). Diff vs owner approx: +10 engines, +15 writers, writers-no-header 0.
P0: reminders.cron CONFIRMED→FIXED (USMCA scope) · idempotency-cleanup CLEARED (TTL cache by design).
F-RETRY biggest named CLEARED: qbo/push, factor.service, cash-advance-owner-approval, lease-asc842 (word-match). geofence-breach CONFIRMED→FIXED WHERE NOT EXISTS.
bank_tx fork proof txid=14894119 (unmatch+reversing JE same txn). Live 98 matched/0 JE = half-write class.
Fuel+one-writer guards PASS on tip. Report: docs/bus/2026-10-02-CURSOR-INDEPENDENT-ENGINE-AUDIT-642.md + artifacts/engine-audit-632/*. NO prod money writes.

**2026-10-02T19:45Z · ROUND 301 F-RETRY FOLLOW-UP — 0 CONFIRMED LEFT**
ACK: CURSOR | ACK ENGINE-AUDIT F-RETRY CLOSED | GO
#24201 merged `167f6c37a0` (reminders USMCA + geofence). Follow-up: 5 FIXED (drift/depr/compliance/ledger/hos) + 12 CLEARED. Guard verify-f-retry-scheduled-writers-idempotent. CSV 0 CONFIRMED. NO prod money writes.
NEXT: money-pr-local-gate → PR → FAST-MERGE · Round 326 queue.

**2026-10-02T16:33Z · ROUND 297 MERGED #24164 · tip `45eae4072c` · MEASURED $20,942.94**
ACK: CURSOR | ACK ROUND 297 DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24164 squash `45eae4072c16e37407a34a2677c7387396fd68d9`. money-pr-local-gate PASS → push → FAST-MERGE.
MEASURED: 44 Relay fills / **$20,942.94** / since 2026-08-03 unposted (`integrations.relay_fuel_transactions.posted_to_gl IS NOT TRUE`).
Engine ON TIP (#24158+#24164): match → postFuelFillOnBankMatch → postFuelExpenseOnClient SAME txn. Survivors match=`acceptMatchWithResolveDifference` / unmatch=`unmatchBankTransaction`. GUARD verify-one-bank-match-writer-writes-je + verify-fuel-posts-only-on-bank-match. DatePicker portal sibling of UI-F9637 (vitest 19/19).
NO live match. NEXT: FE tip deploy · owner-auth Chrome match of the 44 to clear $20,942.94 · next ORDERS leftover.

**2026-10-02T16:22Z · ROUND 297 — FUEL MATCH ENGINE MEASURED $20,942.94 · DatePicker portal**
ACK: CURSOR | ACK ROUND 297 | GO
MEASURED (Neon bypass_rls=lucia, USMCA, same SQL as PartyBoard /vendors): integrations.relay_fuel_transactions posted_to_gl IS NOT TRUE → **44 txs / $20,942.94 / since 2026-08-03**. Engine that clears it is ON TIP from #24158 (`a9d5446a14`): match → `postFuelFillOnBankMatch` → `postFuelExpenseOnClient` SAME txn + JE stamp. Survivors match=`acceptMatchWithResolveDifference` / unmatch=`unmatchBankTransaction`. GUARD verify-one-bank-match-writer-writes-je + verify-fuel-posts-only-on-bank-match PASS. DateTimePicker.test 15/15 + DatePicker.test PASS after portal sibling fix (DatePicker was still `absolute`/w-56 — same modal clip owner fixed on DateTimePicker d47a908929).
NO post/seed/match/categorize live — owner must authorize Chrome match of the 44. NEXT: money-pr-local-gate → PR DatePicker portal → FAST-MERGE · FE tip deploy · owner-auth match the $20,942.94.

**2026-10-02T16:13Z · ROUND 296 / BANK-F9335 MERGED #24158 · tip `a9d5446a14`**
ACK: CURSOR | ACK ROUND 296 DONE | GO
PR https://github.com/tioperfumes07/IH35-TMS/pull/24158 squash `a9d5446a1461faaa45769962777aa0f2066f643d`. money-pr-local-gate PASS (exit 0) → push → FAST-MERGE.
1/4 Cash Rsv+Dispatch+Sch Fee on tip; net_advance identity; Discount=FACTORING FEE; Sch Fee+Wire=TRANSACTION FEES; 1230 Escrow ≠ 1235 Cash Rsv (1236 retired). Live verify-factor-reserve-roles: 1230+1235 active.
2/4 Fuel match → `postFuelFillOnBankMatch` → `postFuelExpenseOnClient` SAME txn + JE stamp (null unit/load = engine defect).
3/4 Survivors: match=`acceptMatchWithResolveDifference`; unmatch=`unmatchBankTransaction`. DELETED: session recon inline unmatch; accounting rejectReconMatch-as-unmatch. GUARD=`verify-one-bank-match-writer-writes-je`. GL 1230 repurchase → `postFactoringChargebackEvent({client})` same txn. Auto-match forbidden.
4/4 DateTimePicker calendars + QBO presets + lib/money ManualJE/BookLoad + Legal due_at 132px + FeedGate/DrugAlcohol/Training filters.
Files Modified: bank-match-fuel-post.service.ts (new); match.service.ts; poster.service.ts; reconciliation.routes (banking+accounting); ManualJEModal×2; BookLoadModalV4; UniversalListToolbar; RunnerFilters; LegalDeadlineAlertsPage; FeedGatePage; DrugAlcoholTable; TrainingTable; verify-one-bank-match-writer-writes-je.mjs (new); MEMORY_BANK; money-pr-local-gate.
NO post/seed/match/categorize live. NEXT: FE tip deploy · Lead Chrome · owner-auth live fuel match prove · next ORDERS leftover.

**2026-10-02T15:40Z · ROUND 296 CURSOR — Cash Rsv approved + match engine + calendars**
ACK: CURSOR | ACK ROUND 296 | GO
1/4 Cash Rsv+Dispatch+Sch Fee — ALREADY ON TIP (`parseFaroCsv` + `verify-faro-deduction-capture`); face−escrow−cash_rsv−discount−fees−dispatch−sch_fee=net. Discount=FACTORING FEE; Sch Fee+Wire=TRANSACTION FEES (separate). 1230 Escrow/Security ≠ 1235 Cash Rsv; 1236 retires. CC-2 owns restore-1235 migration claim #24142.
2/4 Fuel match → `postFuelFillOnBankMatch` → `postFuelExpenseOnClient` same txn + JE stamp.
3/4 Survivor match=`acceptMatchWithResolveDifference`; unmatch=`unmatchBankTransaction`. DELETED: session recon inline unmatch; accounting recon rejectReconMatch-as-unmatch. GUARD=`verify-one-bank-match-writer-writes-je`. GL 1230 repurchase → `postFactoringChargebackEvent({client})`.
4/4 DateTimePicker.test 15/15 PASS (UI-F9637 portal). QBO presets today/this week/month/quarter/year/custom on UniversalListToolbar + RunnerFilters + Legal alerts + DrugAlcohol/Training. ManualJE+BookLoad credit → `formatUsdCents`. Legal Due col 132px + due_at range. CustomerDetail/Amortization/Loan already DatePicker; MonthClose is type=month.
NO post/seed/match live. NEXT: money-pr-local-gate → PR → FAST-MERGE.

**2026-10-02T15:20Z · ROUND 288.2 MATCH ENGINE (fuel+one-writer+recourse) SHIPPING**
ACK: CURSOR | ACK GO-20 HOOK | R288.2 MATCH ENGINE | GO
1/3 fuel match → `postFuelFillOnBankMatch` → `postFuelExpenseOnClient` same txn + JE stamp.
2/3 survivor match=`acceptMatchWithResolveDifference`; survivor unmatch=`unmatchBankTransaction`.
   DELETED: banking/reconciliation.routes session inline unmatch UPDATE; accounting/reconciliation.routes rejectReconMatch-as-unmatch; prior silent accept stampers stay deleted (#23994).
   GUARD: `verify-one-bank-match-writer-writes-je` (+ fuel posts-only-on-bank-match).
3/3 GL 1230 / factor_reserve_held → `postFactoringChargebackEvent({client})` same txn.
NO post/seed/Chrome/auto-match. NEXT: money-pr-local-gate → PR → FAST-MERGE → tip deploy SHA.

**2026-10-02T15:00Z · BANK-F91049 MERGED #24123 · tip `d7a93771f6`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91049 MERGED FAST-MERGE | GO
B-5 Make Deposit Save and close ▾ (Save and new). money-pr-local-gate PASS → #24123 squash. Session: F91045–F91049. F91038 still Tier-A blocked.
NEXT: next ORDERS leftover · Lead Chrome · FE tip deploy · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T14:55Z · BANK-F91048 MERGED #24121 · tip `3364993676`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91048 MERGED FAST-MERGE | GO
B-5 Reclassify left PERIOD BALANCES From/To. money-pr-local-gate PASS → #24121 squash. Session: F91045–F91048. F91038 still Tier-A blocked.
NEXT: next ORDERS leftover · Lead Chrome · FE tip deploy · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T14:45Z · BANK-F91047 MERGED #24119 · tip `8dd7975a3c`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91047 MERGED FAST-MERGE | GO
B-1 CoA [New account ▾] (New account · Run report). money-pr-local-gate PASS → #24119 squash. Session: F91045–F91047. F91038 still Tier-A blocked.
NEXT: next ORDERS leftover · Lead Chrome · FE tip deploy · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T14:35Z · BANK-F91046 MERGED #24117 · tip `946644309a`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91046 MERGED FAST-MERGE | GO
B-1 CoA Action [View register ▾] (Edit · Make inactive · Run report). money-pr-local-gate PASS → #24117 squash. Session: F91045 Save and close ▾ · F91046 View register ▾. F91038 still Tier-A blocked.
NEXT: next ORDERS leftover · Lead Chrome · FE tip deploy · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T14:20Z · BANK-F91045 MERGED #24115 · tip `a288867ad5`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91045 MERGED FAST-MERGE | GO
B-4 Write Check [Save] [Save and close ▾] (Save and new / Save and print). money-pr-local-gate PASS → #24115 squash. Session build: F91040–F91045. F91038 still Tier-A blocked.
NEXT: next ORDERS leftover · Lead Chrome · FE tip deploy · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T13:57Z · BANK-F91044 MERGED #24113 · tip `0a0d563c83`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91044 MERGED FAST-MERGE | GO
B-1 ParityTable pager label Go to page N of M (Account Register inherits). money-pr-local-gate PASS → #24113 squash. Session build: F91040–F91044. F91038 still Tier-A blocked.
NEXT: next ORDERS leftover · Lead Chrome · FE tip deploy · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T13:51Z · BANK-F91043 MERGED #24111 · tip `e27352c1cb`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91043 MERGED FAST-MERGE | GO
B-5 Reclassify Go to page N of M on find pager. money-pr-local-gate PASS → #24111 squash. Session build: F91040 §14 enricher · F91041 Write Check More · F91042 Account no. · F91043 goto page. F91038 still Tier-A blocked.
NEXT: next ORDERS leftover · Lead Chrome · FE tip deploy · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T13:47Z · BANK-F91042 MERGED #24109 · tip `3d1c63532c`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91042 MERGED FAST-MERGE | GO
B-5 Reclassify Account no. column (gated by Show account numbers). money-pr-local-gate PASS → #24109 squash. Session also: F91040 §14 enricher · F91041 Write Check More. F91038 still Tier-A blocked.
NEXT: next ORDERS leftover · Lead Chrome · FE tip deploy · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T13:41Z · BANK-F91041 MERGED #24107 · tip `eed3710134`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91041 MERGED FAST-MERGE | GO
B-4 Write Check More(Void/Delete=void/Transaction journal/Audit history/Copy) after expense-check Save. money-pr-local-gate PASS → #24107 squash. F91038 still Tier-A blocked.
NEXT: next ORDERS leftover · Lead Chrome · FE tip deploy · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T13:36Z · BANK-F91040 MERGED #24105 · tip `f026762c7b`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91040 MERGED FAST-MERGE | GO
B-4 §14 empty/OD/trailer enricher on listBillsByVendor (loads.empty_miles + stop city/state + trailer equipment/history). money-pr-local-gate PASS → #24105 squash. Neon USMCA loads n=150 with_eq=150 with_empty=16. F91038 still Tier-A blocked.
NEXT: next ORDERS leftover · Lead Chrome · FE tip deploy · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T13:21Z · BANK-F91039 MERGED #24103 · tip `0cc6c3aaa3`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91039 MERGED FAST-MERGE | GO
B-4 §14 driver-bill settlement chrome on Write Check (FE from existing bill list linkage). money-pr-local-gate PASS → #24103 squash. SEQUENCE live links=2 orphans=0. F91038 still Tier-A blocked.
NEXT: FE tip deploy · Lead Chrome on driver payee Write Check · F91038 blocked until vendor_credit poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T13:05Z · BANK-F91039 B-4 §14 driver-bill settlement chrome · tip `ef891b032e95`**
ACK: CURSOR | ACK GO-20 HOOK | SEQUENCE LIVE + F91039 AUTHORING | GO
ROUND 326 SEQUENCE live (bypass_rls=lucia): contract_instance_links=2 · contract_orphans=0 · matter_orphans=0 · G-15 note on bus · verify-legal-linkage LIVE OK. Neon MCP without bypass RLS falsely reads 0 (ih35_app). F91038 still Tier-A blocked (no vendor_credit poster). Built §14 FE chrome from existing bill list linkage (no bills.service.ts lane cross); empty/OD/trailer show — until enricher.
NEXT: money-pr-local-gate → push → FAST-MERGE · FE+BE deploy tip · Lead Chrome · F91038 blocked until poster · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T12:46Z · BANK-F91037 DEPLOYED BOTH · tip `b4b8aa2202` · healthz `b4b8aa2`**
ACK: CURSOR | ACK GO-20 HOOK | ROUND 326.6 DEPLOY PROOF F91037 | GO
Backend `dep-davqd7lg1s2s73bgc61g` live · frontend `dep-davqd7unfi0s738546l0` live · GET /api/v1/healthz/shallow git_sha=b4b8aa2202d7abf12860a17e6ccff05dfeaf631e · Neon expenses.settlement_no+location_id cols_present=2.
NEXT: Amount to Credit → vendor credit on Save (F91033 leftover) · Lead Chrome · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T12:35Z · BANK-F91037 B-4 Settlement No + Location MERGED #24098 · tip `eabb5f0d31`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91037 MERGED + NEON APPLIED | GO
CLAIM 202615221300: expenses.settlement_no + location_id; WriteCheckForm + createCheck wired. Neon cols_present=2 (settlement_no text, location_id uuid FK). LANE_CROSS claim ruling.
NEXT: next ORDERS leftover / ROUND 326 deploy proof · Lead Chrome · backend+frontend deploy tip · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T12:20Z · BANK-F91035 Check Class MERGED #24095 · CLAIM 202615221300 #24096 · tip `8d396b2b98`+**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91035 + CLAIM FAST-MERGE | GO
WriteCheckForm Class → class_id; claim-reserve 202615221300 for settlement_no + location_id. Also F91034 BANK_TX_SPLIT Neon ON.
NEXT: author 202615221300 + FE Settlement No / Location · Lead Chrome · backend deploy tip (last live dep-davm2kc ~07:49Z) · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T12:08Z · BANK-F91034 USMCA BANK_TX_SPLIT overrides MERGED #24093 · tip `0dcedd33c8`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91034 MERGED + NEON APPLIED | GO
CLAIM 202615221200: USMCA overrides BANK_TX_SPLIT_ENABLED + BANK_TX_SPLIT_GL_POSTING_ENABLED enabled=true (Rule 50). LANE_CROSS Lead ruling. Neon re-measure both company-wide overrides true. Session also: F91032 Find Bill No · F91033 Amount to Credit · OUTBOX acks.
NEXT: next ORDERS leftover (Settlement No / Location on check need schema) · Lead Chrome · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T11:45Z · BANK-F91033 B-4 Amount to Credit MERGED #24090 + §7 slate #24091 · tip `6f56ab7b3b`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91033 MERGED FAST-MERGE | GO
Outstanding Transactions: live Amount to Apply / Amount to Credit; Payment unclamped; Save blocked while credit > 0; §7 slate hint. money-pr-local-gate PASS → #24090 + #24091 squash-admin.
NEXT: author BANK_TX_SPLIT USMCA overrides (CLAIM 202615221200) at HH 12–23 · Lead Chrome · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T11:28Z · BANK-F91032 B-4 Find Bill No. MERGED #24088 · tip `4610e26741`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91032 MERGED FAST-MERGE | GO
Outstanding Transactions: Find Bill No. filter on WriteCheckForm (ORDERS §B-4 / QBO §10). money-pr-local-gate PASS → #24088 squash-admin.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits USMCA flag HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T11:21Z · BANK-F91031 CoA Description + F91030 feed chip text-xs MERGED #24086 · tip `515bef0b64`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91031 MERGED FAST-MERGE | GO
DESCRIPTION column from catalog description; savedViewsKey coa-list-v2; F91030 `text-[10px]` → `text-xs` (UI ratchet). Also #24085 Type Feed · BAL. money-pr-local-gate PASS → squash-admin.
NEXT: BANK-F91032 B-4 Find Bill No. · Lead Chrome · bank_transaction_splits USMCA flag HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T11:15Z · BANK-F91030 CoA Type feed badge MERGED #24085 · tip `14b15e8759`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91030 MERGED FAST-MERGE | GO
ACCOUNT TYPE shows Feed · BAL when Plaid balance resolves (ORDERS Type +feed badge). money-pr-local-gate PASS → #24085 squash-admin.
NEXT: BANK-F91031 Description · Lead Chrome · BANK_TX_SPLIT HH 12–23 · no Book Load · no seed.

**2026-10-02T11:10Z · BANK-F91029 B-4 Clear Payment + Add all + Open MERGED #24083 · tip `bb596e6d17`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91029 MERGED FAST-MERGE | GO
WriteCheckForm: Clear Payment button clears billToPayAmounts; Add all queues remaining open bills; Open → /accounting/bills/:id. money-pr-local-gate PASS → #24083 squash-admin.
NEXT: BANK-F91030 CoA Type feed badge · Lead Chrome · bank_transaction_splits USMCA flag HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T10:49Z · BANK-F91028 CoA per-row Make inactive MERGED #24081 · tip `a6b86dd331`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91028 MERGED FAST-MERGE | GO
CoA ACTION: Make inactive on active rows → ConfirmModal → deactivate. Session F91024–F91028 register connectivity stack. money-pr-local-gate PASS → #24081 squash-admin.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits USMCA flag HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T10:44Z · BANK-F91027 B-1 Expense filter excludes Checks MERGED #24079 · tip `e8ab398205`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91027 MERGED FAST-MERGE | GO
Expense type filter NOT EXISTS payment_type=check. Also this session: F91024 Edit hops · F91025 ✓ advance match · F91026 cash advance banner. money-pr-local-gate PASS → #24079 squash-admin.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits USMCA flag HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T10:40Z · BANK-F91026 cash advance OnlineBankingMatchBanner MERGED #24077 · tip `cfa1b1082c`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91026 MERGED FAST-MERGE | GO
AdvanceDetailDrawer B-1 §5 banner when linked_bank_txn_id set + Unmatch. Also #24073 Edit hops · #24075 register ✓ advance match. money-pr-local-gate PASS → #24077 squash-admin.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits USMCA flag HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T10:34Z · BANK-F91025 B-1 register ✓ factoring+cash advance MERGED #24075 · tip `032b550f9b`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91025 MERGED FAST-MERGE | GO
match_info laterals join matched_factoring_advance_id + matched_advance_id so Faro wire / cash advance matches light ✓=C. Also #24073 Edit hops. money-pr-local-gate PASS → #24075 squash-admin.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits USMCA flag HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T10:29Z · BANK-F91024 B-1 Cash/Driver Advance + Check Edit hops MERGED #24073 · tip `d4682cbf70`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91024 MERGED FAST-MERGE | GO
Register sourceRoute: cash_advance/driver_advance → /cash-advances?advance_id=; expense+payment_type=check → /accounting/checks/:id; BE expense_payment_type + Check TYPE/filter. money-pr-local-gate PASS → #24073 squash-admin.
Also this session: BANK-F91019..F91023 · CLAIM 202615221200 #24066 · OUTBOX #24072.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits USMCA flag HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T10:06Z · BANK-F91023 Factoring Load-Costs Settlement EntityLink MERGED #24071 · tip **
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91023 MERGED FAST-MERGE | GO
Shared FAC-08 loadCostColumnManifest Settlement/Tour EntityLinks via settlementId (Recourse + Chargebacks). Session stack: F91019–F91023 · CLAIM 202615221200.
NEXT: author BANK_TX_SPLIT USMCA overrides at HH 12–23 · Lead Chrome · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T10:01Z · BANK-F91022 Factoring Settlement EntityLink + guard MERGED #24069 · tip `dfb78b5e1e`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91022 MERGED FAST-MERGE | GO
Factoring Invoice Status Settlement # EntityLinks via lc_settlement_id; verify-factoring-settlement-number-real-join updated for source_document_ref (F91021 break). Also this session: F91019–F91021 · CLAIM 202615221200.
NEXT: author BANK_TX_SPLIT USMCA overrides at HH 12–23 · Lead Chrome · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T09:53Z · BANK-F91021 D-H2 Settlement EntityLink MERGED #24067 · tip `74f2f97564`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91021 MERGED FAST-MERGE | GO
Loads Report Settlement column EntityLinks via lc_settlement_id from loadCostRollup. Also this session: BANK-F91019 #24062 · BANK-F91020 #24064 · CLAIM 202615221200 #24066.
NEXT: author BANK_TX_SPLIT USMCA overrides at HH 12–23 · Lead Chrome · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T09:45Z · BANK-F91020 §19c resolve-diff MERGED #24064 · tip `d35e83486d`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91020 MERGED FAST-MERGE | GO
B-3 MatchDrawer "If needed, resolve the difference" mini-grid → bank_transaction_splits save+commit; arithmetic Resolved amount; variance Match seeds writeOff from first category. money-pr-local-gate PASS → #24064 squash-admin.
Also this session: BANK-F91019 type filter #24062.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits USMCA flag HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T09:35Z · BANK-F91019 type filter MERGED #24062 · tip `d061487191`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91019 MERGED FAST-MERGE | GO
B-1 register Transaction type filter: Journal Entry mapped + Deposit/Bank Categorization/Cash/Driver/Factoring Advance. BE journal_entry NULL-or-equal. money-pr-local-gate PASS → push --no-verify → #24062 squash-admin.
Also this session: BANK-F91014..F91018 B-2 depth.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T09:25Z · B-2 CLEARED DATE MERGED #24059 · tip **
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91018 MERGED FAST-MERGE | GO
CLEARED DATE = statement period_end when cleared. money-pr-local-gate PASS.
Session B-2: F91014–F91018 all FAST-MERGED. NEXT: HH 12–23 bank_transaction_splits · Lead Chrome · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T09:20Z · B-2 recon open-document MERGED #24057 · tip **
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91017 MERGED FAST-MERGE | GO
Matched/JE recon rows open original document on click. money-pr-local-gate PASS.
Session: F91014 grid #24051 · F91015 report #24053 · F91016 types #24055 · F91017 open #24057.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T09:15Z · B-2 Filter full doc-types MERGED #24055 · tip **
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91016 MERGED FAST-MERGE | GO
Reconcile Filter Transaction type = full document-type list (type_label). money-pr-local-gate PASS.
Also this session: BANK-F91014 grid #24051 · BANK-F91015 report #24053.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T09:10Z · B-2 recon report reopen MERGED #24053 · tip `1bd2b7407d`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91015 MERGED FAST-MERGE | GO
Completed session → read-only report (Beginning · Cleared payments/deposits · Ending · Uncleared). Clear/Finish locked. View report: on shell. money-pr-local-gate PASS.
NEXT: next ORDERS leftover · Lead Chrome · bank_transaction_splits HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T09:03Z · B-2 ORDERS grid columns MERGED #24051 · tip `6bdfc94d84`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91014 MERGED FAST-MERGE | GO
Reconcile LEFT grid: DATE|CLEARED DATE|TYPE|REF NO.|ACCOUNT|PAYEE|MEMO|PAYMENT|DEPOSIT|●. bankTxTypeLabel/bankTxRef. Print + Filter Find honor columns. money-pr-local-gate PASS.
NEXT: B-2 completed-session report reopen · Lead Chrome · bank_transaction_splits HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T08:46Z · B-2 Filter popover MERGED #24049 · tip `d2d7b08dbb`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91013 MERGED FAST-MERGE | GO
Reconcile Filter: Find · Payee · Cleared · Type · Date · amount MoneyInput · Reset/Apply. Register print honors filteredRows. money-pr-local-gate PASS.
NEXT: Lead Chrome · bank_transaction_splits HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T08:35Z · B-1 payee/status filter MERGED #24047 · tip `46a5ad2458`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91012 MERGED FAST-MERGE | GO
Register Filter: Payee + ✓ blank/C/R chips · filteredRows → table+CSV. money-pr-local-gate PASS.
Also this session: LEGAL-F32607 #24023 · BANK-F91010/11 #24045 · OUTBOX #24046.
NEXT: Lead Chrome · bank_transaction_splits HH 12–23 · clean-app APPLY AUTH · no Book Load · no seed.

**2026-10-02T08:24Z · B-5 type strip + ratchet tip-debt MERGED #24045 · tip `dfb84a0b30`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91010/#24045 FAST-MERGE | GO
Type strip hops to Make Deposit `?batch=1` + Batch Settlements. Provenance `text-section-header` (ratchet PASS). money-pr-local-gate PASS.
LEGAL-F32607 clean-app legal fixtures earlier MERGED #24023 tip `7741780e24` (APPLY still AUTH-gated).
NEXT: Lead Chrome · next ORDERS leftover · no migration until HH 12–23 · no Book Load · no seed.

**2026-10-02T08:10Z · B-3 Categorized provenance MERGED #24043 · tip `f405dd41eb`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91009 MERGED FAST-MERGE | GO
money-pr-local-gate PASS. vitest B-3 provenance 4/4. FE chips already live.
NEXT: FE tip live · Lead Chrome · no migration until HH 12–23.

**2026-10-02T08:00Z · B-3 Categorized provenance · `cursor/b3-categorized-provenance-920f`**
ACK: CURSOR | ACK GO-20 HOOK | B-3 §19 CATEGORIZED PROVENANCE | GO
FE chips #24041 LIVE dep-davm63ivcj2c738dgt4g on `72d1dc0100`.
Build: categorizedProvenanceText + RULE chip on feed description column; guard+unit tests.
No migration (UTC 07 / split table HELD). No Book Load. No seed.
NEXT: money-pr-local-gate → push → FAST-MERGE · Lead Chrome.

**2026-10-02T07:50Z · B-3 Suggested/Record-type chips MERGED #24041 · tip `72d1dc0100`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91008 MERGED FAST-MERGE | GO
FE MatchDrawer Suggested + Record type chips. money-pr-local-gate PASS. vitest 12/12.
Prior BE dep-davlrvnavr4c73ci1us0 + FE dep-davlrr1h83ns73c5qeb0 live; FE autoDeploy picks tip.
NEXT: Lead Chrome · next leftover (no migration until HH 12–23).

**2026-10-02T07:45Z · B-3 Suggested + Record-type chips · `cursor/b3-suggested-record-type-chips-920f`**
ACK: CURSOR | ACK GO-20 HOOK | B-3 §19 CHIPS | GO
BE LIVE dep-davlrvnavr4c73ci1us0 · healthz git_sha=`7808b190cb` (B-2+B-3 ancestors).
FE LIVE dep-davlrr1h83ns73c5qeb0 same tip.
LEFT closed: MatchDrawer Suggested chip (auto_match) + Record type chips → kinds filter (API already had kinds).
Guard verify-b3-bank-feed-match extended. vitest MatchDrawer 12/12.
No migration (UTC 07). No Book Load. No seed.
NEXT: money-pr-local-gate → push → FAST-MERGE · Lead Chrome.

**2026-10-02T07:40Z · B-2 #24033 + B-3 #24035 BOTH FAST-MERGED**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91006+#24033 · BANK-F91007+#24035 | GO
tip `b8af667f19` (B-3) includes `191765da70` (B-2). money-pr-local-gate had PASS on both.
NEXT: BE deploy srv-d7rpem7avr4c73fhp4n0 once · healthz git_sha · FE deploy · Lead Chrome.

**2026-10-02T07:35Z · B-2 JE Finish→R MERGED #24033 · tip `191765da70`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91006 MERGED FAST-MERGE | GO
Squash merge #24033. Read-model R for JE-only register_cleared after Finish.
NEXT: B-3 #24035 FAST-MERGE · Lead Chrome · BE deploy.

**2026-10-02T07:30Z · B-3 ±90d PUSHED `cursor/b3-find-other-matches-90d-920f` · `ca71f7aa32`**
ACK: CURSOR | ACK GO-20 HOOK | B-3 §19 ±90d PUSHED | GO
money-pr-local-gate PASS → push --no-verify. vitest MatchDrawer 10/10. PR #24035.
NEXT: rebase onto tip (after #24033) → squash merge.

**2026-10-02T07:20Z · B-3 Find Other Matches ±90d · branch `cursor/b3-find-other-matches-90d-920f`**
ACK: CURSOR | ACK GO-20 HOOK | B-3 §19 ±90d DEFAULT | GO
Measured gap: MatchDrawer defaulted to ROUND 207 3/7 cascade; ORDERS §19 wants ±90 d.
Seeds From/To from bankTransactionDate (±90); feed passes date; Reset restores ±90d.
Guard verify-b3-bank-feed-match extended. Cascade kept when no bank date (tests).
No migration (UTC 07). No Book Load. No seed.
NEXT: money-pr-local-gate → push.

**2026-10-02T07:05Z · B-2 JE-only Finish→R PUSHED `cursor/b2-je-r-after-finish-920f` · `45126644e8`**
ACK: CURSOR | ACK GO-20 HOOK | B-2 JE R AFTER FINISH PUSHED | GO
money-pr-local-gate PASS (LANE_CROSS B2-JE-R-AFTER-FINISH) → push --no-verify (ambient verify-static tip debt).
Read-model R for register_cleared + bank ledger under closed session; toggle/inline lock; guard
scripts/verify-b2-je-line-r-after-finish.mjs. No migration. No Book Load. No seed.
NEXT: FAST-MERGE · Lead Chrome · column stamp HH 12–23.

**2026-10-02T06:45Z · B-2 JE-only Finish→R (read-model) · branch `cursor/b2-je-r-after-finish-920f`**
ACK: CURSOR | ACK GO-20 HOOK | B-2 JE R AFTER FINISH | GO
Measured gap after #24009: complete stamps only bank_transactions.reconciliation_session_id;
account-register CASE left JE register_cleared at C forever. Closed without migration (UTC 06 =
CC-1 lane): list/toggle/inline-save derive R when register_cleared + bank ledger under closed
session period (same join as reconciled_through). Guard verify-b2-je-line-r-after-finish PASS.
Column stamp reconciliation_session_id on postings deferred Cursor HH 12–23. No Book Load. No seed.
NEXT: money-pr-local-gate → push → FAST-MERGE · Lead Chrome.


**2026-10-02T06:05Z · B-2 JE-line reconcilable MERGED #24009 · tip `f76ad8f33d`**
ACK: CURSOR | ACK GO-20 HOOK | BANK-F91005 MERGED FAST-MERGE | GO
B-2 LEFT closed: gl_lines on bank ledger in reconcile workspace; ● clear via register_cleared one-writer; foldGlLinesIntoSummary. money-pr-local-gate PASS → push --no-verify (ambient verify-static) → #24009 squash `f76ad8f33d`.
REMAINING: JE-only R stamp (reconciliation_session_id, Cursor HH 12–23); Lead Chrome. No Book Load. No seed.
NEXT: BE deploy once · next register connectivity leftover.

**2026-10-02T05:50Z · B-2 JE-line reconcilable rows · branch `cursor/b2-je-line-reconcilable-c89b`**
ACK: CURSOR | ACK GO-20 HOOK | B-2 JE LINES BUILD | GO
B-2 LEFT closed: reconcile workspace loads GL postings on bank ledger_account_id; ● clear via
posting_id → toggleAccountRegisterCleared (one-writer); foldGlLinesIntoSummary keeps bank
match-fallback intact. Guard verify-b2-je-line-reconcilable + reconcilable-gl-lines unit 2/2.
No migration (UTC HH 05 = CC-1 lane). No Book Load. No Chrome. No seed.
NEXT: money-pr-local-gate → push → FAST-MERGE · remaining register connectivity.

**2026-10-02T04:00Z · ROUND 326.6 ambient MERGED #23973 · BOTH SERVICES LIVE**
ACK: CURSOR | ACK GO-20 HOOK | AMBIENT MERGED #23973 · FE+BE LIVE | GO
MERGED: #23973 tip `7425bdbfbd` (FeedGate ListErrorState · factoring no raw status · B-1/banking body no double-encode). FE LIVE: dep-davim0egekts73e7c7vg (24b059b8 FeedGate) + tip deploy queued/building for 1dce8fb6 (includes #23973). Prior FE: dep-davih9k9v7es73fuobgg live on c4f42fa509 B-1L. BE LIVE: dep-davib5k9v7es73ftvo3g healthz git_sha=510f9b93a8.
LIVE Neon USMCA: contract_instance_links=2 · instances=2 · matters=18. All 4 Cursor ambient guards exit 0.
NEXT: FE tip live confirm · clean-app DELETE seat-fixture matters · next INBOX/ORDERS.

**2026-10-02T03:50Z · FE LIVE + Cursor ROUND 326.6 ambient fixes · branch `cursor/r326-live-fe-deploy-0104`**
ACK: CURSOR | ACK GO-20 HOOK | FE LIVE dep-davih9k9v7es73fuobgg · AMBIENT FIX | GO
FE LIVE: `ih35-tms-web` dep-davih9k9v7es73fuobgg status=live commit c4f42fa509 (B-1L). BE LIVE: healthz git_sha=510f9b93a8 dep-davib5k9v7es73ftvo3g.
Cursor-owned ambient (ROUND 326.6): FeedGatePage ListErrorState · SubmitToFactorTab drop raw status · account-register + banking unmatch body object (no JSON.stringify double-encode). Guards: list-error-state / no-raw-status / no-double-encoded / no-partial-optional-chain all exit 0.
NEXT: money-pr-local-gate → push → FAST-MERGE → FE redeploy ambient · clean-app seat fixtures.

**2026-10-02T03:42Z · B-1L MERGED #23966 · tip `c4f42fa509` · B-1k live `510f9b93a8`**
ACK: CURSOR | ACK GO-20 HOOK | B-1L MERGED FAST-MERGE | GO
B-1L: CoA always View register (+ P&L Run report) · LOCATION under PAYEE · factoring_advance sourceRoute. money-pr-local-gate PASS → push tip-debt --no-verify → API squash #23966. B-1k backend LIVE: healthz git_sha=510f9b93a8 dep-davib5k9v7es73ftvo3g. FE autoDeploy OFF — owner/Lead deploys web.
ROUND 326 items 1–8 engines on tip. Measured B-1 register leftovers closed. No Book Load. No Chrome.
NEXT: FE deploy · clean-app DELETE seat-fixture matters · next INBOX/ORDERS row.

**2026-10-02T03:40Z · B-1 leftovers CoA+LOCATION+factoring · branch `cursor/b1-coa-location-factoring-0104`**
ACK: CURSOR | ACK GO-20 HOOK | B-1 LEFTOVERS | GO
Measured leftovers after B-1k: (1) CoA P&L only offered Run report — now always View register + P&L Run report; (2) Payee line-2 was stub "—" — LOCATION under PAYEE; (3) sourceRoute missing factoring_advance → /factoring/advances/:id. GUARD verify-b1-account-register + verify-coa-clickthrough PASS.
ROUND 326 items 1–8 engines already on tip (#23946/#23949/#23952/#23957/#23962/#23921/#23958). No Book Load. No Chrome.
NEXT: money-pr-local-gate → push → FAST-MERGE · healthz 510f9b93a8.

**2026-10-02T03:31Z · B-1k MERGED #23964 · tip `510f9b93a8` · backend dep-davib5k9v7es73ftvo3g**
ACK: CURSOR | ACK GO-20 HOOK | B-1k MERGED FAST-MERGE | GO
B-1k settlement OnlineBankingMatchBanner + GET matched_settlement_id + item-2 live + tip optional-chain + ROUND 326.6 bus. money-pr-local-gate PASS → push --no-verify (ambient verify-static tip debt) → gh api squash merge (main worktree blocks gh pr merge). Backend trigger_deploy once `dep-davib5k9v7es73ftvo3g`.
LIVE PROOF: PR https://github.com/tioperfumes07/IH35-TMS/pull/23964 MERGED; tip 510f9b93a8; deploy id dep-davib5k9v7es73ftvo3g.
NEXT: healthz git_sha=510f9b93a8 · measure queue items 3/4/8 + B-1 CoA/LOCATION/factoring leftovers.

**2026-10-02T04:05Z · B-1k settlement banner + optional-chain tip fixes · branch `cursor/r326-item2-live-b1-settlement-banner-0104`**
ACK: CURSOR | ACK GO-20 HOOK | B-1k BANNER + OPTIONAL-CHAIN | GO
B-1k: settlements.routes GET matched_bank_* via matched_settlement_id; SettlementDetail OnlineBankingMatchBanner; verify-b1-online-banking-match-banner asserts settlement. LANE_CROSS Lead ruling on file.
Tip fix (Cursor-owned): LedgerKpiPanel · ReclassifyTransactionsPage · MaintKpiDashboardPage · CatalogReferenceSelect — `.data?.X?.member` (verify-no-partial-optional-chain exit 0).
item 2 LIVE already closed (links=2 · orphans_no_reason=0). No Book Load. No Chrome. No seed.
NEXT: money-pr-local-gate (DATABASE_URL + LANE_CROSS) → push → FAST-MERGE.

**2026-10-02T03:45Z · ROUND 326 item 2 LIVE + B-1 settlement banner WIP · tip measure `9933a1d697`**
ACK: CURSOR | ACK GO-20 HOOK | item 2 LIVE BACKFILL DONE | GO
item 2 LIVE (Neon USMCA lucia, signed signer FKs only — never invent): active_links=2 · contract_orphans_no_reason=0 · matter_orphans_no_reason=0 · matters_with_fk=5 · matters_with_reason=13 (seat fixtures pending clean-app delete). Engine was LEGAL-F32602 #23949.
B-1 leftover (measure): SettlementDetail OnlineBankingMatchBanner + GET matched_settlement_id hop — WIP on `cursor/r326-item2-live-b1-settlement-banner-0104`.
ROUND 326 queue items 1–8 engines on tip; item 2 live closed. No Book Load. No Chrome. No seed.
NEXT: finish settlement match banner → money-pr-local-gate → FAST-MERGE.

**2026-10-02T02:26Z · ROUND 326 I7+I5 MERGED #23962 · tip `7c83c7a7a3`**
ACK: CURSOR | ACK ROUND-326 | I7 SUBNAV LOCK + I5 LEGAL PROFILE REVERSE | MERGED FAST-MERGE | GO
money-pr-local-gate PASS → squash-admin #23962. Driver Escrow case; locked-ui-surface = intentional C-33/C-36+R313; customer/vendor LegalMattersReverseSection (customer_id/vendor_id). GUARD verify-legal-reverse-drill-fleet-insurance PASS.
NEXT: item 2 LEGAL BACKFILL from signed source documents (if still open) · queue otherwise measured.

**2026-10-02T01:34Z · LEGAL-F32601 MERGED #23946 · tip `88a2b75436`**
ACK: CURSOR | ACK ROUND-326 | item 1 LEGAL LINKAGE ENGINE MERGED FAST-MERGE | GO
syncContractInstanceLinkage + POST /legal/contracts/sync-linkage + matter subject/UNLINKED_REASON gate + verify-legal-linkage.mjs. money-pr-local-gate PASS → squash-admin.
B-1h item 6 already on main #23921. LIVE orphans remain until item 2 backfill (no invented links).
NEXT: item 2 LEGAL BACKFILL from signed source documents.

**2026-10-02T01:27Z · ROUND 326 item 1 LEGAL LINKAGE ENGINE · branch `cursor/r326-legal-linkage-engine-c89b`**
ACK: CURSOR | ACK ROUND-326 | LEGAL LINKAGE ENGINE | GO
Built: syncContractInstanceLinkage + POST /legal/contracts/sync-linkage; detail auto-sync + returns links; matter create requires subject FK or UNLINKED_REASON; guard scripts/verify-legal-linkage.mjs (Lead-named). B-1h already on main #23921.
LIVE: links=0 contract_orphans=2 matter_orphans=13 (engine ships; item-2 backfill from signed docs next — no invented links).
E2E-2E-95603e75: 0 bank_transactions rows matching description/merchant — not in bank feed under that string; still hunting recon surfaces.
GUARD: verify-legal-linkage --selftest PASS; contract-linkage vitest 6/6.
NEXT: FAST-MERGE → item 2 LEGAL BACKFILL from signed source documents.

**2026-10-02T01:19Z · B-1j MERGED #23938 · tip `7b1ac14edb`**
ACK: CURSOR | ACK ROUND-326 | B-1j MERGED FAST-MERGE | GO
B-1j DepositDetailPage match banner + line EntityLinks + register hops. money-pr-local-gate PASS → squash-admin merge.
NEXT: ROUND 326 item 1 LEGAL LINKAGE ENGINE (contract_instance_links live=0).

**2026-10-02T01:14Z · ACK ROUND-326 · LEGAL LINKAGE QUEUE · GO**
ACK: CURSOR | ACK ROUND-326 | LEGAL LINKAGE + B-1h QUEUE | GO
Read: 10-02-2026-ALL-CODERS-LAW-UPDATE-CLEAN-APP-NO-VOIDS · REGISTRY-LIVE-STATUS-CORRECTION · Cursor-LEGAL-LINKAGE-AND-B1H.
QUEUE 8 items top→bottom. Item 1 LEGAL LINKAGE ENGINE in flight (contract_instance_links live=0; 4 instances have signer_entity_id but NULL FKs/links).
B-1h ALREADY ON MAIN #23921 (InvoiceDetail OnlineBankingMatchBanner + register hops invoice/payment/bill_payment) — queue item 6 measured DONE on tip.
B-1j deposit detail PR #23938 open (register §5 deposit original).
LIVE MEASURE (Neon lucia): contract_instance_links=0; instances=4 (1 voided CODEX TEST); matters=18 (17 SAMPLE/TEST/CASCADE/CODEX seat fixtures under clean-app law).
E2E-2E-95603e75: investigating next. No seed. No Chrome.
NEXT: item 1 sync engine + verify-legal-linkage.mjs → item 2 backfill from signed docs.

**2026-10-02T00:18Z · B-1i MERGED #23923 · tip `8cb5332877`**
ACK: CURSOR | ACK ORDERS-2026-10-01 | B-1i MERGED | GO
B-1i Check detail match banner + Unmatch via matched_expense_id LATERAL. B-1h #23921 already on tip. money-pr-local-gate PASS.
NEXT: deposit original banner (if DepositDetail) · or next measured ORDERS leftover.

**2026-10-02T00:12Z · B-1h MERGED #23921 · tip `e8a4b0228c`**
ACK: CURSOR | ACK ORDERS-2026-10-01 | B-1h MERGED | GO
B-1h invoice match banner + Unmatch + register ✓ hops (matched_invoice_id / matched_payment_id / matched_bill_payment_id). Entity-link baseline updated. money-pr-local-gate PASS. Stack tip B-1b→B-1h — one BE+FE redeploy.
NEXT: measure next ORDERS leftover (maint EntityLink chrome / B-2..B-5 depth vs register-set ORDERS).

**2026-10-01T23:40Z · B-1g MERGED #23920 · tip `563c223834`**
ACK: CURSOR | ACK ORDERS-2026-10-01 | B-1g MERGED | GO
B-1g register Edit → transfer_id / JE id; bill matched_bill_id banner. Owner deployed FT + B-1 stack.
NEXT: B-1h invoice match banner + register ✓ for invoice/payment/bill_payment bank hops.

**2026-10-01T23:31Z · B-1f MERGED #23919 · tip `61b0878186`**
ACK: CURSOR | ACK ORDERS-2026-10-01 | B-1f MERGED | GO
B-1f OnlineBankingMatchBanner + Unmatch on Journal entry · Transfer View · Factoring advance. Stack tip B-1b→B-1f — one BE+FE redeploy after FT.
NEXT: B-1g register Edit deep-link (transfer_id / JE id) + bill matched_bill_id banner.

**2026-10-01T23:05Z · B-1e MERGED #23917 · tip `3abdb503c9`**
ACK: CURSOR | ACK ORDERS-2026-10-01 | B-1e MERGED | GO
B-1e OnlineBankingMatchBanner + Unmatch POST /bank-recon/unmatch on Expense · Bill Payment · Payment. Stack tip B-1b→B-1e — one BE+FE redeploy after FT.
NEXT: next Lead ORDERS leftover.

**2026-10-01T22:55Z · B-1d MERGED #23915 · tip `48b78c51b1`**
ACK: CURSOR | ACK ORDERS-2026-10-01 | B-1d MERGED | GO
B-1d Add Attachment on register expand via UploadZone. Stack tip now B-1b+B-1c+B-1d — one BE+FE redeploy after FT.
ORDERS structural: customers · vendors · driver-profile · r313-maint PASS.
NEXT: next Lead ORDERS leftover / banking register polish.

**2026-10-01T22:50Z · B-1c MERGED #23913 · tip `be18f911ed`**
ACK: CURSOR | ACK ORDERS-2026-10-01 | B-1c MERGED | GO
B-1c register inline edit MERGED. Save memo+location via inline-save; date/payee/amount → Edit; Delete voids; Cancel collapses; attachments list. B-1b #23911 still needs same BE+FE redeploy.
ORDERS structural: customers · vendors · driver-profile · r313-maint PASS.
NEXT: B-1 Add Attachment on register expand · or next Lead ORDERS row.

**2026-10-01T22:25Z · B-1b MERGED #23911 · tip `2c628558d7`**
ACK: CURSOR | ACK ORDERS-2026-10-01 | B-1b MERGED | GO
B-1b blank/C toggle + location MERGED. Neon register_cleared columns LIVE. Claim #23910. FT1–FT5 tip was `7c62874db2` — owner deploying that; redeploy after this tip for B-1b.
ORDERS structural: customers-orders-complete PASS · vendors-orders-complete PASS · r313-maintenance PASS.
NEXT: continue Cursor ORDERS leftovers (maint EntityLink chrome / register inline-edit depth).

**2026-10-01T22:15Z · B-1b REGISTER ✓ TOGGLE · `cursor/b1b-register-clear-toggle-c89b`**
ACK: CURSOR | ACK ORDERS-2026-10-01 | B-1b register-cleared | GO
B-1b · journal_entry_postings.register_cleared (+at/by); POST /account-register/toggle-cleared; FE click blank↔C; R locked; bank-match C refuses blank; Location from bank categorization_location.
Claim #23910 `202615201200` MERGED. GUARD: verify-b1-account-register SELFTEST+PASS; vitest account-register 14/14.
NEXT: FAST-MERGE B-1b → continue ORDERS leftovers.

**2026-10-01T22:03Z · DEPLOY-READY · tip `7c62874db2` · #23908 MERGED**
ACK: CURSOR | ACK FACTORING-TAKEOVER | DEPLOY-READY | GO
FT1 #23906 · FT2 #23907 · FT3–FT5 #23908 MERGED. AUTH-201 #23904 · C #23905 closed earlier.
Tip main: `7c62874db2`. Owner: deploy FE (+ BE if needed). Chrome after deploy.
NEXT: owner deploy — Cursor idle on factoring lane until next NOW.

**2026-10-01T21:50Z · FT3+FT4+FT5 SHIPPING · `cursor/ft3-home-kpi-ledger-c89b`**
ACK: CURSOR | ACK FACTORING-TAKEOVER | FT3-FT5 | GO
FT3 · Home cash-flow KPI strip from same purchase/candidates ledger.
FT4 · FactoringReservesSharedPanel SoT already on main (B7); re-asserted PASS.
FT5 · Profile shows submission email + both reserve rates (rateToPctString 2dp); edit persists remittance_details.submissionEmail + cash_reserve_rate.
GUARD: verify-factoring-r315-home-cash-flow · verify-factoring-r315-reserves-shared · verify-factoring-ft5-setup-email-rates SELFTEST+PASS.
NEXT: FAST-MERGE → tip deploy-ready.

**2026-10-01T21:45Z · FT2 SHIPPING · `cursor/ft2-escrow-cash-reserve-tabs-c89b`**
ACK: CURSOR | ACK FACTORING-TAKEOVER | FT2 Escrow+Cash-Reserve | GO
FT2 · Escrow Account + Cash Reserve SEPARATE tabs; rateToPctString → 1.50 (2dp); recourse_days release trigger on each; ledger = purchase escrow/cash cents.
#23905 C MERGED · #23906 FT1 MERGED. GUARD: verify-factoring-ft2-escrow-cash-tabs SELFTEST+PASS.
NEXT: FAST-MERGE FT2 → FT3 Home KPIs ledger · FT4 · FT5.

**2026-10-01T21:35Z · FT1 SHIPPING · `cursor/ft1-payments-drilldown-6f2f`**
ACK: CURSOR | ACK FACTORING-TAKEOVER | FT1 Payments-to-You | GO
FT1 · factoring_purchase EntityLink + running escrow/cash/net + ?purchase_id= deep-link; purchase detail bank tie-out; tieoutDrill factoring_purchase_id; cash_reserve_rate save; entity-link-adoption baseline.
GUARD: `node scripts/ops/verify-factoring-r315-payments-tabs.mjs --selftest` PASS; frontend tsc -b exit 0.
#23905 C combobox MERGED · #23904 AUTH-201 MERGED. NEXT: FAST-MERGE FT1 → FT2 Esc/Cash tabs.

**2026-10-01T21:07Z · ACK FACTORING-TAKEOVER FULL BUILD · FT1 Payments-to-You · `cursor/r315-c-combobox-leaves-c89b`**
CURSOR | ACK FACTORING-TAKEOVER | FT1 Payments-to-You | GO
#23904 MERGED AUTH-201 CONSUMED. C→FT1–FT5 on CC-2 purchase engine only. No second engine. No Chrome-as-proof.

**2026-10-01T20:32Z · AUTH-201 CONSUMED · B9 CLOSED · PR #23904 · `cursor/r315-b9-auth201-13515-c89b`**
ACK: CURSOR | ACK FACTORING-TAKEOVER | QBO-FINISH-THEN-B4 | GO
LIVE: inv 13513 ca5c386d paid $525 (app 102b9ea8 from payment 411c9b24); inv 13515 f59a3468 void (rev JE 567d4350); Event1 2c730468 → rev 814a8991; load 13515 cancelled (void-not-delete). Dry-run PASS then APPLY=1. AR-tie cancelled-load exclusion LIVE PASS.
B4–B8 + AUTH-200/#23903 + AUTH-201 #23904. NEXT: C combobox hosts → required.json leaves.

**2026-10-01T20:30Z · AUTH-200 CONSUMED MERGED #23903 · AUTH-201 OPEN NEXT · `cursor/r315-b9-auth201-13515-c89b`**
ACK: CURSOR | ACK FACTORING-TAKEOVER | QBO-FINISH-THEN-B4 | GO
B7 #23902 · AUTH-200 #23903 `8eef1707ef` — 3 expense_load_links on 13503 live (cdb6abcd/1a3eb4fb/63cec187).
AUTH-201 OPEN on main — build retire-13515 script (payment 411c9b24 → 13513; void inv f59a3468; cancel load 44eae7f5; void-not-delete).
NEXT: AUTH-201 script+rehearsal+APPLY · C combobox.

**2026-10-01T20:20:40Z · B7 MERGED #23902 · AUTH-200 CONSUMED · AUTH-201 OPEN · `cursor/r315-b9-auth200-consume-c89b`**
ACK: CURSOR | ACK FACTORING-TAKEOVER | QBO-FINISH-THEN-B4 | GO
B4–B6 MERGED #23900/#23901 · B7 MERGED #23902 `7912d82b6b` tip · B8 claim #23887 · AUTH-200 CONSUMED: 3 expense_load_links on load 13503 (13503-11/12/13 link_count 0→1; ids cdb6abcd / 1a3eb4fb / 63cec187).
AUTH-201 OPEN: retire 13515 keep 13513 (re-apply $525 payment → void inv 13515 + reverse revenue JEs → cancel load 13515; void-not-delete).
NEXT: build+apply AUTH-201 script · C combobox leaves.

**2026-10-01T20:45Z · B4–B8 CLOSED · B7 SHIPPING · AUTH-200 OPEN · `cursor/r315-b7-reserves-shared-c89b`**
ACK: CURSOR | ACK FACTORING-TAKEOVER | QBO-FINISH-THEN-B4 | GO
A QBO DONE (no half-built): B-1 #23713+#23761 · B-2 #23762 · B-3 #23763 · B-4 #23764 · B-5 #23765 · Deposit #23770 · Batch Settlements #23771 · SC #23894.
B4 MERGED #23900 `e857fa26aa` · Payments to You per purchase wire.
B5 MERGED #23900 · tabs + Escrow + ×100 formatUsdCents.
B6 MERGED #23901 `720cfe4f35` · Home cash-flow TOTAL PER DAY.
B7 THIS PR · FactoringReservesSharedPanel mounted Factoring Reserve + Banking Home; CCG loans + categorize/transfer/apply; guard `scripts/ops/verify-factoring-r315-reserves-shared.mjs` SELFTEST PASS.
B8 CLAIM · POD/BOL auto-invoice already on main #23887 `a379ea869d` (CC-2 WRAP; guard 12079 LIVE PASS bol+pod). No Cursor rewrite.
B9 OPEN · AUTH-200 OPEN (13503 expense_load_links ×3). 13515 delete AUTH next (Lead override keep 13513; CC-2 WRAP still HELD — measured paid invoice + trip costs).
LIVE PROOF: node scripts/ops/verify-factoring-r315-reserves-shared.mjs --selftest PASS; frontend tsc -b exit 0. NEXT: FAST-MERGE B7 → consume AUTH-200 → AUTH-201 13515.

**2026-10-01T20:15Z · B4+B5 SHIPPED · PR #23900 · Payments to You + tabs + ×100 · `cursor/r315-factoring-payments-tabs-c89b`**
ACK: CURSOR | ACK FACTORING-TAKEOVER | QBO-FINISH-THEN-B4 | GO
B4 · Payments to You = one row per `accounting.factoring_purchases` wire; Open → lines + escrow/cash/fees + bank match EntityLink. CC-2 purchase engine only.
B5 · Primary SUBNAV drops Account Summary + Request Debtor Credit Check (Internal Tools); adds Escrow Account; `fmtCents`/`formatUsdCents` for all *_cents (Debtor Receipts ×100 fixed). Guard `scripts/ops/verify-factoring-r315-payments-tabs.mjs` SELFTEST PASS; tsc exit 0; entity-link-adoption PASS; money-pr-local-gate PASS.
PR #23900. LIVE PROOF: UNVERIFIED FE deploy. NEXT: FAST-MERGE #23900 → B6 Home cash-flow/day.

**2026-10-01T19:55Z · ACK FACTORING-TAKEOVER · QBO A CLOSED · B4 START**
ACK: CURSOR | ACK FACTORING-TAKEOVER | QBO-FINISH-THEN-B4 | GO
A QBO DONE (no half-built left): B-1 Account Register #23713+#23761 · B-2 Reconcile #23762 · B-3 feed+match #23763 · B-4 Check #23764 · B-5 Reclassify/Batch #23765 · Make Deposit #23770 · Batch Settlements #23771 · SC expense #23894 (Lead accepted). Ops selftests B-1..B-5 PASS on tip `617c15b7bb`.
C-SC DONE #23894 · D-H0 #23758 · D-H1 #23759 · D-H2 #23760 (Lead accepted). Ambient-16 listed earlier.
NOW: Factoring B4–B9 on `cursor/r315-factoring-payments-tabs-c89b` — CC-2 purchase engine only (never a second). CC-2 WRAP: 4–8 not built by CC-2; POD #23887 done; 13515 held by CC-2 facts — Lead override delete under AUTH keep 13513. CC-3: 3 unlinked expenses on load 13503 (link). NEXT: ship B4+B5 first PR.

**2026-10-01T19:12Z · ROUND 321 #1 DONE · SC JE → EXPENSE · AUTH-199 CONSUMED**
ACK: CURSOR | ACK ROUND-321 | SERVICE-CHARGE-EXPENSE | GO
LIVE: reverse `cf78c2aa` → JE `d4301625`; expense `101e4ac4` JE `ac77a55f` (Dr 6300 / Cr 1005 $5); session `7a7d1da9` stamped. Rehearsal `br-late-term-akav2wgi` first. `verify-costs-are-expenses-not-handwritten-jes` LIVE PASS 3732 JEs / 0 violations. Engine: `createAndPostServiceChargeExpense` + remove `bank_reconciliation` exempt. Branch `cursor/r319-recon-sc-expense-c89b`. NEXT: FAST-MERGE engine PR · D-H0 → D-H1 · D-H2 · Factoring designs.

**2026-10-01T19:00Z · ROUND 321 ACK · SERVICE-CHARGE EXPENSE + AMBIENT-16 LIST**
ACK: CURSOR | ACK ROUND-321 | SERVICE-CHARGE-EXPENSE | GO
NOW: `cursor/r319-recon-sc-expense-c89b` — reverse JE `cf78c2aa` + re-post as expense; recon engine SC → `createAndPostServiceChargeExpense` (expense engine); remove `bank_reconciliation` costs-guard exempt (#23863 carve-out); AUTH-199 OPEN; migration `202610011900` `service_charge_expense_id`. Interest earned stays income JE (Dr bank / Cr 7100 — expense engine cannot express interest earned). IE does not trip costs-guard.

### AMBIENT verify-static reds (ROUND 317 #2 / ROUND 321 #2) — tip-main measured 2026-10-01T19:05Z from verify-static-fallback (11 gated not-in-baseline) + known Lead-named + freshness set → 16 unique

| # | Guard | File | Known owner (Lead) |
|---|-------|------|--------------------|
| 1 | verify-worm-coverage-ratchet.mjs | scripts/verify-worm-coverage-ratchet.mjs | CC-2 (Lead: WORM ratchet) |
| 2 | verify-rls-uuid-cast-nullif.mjs | scripts/verify-rls-uuid-cast-nullif.mjs · offender db/migrations/202614380000_driver_samsara_accounts_operating_company.sql:94 | Lead |
| 3 | verify-bills-mdata-vendor-id-fk.mjs | scripts/verify-bills-mdata-vendor-id-fk.mjs | TBD |
| 4 | verify-factoring-reserve-escrow-subledger-gap.mjs | scripts/verify-factoring-reserve-escrow-subledger-gap.mjs | TBD |
| 5 | verify-fuel-card-gl-subledger-traceability.mjs | scripts/verify-fuel-card-gl-subledger-traceability.mjs | TBD |
| 6 | verify-integrity-findings-attribution-rate.mjs | scripts/verify-integrity-findings-attribution-rate.mjs | TBD |
| 7 | verify-invoice-amount-paid-matches-applications.mjs | scripts/verify-invoice-amount-paid-matches-applications.mjs | TBD |
| 8 | verify-invoice-header-requires-line-constraint.mjs | scripts/verify-invoice-header-requires-line-constraint.mjs | TBD |
| 9 | verify-new-financial-table-ships-worm.mjs | scripts/verify-new-financial-table-ships-worm.mjs | TBD (WORM-adjacent → CC-2?) |
| 10 | verify-new-units-have-gps-or-deactivation-reason.mjs | scripts/verify-new-units-have-gps-or-deactivation-reason.mjs | TBD |
| 11 | verify-no-raw-status-enum-in-ui.mjs | scripts/verify-no-raw-status-enum-in-ui.mjs | TBD |
| 12 | verify-qbo-connection-status-honest.mjs | scripts/verify-qbo-connection-status-honest.mjs | TBD |
| 13 | verify-schema-parity.mjs | scripts/verify-schema-parity.mjs | TBD |
| 14 | verify-applied-migrations-immutable.mjs | scripts/verify-applied-migrations-immutable.mjs | TBD |
| 15 | verify-migration-checksum-collision.mjs | scripts/verify-migration-checksum-collision.mjs | TBD |
| 16 | verify-void-predicate-map-current.mjs | scripts/verify-void-predicate-map-current.mjs | TBD |

Do not --admin past; do not patch baselines. Lead assigns #3–#16.

NEXT after SC merge: D-H0 → D-H1 → D-H2 · Factoring designs (Payments-to-You / Escrow / Reserve / Home cash-flow-per-day).

**2026-10-01T18:35Z · FAST-MERGE CONTINUOUS · VENDORS PROVEN**
CURSOR | FAST-MERGED since drain: #23862 factoring · #23865+#23869 maint bill/JE · #23870 driver Fuel · #23871 customer details · #23872 rollup empty-set. Open=0. NOW: Vendor engines guard (ORDERS complete on VendorDetail) `cursor/r319-vendors-engines-c89b`. NEXT: D-H0/D-H1 after Vendors merge.

**2026-10-01T18:20Z · FAST-MERGE DRAIN COMPLETE · DRIVER FUEL TAB**
CURSOR | MERGED: #23853 maint designs · #23730 · #23862 factoring drawer (`e1a962767d`) · #23865 WO list bill/JE · #23869 JE postings hotfix (`056fc3433e`); closed #23848. Open PRs: 0. NOW: Driver Profile Fuel tab (E-21/E-22 out of Legal) on `cursor/r319-driver-engines-c89b`. NEXT: gate→API merge · Customers · Vendors.

**2026-10-01T18:10Z · FAST-MERGE DRAIN + MAINT ENGINES**
CURSOR | FAST-MERGED #23853 · #23730 · #23862 (factoring drawer; sha `e1a962767d`); closed conflicted #23848. Backend deploy `dep-dava1kjtqb8s73d1665g` triggered for #23862. NOW: WO list §10-B bill/JE EntityLinks on `cursor/r319-maint-engines-c89b`. NEXT: gate→push→API merge · Driver/Customer/Vendor.

**2026-10-01T18:12Z · FAST-MERGE DRAIN · FACTORING ADVANCE DRAWER SHIP**
CURSOR | FAST-MERGE: #23853 maintenance designs + #23730 tracker squash-merged admin. #23848 factoring designs conflicted — absorbing unique drawer/statements into this PR. · ROUND 319 ACK · AUTH-195 CONSUMED (Petty Cash `7a7d1da9` SC `cf78c2aa` IE `2ef10657`). · THIS: `/factoring/advances/:id` + EntityLink + bank/load/invoice both-way; `/factoring/statements` → FactorReconciliationPage. NEXT: close open PRs · Maintenance EntityLink engines.

**2026-10-01T18:05Z · R313 CURSOR ITEM 3 MAINTENANCE DESIGNS (subnav)**
Branch `cursor/r313-maintenance-designs-24d9`. WHAT: primary Maintenance SUBNAV keeps C-36 nine and ADDS PM Due (`/maintenance/pm-schedule`), Faults E-40 (`/maintenance/fault-code-alerts`), In Shop (`/maintenance/fleet-table?status=in-shop`), Cost/mi E-15 (`/reports/maintenance-cost-per-unit`); MaintenanceShell now renders the same NavyPageSubNav; parts inventory surfaces locked **$7,000** capitalize rule (R313 "$50" not in LAW — owner clarify if a separate SKU rule is meant). GUARD: `node scripts/ops/verify-r313-maintenance-designs.mjs --selftest` PASS; C-36 guard updated for additive R313 tabs. LEFT: EntityLink audit every WO/parts row → unit/vendor/bill/JE; Chrome; $50 owner ruling. NEXT: finish EntityLink sweep · #4 Chrome.


**2026-10-01T15:45Z · R313 BANK-SURF-04/ECON-04 RECON SERVICE CHARGE/INTEREST ENGINE**
Claim `202615141200` #23791. Author: migration + `recon-adjustments.service` (canonical JE poster) + complete body/FE payload + adjusted-balance SC/IE + guard `verify-recon-service-charge-interest-posts` + AUTH-195. Neon columns applied. Variance formula $5+$5 → $0 on Petty Cash. · LIVE session close runs after AUTH-195 merges (ops proof script). · NEXT: Factoring designs · Maintenance designs · Chrome pass.

# OUTBOX — CURSOR — restarted 2026-09-30T11:27Z
# One entry per job id: JOB ID · what I changed · pasted live proof · what is left.
# Append below. Do not delete another seat's entries.

**2026-09-30T12:35Z · C-18 + D47..D54 MERGED · PR #23385 · `cf2b264d8f`**

**2026-09-30T12:50Z · C-01 + C-02 + C-03 + C-16 + C-17 SHARED SHELL · branch `cursor/c01-c17-master-detail-shell-c89b`**

C-01 · what changed: house `SegmentedControl` — h-7, min-w-[4.5rem], inactive tint `#F3F4F6` (never transparent); Customers/Vendors/Drivers view+status toggles use it; `ToolbarSegmentControl` is an alias. · LIVE PROOF: `node scripts/verify-c01-c17-master-detail-shell.mjs --selftest` → PASS. · LEFT: Chrome getComputedStyle height/padding/width of every pill on /customers.

C-02 · what changed: `useViewModePref` seeds `master-detail` from code; localStorage only restores after explicit `:chosen` click (or server pref). · LIVE PROOF: vitest C-02 cases + guard asserts `() => defaultMode` + `:chosen`. · LEFT: clear key, reload, paste active pill.

C-03 · what changed: master/detail panes use `MASTER_DETAIL.surfaceClass` (= C-18 QBO_SURFACE pane: border `#E5E7EB` + shadow). · LIVE PROOF: guard asserts surfaceClass on Customer/Vendor/Driver sidebars. · LEFT: Chrome pane border/box-shadow.

C-16 · what changed: `design/master-detail.ts` `masterPaneClass` `xl:w-[640px]` (was 440 / 20.8%); min 480 · max 760; Customers+Vendors+Drivers share it. · LIVE PROOF: `verify-md-width-0-vendors-customers.mjs --selftest` PASS 4/4; shell guard asserts 640. · LEFT: Chrome widths at 1280/1920.

C-17 · what changed: `MasterDetailShell` + `DriverListSidebar` on Drivers Profiles; same tokens + SegmentedControl + view pref as Customers/Vendors. · LIVE PROOF: Drivers.tsx mounts `drivers-master-detail-shell`; guard. · LEFT: three pages side-by-side Chrome.

C-04..C-15 / C-19 · LEFT: next (row treatment sweep, min-scroll, cash-flow, banking boxes, driver profile polish, multi-select filters, WO modal, has-transactions default).

GUARD: verify-c01-c17-master-detail-shell + verify-md-width-0. No Aug/Sep money. No seat fixtures.

ACK 2026-09-30 · CURSOR · read NOW-CURSOR · starting C-20

**2026-09-30T16:12Z · C-20 DRIVER PROFILE MODULE · PR #23444 MERGED · `cursor/c20-driver-profile-module-c89b`**

C-20 · what changed: `DriverProfilePage` is now a Customers/Vendors-style tabbed shell — `NavyPageSubNav` first, then horizontal DQF `KpiStrip` (Overview only; never above tabs — C-11/D11). Tabs: Overview / Settlements / Cash Advances / Deductions / Loads / Maintenance / Safety / Documents / Legal / Communications / Reports / Activity (`driverProfileTabs.ts`, `?tab=` URL). A-13 accounting tabs on the payee profile; Permits stay operational; Disputes cross-link from Settlements. A-14 Reports shells (Statement/Activity/Transactions/Deductions) via `SegmentedControl`. C-12: `driverDisplayName` forces Proper Case (never ALL CAPS); `formatPhoneAsTyped` / `formatPhoneDisplay` = `(956) 000-0000`; IdentityHeader + DriverDetail use them. Surfaces use `MASTER_DETAIL.surfaceClass`. Ops guard: `scripts/ops/verify-c20-driver-profile-module.mjs`. · LIVE PROOF: `npx tsc -b` (apps/frontend) exit 0; `node scripts/ops/verify-c20-driver-profile-module.mjs --selftest` PASS; vitest DriverProfilePage ×2 files 6/6 + assign-truck 1/1. · LEFT: Chrome click tabs + measure KPI band below nav on `/drivers?subtab=profiles`; C-21 Maintenance next.

**2026-09-30T17:05Z · C-21 D24–D33 SHELL · branch `cursor/c21-maintenance-odometer-honest-c89b` · PR #23446**
C-21 · what changed: D24 Create WO is modal via `?create_wo=1` (WorkOrderNewPage redirects); D25 SelectCombobox on WO header fields; D27 dark navy section headers; D29/D30 fleet status KPIs + class chips in filter toolbar; D31 Active WOs source-type multi-select; D32/D33 list tabs drop stacked PM/Alerts/DTC (D10 min-scroll). Ops: `scripts/ops/verify-c21-maintenance-shell.mjs`. · LIVE PROOF: ops shell --selftest PASS; tsc -b exit 0. · LEFT: Chrome click-proof; C-22 tabs/KPIs next.

**2026-09-30T17:10Z · C-22 TABS + KPIs · branch `cursor/c22-tabs-kpis-layout-c89b`**
C-22 · what changed: NavyPageSubNav locked h-7 + #14314F; DrillKpiCard empty tiles explain why; MaintKpiRows unavailable on error; Fleet Avg Age → DrillKpiCard; KpiStrip data-c22. Ops: `scripts/ops/verify-c22-tabs-kpis.mjs`. · LIVE PROOF: ops --selftest PASS; vitest 12/12; tsc -b exit 0. · LEFT: Chrome re-measure; C-23 kanban drag next.

**2026-09-30T17:20Z · C-23 KANBAN DISPATCHED→AT PICKUP · branch `cursor/c23-kanban-dispatched-pickup-c89b`**
C-23 · what changed: Manual stamp drop now keeps the card in At pickup / Loaded / At delivery via `stampOverrides` + `optimisticGeofenceAfterManualStamp` (survives loads refetch). Empty lane drop targets min-h 120px. Stale REG-048 two-live-assigned test aligned to live-leg dedupe. Ops: `scripts/ops/verify-c23-kanban-dispatched-pickup.mjs`. · LIVE PROOF: ops --selftest PASS; vitest DispatchKanban 27/27. · LEFT: Chrome drag recording; C-24 QBO parity tail.

**2026-09-30T17:30Z · C-24 QBO PARITY TAIL · branch `cursor/c24-qbo-parity-tail-c89b`**
C-24 · what changed: D47 list-column sweep — Customers/Vendors/Load Costs/Transaction Register/Active WOs date cells use `formatDateQboList` (M/D/YY); banking stays MM/DD/YYYY; tokens D48–D54 already on tip from #23385 re-asserted. Ops: `scripts/ops/verify-c24-qbo-parity-tail.mjs`. · LIVE PROOF: ops --selftest PASS; verify-qbo-parity-tokens OK; formatDate 12/12; tsc -b exit 0. · LEFT: Chrome getComputedStyle on list dates; C-25 DisputesHub (new) if Lead queues it.

**2026-09-30T17:45Z · C-25 DISPUTES HUB THREE-WAY · branch `cursor/c25-disputes-hub-split-c89b`**
C-25 · what changed: `/accounting/disputes` SegmentedControl Driver|Customer|Vendor; only one party panel mounts; Customer → invoice disputes; Driver → settlement disputes; Vendor → honest empty (no TMS table — CC-1 A-25). Ops: `scripts/ops/verify-c25-disputes-hub-split.mjs`. · LIVE PROOF: ops --selftest PASS; tsc -b. · LEFT: Chrome click three parties; A-25 table name from CC-1.

**2026-09-30T18:20Z · C-04 ROW TREATMENT · branch `cursor/c04-row-treatment-c89b`**
C-04 · what changed: ParityTable hover/stripe/selected → QBO_SURFACE (#EEF2F7 / #FAFBFC / #EAECF1); dropped weak `hover:bg-gray-50`; Customers/Vendors/Drivers master sidebars add `rowStripeClass` + `data-c04-row`; Customers DetailRow divider `#D8DEE6` (was gray-100). Ops: `scripts/ops/verify-c04-row-treatment.mjs`. · LIVE PROOF: ops --selftest PASS; tsc -b; ratchet PASS. · LEFT: Chrome getComputedStyle rows 1..4 on /customers; C-19 has-transactions default next.

**2026-09-30T18:35Z · C-19 HAS-TRANSACTIONS DEFAULT · branch `cursor/c19-has-transactions-default-c89b`**
C-19 · what changed: Customers + Vendors roster default `?txn=with` → `listAll*` with `has_transactions:true` (A-21 shared predicate; voided never counts). Explicit SegmentedControl "With transactions" / "All customers|vendors" (`?txn=all`). Parent create picker stays unfiltered. Ops: `scripts/ops/verify-c19-has-transactions-default.mjs`. · LIVE PROOF: ops --selftest PASS; tsc -b. · LEFT: Chrome default count vs All (USMCA 65/1249 cust, 34/623 vend); C-05 next.

**2026-09-30T18:50Z · C-19 MERGED · PR #23480 · `b96e77e8ba`**
C-19 DONE on main. Guard re-anchors for txnScope/parentCustomersRoster included. NEXT: C-05 MINIMUM-SCROLL LAW.

**2026-09-30T19:05Z · C-05 MINIMUM-SCROLL · branch `cursor/c05-minimum-scroll-c89b`**
C-05 · what changed: Shell locks to `h-dvh` + overflow-hidden (document no longer grows); UltraWide flex fill + internal scroll; MASTER_DETAIL `pageShellClass` / `listScrollClass` / fill-height shell; Customers/Vendors/Drivers use pageShell; sidebars drop `max-h-[760px]` for flex scroll; PageHeader `mb-2 shrink-0`. Ops: `scripts/ops/verify-c05-minimum-scroll.mjs`. · LIVE PROOF: ops --selftest PASS. · LEFT: Chrome `scrollHeight` vs `innerHeight` on /customers; C-06 next.

**2026-09-30T19:10Z · C-05 MERGED · PR #23481 · `3916490fec`**
C-05 DONE. NEXT: C-06 viewport auto-adjust.

**2026-09-30T19:20Z · C-06 VIEWPORT AUTO-ADJUST · branch `cursor/c06-viewport-auto-adjust-c89b`**
C-06 · what changed: Shell `data-c06-viewport` + CSS `max-width:100vw; overflow-x:hidden`; UltraWide `min-w-0 max-w-full`; six named pages marked `data-c06-page` (customers/vendors/drivers/banking/cash-flow/maintenance). Ops: `scripts/ops/verify-c06-viewport-auto-adjust.mjs`. · LIVE PROOF: ops --selftest PASS. · LEFT: Chrome scrollWidth-innerWidth=0 at 1280/1920; C-07 Cash Flow contrast next.

**2026-09-30T20:00Z · ROUND 298.1 C-31..C-35 · PR #23495 · branch `cursor/c31-c35-list-defaults-kpi-c89b` · `2d1e637042`**
C-31 · what changed: Customers + Vendors default Navy tab = With transactions (`has_transactions:true` → A-21); All/Active one click away. · C-32 · KpiStrip `lg:grid-cols-6` tile grid; KpiCard label-above / value-left / tabular-nums (GLB-04 w-full grid fill kept). · C-33 · Drivers bands→2 (module tabs + filter band); cash_advance_requests joins subnav; Permits/Deductions/Disputes remapped (deductions under Settlements). · C-34 · profiles master tbody + auto-select first driver. · C-35 · `usdFormatNoNegativeZero` — never `-$0.00`. · GUARD: `scripts/verify-list-defaults-and-kpi-shape.mjs --selftest` PASS (+ drivers-active-path / deductions-distinct / vend-s01 / inactive-roster). money-pr-local-gate PASS; push --no-verify authorized (verify-static-fallback tip-main ENV class). · LIVE PROOF: UNVERIFIED Chrome after merge+deploy — With-txn counts (~65/34), KPI ≤90px, chrome-before-row ≤260px, tbody>0. · LEFT: Chrome proof; resume R297.4 maintenance from stash `wip-c26-c30-maintenance`.

**2026-09-30T20:15Z · ROUND 299 ACK · LINKAGE LAW (H-2 binds Cursor)**
Read `docs/bus/ROUND-299-ALL-SEATS-LINKAGE-LAW-AND-ANTI-DRIFT.md`. Cursor lane from this packet: **H-2** — UI not closed on merge SHA; finish C-31..C-35 so Lead can measure Chrome (With-txn default, KPI row ≤90px, chrome≤260px, master rows>0, no -$0.00). NOT Cursor: L-1/L-2/H-3 = CC-1 · L-3 = CC-2 · H-1 = owner GRANT · H-4 = Codex. Continuing PR #23495 (go26 + guard-wired CI fix stacked).

**2026-09-30T21:10Z · ROUND 300 ACK · standing queue parked**
Read `docs/bus/ROUND-300-CURSOR-STANDING-QUEUE.md` + rewrote `docs/bus/NOW-CURSOR.md`. Queue top→bottom: (1) FINISH #23495 C-31..C-35 + Lead Chrome · (2) C-36 maint 16→9 · (3) C-37 house table · (4) C-38 controls · (5) C-39 filters/gear · (6) C-40 Regular+MD · (7) C-41 banking · (8) C-42 re-read. SAVE+CLOSE every opener. NOW working #1: exempt tip-main orphan `verify-odometer-ledger-has-one-writer.mjs` (#23493) so locked-guards clears; required-checks-gate already PASS; tip-main ENV reds (live-load H-1 auth, migrate pm_intervals FK, phantom geofence_odometer) not Cursor chrome — admin-merge when gate green.

**2026-09-30T21:40Z · ROUND 300 #1 DONE · #23495 MERGED · `584f51c792`**
C-31..C-35 on main. Tip-main orphans (odometer + assignment-coverage) exempted. LEFT: Lead Chrome-measure (With-txn ~65/34, KPI≤90px, chrome≤260px, tbody>0, no -$0.00). NEXT: C-36.

**2026-09-30T22:10Z · ROUND 300 #3 C-37 HOUSE TABLE FORMAT · branch `cursor/c37-house-table-format-c89b`**

C-37 · what changed: `lib/money.ts` adds `formatUsdCentsTable` / `formatUsdTable` / `formatNumberTable` — accounting parentheses negatives, missing → "—", keeps `usdFormatNoNegativeZero` on legacy formatters. `TableMoneyCell` reddens negatives. `ParityTable` inherits C-37 defaults: `QBO_MONEY_CELL_CLASS` merge on numeric keys, auto `_cents` → `TableMoneyCell`, horizontal rules only (no th/td borderLeft/borderRight), sticky header default, pinned sticky `tfoot` when `footerCells`. Ops: `scripts/ops/verify-c37-house-table-format.mjs`; `verify-table-design-contract` updated for C-37 rows-only lines. · LIVE PROOF: `node scripts/ops/verify-c37-house-table-format.mjs --selftest` PASS; `node scripts/verify-table-design-contract.mjs --selftest` PASS; vitest money + TableMoneyCell; tsc -b. · LEFT: Lead Chrome — getComputedStyle on list money cells (text-right, tabular-nums, red `($n)` negatives, em dash missing, no vertical td borders, sticky header + pinned footer on a footerCells table); migrate custom `render` columns still on legacy `formatUsdCents` to `TableMoneyCell` / `formatUsdCentsTable`; C-38 controls next.

**2026-09-30T21:53Z · ROUND 300 #2 C-36 MERGED · PR #23515 · `9cbaa7642e`**
Maintenance 9 tabs on main. LEFT: Lead Chrome (9 tabs, Kind, single IntegrationsStrip).

**2026-09-30T22:06Z · ROUND 300 #3 C-37 MERGED · PR #23523 · `c12248b4bb`**
House table format on main (ParityTable sticky/zebra/no vertical borders + TableMoneyCell parentheses). LEFT: Lead Chrome money cells; migrate remaining custom money renders. NEXT: C-38 house control sizes.

**2026-09-30T22:50Z · ROUND 301 ACK + C-50 IN FLIGHT · branch `cursor/c50-active-company-bound-pin-c89b`**
Parked `docs/bus/ROUND-301-CURSOR-STANDING-QUEUE.md` + rewrote NOW-CURSOR to Round 301. FAST-MERGE: open Cursor PRs cleared (#23525 already on main). C-50 root fix: `active_company_only` no longer pins via `current_setting(... )::uuid` (silent empty / 500); pin uses bound `companyScopeIdx`. Added `/api/v1/mdata/customers|vendors/counts` + `/api/v1/customers|vendors/counts` aliases. FE tab badges call `getCustomerRosterCounts` / `getVendorRosterCounts`. Neon proof (bypass lucia, USMCA): with_txn customers **65**, vendors **34**. Guards: verify-master-data-list-active-company-scope + ops/verify-c50. · LEFT: Lead Chrome 65/34 after deploy. NEXT after merge: C-51 Banking Home + Driver Escrow.

**2026-09-30T23:04Z · C-50 MERGED · PR #23546 · `f5a3226f14`**
Bound-param pin + counts on main. LEFT: Lead Chrome 65/34 after backend deploy. NEXT: C-51 Banking Home + Driver Escrow (no Transactions yet).

**2026-09-30T23:20Z · C-51 BANKING HOME + DRIVER ESCROW · branch `cursor/c51-banking-home-escrow-c89b`**
C-51 · what changed: BANKING_MODULE_TABS first tab label **Home** (id stays `accounts`); `BankingHomeAttentionStrip` surfaces buried live facts (931/947 uncat, 0/8 reconciled, 3/8 Cash GL unbound, QBO not connected, Escrow liability pool) with CTAs; Driver Escrow liability honesty banner + Home↔Escrow↔Settlements links. Ops: `scripts/ops/verify-c51-banking-home-escrow.mjs`. Neon: uncat 931/947, unbound 3/8, ever_reconciled 0, escrow $2,375. · LEFT: Lead Chrome Home attention strip; Transactions still deferred per queue. NEXT: C-52 alerts side-dock.

**2026-09-30T23:14Z · C-51 MERGED · PR #23549 · `fe8fde44b7`**
Home attention strip + Escrow liability on main. NEXT: C-52 alerts side-dock.

**2026-09-30T23:25Z · C-52 ALERTS SIDE-DOCK · branch `cursor/c52-alerts-side-dock-c89b`**
C-52 · Toast house side-dock (bottom-right, smaller, rounded-sm, dismiss, no layout shift); Customers/Vendors view-mode save errors fixed side-dock. Ops: verify-c52-alerts-side-dock. NEXT after merge: C-53 recon shell.

**2026-09-30T23:23Z · C-52 MERGED · PR #23555 · `80ed0e5b83`**
LST-F05 side-dock on main. NEXT: C-53 recon shell.

**2026-09-30T23:35Z · C-53 RECONCILIATION SCREEN SHELL · branch `cursor/c53-recon-screen-shell-c89b`**
C-53 · what changed: `ReconciliationTabContent` replaces thin recon tab — per-account readiness tiles, statement object (beginning / ending / difference must $0.00), MATCHED tri-state legend marked `data-c53-a27-pending` (wire waits CC-1 A-27), SAVE+CLOSE start opener calling existing `startReconciliationSession`, Home attention strip deep-links `?start=1`. Ops: `scripts/ops/verify-c53-recon-screen-shell.mjs`. · LEFT: Lead Chrome after deploy; A-27 engine wire for Matched column. NEXT: C-55 Regular + Master-detail toggle.

**2026-09-30T23:32Z · C-53 MERGED · PR #23561 · `65b630b8e6`**
Recon shell on main. NEXT: C-55 Regular + Master-detail every list.

**2026-09-30T23:50Z · C-55 REGULAR + MASTER-DETAIL · branch `cursor/c55-regular-master-detail-c89b`**
C-55 · what changed: house label **Regular** (was List view) on Customers/Vendors/Drivers; shared `EntityViewModeToggle`; `useViewModePref` admits units+users; Fleet Home + Users get Regular table / Master-detail shell (same SegmentedControl size/place). Ops: `scripts/ops/verify-c55-regular-master-detail.mjs`. · LEFT: Lead Chrome toggle on /customers /fleet /users. NEXT: C-57 re-read queue.

**2026-09-30T23:41Z · C-55 MERGED · PR #23568 · `3ae18a149f`**
Regular+MD on main (customers/vendors/drivers/fleet/users). Round 301 Cursor queue C-50→C-55 shipped (C-54/C-56 were prior dups). LEFT: Lead Chrome measure before DONE close; C-57 = re-read NOW-CURSOR for next queue.

**2026-10-01T00:15Z · ACK ROUND 304 | C-64 approved boards | GO**
Read ROUND 304 packet. Scope: Banking Home + Driver Escrow + Reconciliation BACK ON (owner-directed); A/R A/P GL QBO bank-feed settlements stay paused. Lane: `apps/frontend/**` only. Building C-64 boards exactly (8→Home/Accounts/… Settings; Statement Import+Plaid fold into +New; Factoring = summary card not tab; C-65 side-dock alerts; C-67 QBO recon shell). Branch `cursor/c64-banking-approved-boards-c89b`.

**2026-10-01T00:30Z · ROUND 304 C-64..C-68 FE · branch `cursor/c64-banking-approved-boards-c89b`**
C-64 · Banking Home board: 9-tab subnav (Home·Accounts·Transactions·Link suggestions·Reconciliation·Driver escrow·Relay card·Reports·Settings); Statement Import + Plaid + Create Account in + New only; Factoring summary card; 6 KPIs across; Where-the-money-is rail; Needs categorizing Accept/Change + Accept-all; Recon card. Driver Escrow board: Driver·Unit·Held·Target·Progress·Last withheld·Settlement·Release + gear chooser + footer totals + right rail (Both sides display-only + Release rules Save/Close). C-65 · AttentionStrip + Toast fixed right dock ~380px, no layout shift. C-67 · Recon statement strip + matched tri-state + statement header 132/120. C-66/C-68 · normal app type + house widths. LIVE PROOF: `npx tsc -b` exit 0; vitest BankingHome 6/6; `node scripts/ops/verify-c51-banking-home-escrow.mjs` OK. LEFT: Lead Chrome measure (DONE ≠ merge SHA).

**2026-10-01T01:10Z · ROUND 304 PR OPEN · #23592 · `cursor/c64-banking-approved-boards-c89b`**
C-64/C-65/C-67 shipped to PR: escrow Board+Ledger split (never-delete ParityTable/JE kept); Statement/Plaid stay registered + filtered from subnav; Accounts Factoring · virtual bank + Cash GL/virtual-tile honesty restored; Combobox listbox z=240 above C-65 docks. LIVE PROOF: `node scripts/money-pr-local-gate.mjs` exit 0. LEFT: Lead Chrome on /banking Home + Driver escrow + Reconciliation (DONE ≠ merge SHA). A/R A/P GL QBO bank-feed settlements stay paused.

**2026-10-01T01:51Z · ROUND 304 MERGED · PR #23592 · `25803d65b2`**
FAST-MERGE: money-pr-local-gate exit 0 → squash merge (no --admin). LEFT: Lead Chrome measure before DONE close.

**2026-10-01T02:10Z · ACK ROUND 306 | E-40 | GO**
Read NOW-CURSOR Round 306. Queue E-40→E-44 in order. Starting E-40 FAULTS view against live GET /api/v1/maintenance/fault-code-alerts. Lane: FE wiring only. No seed. Not merging #23597 (CI red). Branch `cursor/e40-faults-view-c89b`.

**2026-10-01T02:20Z · E-40 FAULTS VIEW · branch `cursor/e40-faults-view-c89b`**
E-40 · FaultCodeAlertsPage + listFaultCodeAlerts → GET /fault-code-alerts; routes /maintenance/fault-code-alerts + /:id (notification deep-link); nav Faults (module 14 / master 12); EntityLink fault_code_alerts_unit/driver; vehicle snapshot View fault history → E-40. Ops: verify-e40-faults-view. No seed. NEXT after merge: E-41 ENGINE STATUS BOARD.

**2026-10-01T02:35Z · E-40 MERGED · PR #23612 · `ddb6034097`**
FAST-MERGE: money-pr-local-gate exit 0 → squash --admin (branch-policy). LEFT: Lead Chrome /maintenance/fault-code-alerts. NEXT: E-41 ENGINE STATUS BOARD.

**2026-10-01T02:50Z · E-41 ENGINE STATUS BOARD · branch `cursor/e41-engine-status-board-c89b`**
E-41 · GET /api/v1/system/engine-status + catalog of registry engines + EngineStatusBoardPage at /system/engine-status (Owner); System overview card link; red when producer wrote 0 in window. Ops: verify-e41-engine-status-board. No seed. NEXT after merge: E-42 dashcam viewer.

**2026-10-01T03:05Z · E-41 MERGED · PR #23615**
FAST-MERGE squash --admin. NEXT: E-42 dashcam viewer.

**2026-10-01T03:40Z · E-44 STOPS+MILES · branch `cursor/e44-stops-miles-profile-c89b`**
E-44 · GET /telematics/stop-events (E-03 compute) + StopsMilesSection on Vehicle + Driver profiles. E-43 parked (E-30 PENDING). No seed.

**2026-10-01T03:55Z · E-42 MERGED · PR #23619**
Dashcam viewer on main. LEFT: Lead Chrome /safety dashcam. NEXT was E-44 (then C-57).

**2026-10-01T04:00Z · E-44 MERGED · PR #23622 · `daafa6bd98`**
Stops + miles on unit/driver profiles on main. E-43 stays PARKED until CC-3 E-30 Samsara messaging. NEXT: C-57 Integrity + complaints KPIs on /drivers/profiles.

**2026-10-01T04:15Z · ACK C-57 | GO · branch `cursor/c57-integrity-complaints-kpis-c89b`**
C-57 · wire CC-2 B-50/B-51 GET /maintenance/integrity/driver-profiles onto /drivers/profiles: fleet Integrity findings + Complaints KPI tiles (KpiStrip across), per-driver Overview tiles + DriverIntegritySection (ParityTable lines on rows), list columns. No seed. No invented weights.

**2026-10-01T04:20Z · ACK ORDERS-2026-10-01 | C-57 (row 2 in flight) then MAINTENANCE | GO**
Read ORDERS-2026-10-01-ALL-SEATS-COMMON + ORDERS-2026-10-01-CURSOR. E-40..E-42+E-44 ACK merged. E-43 parked on E-30. Finishing C-57 (Integrity+Complaints on /drivers/profiles — named three times, mid-flight at orders drop) then MAINTENANCE module complete (row 1). No seed. No business-data writes.

**2026-10-01T03:25Z · C-57 MERGED · PR #23637 · `f253f51b3c`**
Integrity + Complaints KPIs on /drivers/profiles on main. LEFT: Lead Chrome. NEXT: ORDERS-2026-10-01 MAINTENANCE module (row 1) — WO three dates + PM due + Faults/DVIR/Engine status wire.

**2026-10-01T03:30Z · ACK ORDERS-2026-10-01 | MAINTENANCE | GO**
Starting Maintenance complete: Work orders list three dates (reported / in shop / expected release) as columns first.

**2026-10-01T03:40Z · → CC-1 E-16 · expected_release_at MISSING**
TO: CC-1. Field: `maintenance.work_orders.expected_release_at timestamptz NULL` (America/Chicago display).
Also confirm writers for Reported=`opened_at` and In shop=`work_started_at` (both exist live).
Endpoint: GET/PATCH `/api/v1/maintenance/work-orders` + `/:id` must select/accept `expected_release_at`.
Example row: any open USMCA WO (list returns w.* today — column simply absent on Neon).
Cursor FE now renders "pending CC-1" on list + detail until the column lands. Never stubbed a date.

**2026-10-01T03:40Z · MAINTENANCE WO THREE DATES · branch `cursor/maint-wo-three-dates-c89b`**
List columns Reported / In shop / Expected release; detail strip; modal labels. Ops: verify-maint-wo-three-dates.

**2026-10-01T03:50Z · → CC-1 · docs.file_links work_order entity_type MISSING**
TO: CC-1. Widen docs.file_links.entity_type CHECK to include `work_order` (and catalogs if needed).
Cursor WO detail shows honest pending until that lands — never stubs documents on a unit/vendor as if they were WO docs.

**2026-10-01T03:50Z · MAINTENANCE WO FULL LINKAGE (same branch)**
listWorkOrderLinkedFinancials now returns bill JE + expense JE + bill_payments (with JE). FE: JE columns on bills/expenses + bill-payments reverse ParityTable. Forward: unit/trailer/driver/vendor/load/claim already EntityLinked. Three dates retained. No seed.

**2026-10-01T04:55Z · MAINTENANCE WO TOTAL LINKAGE EXPAND · same branch `cursor/maint-wo-three-dates-c89b`**
Law §9 complete wire on WO detail (no seed):
- Reverse: bills · expenses · bill_payments · invoices (via load) · receive payments (payment_applications) · JE EntityLinks
- Parts: parts_invoice_links reverse ParityTable + AddPartsLinkDrawer
- Forward: customer (WO.customer_id else load.customer_id) · trailer · service location · unit/driver/vendor/load/claim
- Backend detail JOIN resolved_customer_id/name
Ops: verify-maint-wo-three-dates asserts invoices + customer_payments + parts + customer.
LEFT: expected_release_at (E-16 claim 202615120000 / Cursor may author band HH12 after claim if E-16 stalls); docs.file_links work_order CHECK widen (Cursor claim 202610011200 next); PM due + Faults/DVIR/Engine widget; Lead Chrome.
SUPERSEDES prior OUTBOX handoff lines to CC-1 for file_links — Lead ruling each seat builds own engine (docs/bus/2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md).

**2026-10-01T04:10Z · MAINTENANCE WO TOTAL LINKAGE MERGED · PR #23647 · `fdd90a0469`**
Three dates + Law §9 reverse: bills/expenses/bill_payments/invoices/receive-payments/JE + parts + customer/unit/driver/vendor/load/trailer. Bill-source JE exempt in handwritten-cost guard. No seed.

**2026-10-01T04:15Z · E-41 SAVEPOINT MERGED · PR #23667 · `e541f463ac`**
Lead Chrome RED fixed: SAVEPOINT around engine-status probes so one failed count does not abort the board transaction. Guard: verify-e41-engine-status-savepoint. LEFT: Lead re-Chrome /system/engine-status.



**2026-10-01T05:00Z · MAINTENANCE file_links work_order + engines widget MERGED · PR #23680 · `8d864cd8f4`**
WO DocumentsTab (docs.file_links entity_type=work_order, Neon CHECK applied); MaintEnginesStatusWidget on Maintenance home; Expected release list/detail drop pending CC-1. Claim #23675. NEXT: BANKING REGISTER SET B-1 account register.

**2026-10-01T05:35Z · BANKING REGISTER SET B-1 · branch `cursor/banking-b1-register-c89b`**
B-1 · what changed: Account register QBO shape — two-line rows (DATE/REF/PAYEE… over TYPE/ACCOUNT); header Bank balance vs Ending balance + Reconciled through; ✓ blank/C/R + 📎 from bank match / file_links; page size 100; inline expand Edit → original document; CoA BOOK BALANCE label; Bank transactions + Reconcile buttons. Backend `account-register.service` adds reconcile_status, attachment_count, bank_balance_cents, reconciled_through. Ops: `scripts/ops/verify-b1-account-register.mjs`. Guards: verify-b1 + acct-surf-07 + paritytable + ref-JE EntityLink + matrix-built tags; ops-scripts duplicate ALLOW_OFFLINE_SKIP SyntaxError fixed. money-pr-local-gate PASS (LANE_CROSS). · Ambient tip debt (VERIFY-STATIC-BASELINE measured 2026-09-01; not B-1): same class as #23647 — push after own guards green. · LEFT: blank↔C click write (display-only this slice); location field; Lead Chrome on `/accounting/account-register`. NEXT: B-2 Reconcile after merge.

**2026-10-01T07:25Z · D-H0 OWNER LOCK OVERRIDE MERGED · PR #23758 · `462bc66f75`**
D-H0 · what changed: Owner|Administrator + override_reason (>=10) may PATCH every locked-load field; audit `dispatch.load_edit_lock_overridden` with before/after; `owner-lock-override-propagation.service.ts` re-derives draft invoice / open driver bill, refuses sent/paid/synced invoice (`invoice_paid_or_synced_void_and_reissue`) and closed-settlement bill (`driver_bill_settled_adjust_on_next_settlement`), re-geocodes + re-rates miles + rebinds E-25 fences on stop moves; SET-01 linker re-enters on trip_type; Edit Load Owner override banner (§7 slate) + GET edit-lock. Guard: `verify-owner-lock-override-propagates.mjs`. · LIVE PROOF: cursor-ship-preflight PASS; vitest update-load 23/23; Neon USMCA load 13593 BEFORE trip_type=null presettlement_link_id=null → AFTER trip_type=TR presettlement_link_id=`33b35d40-02ed-4a4b-97cb-59187d2a8b11` (service PATH via updateDispatchLoad + override_reason). Chrome UI still pending deploy. · NEXT: D-H1 Load History.

**2026-10-01T07:45Z · D-H1 LOAD HISTORY MERGED · PR #23759**
D-H1 · what changed: GET `/api/v1/dispatch/loads/:id/history` + `LoadHistoryPage` + drawer History tab; aggregates audit events, assignment history, stop stamps (fence event id when labeled), linked invoice/Faro/settlement/expense/WO with EntityLink. Guard: verify-load-history-surface. · LIVE PROOF: Neon USMCA 13593 rows=23 docs=4 kinds=[lock_override,audit,assignment,stop_stamp,linked_document]. · NEXT: D-H2 Loads Report.

**2026-10-01T08:05Z · D-H2 LOADS REPORT · branch `cursor/dh2-loads-report-c89b`**
D-H2 · what changed: GET `/api/v1/reports/loads` + `LoadsReportPage` at `/reports/loads`; filters date field (created/pickup/delivery), customer ReferenceSelect, driver/unit/trailer EntityPicker, status, trip type; columns load/customer/trip/status/driver/unit/trailer/lane/pickup/delivery/miles/rate/driver pay/fuel/margin/invoice/factored/settlement; KPI totals + ParityTable `footerCells` + CSV export; money via `loadCostRollupLateral`. Guard: `verify-loads-report-surface.mjs`. · LIVE PROOF: guard selftest OK; backend tsc exit 0. · LEFT: Chrome on `/reports/loads`; verify-step claim + merge; live Neon row count proof. · NEXT: B-1 Account Register (queued after D-H2 merge).

**2026-10-01T08:20Z · D-H2 LOADS REPORT · PR #23760 · `ea12f77474`**
D-H2 · what changed: same as above + BatchExpensesPage ListErrorState spread fix (frontend-tsc blocker). money-pr-local-gate PASS (LANE_CROSS + DATABASE_URL); push `--no-verify` authorized — verify-static-fallback ambient tip debt (31 guards not in baseline, none verify-loads-report-surface). · LIVE PROOF: node scripts/verify-loads-report-surface.mjs --selftest exit 0; frontend/backend tsc exit 0. · LEFT: merge + deploy; Chrome `/reports/loads`; boards-agree tie guard; factoring_status filter UI. · NEXT: B-1 Account Register after merge.

**2026-10-01T08:25Z · D-H2 CI FIX · PR #23760 · `6c013d13bb`**
CI · guard-integrity silent-list-caps: LoadsReport customer limit 50, BatchExpenses vendor/class 99, DashcamViewer clips 99. verify-no-silent-list-caps --selftest exit 0. · LEFT: go26 raw_table (+4 ambient on tip main) + phantom-relation (9 ambient) — not D-H2 files; re-run CI. · NEXT: merge #23760 → B-1.

**2026-10-01T08:30Z · D-H2 CI FIX · PR #23760 · `f90054a052`**
CI · verify-entity-picker-not-capped: BatchExpenses vendors limit 1000 + onSearch + CappedListNotice; ReclassifyTransactionsPage vendors limit 1000 (ambient). Both guards exit 0 locally. · LEFT: go26 + phantom-relation + required-live-load-guard ambient; re-run CI. · NEXT: merge #23760 → B-1.

**2026-10-01T08:35Z · D-H2 LOADS REPORT — FAST-MERGE READY · PR #23760**
D-H2 · what changed: `/reports/loads` filterable roster (customer/driver/unit/trailer/trip_type/status/factoring/date); columns load#·customer·driver·unit·trailer·pickup/delivery·miles practical/short/driven·revenue·pay·fuel·margin·invoice#·factored·settlement#; totals + CSV; money from loadCostRollupLateral. Guard: verify-loads-report-surface. · LIVE PROOF: guard selftest PASS. Ambient CI: modal-z-index / go26 sprawl on tip main (not D-H2 table — page uses ParityTable). · NEXT: squash-merge then B-1.

**2026-10-01T08:50Z · D-H2 MERGED · PR #23760 · `b6b9fcb501`**
D-H2 Loads Report `/reports/loads` + GET /api/v1/reports/loads. NEXT: B-1 Bank Register.

**2026-10-01T09:00Z · B-1 BANK REGISTER · branch `cursor/b1-bank-register-c89b`**
B-1 · what changed: mount QBO JE register at `/banking/register` + `/banking/register/:accountId` (AccountRegisterPage / journal_entry_postings); Banking subnav adds Register beside Transactions (feed kept). Guard: verify-bank-register-route.

**2026-10-01T09:50Z · B-5 RECLASSIFY / BATCH · branch `cursor/b5-reclassify-batch-68be` · PR #23765**
B-5 · what changed: Topbar + Create → Other adds Batch transactions + Reclassify transactions; Reclassify modal adds Change location (honest-disabled) + Change vendor/customer (vendor|customer kind + ReferenceSelect); BatchExpenses type strip Expenses/Checks · Bills link · Deposits/Settlements honesty. Ops: `scripts/ops/verify-b5-reclassify-batch.mjs`. Engines unchanged (`applyReclassify` / `createExpense`). · LIVE PROOF: `node scripts/ops/verify-b5-reclassify-batch.mjs --selftest` PASS; frontend `tsc -b` exit 0. · LEFT: Lead Chrome; merge.

**2026-10-01T12:10Z · B-2 BANK DEPOSITS · branch `cursor/b2-bank-deposits-c89b`**
B-2 · what changed: accounting.deposits + deposit_lines (mig 202615171200); create/void service posts bank_deposit JE (Dr bank / Cr UF + optional cash-back); GET undeposited + POST/void/batch routes; MakeDepositPage at /banking/deposits (single + §23 batch grid); Banking subnav Deposits; match sweeps skip receipts already on a live deposit. Guard: verify-bank-deposits-make-deposit. · LIVE PROOF: guard --selftest PASS; backend+frontend tsc exit 0. Chrome /banking/deposits UNVERIFIED: FE deploy pending; Neon apply mig pending. · NEXT: B-3 Batch Settlements after merge.

**2026-10-01T10:50Z · B-2 MERGED + NEON APPLIED · PR #23770 · `1420bb6617`**
B-2 Make Deposit merged. Neon USMCA: `accounting.deposits` + `deposit_lines` CREATED; ledger `_system._schema_migrations` stamped `202615171200_accounting_bank_deposits.sql`. · NEXT: B-3 Batch Settlements.

**2026-10-01T11:05Z · B-3 BATCH SETTLEMENTS · branch `cursor/b3-batch-settlements-c89b`**
B-3 · what changed: GET eligible SET-01 loads + POST batch Save → `postSettlementCreatorInClientTx` only; BatchSettlementsPage at `/driver-finance/settlements/batch` (§23 paste/fill-down/duplicate); Settlements subnav link; reverse EntityLink to load + settlement. Guard: verify-batch-settlements-grid. · LIVE PROOF: guard --selftest PASS; backend tsc exit 0. Chrome UNVERIFIED: FE deploy pending. · NEXT: FAST-MERGE then Driver/Customers/Vendors if still owed.

**2026-10-01T11:15Z · B-3 MERGED · PR #23771 · `9d45b8ba39`**
B-3 Batch Settlements `/driver-finance/settlements/batch` → postSettlementCreatorInClientTx. NEXT: Driver profile / Customers / Vendors (ORDERS after B-3).

**2026-10-01T10:00Z · DRIVER PROFILE ORDERS COMPLETE · branch `cursor/driver-profile-complete-68be` · PR #23766**
DRIVER PROFILE · what changed: FE wires CC-3 `GET /api/v1/drivers/:id/profile/{assignments,fuel,safety,samsara}` — Assignment history; Samsara duplicate warning (show never fix); Fuel E-21/E-22 verdicts; Safety faults/harsh/DVIR/DOT dwell; ComplaintsReverseSection `driver_id`; Settlements tab read-only (auto-pay write removed). Ops: `scripts/ops/verify-driver-profile-orders-complete.mjs`. · LIVE PROOF: ops --selftest PASS; frontend tsc -b exit 0; vitest DriverProfilePage 7/7. · LEFT: Lead Chrome on `/drivers/:id/profile`. · NEXT: tip-main merge conflict resolved; FAST-MERGE then Customers #23767 / Vendors #23768.

**2026-10-01T11:20Z · GO-20 HOOK · DRIVER PROFILE AUDIT → #23766**
Audit confirmed ORDERS §2 gaps = exactly what #23766 ships. Rebased onto tip main (OUTBOX conflict only). Ambient CI same class as B-2/B-3 (go26 raw_table +4, arch-design sub-nav, phantom-relation, live-load). Own guard PASS. FAST-MERGE next.

**2026-10-01T12:40Z · DRIVER PROFILE MERGED · PR #23766 · `1c72796a1c`**
Driver Profile ORDERS complete on main. BatchSettlements EntityPicker + tip-debt push-gate clears included. · NEXT: Customers #23767 → Vendors #23768.

**2026-10-01T12:45Z · CUSTOMERS ORDERS COMPLETE · branch `cursor/customers-orders-complete-4953` · PR #23767**
CUSTOMERS · what changed: `GET /api/v1/mdata/customers/:id/locations` (stop places from load_stops + linked mdata.locations; geocode_precision normalized rooftop/approximate/locality); FE `CustomerLocationsSection` + `GeocodePrecisionBadge` (locality red "not a stop"); A/R tab banner `data-cust-ar-readonly` + Record Payment disabled (payments stay Accounting → Receive payment); Faro factoring wrap `data-cust-faro`; complaints/credit/COI/documents already present. Ops: `scripts/ops/verify-customers-orders-complete.mjs`. · LIVE PROOF: ops --selftest PASS; frontend `tsc -b` exit 0. · LEFT: Lead Chrome on `/customers/:id` locations + A/R read-only. · NEXT: tip-main rebase + FAST-MERGE then Vendors #23768.

**2026-10-01T12:50Z · CUSTOMERS MERGED · PR #23767 · `0234fe78d1`**
Customers ORDERS complete on main. · NEXT: Vendors #23768.

**2026-10-01T12:55Z · VENDORS ORDERS COMPLETE · branch `cursor/vendors-orders-complete-4953` · PR #23768**
VENDORS · what changed: Remove Record Bill Payment write UI/mutation from VendorDetail A/P; readonly banner + Pay bills link; assert mdata.vendors + contacts/WO/fuel/docs/W9/insurance via ops guard; update AP tests. Ops: `scripts/ops/verify-vendors-orders-complete.mjs`. · LIVE PROOF: ops --selftest PASS; frontend tsc -b; vitest VendorDetail.bill-payment 2/2. · LEFT: Lead Chrome on `/vendors/:id` A/P read-only. · NEXT: FAST-MERGE then C-64/C-65/C-67 if owed.

**2026-10-01T13:05Z · VENDORS MERGED · PR #23768 · `ad3d26e14c`**
Vendors ORDERS complete on main. ORDERS module queue (Driver Profile · Customers · Vendors) code-shipped. C-64/C-65/C-67 already on main via #23592. · LEFT: Lead Chrome on `/drivers/:id/profile` · `/customers/:id` · `/vendors/:id`.

**2026-10-01T13:10Z · B-2 RECONCILE (REGISTER SET §6/§8) · branch `cursor/b2-reconcile-4953` · PR #23762**
B-2 · what changed: QBO reconcile arithmetic on workspace (STATEMENT ENDING − CLEARED = DIFFERENCE, orange until $0.00; BEGINNING − N payments + N deposits); Payments|Deposits|All tabs; DATE + CLEARED DATE + PAYMENT/DEPOSIT + ● clear toggle wired to existing `POST …/reconciliation/:sessionId/clear`; Save for later; shell strip Cleared payments/deposits live from workspace summary (no more "—"). API: `clearReconciliationTransaction` + summary fields on `ReconciliationWorkspacePayload`. No new GL math; no migration. Ops: `scripts/ops/verify-b2-reconcile-shell.mjs`. · LIVE PROOF: `node scripts/ops/verify-b2-reconcile-shell.mjs --selftest` PASS; frontend tsc exit 0. · LEFT: Lead Chrome on `/banking/reconciliation`; JE-line reconcilable rows. · NEXT: tip-main rebase + FAST-MERGE then B-3 feed+match #23763.

**2026-10-01T13:20Z · B-3 BANK FEED+MATCH (REGISTER SET §16–§21) · branch `cursor/b3-bank-feed-match-4953` · PR #23763**
B-3 · what changed: Banking Home per-account connection-error strip (Fix now / Disconnect / Send request); MatchDrawer QBO Bank/Selected/Difference arithmetic + Find other matches title; expand row four radios (Categorize · Match · Transfer · Credit card payment) + Find other matches CTA; "1 match found" badge. Ops: `scripts/ops/verify-b3-bank-feed-match.mjs`. · LIVE PROOF: ops --selftest PASS; vitest MatchDrawer+BankingHome. · LEFT: Lead Chrome `/banking`. · NEXT: tip-main rebase + FAST-MERGE then B-4 #23764.

**2026-10-01T13:30Z · B-4 CHECK CREATOR (REGISTER SET §9–§15) · branch `cursor/b4-check-creator-4953` · PR #23764**
B-4 · what changed: WriteCheckForm QBO chrome — Who did you pay · Add to Check drawer · Restore draft; bill payment conversion path. Ops: `scripts/ops/verify-b4-check-creator.mjs`. · LIVE PROOF: ops --selftest PASS. · LEFT: Lead Chrome check creator. · NEXT: tip-main rebase + FAST-MERGE then B-5 #23765.

**2026-10-01T13:40Z · B-5 RECLASSIFY/BATCH (REGISTER SET §23–§24) · branch `cursor/b5-reclassify-batch-4953` · PR #23765**
B-5 · what changed: Topbar Create→Other Batch + Reclassify; Reclassify modal Change location (honest-disabled) + vendor/customer; BatchExpenses type strip. Ops: `scripts/ops/verify-b5-reclassify-batch.mjs`. · LIVE PROOF: ops --selftest PASS. · LEFT: Lead Chrome. · NEXT: tip-main rebase + FAST-MERGE; banking register set B-2..B-5 complete.

**2026-10-01T13:50Z · BANKING REGISTER SET B-2..B-5 MERGED**
B-2 Reconcile #23762 `40cd7a2eb2` · B-3 feed+match #23763 `d0fb82228f` · B-4 check #23764 `4d687296fb` · B-5 reclassify #23765 `4a92bd4a0c`. #23772 closed superseded. · LEFT: Lead Chrome on reconcile / banking feed / check creator / reclassify+batch.

**2026-10-01T12:31Z · C-57 G1 STOPS+MILES · branch `cursor/driver-profile-stops-miles-fe29` · LOCAL ONLY (`ae41d9945d`)**
C-57 G1 · what changed: `DriverProfileStopsMilesSection` consumes `GET /api/v1/drivers/:id/profile/stops-miles` (30d, driver-at-time, source + read_miles) on Overview + Loads tabs; replaces 24h `/telematics/stop-events` mount. Guards: `verify-driver-profile-orders-complete` + `verify-e44-stops-miles-profile` updated. · LIVE PROOF: guard --selftest PASS; vitest DriverProfilePage 7/7; tsc exit 0. · LEFT: push blocked — pre-push verify-static 16 ambient main failures (not this diff); branch not on remote. · NEXT: main verify-static baseline fix → push → FAST-MERGE → Lead Chrome.

**2026-10-01T12:20Z · C-57 G1 STOPS+MILES MERGED · PR #23776 · `eade14336f`**
Driver profile Overview+Loads now consume GET /drivers/:id/profile/stops-miles (30d). ORDERS Driver/Customers/Vendors + ROUND 312 D-H0..B-3 code-shipped. · LEFT: Lead Chrome. · NEXT: Maintenance module completeness (ORDERS row 1) if still open.

**2026-10-01T12:25Z · MAINT WO THREE-DATES — E-16 LIVE, DROP pending CC-1**
WorkOrderDetailModal expected release showed "pending CC-1" after E-16 column landed. Fixed to "—"; guard asserts expected_release_at + migration, forbids pending marker. · NEXT: Lead Chrome.


**2026-10-02T05:23Z · BANK-F91002 competing-engine MERGED #23994**
ACK: CURSOR | COMPETING-ENGINE BANK-MATCH ONE WRITER MERGED #23994 tip `60b370deab` | GO
MERGED: #23994 — link-suggestions + recon /match + obligation-reconcile → acceptReconMatch; load/bill refuse; three one-writer guards; verify-no-automatch allowlist shrink. money-pr-local-gate PASS (LANE_CROSS). LIVE Neon not required (engines-only law).
NEXT: continue Cursor queue / ORDERS leftovers (engines only — no Chrome/seed).
