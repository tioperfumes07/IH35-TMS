# IH35-TMS — FINAL CODER HANDOFF · 2026-07-19
_One document. Everything from this session + all agent findings. Hand to Cursor/Coder._

## PROVENANCE (how each fact was verified)
- **LIVE-REPO (me, this session):** block counts via `npm run reconcile:blocks` on current main; migrations/routes/components read directly; decision citations from lockdown/specs/memory. 
- **TRIAGE (16 fresh sonnet passes on live main + 2026-07-16 adversarial sweep):** the 792 dispositions; unknowns labeled UNVERIFIED, never guessed.
- **RELAYED-GUARD (Claude agent w/ authorized Neon access):** all prod-DB counts in §7. NOT independently re-verified by me (prod is gated §1.5).
- Nothing here touched the ledger/schema/migrations. Financial/schema/flag changes below are GATED — owner-approve + GUARD live-verify, never self-merge.

## 1. TRUE COUNTS (live `reconcile:blocks`, main, post-purge)
| metric | value |
|---|---|
| TO BUILD | 34 (6 PENDING + 28 PENDING-GATED) |
| NEEDS-VERIFY | 61 |
| DONE (merged on main; NOT = verified) | 587 |
| AUDIT-NOTE remaining | 504 (was 792) |
| purged this session | 287 |
| total blocks | 1186 (was 1473) |
| merged-PR spine | 2621 |

TWO AXES (stop conflating): **34 build tickets** (measurable) vs **~418 open audit findings** (the '408'). Do not sum.

## 2. THE 34 TO BUILD
**6 PENDING (build now):** accounting-2-ap-aging-qbo-mirror-population · AF-8-payroll-bridge · CHAIN-08/chain-08 TRANSP demo-data purge (pre-go-live) · driverprofile-1-companion-tier1-rls-hardening · fk-safety-events-driver-status-0289
**28 PENDING-GATED (need owner gate then build):** AF-1 entity-COA fix · AF-2 QBO drift · AF-4 A/P bills migration (~$1.18M) · AF-5 34 stub-catalogs · AF-7 money controls · CHAIN-06 invoice→AR · CHAIN-07 settlements 500+GL · CONN-4 EDI · FH-VERIFY finance-hub 1-8 · STMT-3 1099+425C · VOID-VERIFY · FIX-05 banking-split · ITEM-02 excel-upload RLS · BLOCK-01 depreciation · BLOCK-02 driver-escrow · BLOCK-03 IFTA · BLOCK-17 W2/1099 · BLOCK-19 audit-hash · BLOCK-24 1099-annual · BLOCK-25 consolidation · HOS-FANOUT-03-08 · HOS-MAP-samsara · HOS-PRC-DATA · HOS-PRC2 · DISP-WIZARD-edit-load · DISP-WO-modal · ENT-AUDIT · USMCA-LAUNCH

## 3. AUDIT-NOTE PURGE (PR #2762) — 287 retired, reversible, evidence-tagged
NOISE 116 · RESOLVED 148 · DUPLICATE 23. Markers: superseded_by/duplicate_of (git-reversible, nothing deleted). Held for confirm: 79 (fresh=resolved vs stale sweep=open, prose-only).

## 4. REMAINING OPEN BACKLOG — 418 findings, by module (the real work)

### dispatch (85)
- `0008-d-abandonment-pay-first-then-escr_DISPATCH` — grep -i escrow returns ZERO hits in abandonment.service.ts (369 lines) / abandonment.routes.ts; pay-first-then-escrow-shortfall logic entirely absent.
- `0008-g3-qbo-mirror-canonical_DISPATCH` — Both accounting.qbo_* (18 files) and mdata.qbo_* (85 files) still exist and are actively written; no writer repoint/retirement performed.
- `0008-h-create-bill-line-items-load-id_DISPATCH` — Migration 202607200000_bill_lines_load_id.sql exists but is marked HOLD-FOR-JORGE / not run; accounting.bill_lines.load_id column does not exist on prod yet.
- `0010-f1-orphan-fk-columns_DISPATCH` — scripts/verify-orphan-fk-inventory.mjs exists + registered as npm script (package.json:893) but not wired into any CI workflow or verify:arch-design chain.
- `0091-b1-3-bill-unit-allocation-delete-not-void_DISPATCH` — bills.routes.ts:453-467 still does raw DELETE FROM accounting.bill_unit_allocation then fresh INSERT -- violates void-not-delete (CLAUDE.md sec2); no is_active 
- `0091-g10-h1` — 0034_loads_schema.sql:211-212 shows DELETE-grant asymmetry (loads no DELETE, load_stops has DELETE); no REVOKE migration; CASCADE children still ON DELETE CASCA
- `0091-g7-1_DISPATCH` — settlement-payment.service.ts:8-120 implements a full state machine w/ validateTransition(), but no transition-matrix pinning test exists anywhere in the repo.
- `0091-info-b3-3` — Adversarial pass refuted the premise: migration 0116_p6_privilege_reconciliation.sql:17 GRANTs DELETE on ALL TABLES -- ih35_app CAN hard-delete loads; the FK es
- `0091-m-lists-1` — Same generic boilerplate block file, no specific claim extractable to verify against code
- `0243-b3-3-fuel-g18-trigger-hard-delete-gap` — db/migrations/0300_create_fuel_transactions.sql:10 load_id uuid NULL REFERENCES mdata.loads(id) ON DELETE SET NULL (not RESTRICT); no guard found asserting no h
- `0243-c1-4-dead-duplicate-components-dispatchli` — No specific duplicate component pair named in registry; not located within available time
- `0243-d1-2-vendors-split-two-tables_DISPATCH` — Only one mdata.vendors table located (0008_mdata_init.sql); could not identify the second vendor table the finding refers to
- `0243-d1-3-inline-drawers-drop-captured-fields` — NewVendorDrawerForm.tsx collects ~14 fields (incl. mobile/website/printOnChecks/city/state/zip) but createVendor() call forwards only 6 -- rest silently dropped
- `0243-g10-h1-load-stops-delete-grant-live` — db/migrations/0034_loads_schema.sql:212 still GRANT ... DELETE ON mdata.load_stops TO ih35_app; no later REVOKE DELETE migration found
- `0243-g11-5-period-close-no-reopen_DISPATCH` — apps/backend/src/accounting/p7-wave2.routes.ts:335 POST /api/v1/accounting/periods/:id/reopen exists, gated by MONEY_CONTROL_PERIOD_REOPEN_FLAG_KEY, audited via
- `0243-g11-7-factoring-reserve-two-place_DISPATCH` — reserve-tracker.service.ts reads accounting.factoring_reserve_movements from migration 202607130000 which is HELD (db/migrations/.held-migrations.json) -- not l
- `0243-g4-idem1-money-routes-off-allowli_DISPATCH` — journal-entries.service.ts has an idempotency_key DB constraint but no evidence found of a route-level money-routes idempotency allowlist/middleware matching th
- `0243-g4-tx1-source-gl-two-transactions_DISPATCH` — No matching code/pattern located for 'source GL two transactions' claim within available time
- `0243-g9-h4-load-status-advisory-not-enforced` — dispatch/driver-pwa/dispatch-view.routes.ts arrival(line 318) AND departure(line 385) endpoints both call validateLoadStopStatusWrite(), which explicitly blocks
- `0243-g9-m-eight-workflow-status-defects` — PR #2131 fixed load-number-500 + bulk set_status emit only; commit msg explicitly defers auto-pay/escrow-wiring/mark_factored as financial
- `0243-h3-2-three-posting-flags-unprotected_DISPATCH` — no admin/feature-flag write route found to inspect for protection; cannot confirm state either way from repo
- `0243-h6-1-qbo-refresh-token-race` — integrations/qbo/qbo-oauth.service.ts refreshAccessToken has no pg_advisory lock/mutex; cron (hourly)+on-demand getValidAccessToken can race QBO's one-time-use 
- `0251-gap10-commodity-product-catalog` — no commodity/product catalog table found in db/migrations or backend routes
- `0251-gap12-commodity-equipment-mapping` — no commodity<->equipment mapping table or route found
- `0251-gap13-commodity-rate-matrix` — no rate_matrix or commodity-rate table/route found anywhere in repo
- `0251-gap16-charge-code-catalog` — accounting.invoice_lines.line_type is a fixed CHECK enum (10 values); no editable charge-code catalog table
- `0251-gap17-charge-code-default-rates` — no charge-code catalog exists (see gap16), so no default-rate field/table either
- `0251-gap21-stop-location-catalog` — mdata.locations (0008) + mdata.load_stops.location_id FK (0034), joined in 0036 -- stop location catalog exists and is used
- `0251-gap5-chargecode-gl-mapping_DISPATCH` — invoice-line-revenue-resolution.service.ts derives revenue_code from line_type, resolves account_id via expense_category_account_map(category_kind='revenue'), m
- `0251-gap9-charge-line-audit-trail` — accounting.invoice_lines only has soft_deleted_at/soft_deleted_by (202606271580); no field-level change-history/audit chain found
- `0270-no-auto-driver-termination-walkoff-noshow` — dispatch/loads.routes.ts fires escrow events on driver_walkoff/no_show but no hook into a termination workflow; mdata.loads->mdata.drivers status link is one-wa
- `0280-03-open-loads-driver-unit-linkage` — getOpenLoadsBreakdown() (apps/backend/src/dispatch/active-loads-count.ts) uses assigned_primary_driver_id but has zero unit/equipment reference
- `0280-12-message-queue-driver-customer-linkage` — dispatcher.service.ts loadIncomingMessageQueue joins driver+load only, no customer; DispatcherHome.tsx renders raw count, no drill-through
- `0280-20-cooling-drivers-last-load-linkage` — dm-home.service.ts cooling-drivers query joins mdata.loads load_activity subquery for days_idle calc
- `0394-qbo-transaction-pull-missing_DISPATCH` — CDC_ENTITIES in apps/backend/src/integrations/qbo/qbo-cdc.service.ts = 'Invoice,Bill,Payment,BillPayment,JournalEntry,CreditMemo,Customer,Vendor,Item,Account' —
- `0441-mod10-cashflow-income-loadid-plaintext` — EarningsSection.tsx line 26 renders the Load column as `<td>{line.id}</td>` — raw text, no Link/drill-through to the load record
- `0441-mod11-dispatch-margin-cash-500` — dispatch-margin.routes.test.ts CODER-14 regression test: 'GET .../dispatch-margin must NOT 500 when settlement_lines.load_id is absent', asserts statusCode !== 
- `0441-mod11-profit-per-truck-cron-double-count` — reports/queries/profit-per-truck-weekly.ts LEFT JOINs mdata.units to BOTH mdata.loads and maintenance.work_orders in one query, then SUMs each — classic fan-out
- `0441-mod12-docs-lowest-uuid-company-bug-live` — files.routes.ts upload schema now accepts explicit operating_company_id, validates access, and uses it instead of resolveOperatingCompanyId's lowest-UUID fallba
- `0441-mod13-coa-merge-no-gl-repoint_DISPATCH` — No CoA-merge / account-merge functionality (code, migration, or route) found anywhere in the repo; cannot determine current state of this dispatch item.
- `0441-mod13-load-cancellation-reasons-split-bra` — verify-load-cancellations-report.mjs and db-verify-load-cancellation-reasons.ts both exist, implying prior remediation work, but did not read full contents to c
- `0441-mod4-dispatch-cancel-bypasses-approval-ga` — PATCH /dispatch/loads/:id/transition (loads.routes.ts ~1192-1235) allows direct transition to 'cancelled' bypassing cancelLoad()'s owner-approval gate (cancella
- `0441-mod4-dispatch-cancellation-reasons-decoy-` — CancelLoadModal.tsx:80-89 sends cancel_reason_code; cancellation.service.ts persists to dispatch.load_cancellations + catalogs.load_cancellation_reasons, fully 
- `0441-mod4-dispatch-chat-no-attachment-upload` — DispatchChatPage.tsx/api/chat.ts has no file input/FormData/upload call; ChatMessage msg_type photo/document values are decorative-only
- `0441-mod4-dispatch-detention-in-shop-hardcoded` — 'In shop' driven by listDispatchInShopUnits API + FleetOosStrip real unit fields; detention is real API-sourced driver_lifecycle_stage value, not hardcoded
- `0441-mod4-dispatch-mapview-no-real-map` — MapView.tsx:59-86 explicitly renders 'Map provider not configured' placeholder whenever isDispatchMapProviderConfigured() is false; no real map renders
- `0441-mod5-onboarding-step-data-only` — onboarding.routes.ts lists 'vehicle_assignment' step but never writes mdata.units/drivers.assigned_primary_driver_id; only merges JSON step_data
- `0441-mod7-invoices-plaintext-audit-log_DISPATCH` — InvoiceDetailPage.tsx:315-325 navigates to real /accounting/audit-trail route (manifest.tsx:3586), fixing the prior dead /reports?invoice_id= link
- `0441-mod7-je-rows-no-onclick_DISPATCH` — ManualJEListPage.tsx:160 onRowClick navigates to /accounting/journal-entries/:id detail
- `0441-mod9-merge-vendors-no-gl-repoint_DISPATCH` — createDriverVendorMerge (data-infra.service.ts) only audits + repoints qbo_vendor_id pointer; never repoints/deactivates GL-linked bills.
- `0441-mod9-quality-history-cant-attach-load-inv` — Backend accepts related_load_id/related_invoice_id on quality events, but CustomerDetail.tsx create form has no picker for either field.
- `0473-2-4-ap-aging-partial-mismatch_DISPATCH` — fin20-aging.service.ts:401 filters status IN ('unpaid','partial') but the write path uses 'partially_paid' — partial bills undercounted once flag is on.
- `0490-critical-users3-owner-mint-approval-path` — workflow-routes.ts:304-312 WF-064-IDENT-002 approval branch has no callerIsOwner check — an Administrator can approve an Owner-role grant.
- `0490-new3-c2-1-detectitemsdrift-scoping` — drift-detector.ts:167-183 detectItemsDrift's missingQbo query has no operating_company_id filter — cross-entity items can misattribute drift.
- `0490-section-c-2-reporting-vs-reports-drift` — 00_LOCKED_DECISIONS.md says reporting.* is canonical; verify-no-deprecated-schema-creates.mjs treats reporting as DEPRECATED — contradictory, unresolved.
- `0519-lg1-5-nullable-financial-columns_DISPATCH` — docs/specs/db-integrity-hardening-0519.md LG1 explicitly 'not-built'; grep confirms no SET NOT NULL added for the 5 named accounting columns.
- `P4-01_SAFETY-INSURANCE-LINK_DISPATCH` — db/migrations/202607250000_phase4_crossmodule_fks.sql (P4-01/02/03 batch) is HELD, NOT applied on prod (.held-migrations.json); backfill/resolver/route wiring d
- `P4-02_LEGAL-LINK_DISPATCH` — Same HELD batch migration 202607250000_phase4_crossmodule_fks.sql, not applied on prod; legal.matters FK + route wiring deferred.
- `P4-03_UNIT-IDENTITY_DISPATCH` — Same HELD batch migration (mdata.assets.unit_id FK), not applied on prod; per-unit cost reconciliation via the bridge not proven.
- `P4-04_SAFETY-COST-GL_DISPATCH` — No journal_entry/posting code found under apps/backend/src/insurance or safety for claim payout/settlement/legal-fee JE.
- `P4-05_DAMAGE-CLAIM-FK_DISPATCH` — db/migrations/202607240000_incidents_auto_claim_fk.sql is HELD in .held-migrations.json with no applied_on_prod flag — not yet run.
- `P4-06_WO-FK_DISPATCH` — db/migrations/202607230000_work_orders_unit_driver_fk.sql header: '[HOLD-FOR-JORGE] DO NOT RUN ON PROD'; merged as PR #2334 but not executed on prod.
- `P4-07_PARTS-GL_DISPATCH` — No parts-receipt/WO-consumption JE posting code found under apps/backend/src/maintenance; acceptance itself says 'Design doc; then...' — not built.
- `PHASE2_CANCEL-TONU_billable-cancellation-no-charge_DISPATCH` — apps/backend/src/dispatch/cancellation.service.ts records cancellation_charge_cents/billable_to_customer but has ZERO 'invoice' references (grep -c = 0) — no TO
- `PHASE2_LOAD-INVOICE_no-auto-ar_DISPATCH` — No auto-invoice-on-delivery trigger found (grep for autoInvoice/createInvoiceFromLoad/delivery-triggered invoice = none); invoice creation remains a manual rout
- `bf10c-driver-conduct-catalogs-scorecard` — PerformanceScorecardSection.tsx exists (32 lines) but contains no 'catalog'/'conduct' terms or catalogs-schema linkage; no driver-conduct-catalogs-backed scorec
- `bf2-walkoff-termination-trigger` — dispatch/loads.routes.ts driver_walkoff status transition only updates the load row; never touches mdata.drivers.status/deactivated_at. escrow-separation.servic
- `biz-flow-1-termination-not-linked-to-load` — mdata/drivers.routes.ts deactivate/terminate routes (~lines 1499-1589) update status/deactivated_at only — no load_id or triggering-load reference field is writ
- `biz-flow-6-payment-application-manual_DISPATCH` — CustomerDetail.tsx:869-895 payAutoApply waterfalls cash across open invoices sorted asc by issue_date (oldest-first), default-on.
- `biz-flow-7-no-automatic-team-assignment` — book-load.service.ts requires explicit team_id; 0 hits for autoAssignTeam/suggestTeam/detectTeam. Confirmed backlog-verify/dispatch.md.
- `bl-04-no-rate-con-pdf-generation` — Only inbound ratecon-extract (OCR of uploaded rate-con) exists; no outbound Rate Confirmation PDF generator anywhere in repo.
- `coder-work-order-t1-7-escrow-ui-zero-callers` — 3 mounted write routes (escrow/open,deposit,release, routes.ts:41,106,123) have zero frontend callers; EscrowPage.tsx only calls list* reads.
- `custvend-par1-g3-customer-statement-en_DISPATCH` — Customers.tsx Statements tab is an explicit stub: 'Needs a customer statement generator endpoint - flagged as a follow-up.'
- `d-02-cancel-load-shown-on-unsaved-load` — LoadDetailDrawer.tsx:706-707 Cancel Load button is disabled-but-still-red on unsaved load, not replaced with a plain 'Close' action.
- `dispatch-board-db2-db7-fixes` — DB-2/DB-4 confirmed shipped in DispatchKanban.tsx; DB-3 (gear+scroll fix) has zero code trace, unconfirmed/possibly unshipped.
- `dispatch-sweep-gap-11` — No DocumentUploadWidget.tsx, no verify-upload-widget-presence.mjs; not embedded in Expense/Bill/Estimate/WO/BookLoad forms per GAP-11 spec.
- `dispatch-sweep-gap-15` — No pre-settlement-validation dir/service/route files anywhere in repo (GAP-15 spec target files all absent).
- `fk-termination-load-0289` — No driver_finance.terminations (or equivalent) event table with source_load_id FK to mdata.loads exists in any migration; termination tracked only via mdata.dri
- `flow1-auto-termination-walkoff-noshow` — driver_walkoff/driver_no_show are terminal load statuses that fire emitAutoProposedEscrowEvents only; no code path fires driver termination/deactivation off tho
- `flow7-auto-team-assignment` — No service reads mdata.driver_teams for the assigned driver and auto-populates load.team_id at booking; team_id is a manual pass-through field only (book-load.s
- `linkage-walkoff-no-auto-termination` — Setting load status to driver_walkoff triggers emitAutoProposedEscrowEvents (loads.routes.ts:1226) but no code sets mdata.drivers.status='Terminated' automatica
- `load-cancellations-fk-per-entity-repoi_DISPATCH` — Migration 202606300130_load_cancellations_per_entity_fk.sql added the per-entity FK + backfill but its own header explicitly DEFERS switching 5 live backend con
- `phase14-audit-241` — No source_file text in repo, no distinguishing title beyond the id. Same generic dispatch series as 231-245; cannot determine this id's specific ask from repo a
- `ruling-4-embezzlement-reclass-off-ar-q_DISPATCH` — No CPA ruling or QBO-side reclass evidence found in repo; MASTER-MANIFEST-2026-07-10.md still lists 'partial', missing the QBO-side subtype reclass + CPA theft-
- `sweep-fix-17-27-fixture-names-and-pager` — scripts/verify-no-test-fixture-names.mjs TEST_PATTERNS array only matches TEST-VENDOR; @example.com/m2-probe/m2-stop were never added as blocked patterns (comme

### accounting (66)
- `0033-audit-schema-manifest-tool` — No scripts/audit-schema.mjs and no docs/schema/SCHEMA-MANIFEST.json anywhere; substitute verify-backend-schema-contract.mjs is a static migration-file parser, b
- `0091-d1-2` — mdata.vendors and mdata.qbo_vendors remain split and both actively referenced across backend; awaiting owner decision on canonical vendor table (2 open Jorge de
- `0091-m-lists-2` — Same generic boilerplate block file, no specific claim extractable to verify against code
- `0242-no-auto-customer-charge-on-cancellation` — dispatch/cancellation.service.ts records billable_to_customer/cancellation_charge_cents as data only; no invoice/bill creation call anywhere in the file
- `0243-g4-deploy-smoke-fixed-unit-test-owner` — Could not locate the specific deploy-smoke/unit-test-owner claim in available time
- `0251-gap11-commodity-gl` — only a free-text 'commodity' field for border-crossing paperwork (0313); no GL account mapping tied to commodity
- `0251-gap22-lumper-expense_VERIFY` — lumper category+GL map (202606251700, merged) + real posting code lumper-posting-rules.ts/lumper-auto-invoice.ts/lumper-cash-advance-split.ts; flag-gated OFF by
- `0251-gap3-vendor-invoice-linkage` — accounting.bills.vendor_id is soft TEXT (2 soft keys, no FK); real FK mdata_vendor_id added but is HOLD-FOR-JORGE, listed in .held-migrations.json, not run on p
- `0251-gap8-accessorials-gl_VERIFY` — deriveRevenueCode maps accessorial/tonu/tax/adjustment line types to 'accessorial' revenue_code, resolved to GL account
- `0280-05-factoring-balance-invoice-linkage` — OwnerHome.tsx Factoring Balance tile shows '{fb.invoices_factored} invoices factored', links to /factoring
- `0280-42-wo-to-expense-flow` — maintenance-posting/poster.service.ts posts WO to bill/expense with work_order_id FK, memo 'Auto-created from work order ...'
- `0285-acct-gap2-no-auto-invoice-send` — No auto-invoice-send code found anywhere in apps/backend/src/accounting or cron directories
- `0441-mod10-cashflow-accounting-routes-dead` — Both accounting/cash-flow.routes.ts and cash-flow/cash-flow.routes.ts registered in index.ts; frontend api/reports.ts calls /api/v1/accounting/cash-flow (getCas
- `0441-mod13-inventory-accounting-none_DESIGN` — DESIGN-status dispatch item; no GL/accounting integration for inventory found, but not clear whether this is an intentional design-hold (per CLAUDE.md financial
- `0441-mod4-dispatch-settings-localstorage-only` — DispatchSettingsPage.tsx: sort/thresholds/auto-routing still localStorage-only; only 'default landing view' persists via API; page's own footnote admits it
- `0441-mod7-bill-subnav-filters-not-creators_UI` — BillsPage.tsx:503-511 has '+ Create' CTA (data-testid=bills-create-cta) wired to CreateBillModal
- `0441-mod7-myaccountant-flag-no-seed` — Migration 202607590000_my_accountant_flag_seed.sql seeds MY_ACCOUNTANT_ENABLED into lib.feature_flags (default OFF); registered in PER_ENTITY_ONLY_FLAG_KEYS
- `0441-mod8-tx-fields-captured-not-sent` — banking.bank_transactions lacks check_number/class_name/location/is_billable/tags cols; categorize payload doesn't send captured UI values.
- `0473-1-1-default-revenue-account-unmapped-line` — CPA ruling gate, not a code bug — no written sign-off exists on hard-fail vs catch-all for an unmapped invoice line, or the standard revenue account.
- `0473-1-6-wo-void-reversal-grain` — Whole-bill-grain reversal is built + guard-pinned (void.service.postVoidReversal) but CPA written confirmation of the grain choice is still outstanding.
- `0473-1-8-tk-transp-lease-asc842` — Locked as operating lease in design docs; LEASE_GL_POSTING_ENABLED stays OFF pending CPA+counsel written ASC 842 confirmation, not yet given.
- `0519-at2-no-db-enforced-sod` — Confirmed via migrations: no approved_by/posted_by columns or approver<>creator CHECK on journal_entries/posting batches; owner ruling pending.
- `0519-es1-58-unscoped-tables` — docs/specs/db-integrity-hardening-0519.md ES1: status 'partial' — per-table enforced-parent-FK audit not completed; overlaps unresolved RI1 gap.
- `0519-ri1-689-orphan-fk-columns` — verify-orphan-fk-inventory.mjs only ratchets (baseline now 740, up from 689 at finding time); adding real FK constraints explicitly deferred/owner-gated.
- `a-03-expenses-fullpage-form-not-list-drawer` — ExpensesListPage.tsx: list is canonical route, '+ Create' opens RecordExpenseModal (ParityDrawer); /accounting/expenses/new kept only as additive alias.
- `a-05-bills-no-page-level-create-button` — BillsPage.tsx has page-level button data-testid="bills-create-cta" '+ Create' wired to setCreateOpen(true).
- `audit16-budget-tracking-system` — No dedicated budget-tracking module found in apps/backend|frontend/src; grep 'budget' only hits unrelated Form425C/cache-tiers code.
- `audit17-procurement-purchase-order-system` — No procurement/purchase-order module found anywhere in apps/backend or apps/frontend (zero grep hits for 'procurement'/'purchase order').
- `audit18-treasury-management` — No dedicated treasury-management module; 'treasury' hits are unrelated (CashFlowOverviewPage, NewAccountDrawerForm CoA-type option).
- `audit19-ma-due-diligence-framework` — No M&A due-diligence framework/module; only hit is boilerplate legal-template text (legal-template-library.generated.ts), not a system.
- `audit2-internal-controls-approval-workflow` — Only narrow approval flows exist (settlements/approval.service.ts D1, accounting/role-home/pending-approvals-gl.service.ts). No general configurable internal-co
- `audit20-dividend-tracking-system` — No dividend-tracking module found in backend or frontend; only hit is an unrelated CoA account-type option in NewAccountDrawerForm.tsx.
- `audit21-capex-tracking-approval` — No capex tracking/approval module; 'capex' grep hits are false positives (onCapExceeded selection-cap callback in FleetTable/ParityTable, unrelated).
- `audit23-royalty-tracking-system` — Zero grep hits for royalty tracking anywhere in apps/backend or apps/frontend src.
- `audit24-franchise-tracking-system` — Zero grep hits for franchise tracking anywhere in apps/backend or apps/frontend src.
- `audit25-fx-rate-hedging-translation` — No FX-rate/hedging/currency-translation module; only unrelated hit is mx-tolls.routes.ts (Mexico toll data, not FX hedging).
- `audit3-external-audit-prep-workflow` — Zero grep hits for an external-audit-prep workflow module anywhere in apps/backend or apps/frontend src.
- `audit4-tax-return-automation` — Partial only: accounting/sales-tax/routes.ts has prepare/file sales-tax returns + tax-documents/ has 1099-NEC/1042-S automation. No corporate/income-tax-return 
- `audit5-fraud-anomaly-detection` — Partial only: apps/backend/src/integrations/fuel/fraud-detector/routes.ts is a real fuel-specific detector (severity/resolved_at). No general ledger-wide fraud/
- `audit6-sox-ifrs-compliance-dashboard` — Zero grep hits for a SOX/IFRS compliance dashboard anywhere in apps/backend or apps/frontend src.
- `audit7-cost-center-tracking` — Zero grep hits for a dedicated cost-center tracking module in apps/backend or apps/frontend src.
- `audit8-revenue-leakage-detection` — No dedicated revenue-leakage detection found; load-profitability.service.ts and dispatch-margin.routes.ts compute margin but have no leakage-detection logic.
- `audit9-expense-validation-duplicate-detection` — Only narrow dup checks exist: fuel-transaction-import.ts (ON CONFLICT idempotency) and ap/payment-application.routes.ts (duplicate_bill_in_applications). No gen
- `banking-b4-driver-vendor-account-mapping` — jobs/driver-vendor-mapping-worker.ts (GAP-52, daily) + integrity-monitors/driver-vendor-mapping.js checkAllMappings/persistFindings; initializeDriverVendorMappi
- `banking-grid-sort-resize-rows-per-page` — BankingTransactionsDesignView.tsx: sortBy state (date/description/amount/driver/truck/...), useTablePref column-width resize, pageSize 50|75|100|200|300.
- `biz-flow-6-no-automatic-invoice-sending` — No 'send_invoice'/auto-send-on-create logic found anywhere in apps/backend/src; invoice creation has no automatic email/send trigger.
- `db249-finance-schema-naming-drift` — finance.loans / finance.loan_amortization_rows remain under finance.* rather than canonical accounting.* (scoped to 2 tables, not the claimed 10).
- `db249-index-optimization-3` — None of the 3 specified composite indexes exist on safety.safety_events / accounting.invoices / maintenance.work_orders.
- `dip-mor-pre-post-petition-ap-split` — Zero hits for pre_petition/post_petition/petition_status anywhere; needs CPA + bankruptcy-counsel ruling before any migration is built.
- `dispatch-sweep-gap-21` — No bill-OCR extractor/category-classifier/BillOcrPanel files anywhere; GAP-21 spec target files all absent.
- `dispatch-sweep-gap-25` — Active-driver-set cache/query/recompute services exist but initializeActiveDriverSetRecomputeWorker is never called; routes never registered in index.ts.
- `expenses-list-routing-bug` — apps/frontend/src/routes/manifest.tsx: /accounting/expenses still renders ExpenseCreatePage (wizard); the list lives at /accounting/expenses/list. Not swapped.
- `fact-par-1-submission-workflow` — submission-queue.routes.ts:91-104 only wires channel='manual_download'; no email-adapter or file-drop-adapter despite doc requiring both as configurable channel
- `factoring-asc860-cpa-control-test-open` — Secured-borrowing conclusion is locked (docs/accounting/FACTORING-POSTER-DESIGN.md:12) but no signed CPA control-test applying ASC 860-10-40-5(a-c) to the actua
- `fh-unit-allocation-ui-view-missing` — find apps/frontend/src for *unit-alloc*/*UnitAlloc* returns 0 results -- no frontend page/route/api-client for the Unit-Allocation (FH-7) view exists anywhere.
- `flow2-customer-chargeback-driver-expense` — No design doc or owner/CPA ruling exists for this workflow; grep for 'chargeback' outside factoring context returns nothing relevant.
- `flow3-cancellation-auto-customer-charge` — apps/backend/src/dispatch/cancellation.service.ts records billable_to_customer/cancellation_charge_cents but has 0 hits for createInvoice/createCharge/driver_se
- `flow3-cancellation-billing-deduction-linkage` — No 'cancellation_id' column anywhere in db/migrations/*.sql (0 hits, 2 passes); no FK on accounting.invoices or driver_finance.driver_settlement_deductions.
- `flow6-auto-invoice-sending` — invoices.routes.ts:600-614 has a manual, user-triggered POST /invoices/:id/send only; no automatic fire on leaving draft, no reminder cadence for unpaid invoice
- `flow6-auto-payment-application` — apply.service.ts applyPayment() requires explicit applications array and throws 'no_applications' if empty; no FIFO/oldest-invoice-first auto-allocation logic e
- `global-column-resize-sort-parity-table-phase-a` — ParityTable.tsx implements drag-to-resize (mouse+touch+keyboard a11y, width persistence via storageKey) and controlled/uncontrolled sort, used across ~130 call 
- `h-05-home-kpi-no-date-range-toggle` — OwnerHome.tsx/DefaultHome.tsx subtitle hardcoded 'Workspace snapshot for the last three days'; no date-range control found on Home KPIs.
- `ifta-sales-tax-booking-location-confirm` — Migration 202607011000_transp_coa_role_map_seed.sql:69 comment: 'sales_tax_payable: intentionally NOT seeded (freight not sales-taxed — confirm N/A)' for TRANSP
- `ledger-write-proof-operational-not-found` — No matching script/code named 'ledger write proof operational' found; generic block-ready template with no specific detail beyond name.
- `s-04-no-from-to-date-range-safety-lists` — AccidentsPage.tsx and SafetyEventsPage.tsx now have fromDate/toDate DatePickers, but SafetyIncidentsClusterSurface.tsx (damage-reports/trailer-interchange/cargo
- `usmca-unhide-entity-switcher` — apps/backend/src/org/companies.routes.ts:13-18 filters USMCA_COMPANY_ID out of the company picker unless USMCA_ACTIVE=1 (default OFF) — still hidden in current 

### platform (56)
- `0010-f2-unscoped-financial-tables` — Remediation migration 202606300090 (adds operating_company_id to catalogs.classes) is in db/migrations/.held-migrations.json -- never runs on prod; ~57 tables' 
- `0010-f3-rls-missing-force` — Force-tail migration 202606290002 runs its DO-loop once over pg_class at that migration's sort position -- not drift-proof for later tables; adversarial pass re
- `0033-verify-fk-integrity-guard` — Only scripts/verify-fk-integrity-fault-da-records.mjs exists, scoped narrowly to fault/DA records; no general-purpose orphan-FK CI scan across financial/core sc
- `0091-repo-public` — gh repo view tioperfumes07/IH35-TMS --json visibility returned PUBLIC right now; repo holds live financial/legal-evidence data per CLAUDE.md
- `0219-nested-modals` — Boilerplate block file, no source spec; no clear nested-modal defect/fix located in frontend to confirm either way
- `0243-g2-2-operating-company-id-trusted-raw-ten` — settlements/approval.service.ts + approval.routes.ts still trust raw operating_company_id (no membership/uuid validation); non-financial dispatch/loads.routes.t
- `0243-h2-2-stale-backend-lockfile-unshipped-cve` — backend package-lock.json regenerated; commit is ancestor of origin/main
- `0243-h5-1-append-only-spine-unbounded-growth` — events.event_log has no partition/retention/archival; only related migration (202607510000) is HOLD-FOR-JORGE RLS fix, not growth control; unrelated public.audi
- `0243-h5-3-no-r2-evidence-check-dr-drill-stub-7` — evidence-presence-reconcile.cron.ts (399 lines)+test, invoked via run-dr-drill-evidence-check.ts by scripts/backup-restore-drill.sh
- `0243-h6-2-cash-advance-display-id-no-lock-no-u` — cash-advances/display-id.ts uses pg_advisory_xact_lock(hashtext(scope)); test display-id-advisory-lock.test.ts
- `0252-audit139-performance-management` — no performance_review/scorecard/annual_review code found anywhere in backend
- `0252-audit141-benefits-administration` — only hit is a QBO payroll aggregate 'total_benefits_cents' field, not a benefits-admin module
- `0252-audit142-engagement-tracking` — no engagement/pulse-survey code found
- `0252-audit143-turnover-analysis` — no attrition/turnover-rate code found
- `0252-audit144-diversity-metrics` — no diversity/EEO code found
- `0252-audit145-workplace-culture` — no culture-survey code found
- `0252-audit147-wellness-program` — no wellness-program code found
- `0252-audit150-employee-relations` — no employee-relations/grievance/disciplinary-action code found
- `0275-audit171-data-quality-monitoring` — No data-quality rules-engine/violation-tracking table/dashboard exists anywhere; no design spec in docs/specs/ to build against.
- `0275-audit174-data-security-hardening` — Encryption + audit.row_changes real, but no SELECT/read-access logging mechanism exists; needs owner decision on scope before design doc.
- `0275-audit177-data-integration-monitoring` — integration_sync_log (0175) is real and actively written, but has no dashboard/UI consumer; write-only table, needs design+prioritization.
- `0275-audit178-master-data-governance` — mdata.* tables real/used, but no dedicated MDM-style consistency dashboard/validation job exists; needs owner-scoped design doc.
- `0275-audit181-data-lineage-tracking` — No named target files/design spec exists; owner must scope what 'lineage' means (GL-tracing vs row-change history) before buildable.
- `0275-audit182-data-profiling-system` — No general data-profiling/anomaly module beyond fuel-fraud-detector; no design spec, owner must scope.
- `0275-audit183-data-catalog-system` — No live/queryable data-catalog feature found in apps/; docs/specs are static docs only, not a product feature; owner must scope.
- `0275-audit184-data-dictionary-system` — No live data-dictionary UI found; db/migrations/+docs/specs are de facto static dictionary only; owner must scope.
- `0275-audit185-data-model-documentation` — No live model-performance-monitoring dashboard exists; needs design spec for the documentation artifact before build.
- `0277-error-swallowing-rollback-catch` — Re-ran grep on main: all 8 unlogged rollback-swallow sites still present verbatim (auth/db.ts:181,206,237; samsara-master-sync.cron.ts:112; etc). No app.log.err
- `0280-27-widget-audit-trail-logging` — No audit/log-event calls found anywhere in apps/backend/src/home/home-widgets.routes.ts
- `0280-28-api-response-zod-validation` — Only 1 of ~10+ home widget endpoints (driver-day-summary) uses zod response validation in api/home.ts; rest use manual num() coercion, no schema
- `0280-29-legacy-fallback-tests` — No 'legacy' references found anywhere in home module/tests; cannot determine original finding scope from repo alone
- `0441-mod13-form425c-exhibit-c-opening-balance-` — exhibit-c-bank-reconciliation.ts has an explicit code comment: 'OPENING BALANCE - DEFERRED / FLAGGED FOR JORGE + COUNSEL ... We therefore report opening_balance
- `0441-mod6-idvr-row-not-clickable-session-fake-` — IdvrPage.tsx rows have no onClick/detail handler, only column-level EntityLinks; 'fake session data' portion of claim not located (unverified)
- `0473-1-10-year-end-close-retained-earnings-asc` — Financial-cluster CPA/owner ruling on ASC-topic year-end-close/retained-earnings treatment still unmade; no acceptance criteria in repo.
- `0518-r17-147-fk-less-financial-columns` — Only verify-fk-integrity-fault-da-records.mjs exists (narrow); no comprehensive orphan-FK CI gate over the full financial *_id/*_uuid surface.
- `0519-at1-245-tables-missing-created-by-user-id` — accounting.journal_entry_postings (migration 0092) confirmed to still have no created_by_user_id column; no coverage guard exists either.
- `0519-mig2-4-applied-migrations-no-file-on-disk` — docs/specs/orphaned-migration-records-runbook-0519.md status 'DESIGN/RUNBOOK ONLY'; Step 1 (identify the 4 rows) never executed or documented.
- `biz-flow-1-abandonment-separate-from-terminati` — driver-finance/abandonment.service.ts (chargeback flow) never reads/writes mdata.drivers.status or 'Terminated' — abandonment and termination remain two disconn
- `ci1-build-typecheck-flake-root-cause-and-guard` — Race only ad-hoc-mitigated (pg_advisory_lock in a few db.test.ts); the promised registry-driven scripts/verify-db-test-isolation.mjs guard was never built.
- `coder-32-migration-drift-prod-triage-pending` — docs/audits/MIGRATION-DRIFT-FINDINGS.md still reads 'PROD run - PENDING (§1.5)'; blocked on owner-gated prod access, tooling ready but unrun.
- `entitylink-reverse-drill-incomplete` — 192 <EntityLink> call sites vs 805 non-test page files; scripts/verify-entity-link-adoption.mjs exists but is orphaned (never in CI, always exits 0).
- `events-event-log-force-rls-still-blocked` — Fix migration db/migrations/202607510000_events_audit_log_entity_isolation.sql:24 FORCEs RLS but is HOLD-FOR-JORGE, unapplied to prod. events.event_log stays RL
- `law-of-land-entitylink-reverse-drill-adoption` — EntityLink component used across 96 frontend page files — broad adoption, but full/complete coverage across every module per the Total-Connectivity law not exha
- `p1-apm` — Sentry APM wired in apps/backend/src/index.ts (initBackendSentry, error handler) — partial evidence, but full P1 APM scope unconfirmed.
- `p1-compression` — No @fastify/compress or any compression dep in apps/backend/package.json; no response-compression middleware registered anywhere in apps/backend/src.
- `p1-error-handling` — Broad handling exists (zod-http-error, Sentry) but FMCSA SAFER verification calls at customers.routes.ts:730,1120 are fire-and-forget with no retry/backoff.
- `p1-logging-system` — Fastify logger:true gives structured pino to stdout + request-id middleware, but no centralized log aggregation/shipping transport is configured (stdout only).
- `p1-session-timeout` — apps/backend/src/auth/lucia.ts:29-34 sessionCookie has expires:false with no sessionExpiresIn passed; falls back to library default, not an explicit reviewed ti
- `p1-vulnerability-management` — .github/dependabot.yml + codeql.yml + semgrep.yml exist and run, but none are referenced in required-checks.yml, so a CVE/SAST hit does not block merge to main.
- `public-audit-log-partitions-no-rls` — 202606080940_block26_partition_hot_tables.sql creates public.audit_log(+48 partitions) with NO RLS. Fix (RLS+FORCE+operating_company_id) authored in 20260751000
- `remediation-t4.1-duplicate-schema-consolidatio` — docs/trackers/MASTER-MANIFEST-2026-07-10.md marks needs-design; maint(144 rows)/maintenance(17,310 rows) both still live with data, no consolidation migration f
- `systemic-pattern-mandatory-error-states` — verify-list-error-state-coverage.mjs passes but is explicitly scoped as a regression guard for 20 already-fixed pages only; its own header states it 'does NOT t
- `systemic-pattern-never-toast-success-posted-fa` — No guard or code found implementing a 'never toast success on posted:false' rule anywhere in apps/frontend/src or scripts/.
- `tbl-standard-raw-table-sweep-incomplete` — Live grep confirms 202 .tsx files still hand-roll raw <table> outside ParityTable (manifest cited 157 as of 07-10) — sweep still incomplete.
- `users-par-1-permission-matrix` — docs/specs/USER-PERMISSION-MATRIX.md (the design doc, a separate block id) exists, but no action-level PermissionMatrix build found in code — zero hits for perm
- `year-end-close-retained-earnings-asc852-freshs` — No docs/specs file for ASC 852 fresh-start year-end-close design found; matches MASTER-MANIFEST-2026-07-10.md 'needs-design' — missing CPA ruling and underlying

### settlements (52)
- `0007-pattern-2-column-drift-500s` — No CI guard scoped to the 12 driver Operations views / settlement_lines / fuel_transactions; only generic verify-schema-parity.mjs + maintenance-only guard exis
- `0008-b-canonical-deduction-store` — Posting reads only driver_finance.driver_settlement_deductions, but settlements/auto-deductions/apply.ts:64-65 still INSERTs into settlement_lines -- 2nd store 
- `0091-c1-1-two-settlement-engines_DISPATCH` — Adversarial pass refuted the 'dead engine' claim: settlement-posting.routes.ts:134-136 IS mounted via accounting/index.ts:10-17 -- the 2nd settlement engine is 
- `0091-e1-4` — Adversarial pass: WRITE side collapsed to driver_finance.* (commit 85aad9a5e), but READ side still prefers the RETIRE payroll ledger via payroll/aggregated.rout
- `0091-g1-3` — settlements/approval.routes.ts:13 imports only withCurrentUser; zero hits for assertCompanyMembership/withCompanyScope across all 8 handlers -- operating_compan
- `0091-g9-h1` — settlement-payment.service.ts loadSettlement() (:45) has no FOR UPDATE and no CAS guard on any of 5 UPDATE statements (lines 145-351) -- concurrent state-transi
- `0242-no-auto-escrow-deduction-driver-fault-can` — No code path found tying driver-fault load cancellation to an automatic escrow deduction; insufficient evidence either way in time available
- `0243-c1-1-orphaned-payroll-settlement-engine` — apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts:61,115,189 still actively queries payroll.driver_settlements / payroll.driver_settlement_line
- `0243-e1-4-driver-settlements-four-schemas` — Same root cause as c1-1: payroll.* schema still actively queried (settlement-pdf-renderer.service.ts) alongside driver_finance.*; no engine collapse found
- `0243-g1-3-settlement-cash-advance-approvals-no` — settlements/approval.routes.ts (approve/reject/finalize handlers ~line 68-209) takes raw String(query.operating_company_id) with no assertCompanyMembership/with
- `0243-g11-2-two-deduction-subledgers-dont-recon` — settlement_lines and driver_settlement_deductions both still separately referenced across many settlement-posting/driver-finance service files; no single-subled
- `0243-g9-h1-settlement-double-pay-race` — driver-finance/settlement-payment.service.ts queuePayment UPDATE WHERE clause (line ~145-153) checks only id+operating_company_id, no payment_state=$current gua
- `0252-audit140-compensation-structure` — no pay_grade/salary_band/comp_plan code found
- `0270-no-auto-escrow-deduction-safety-events` — grep 'escrow' driver-safety-events.routes.ts = 0 hits; grep 'safety_event' driver_finance/ = 0 hits. No auto-propose hook exists; owner must rule on event types
- `0280-19-attention-items-driver-settlement-link` — dm-home.service.ts pending_settlements attention item has action_url '/driver-finance/settlements'
- `0285-df-gap1-no-escrow-for-cash-advances` — No 'escrow' reference in apps/backend/src/cash-advances/cash-advance-disburse.ts or cash-advance-create.ts
- `0285-df-gap2-dual-deduction-systems` — Two parallel live systems confirmed: auto-deductions/apply.ts (policy-based, dead, only called from its own test) vs driver_finance.driver_settlement_deductions
- `0441-mod10-autodeductionpolicies-fully-dead` — UI panel now mounted (AutoDeductionPoliciesPanel in DriversPage.tsx) so no longer FULLY dead, but applyAutoDeductionsToSettlement() (auto-deductions/apply.ts) i
- `0441-mod10-cashflow-driverpay-hardcoded-empty` — cash-flow.service.ts type allows kind:'driver_pay' and DailyPredictionTab.tsx has a label ready for it, but the service only ever constructs kind:'bill_due' (li
- `0441-mod10-deductions-never-reduce-settlement` — applyAutoDeductionsToSettlement (settlements/auto-deductions/apply.ts) is defined and unit-tested but never invoked from any real settlement compute/finalize pa
- `0441-mod10-holddeduction-id-mismatch_DISPATCH` — SettlementDetailPage.tsx toDeductionRows() sets id=settlement-line id, sent by HoldDeductionModal to PATCH /driver-finance/deduction-schedules/:id/hold, but tha
- `0441-mod10-payment-status-panel-404` — registerSettlementPaymentRoutes (apps/backend/src/driver-finance/settlement-payment.routes.ts) is defined but never imported/called anywhere in the backend; fro
- `0441-mod10-settlement-line-ui-nonexistent-colu` — SettlementsTable.tsx source comment: "'Loads' has no real per-row field yet (renders a static '—' below)" — self-documented phantom column
- `0441-mod10-three-settlement-dispute-backends` — Three separate, all-mounted route files create/read settlement disputes: settlements/disputes/disputes.routes.ts (/api/v1/settlements/:id/disputes), driver-fina
- `0441-mod11-deduction-trail-period-close-zero-r` — REPAIR-A guard (verify-deduction-applier-wired-into-close.mjs) fixes a related but distinct bug (applier not called at close); AuditDeductionTrailPage report it
- `0441-mod11-financial-change-log-starved` — audit-reports.routes.ts financial-change-log endpoint queries events.event_log with real filters; whether event_log is actually populated with invoice/bill/paym
- `0441-mod5-deductions-tab-wrong-content` — Drivers.tsx:618 renders the identical cash-advance debt panel for both 'cash_advances' and 'deductions' subnav tabs
- `0441-mod5-settlements-card-deprecated-table` — driver-aggregate.service.ts:358-399 (feeds SettlementsSection.tsx) queries payroll.driver_settlements, a retired table per settlement-engine-collapse memory; ca
- `0490-critical-g11-1-deduction-consent-template` — hasSignedDeductionAuthorization() gate is wired but no seed migration creates a matching legal.contract_templates row — structurally can't pass.
- `0490-structural-fix-liability-deduction-fk-spi` — source_expense_id FK was added to driver_settlement_deductions, but liability_id/incident_id FK columns still absent — fault linkage still severed.
- `audit10-payroll-automation-tax-withhol_DISPATCH` — No payroll tax withholding automation code found (grep withholding/tax_withhold/payroll_tax = no module). Drivers are 1099 contractors (no W2 withholding), per 
- `bf1-driver-fault-liability-deduction` — settlement-contract-terms.service.ts computeLateDeliveryPassthrough(): when mdata.loads.customer_chargeback_driver_fault=true, creates canonical settlement dedu
- `bf9a-accident-claim-liability-deduction` — SAFE-1 guard (accident-at-fault.routes.test.ts) only fixed at_fault/preventable persistence; full-report.service.ts and auto-workflow-trigger.ts have no deducti
- `biz-flow-1-escrow-not-linked-to-termination` — escrow-separation.service.ts recordDriverEscrowSeparation() requires mdata.drivers.status='Terminated'+deactivated_at, then FKs driver_finance.driver_escrow_sep
- `biz-flow-3-no-auto-escrow-deduction-driver-fau` — escrow-resolver.service.ts resolves the per-driver 'Damage Claim Escrow' liability account for routine settlement contributions only; no code path found that au
- `biz-flow-3-no-cancellation-deduction-linkage` — dispatch/cancel-load.routes.ts has zero references to 'deduction' or 'escrow' — cancelling a load creates no driver deduction/escrow linkage.
- `biz-flow-4-no-escrow-deduction-cash-advance` — Cash advances are recovered via driver_finance settlement deduction (deduction_type='cash_advance_repayment' in deductions.service.ts), not via a debit to the d
- `biz-flow-9-no-automatic-escrow-deduction-safet` — mdata/driver-safety-events.routes.ts has zero refs to 'escrow' or createSettlementDeduction; no auto-deduction path from safety event.
- `d-04-settlements-board-redirect-notice` — Dispatch.tsx:497-513 shows a quick-link to Driver Finance instead of real inline data; original 'redirect notice not real data' finding stands.
- `dispatch-sweep-gap-22` — No mileage_reimbursement_log migration, ReceiptOcrPanel, or MileageReimbursementForm anywhere; GAP-22 spec target files all absent.
- `expand-escrow-non-bond-deductions` — apps/backend/src/driver-finance/escrow-deduction-pending.service.ts:404 hardcodes deduction_type='escrow_load_abandonment' as the only value; no other class wir
- `fk-cancellation-deductions-0289` — No dispatch.load_cancellations.deduction_id FK to driver_finance.driver_settlement_deductions exists; migration 0289 on main is factoring.factor (unrelated), no
- `flow1-termination-load-escrow-linkage` — db/migrations/202607111000_block02_driver_escrow_separation_return.sql:68-101 creates driver_finance.driver_escrow_separations with no load_id/mdata.loads refer
- `flow2-auto-deduction-trigger-from-customer-exp` — createSettlementDeduction() is only called manually from cash-advance/deductions/settlement services; no auto trigger fires it from accounting.expenses. Cited g
- `flow3-cancellation-auto-escrow-deduction` — cancellation.service.ts never calls emitAutoProposedEscrowEvents for driver-fault cancellation reason codes (0 hits), unlike loads.routes.ts's abandonment/walko
- `flow5-dual-deduction-systems-consolidate` — Two competing paths both actively imported: settlement-deduction-cap.service.ts (capped-recovery) vs deductions.service.ts (legacy); needs consolidation design/
- `flow9-safety-event-auto-escrow-deduction` — No escrow linkage in safety/events/*; emitAutoProposedEscrowEvents only called from load-status walkoff, not safety events.
- `flow9-safety-event-no-auto-status-escrow-notif` — Notif part fixed (see flow9-safety-event-auto-notifications) but escrow + driver-status linkage still absent in safety/events/*.
- `repair-e-escrow-return-and-tieouts-des_DISPATCH` — docs/specs/repairs/REPAIR-E-ESCROW-TIEOUTS-DESIGN.md exists (design done) but escrow_load_abandonment_recovery role-key is absent from settlement-posting.servic
- `ruling-3-driver-escrow-current-vs-long_DISPATCH` — memory driver-escrow-is-liability.md confirms Damage Claim Escrow accounts still typed OtherLongTermLiabilities in catalogs.accounts; no code/migration reclass 
- `settlement-posting-design-doc-missing_DISPATCH` — docs/specs/SETTLEMENT-POSTING-DESIGN.md does not exist in the repo (confirmed via ls).
- `sweep-g11-1-deduction-consent-template_DISPATCH` — apps/backend/src/legal/signed-finance-handoff.service.ts:140 — signed hire contract satisfies 'payroll/settlement deduction authorization (consent gate for FIN-

### reports (26)
- `0008-g2-reporting-schema-canonical` — Two unconsolidated systems remain: reports/scheduler.ts (live, mounted index.ts:1415) vs orphaned reporting.scheduled_reports engine; FE route /reports/schedule
- `0091-g9-h5` — profit-per-truck.routes.ts:346-380 legacy month path fixed (separate CTEs, no fan-out), but profit-per-truck-weekly.ts:42-53 STILL has the same cartesian JOIN f
- `0243-e1-3-two-scheduled-report-engines` — reports.scheduled_reports(0058) and reporting.scheduled_reports(0164) both live; each queried by separate active route/worker files (reports/* vs scheduled-repo
- `0243-g3-5-csp-report-only-samsara-placeholder-` — apps/backend/src/middleware/security-headers.ts:25 still reportOnly: true; CSP never flipped to enforce
- `0243-h1-3-csp-report-only-no-healthcheckpath-b` — middleware/security-headers.ts:25 reportOnly:true still set; comment cites a 48h obs window, weeks past that
- `0277-any-type-reports-library-routes` — Confirmed current: reports/library.routes.ts:39,44 relationExists/columnExists still typed 'client: any', not the real pg/Fastify pool client type.
- `0441-mod10-finalize-5s-staleness-race` — useLiveDebt.ts: staleness threshold is a hardcoded 5000ms (`Date.now() - computedAt > 5000`), checked on an identical 5000ms setInterval — matches the described
- `0441-mod11-deadhead-phantom-fuel-columns` — No fuel-column reference found in dispatch/deadhead/optimizer.service.ts or routes.ts; could not locate the phantom columns described.
- `0441-mod11-help-was-this-helpful-not-persisted` — HelpArticlePage.tsx feedback buttons only setFeedback(local useState); no API call, no localStorage — confirmed not persisted anywhere, lost on refresh.
- `0441-mod11-owner-mint-maker-checker` — No 'mint'/owner-mint code, route, or doc reference found anywhere in the repo; cannot determine what this finding refers to.
- `0441-mod11-three-parallel-scheduled-report-sys` — index.ts mounts 4+ separate scheduled-report systems simultaneously: registerReportsScheduledCrudRoutes, registerScheduledSubscriptionRoutes, initializeReportsR
- `0441-mod11-users-changerole-no-approver-ui` — Users.tsx submits a WF-064-IDENT-002 role-change workflow request (roleWorkflowMutation), but listIdentityWorkflows/approveIdentityWorkflow/rejectIdentityWorkfl
- `0441-mod13-inventory-purchases-not-built` — InventoryPurchasesPage.tsx ('Purchase History') just renders PartsInventoryTable via listPartsInventory — the same stock data as the Parts Inventory page, not r
- `0441-mod2-csv-import-mileage-phantom` — vehicles.routes.ts CSV bulk-import INSERTs into mdata.units column list including `mileage`, but no migration ever adds a mileage column to mdata.units (grep ac
- `0441-mod3-fuel-expensive-states-free-text` — ExpensiveStatesMultiselect.tsx is catalog-backed checkbox multiselect (expensiveStatesCatalogClient.list), wired FuelPlannerHome.tsx:410; no free text remains
- `0441-mod3-fuel-loves-prices-isolated` — No migration creates a Loves-prices table joined into views.fuel_planner_active_routes/expensive-states; planner.routes.ts:104-110 uses it only for a 'last sync
- `0441-mod5-addtraining-drops-expiry` — AddTrainingModal.tsx:91 sends expiry_date; driver-training.routes.ts:71-81,116-118 persists it on create and PATCH
- `0441-mod5-border-creds-no-edit` — BorderCredentialsSection.tsx:116-124 has Edit button opening modal that PATCHes via updateDriver() for FAST/SENTRI/TWIC/Mex-license fields
- `0441-mod5-disputes-no-approve-deny-dual-check` — disputes.routes.ts reviewSettlementDispute():191-197 only checks isOwner(role) - single person can approve/deny, no maker-checker
- `0441-mod5-teams-tab-unreachable` — Drivers.tsx:464-490 renders Drivers/Teams SecondaryNavTabs unconditionally via local state; Teams roster + '+ Create Team' reachable, no route dependency
- `0441-mod6-spawn-liability-fake-stub` — POST /accidents/:id/spawn-liability (safety.routes.ts:544-569) writes only an audit-log row and returns spawned_liability_id:null - no liability record created
- `0441-mod7-dispute-queue-stub` — DisputeQueuePage.tsx (19 lines) is a literal stub - no useQuery/fetch, just prose naming the API endpoints; real backend routes exist but unwired
- `0441-mod9-mileage-dropped-on-create-edit` — mdata.units has no mileage column; vehicles.routes.ts create/PATCH silently drop mileage param, RETURNING hardcodes NULL::bigint.
- `a-06-save-button-not-above-fold` — RecordExpenseForm's submit button sits at the end of the scrollable form body; RecordExpenseModal does not use ParityDrawer's sticky footer slot — the fd85f5263
- `f-01-fuel-home-stub` — apps/frontend/src/pages/fuel/FuelHome.tsx only renders FuelFraudAlertsKpiCard + RelayHistoryImport; still lacks recent-transactions list, spend-by-truck, MPG tr
- `qbo-realtime-webhook-sync` — qbo-webhook.routes.ts registered+HMAC-verified (index.ts:656) and sync-inbound.worker.ts consumes events, but it only writes a forensic snapshot to qbo_archive.

### safety (24)
- `0007-pattern-9-fake-persist-evidence-loss` — scripts/r2-verify.mjs exists (npm alias r2:verify) but zero hits in .github/workflows/*.yml -- file-only guard, not run by CI; 3 underlying fake-persist claims 
- `0243-g10-m-seven-integrity-reliability-gaps` — Bundle of 7 sub-items (audit-chain HMAC, mutation-block trigger, etc); design doc (07-11) marks bundle unbuilt as design-only, individual sub-items not re-verif
- `0252-audit146-workplace-safety-osha` — safety module exists but is FMCSA/DOT/CSA-focused (safety-v5, csa-source, safety-events); zero 'OSHA' hits anywhere in backend/frontend
- `0270-no-auto-driver-status-from-safety-events` — Explicit-termination path IS wired (driver-safety-events.routes.ts:437-445), but automatic severity-accumulation escalation (N severe events->auto-Probation) is
- `0278-eld-none-identified-contradiction` — sidebar-config.ts:45,67,72,123 confirms 'eld' is an explicitly documented stub, hidden from nav, Owner-only -- no real ELD backend exists; source doc's 'no gaps
- `0278-safety-gap1-auto-driver-status` — Dup of 0270-no-auto-driver-status: explicit-termination wired, but automatic probation/suspension escalation from severe events is unbuilt, needs owner threshol
- `0278-safety-gap3-auto-notifications` — safety-events.routes.ts general create handler has zero notification calls (grep 'notif' = 0); only the separate anomaly-detection pipeline notifies, not genera
- `0441-mod12-eld-export-pdf-window-print` — EldAuditTrailViewer.tsx exportPdf() opens a popup, writes an HTML table, then calls popup.print() via setTimeout — literally still window.print()-based, not a r
- `0441-mod12-eld-orphaned-under-safety-permanent` — "eld" is still in NAV_HIDDEN_STUB_IDS (sidebar-config.ts, current as of 2026-07-18); the only reachable ELD feature is parked at /safety/eld/audit-trail rather 
- `0441-mod6-accident-edit-500-status-silent-fail` — Backend PATCH /accidents/:id/status has no try/catch, but setSafetyAccidentStatus frontend fn is called nowhere in production UI (only a test mock) - path unexe
- `0441-mod6-damage-insurance-worker-unregistered` — initializeDamageContinuityWorker imported and invoked at startup, index.ts:494,1372-1373
- `0441-mod6-hos-dashboard-silent-per-driver-catc` — HoursOfServicePage.tsx:75-86 try/catch swallows per-driver HOS fetch failure with no log/toast, indistinguishable from no-data row
- `0441-mod6-insurance-no-driver-accident-link` — Forward link exists (accident_reports.insurance_claim_id + rendered Link); reverse graph.reverse.accidents in ClaimsTab.tsx:224 is fetched but never .map()'d/re
- `audit-spine-a1-a9-emit-coverage-task` — A1-A7 + verify:audit-emit-coverage wired in ci.yml (lines ~1221-1252). A8 (verify:a8-audit-reports-section) exists in package.json but has NO ci.yml invocation 
- `biz-flow-9-no-automatic-notifications-safety-e` — mdata/driver-safety-events.routes.ts has zero notif/email/dispatchNotification hits (separate from unrelated safety.accidents notify pipeline).
- `coder-work-order-t2-6-accident-liability-stub` — POST /safety/accidents/:id/spawn-liability hard-returns spawned_liability_id:null; no safety.accident_liabilities table or escrow-posting path.
- `flow9-safety-event-auto-notifications` — notification.service.ts notifySevereSafetyEvent wired in safety-events.routes.ts:435-436 for high/critical severity (source_block 0278-safety-gap3-auto-notifica
- `insurance-2-breadcrumb-desync` — insurance/PolicyDetail.tsx uses a custom 'Back to policies' text link instead of the standard PageHeader breadcrumb pattern used elsewhere in the app; no PageHe
- `linkage-safety-event-no-driver-status-update` — No code found linking a safety-event write to a driver status change (mdata.drivers.status) in safety/events/* or mdata/*-safety-events.routes.ts.
- `s-02-insurance-sidebar-not-standalone` — sidebar-config.ts 'insurance' item routes to /safety/insurance (a Safety tab, InsuranceTab.tsx); top-level /insurance route redirects to /safety/insurance (rout
- `s-10-no-type-filter-incidents` — Incidents are split into separate per-type routes/pages (damage report, trailer interchange, cargo claim) via SafetyIncidentsClusterSurface with no combined TYP
- `safety-dot-fields-and-driver-create-fix` — db/migrations/202607582000_safety_events_dot_fields.sql adds injury_count/fatality_count/tow_away_required/dot_reportable/police_report_number/location_text; al
- `safety2-cert-expiry-nav-distinct-route` — apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts SAFETY_ALIAS_TABS defines 'cert-expiry' with its own distinct route /safety/cert-expiry (badge 'new'),
- `systemic-pattern-r2-verify-bytes-guard` — Generic r2-client.ts verifyObjectExists/getObjectMetadata exists and is used by evidence-presence-reconcile.cron.ts, but that cron is default-OFF (EVIDENCE_PRES

### factoring (16)
- `0091-g10-h3` — 3 of 6 sub-items resolved (Pre-Flight DVIR built+mounted), but 3 money routes remain unbuilt (payment unapply, factoring reconcile-apply, escrow forfeit) -- 3 d
- `0091-g11-5` — month-close.service.ts:192-196 still hard-requires arOverdueCount===0 && apOverdueCount===0 to lock a period -- unsatisfiable for a factoring carrier w/ perpetu
- `0243-b1-2-factor-reserve-default-liability-fal` — accounting/coa-roles/resolver.service.ts:59 still types factor_reserve_default: { type: ["Liability"] } despite factor_reserve_held(Asset) being canonical per o
- `0243-g10-h3-six-ui-features-404-routes` — No specific route list named in registry; not located within available time
- `0251-gap1-factoring-vendor-fk-not-stored` — mdata.customers.factoring_company_vendor_id (0022) + accounting.factoring_advances.factoring_company_vendor_id NOT NULL FK->mdata.vendors (0061)
- `0251-gap4-driver-vendor-mapping` — mdata.drivers.qbo_vendor_id (0091) + driver_vendor_id consumed directly in settlement-bill-payment-posting.service.ts
- `0441-mod8-factoring-virtual-hardcodes-zero` — factoring-virtual.routes.ts:42-63 selects real current_reserve_balance/current_chargeback_balance from accounting.factoring_companies (COALESCE-to-0 only, not h
- `0518-r18-schema-fragmentation-8-dup-pairs` — 3 of 7 dup schema pairs got canonicalization verdicts; 4 (reports/reporting, docs/documents, mdata/master_data, maint/maintenance) remain unresolved.
- `core-ledger-write-proof-trucking-evidence` — No docs/proofs/ dir, no __proofs__ harness; zero code matches for core-ledger-write-proof anywhere in apps/backend/src.
- `fact-fix1-duplicate-vendors-banner` — apps/backend/src/factoring/scan-duplicate-vendors.routes.ts is registered (index.ts:233,960) but no frontend caller anywhere in apps/frontend/src -- backend-onl
- `fact-par-1-factoring-submission-gating` — Doc-gating logic exists in submission-queue.service.ts (is_submittable=hasPod&&hasRatecon) but the reachable batch-submission path (batch.routes.ts/BatchWizard.
- `fact-par1-submissionqueue-unrouted` — apps/frontend/src/pages/factoring/SubmissionQueue.tsx + index.tsx exist but 0 hits for either in routes/manifest.tsx or anywhere under apps/frontend/src -- orph
- `factoring-asc860-determination-memo` — docs/accounting/FACTORING-ASC860-DETERMINATION.md does not exist; find for *ASC860*/*ASC-860* returns only .block-ready stub files, no actual memo.
- `factoring-coder-directive-item-c-unconfirmed` — Draft-vs-posted immutability half is built (batch.service.ts:255-262). Reason-coded true-up half is not: only faro-csv-import.ts:243 mentions 'true_up' as a cod
- `factoring-g3-debtor-credit-check-decision-note` — Source doc frames this as an owner-decision-pending enhancement, not a defect; no debtor-credit-check-via-factor-data surface exists in apps/backend or apps/fro
- `migrate-faro-to-rts` — Still on Faro; design note 0243-h7-1-faro-rts-no-api confirms RTS Financial has no public API (FTP/portal file-drop only); no RTS integration code found anywher

### banking (15)
- `0242-no-auto-equipment-log-on-transfer` — mdata/equipment-transfer.service.ts calls appendCrudAudit 4x (generic audit trail exists) but can't confirm this satisfies the specific dedicated equipment-log 
- `0285-banking-transfer-gl-gap_VERIFY` — apps/backend/src/banking/transfers.service.ts only writes banking.bank_accounts / banking.transfers; zero accounting.journal_entries or GL-posting call
- `0441-mod2-wo-split-brain` — Two live POST routes insert maintenance.work_orders w/ different display_id schemes: work-orders.routes.ts:606 (own seq) vs maintenance/work-orders.routes.ts:55
- `0441-mod5-auto-deductions-team-splits-dead` — DriversPage links to /drivers/auto-deductions & /drivers/team-splits but manifest.tsx has no Route for either; catch-all redirects to home
- `0441-mod6-hos-violations-source-enum-mismatch` — DB CHECK constraint, backend zod, and frontend dropdown all match exactly: samsara_auto/manual_office/dot_citation
- `0441-mod8-auto-match-button-dead` — ReconciliationWorkspace.tsx:192-205 Auto-Match Suggestions button has real onClick navigating to /banking/reconciliation accept/reject worklist
- `0441-mod8-plaid-sign-deposits-negative` — BankAccountDetail.tsx:24-26 money() ignores is_credit; deposits still render negative on main. Confirmed unchanged (backlog-verify/banking.md).
- `0441-mod8-section7-palette-violation` — verify-section7-palette-financial.mjs is wired in CI but ratchet-frozen at 150 off-palette classes (down from 481) — violations remain, not fixed.
- `0441-mod9-customer-taxonomy-mismatch` — Customers.tsx list-preview 12-tab taxonomy still doesn't match CustomerDetail.tsx's 13-tab full-page taxonomy; no shared vocabulary.
- `biz-flow-8-no-equipment-log-auto-update` — equipment-transfer dual-confirm/request.service.ts never INSERT mdata.equipment_log; log write is manual-only via equipment-log.routes.ts.
- `biz-flow-8-no-transfer-notifications` — Zero notif/email/push/outbox hits in dispatch/equipment-transfer/{dual-confirm,request}.service.ts.
- `fk-equipment-transfer-log-0289` — mdata.equipment_log exists (0008 migration) but no FK links dispatch.equipment_transfer_requests.equipment_uuid (no REFERENCES clause) to it; no code writes an 
- `flow8-equipment-transfer-notifications` — Current canonical engine (dispatch/equipment-transfer/dual-confirm.service.ts + request.service.ts) has zero notification/email/outbox calls on transfer initiat
- `flow8-no-auto-equipment-log-notify` — equipment-log.routes.ts INSERTs + appendCrudAudit only; no notification call on create.
- `qbo-parity-resizable-columns-everywhere` — Resize only lives inside ParityTable.tsx (guarded by verify-parity-table-resize-sort-contract.mjs); the ~202 raw-table surfaces have no resize. Not 'everywhere'

### compliance (15)
- `0243-g6-2-vendor-create-no-dedup-guard` — App-level case-insensitive+opco-scoped dedup now exists (mdata/vendors.routes.ts, comment cites G6-2), but no DB-level partial UNIQUE index and no verify-vendor
- `0252-audit136-hr-policy-tracking` — no hr-policy-acknowledgment tracking found; only insurance/session/password 'policy' modules exist (unrelated)
- `0257-audit-100` — tracker itself: 'needs-design ... no merged PR / no files on main'; only narrow I-9 upload step (OnboardingStepI9.tsx) + visa_expiration field exist, no dedicat
- `0257-audit-76` — block-ready acceptance is generic template ("table/column/fk/rls/route/mounted proven...") verbatim from MASTER-6 dispatch; no specific column/table/route named
- `0275-audit173-data-privacy-compliance` — RLS/company-isolation real (856 CREATE POLICY), but no GDPR/CCPA consent-mgmt table, data-subject-rights workflow, or privacy dashboard exists anywhere.
- `0441-mod11-ifta-drift-two-preparers` — Both registerIftaQuarterlyPreparerRoutes (/api/v1/ifta/preparations/*) and registerReportsIftaRoutes (/api/v1/reports/ifta/*) are mounted simultaneously in inde
- `0441-mod12-eld-module-fake-stub` — sidebar-config.ts current comment (last touched 2026-07-18, PR #2701) still reads: "'eld' is a placeholder/stub page (no real backend) — hidden from nav"; eld r
- `0441-mod13-compliance-tabs-local-usestate-not-` — ComplianceDashboardPage.tsx tab state is plain useState (severityFilter/typeFilter/ownerTypeFilter/tab); no useSearchParams/URL sync found, so tab selection is 
- `0441-mod3-fuel-compliance-not-available-rows` — CompliancePanel.tsx hardcodes literal 'Not available yet' for 2 KPI rows (last-week non-compliance count, top reason)
- `0441-mod6-hos-create-violation-mislabeled-link` — HoursOfServicePage.tsx:151-158 button reads '+ Create violation' and correctly opens create modal - not mislabeled
- `0441-mod6-hos-exceptions-archived-stub` — HosExceptionsPage.tsx explicitly marked '// ARCHIVE ... Sunset 2026-09-01' - static text only, no query/data (deliberate archive, not a live bug)
- `0441-mod6-hos-violations-void-hardcoded-reason` — hos-violations.ts:34-36 requires user-supplied zod 'reason' (min 3 chars) written to void_reason; frontend passes user-entered text through
- `0441-mod9-vendor-contact-fields-notes-blob` — vendorProfileMeta.ts serializes primary/secondary contact fields into the vendor.notes text blob; no real mdata.vendors columns exist for them.
- `systemic-pattern-column-drift-guard` — Only narrow guards exist (verify-maintenance-insert-column-drift.mjs scoped to maintenance inserts; verify-sql-column-existence.mjs is a static curated-table ba
- `twice-daily-mandatory-checkin-compliance-featu` — No driver check-in compliance feature found; the only 'twice-daily' hits in the codebase are for the accounting reconciliation cadence (recon.cron.ts), an unrel

### drivers (13)
- `0243-g5-2-qbo-txn-inside-db-transaction` — integrations/qbo/qbo-vendor-linkage.service.ts createDriverWithQboVendor still awaits createQboVendor() HTTP call inside the withCurrentUser DB-connection callb
- `0280-18-driver-kpi-profile-linkage` — dm-home.service.ts returns scoring.top/bottom leaderboard (driver_id) but DriverManagerHome.tsx's consumed type omits `scoring` entirely; never rendered/linked 
- `0441-mod13-lists-driver-vs-drivers-parallel-tr` — The singular /lists/driver/* subcatalog pages now render DriverCatalogDeprecatedBanner pointing to the canonical plural /drivers path, locked by driver-subcatal
- `0441-mod5-dqf-panel-free-text-no-fk` — DriverDqfPanel.tsx:19,69-74 'Add checklist item' is a plain free-text input posted as item_name string, no FK/reference-table select
- `0441-mod7-escrow-read-only` — EscrowPage.tsx only does list reads, no release/adjust button; real POST /accounting/escrow/release backend exists but zero frontend callers
- `biz-flow-9-no-automatic-driver-status-update-s` — Refers to driver disciplinary status (probation/suspension) auto-escalation by safety-event severity; no such logic in driver-safety-events.routes.ts.
- `dh-01-driver-hub-overview-stub` — DriverHubPage.tsx overview tab renders only <DriverInbox>; no availability grid, on-duty status board, or metrics component.
- `driver-d-cluster-scope-guard-missing` — scripts/verify-driver-profile-scope.mjs does not exist; grep for driver-profile-scope/driver_profile_scope across scripts/*.mjs + package.json = 0 hits.
- `fk-escrow-termination-0289` — 'termination_id' column claimed never existed (0 hits repo-wide). driver_finance.driver_escrow_separations covers intent but lacks a termination-reason FK -- ow
- `flow1-escrow-linked-to-termination-record` — escrow-separation.service.ts:111-147 gates only on driver.status!=='Terminated'||!deactivated_at; zero references to termination_reason_id or catalogs.driver_te
- `hiredate-provenance-partial` — hire_date_source column + samsara-hire-date.service.ts: HR/file date always authoritative, samsara_estimate fills gaps only, needs_review flag for >180d diverge
- `notif-b-android-block` — Driver PWA (apps/driver-pwa) has no Capacitor/Cordova dependency and no native Android shell — confirmed via package.json + repo-wide search for capacitor/andro
- `s-08-no-driver-unit-type-date-filters-incident` — SafetyIncidentsClusterSurface.tsx (the shared Incidents list surface) renders a plain table (Date/Driver/Unit/Location/Status/Action) with no filter controls at

### qbo-recon (12)
- `0007-pattern-1-unmounted-backend` — verify-frontend-api-routes-exist.mjs guard exists (pkg.json:550) but never invoked by any .github/workflows/*.yml -- orphaned guard, unmounted-backend pattern u
- `0091-g11-2` — Hard-block at POST time exists, but driver_settlements.net_pay is computed from settlement_lines alone and never cross-checked against deductions total -- order
- `0243-e1-6-bank-geo-schema-stranded` — Both bank.reconciliation_matches+geo.geofences AND banking.reconciliation_sessions+geofence.fence/event are live and separately queried by different code paths 
- `0243-g10-c3-sentry-half-live-crons-pwa` — Only 1 of 27 apps/backend/src/cron/*.cron.ts files calls Sentry; driver-pwa has a dedicated sentry-pwa.ts -- confirms lopsided/partial coverage
- `0280-04-cash-position-reconciliation-linkage` — OwnerHome.tsx Cash Position tile shows 'Last reconciled: {cp.last_reconciled_at}', links to /banking
- `0394-qbo-sync-one-shot-not-recurring` — qbo-inbound-sync.cron.ts, qbo-cdc-poll.cron.ts (5-min setInterval), qbo-sync-queue-runner.ts all actually initialized (called, not just imported) at apps/backen
- `0441-mod11-fuel-recon-zero-and-noop-save-link` — FuelReconciliationPage.tsx has real match/export buttons wired to mutations; could not confirm or refute the specific 'zero values + noop save link' claim from 
- `bf10b-qbo-recon-six-types` — accounting/qbo-recon-reads.ts REMOTE_ENTITY_KEY only maps 5 object types (customers, vendors, accounts, invoices, bills) — not six.
- `bnk-03-no-last-reconciled-no-beginning-balance` — Zero matches for 'last reconciled'/'beginning balance' in ReconciliationWorkspace.tsx or BankReconciliationPage.tsx.
- `daily-tms-qbo-reconciliation-cadence` — Cadence cron (06:00/19:00 CT) + recon screen exist and are wired, but 'tolerance + owner-assignment on off-tie' unmet; TOLERANCE_ACCEPTED is a dead enum.
- `qbo-parity-a1-paritytable-universal-adoption` — 147 files import ParityTable but 202 .tsx files still hand-roll raw <table> (e.g. DataTable.tsx, FleetTable.tsx, EarningsTab.tsx). Adoption not universal.
- `vend4-dual-qbo-sync-single-source-of-truth-dec` — No design-doc or code resolving the dual-sync-banner-vs-490-projected-vendors mismatch found; matches MASTER-MANIFEST-2026-07-10.md 'needs-design' (owner decisi

### customers-vendors (10)
- `0243-g6-3-customer-dedup-case-sensitive-unscop` — App-level fix exists (customers.routes.ts assertUniqueCustomerFields, comment cites G6-3, case-insensitive+opco-scoped), but no DB-level UNIQUE index / guard cl
- `0280-32-revenue-to-customer-linkage` — reports/customer-profitability.routes.ts groups revenue by customer_id (mdata.loads), registered via reports/index.ts; frontend CustomerProfitabilityPage.tsx + 
- `0441-mod13-inventory-part-to-vendor-none` — parts-inventory.routes.ts has a vendor_id column on the part record and parts-invoice-links.routes.ts links vendor_id per purchase, but could not confirm this f
- `0441-mod9-coi-duplicated-feature-unequal` — CustomerDetail.tsx's CoiRequestsTab and Customers.tsx's CustomerCOITab are both mounted, disjoint, and neither uses '+ Create' vocab. Not consolidated.
- `0441-mod9-customers-list-12-tabs-9-stubs` — Customers.tsx CUSTOMER_TABS has 12 entries; render switch shows only 3 map to real components — 9 of 12 tabs still render a stub state.
- `0441-mod9-four-disjoint-vendor-tables` — mdata.vendors, mdata.qbo_vendors, accounting.qbo_vendors, catalogs.maintenance_vendors confirmed live with no REFERENCES constraint between any.
- `cust1-vend1-pager-total-count-bug` — totalCount prop is in-memory array length (customersSorted.length), not a true server total; limit raised to 5000 but pager math itself unfixed.
- `custvend-par1-vendor-credits-no-ui` — Backend routes + migration + api/vendor-credits.ts client all exist; zero .tsx files import the client, no UI renders it.
- `vend1-pagination-total-vs-length` — apps/frontend/src/pages/Vendors.tsx:85-87 explicit 'VEND-1' comment + listVendors({limit:5000...}) fetches the full roster, so totalCount={vendorsSorted.length}
- `vend3-test-vendor-rows-visible` — verify-vendor-test-fixture-guard.mjs blocks NEW TEST-VENDOR creation (passes live) and admin-jobs.service.ts has an owner-gated 'vendors.archive_test_rows' clea

### fleet (7)
- `0091-m-woid-1` — Generic boilerplate block file, no specific claim extractable
- `0441-mod13-inventory-part-to-unit-none` — parts-invoice-links.routes.ts joins wo.unit_id (part consumption tied to a unit via its work order) but no direct part-master-to-unit FK found; unclear if this 
- `0441-mod5-actionbar-dead-links` — ActionBar.tsx:40-71 every button has a live handler (navigate/prop/modal/href); no dead link found
- `0441-mod9-create-trailer-no-manual-path` — POST /api/v1/mdata/equipment exists but no frontend create-trailer form/modal calls it; backend route is unreachable from the office UI.
- `0441-mod9-fleet-roster-no-create-actions` — FleetHomePage.tsx/FleetTablePage.tsx have no + Create action despite both POST /mdata/units and /mdata/equipment backends existing.
- `0441-mod9-second-create-unit-backend-orphaned` — POST /api/v1/mdata/units is live/registered but has zero frontend callers; only /maintenance/vehicles is used to create units.
- `owner-batch-s2-units-value-catalog` — No matching unit-value/valuation catalog table or service found; can't confirm scope or resolution from repo alone.

### maintenance (7)
- `0091-h2-3` — root package.json still pins lucia@3.2.2 + @lucia-auth/adapter-postgresql@3.1.2 as the live session dependency; arctic/oslo present in tree but no migration has
- `0091-h5-1` — No monthly range-partition migration exists for outbox.events/audit.row_changes/events.event_log; sole partitioning migration (202606080940_block26) targets a d
- `0243-h2-3-lucia-deprecated-auth-lib` — auth/lucia.ts still imports+uses lucia@3.2.2 live; PR #2130 only did touchpoint inventory + adapter seam, no actual migration off
- `0441-mod2-vendor-ap-disconnected` — bills.routes.ts has a proper vendor_id column/param on accounting.bills, suggesting AP-vendor linkage exists, but did not verify the specific 'disconnected' cla
- `0441-mod9-maintenance-vendor-linkage-broken` — catalogs.maintenance_vendors createSchema/patchSchema/buildVendorMetadata never write mdata_vendor_id; correlation filter always resolves NULL.
- `0519-dc2-maint-schema-144-rows-active-alongsid` — maint.* (10 files) and maintenance.* (126 files) both actively written in apps/backend/src today; fragmentation persists, no consolidation migration found.
- `wo-cancellation-reasons-fold-into-void-cancel-` — apps/backend/src/catalogs/wo-cancellation-reasons.routes.ts still exists as its own standalone route/table; no fold-migration into catalogs.void_cancel_reasons 

### ? (3)
- `0091-g9-h4` — Verified directly: load-state-machine.ts helper exists, but driver-pwa/dispatch-view.routes.ts:337 and :403 still do raw 'UPDATE mdata.loads SET status=$2' (sto
- `0270-no-auto-equipment-log-update-duplicate` — Verified live: grep 'equipment_log' apps/backend/src/mdata/equipment-transfer.service.ts = 0 hits; confirmTransfer/finalizeDualAckTransfer never INSERT into mda
- `0518-r10-qbo-sync-workers-off-mirror-stale` — master-data-sync.cron.ts:12-13 gates the recurring QBO sync on QBO_MASTERDATA_SYNC_ENABLED, default OFF — mirror stays stale unless flag flipped.

### insurance (3)
- `0252-audit148-remote-work-policy` — no remote-work/telework policy code found
- `0277-csrf-tokens-recommendation` — csrf-origin-guard.ts (Origin/Referer allow-list) is real+wired (index.ts:430,638), but adversarial pass found the item overclaims RESOLVED on a gap that is actu
- `0441-mod9-fleet-insurance-summary-never-render` — unit-aggregate.service.ts computes insurance_summary but VehicleProfilePage.tsx has zero render sites for it — dead backend field.

### fuel (2)
- `0251-gap7-fuel-surcharge-gl_VERIFY` — deriveRevenueCode maps line_type 'fsc'->'fuel_surcharge', resolved to GL account via expense_category_account_map
- `0441-mod3-fuel-fraud-detector-cron-never-invok` — initializeFuelFraudDetectorWorker() (jobs/fuel-fraud-detector-worker.ts:117) defined but never imported/called anywhere; not in scheduler/jobs.index.ts or index

### qbo-import (2)
- `import-1v2-trk-full-coa-equity` — TRK CoA is only the minimal decommingled set from migration 202606161200_coa_decommingle_trk_stage3.sql (14 mirrored accounts); no full QBO-equivalent CoA+equit
- `import-4v2-gl-detail-hardened` — integrations/qbo/forensic-import.service.ts pipeline hardened with forensic-batch-heartbeat.ts, forensic-progress.store.ts, forensic-audit.service.ts (error/ano

### users-docs-help (2)
- `phase8-audit161-api-audit` — No OpenAPI/Swagger spec or API-contract-testing workflow found (grep for swagger/openapi in backend src+package.json empty). Per-route Zod validation exists but
- `users-invited-status-distinct-from-active` — No 'invited' status string found anywhere in apps/backend/src or apps/frontend/src user-status code.

### finance-hub (1)
- `0451-fin2-finance-lands-on-stub-not-hub` — manifest.tsx:4100 /finance route still resolves to FinanceOverviewPage (stub), a separate route from /finance/hub (FinanceHubPage). Unchanged.

### legal (1)
- `0441-mod12-legal-no-reverse-drill-through` — Matter detail page has forward EntityLinks out to driver/unit/claim, but grep for legal-matter references in driver/fleet/insurance frontend pages returns nothi

## 5. NOTABLE FINANCIAL BUGS (still-open, precise)
- settlement-payment.routes.ts never registered → payment-status panel 404s in prod
- HoldDeductionModal sends settlement-line id but backend updates deduction_schedule → holds silently no-op
- QBO CDC omits Purchase/Deposit/Transfer → bank-transaction pull missing
- auto-deduction policy apply() only called from its own test → deductions never reduce settlements
- 0441-mod2-wo-split-brain: two live WO-numbering route sets
- 0441-mod6-spawn-liability-fake-stub: returns null liability id
- 0441-mod11-profit-per-truck-cron-double-count: fan-out JOIN over-counts
- 0441-mod2-csv-import-mileage-phantom: writes phantom mdata.units.mileage
- settlement double-pay race: no compare-and-set guard
- load_stops DELETE grant still live to app role
- VENDOR-CUSTOMER-QBO-PARITY: default_ap_account_qbo_id zero frontend refs

## 6. REVENUE-RECOGNITION LOCK — conflict to resolve before flag flip (GATED)
Locked (#2733/#2735): two-event latch — at delivery DR Unbilled Revenue/CR Line-Haul Income; at billing DR A/R/CR Unbilled. Verified NetSuite-grade for single-obligation freight; surpasses QBO. **CONFLICT:** merged accounting.revenue_recognition schema+poster model DEFERRED revenue (bill-first, opposite direction); revenue_contracts has deferred_revenue_account_id+ar_account_id but NO unbilled/contract-asset column (grep of db/migrations = zero). **Prereqs before REVENUE_RECOGNITION_POST_ENABLED flips:** (1) seed Unbilled Revenue account TRANSP+USMCA (none exist); (2) new migration adding unbilled/contract-asset account + earn-first posting path; (3) fix flag wiring 0243-h3-2 (isEnabled() called w/o operating_company_id → global-only).

## 7. NEON PROD READS — RELAYED-GUARD (br-fancy-credit-akjnd07a, RLS-bypass, 2026-07-19)
_Verified by the GUARD agent with authorized prod access; not independently re-verified by me._

| item | prod result | disposition |
|---|---|---|
| 0519-sf1 settlements | 165/165 active drivers have 0 settlements | OWNER CONFIRM: settlements done in QBO for now (CPA #57)? If yes → EXPECTED; if TMS engine should've run → gap |
| 0519-ma1 PM schedules | 0/50 active units have active PM schedule (186 total) | OWNER: is PM scheduling expected live in TMS yet? |
| dp-04 hire date | 165/165 active drivers blank hire_date | GAP if required; backfill on HR timeline (mdata write, gated) |
| 0519-dq3 blank CDL | 16 active drivers no cdl_number | REAL DQ (compliance) → cleanup (gated) |
| is_sample_data mis-flag | 78 active drivers flagged sample; 73 have REAL Mexican CDLs, 0 Samsara logins | CONFIRMED your uploaded B1 roster MIS-FLAGGED → un-flag real ones (mdata write, gated) |
| 0519-dq1 test driver | 4 active test/dummy names | purge/rename (gated) |
| 0519-dq2 placeholder phone | 2 active placeholder phone | minor cleanup (gated) |
| banking 'disconnected' | 5 stale is_active=false duplicate rows (1 BoA USMCA, 4 WF TRK); BoA absent for TRANSP/TRK | NOT broken feeds — archive 5 stale rows; ensure balance/recon filter is_active=true. BoA closed in trucking = correct |
| 0519-dq4/fl-01 fleet VIN | 0 blank; all 50 active units complete | CLOSE — clean |
| GL flags | all 15 GL-posting flags ENABLED on all 3 entities | CLOSE — correct-by-design (parallel-books cutover); do NOT re-flag |
| PHASE0 deploy-drift | prod=cb8055b fresh deploy | confirm cb8055b==origin/main HEAD (moves w/ merges) |
| 0519-mig2 migrations-no-file | 688 ledger rows / 688 files | CURSOR: comm -23 ledger vs ls db/migrations; left-only=applied-no-file; never delete ledger rows |

## 8. THE 66 UNVERIFIED — full disposition
- **PROD (32):** closed by GUARD in §7 where listed; remaining prod-reads run same way (RLS-bypass count). Data-quality writes are mdata → gated.
- **LIVE-APP (10):** 3 VISUAL-REMAINDER = RESOLVED (commits on main, PRs #2180/#2184/#2185 merged, verified via git merge-base --is-ancestor). 0441-mod13-compliance-tabs-local-usestate = STILL-OPEN (ComplianceDashboardPage.tsx:71 useState not URL-synced → migrate to searchParams). Repo/tooling: compliance-violations-tab-hardcoded (grep eld/tabs/ViolationsTab.tsx), p1-circular-dependencies (npx madge --circular), module-catalog-sweep (per-module parity, or drop). CHROME+axe (2 only): 0518-r15-a11y (axe across 30 routes), h-04-kpi-sublabel-contrast (OwnerHome.tsx:409). bf9b-wo-cost = underspecified → re-author/drop.
- **UNIDENTIFIABLE (24):** no locatable artifact. CURSOR: one locate attempt each (grep + to_regclass + route table); found → verify; not found → OWNER drop-or-keep.

## 9. THE 108 OWNER-DECISIONS
### 9A — ALREADY ANSWERED in corpus (60) — tracker just needs updating
- **biz-flow-4-no-escrow-deduction-cash-advance** [DELIBERATE-LOCK] — Owner-locked I3: driver escrow is a held-in-trust LIABILITY; the settlement pay-run only CONTRIBUTES to it (up to the $2,000 cap) and NEVER releases/draws it during the p  _(src: apps/backend/src/driver-finance/escrow-resolver.service.ts:1-4 (I3 LOCKED comment + ESCROW_CAP_CENTS))_
- **0285-df-gap2-dual-deduction-systems** [DECIDED] — Canonical deduction store = driver_finance.driver_settlement_deductions (the only store the FIN-18 GL poster reads); retire the settlement_lines auto_deduction path AND t  _(src: docs/lockdown/00_LOCKED_DECISIONS.md §9.1 (also docs/specs/ACCOUNTING-ARCHITECTURE.md:167 and memory audit-fix-decisions-2026-07-04.md item B))_
- **PHASE2_BILLLINE-LOADID_no-per-load-attribution_DISPATCH** [DECIDED] — Scope was already decided and built: add accounting.bill_lines.load_id FK -> mdata.loads for per-load cost attribution. PR #2330 (P2-BILLLINE-LOADID) merged 2026-07-11; t  _(src: docs/trackers/BLOCK-RECONCILIATION-2026-07-19.md:625 (P2-BILLLINE-LOADID-bill-lines-load-id, DONE, PR #2330) and memory session-2026-07-11-enforcement-layer-shipped.md)_
- **0091-repo-public** [DELIBERATE-LOCK] — Flipping GitHub repo visibility is an access-control/permissions change, which is explicitly prohibited for an agent to perform itself — it must be directed to Jorge to d  _(src: CLAUDE.md §1.6 (lines 52-54, "Prohibited outright": "changing access controls or sharing/permissions... direct Jorge to do it himself"))_
- **intercompany-trk-transp-consolidation-decision** [DELIBERATE-LOCK] — No consolidated/combined reporting ever, by design. TRANSP/TRK/USMCA financials are always presented per-entity, independent, never combined. Intercompany is handled only  _(src: memory revenue-recognition-at-delivery-and-no-consolidation.md (OWNER CORRECTION 2026-07-18, item 2), cross-referenced with memory bank-transaction-metadata-decisions-0441-mod8.md)_
- **fk-escrow-termination-0289** [DECIDED] — Escrow release-on-separation is keyed off the driver's termination_date directly (release_scheduled_at = termination_date + release_claims_window_days, per-driver 45/60/9  _(src: docs/specs/B9-ESCROW-DESIGN.md:43,97 (also memory enterprise-feature-decisions-2026-07-05.md updating the return window to >=90d))_
- **0285-df-gap1-no-escrow-for-cash-advances** [DECIDED] — Cash-advance shortfalls follow the same rule as walkoff/abandonment recovery: PAY FIRST, escrow only as a last resort if pay is insufficient (single charge per event, no   _(src: memory audit-fix-decisions-2026-07-04.md item D, plus apps/backend/src/driver-finance/escrow-resolver.service.ts:1-4 (I3 LOCKED))_
- **0243-g11-10-month-close-checklist-unsatisfiabl** [DECIDED] — Remediation is already specced: change the month-close gate from 'zero overdue' (arComplete/apComplete requiring 0 overdue) to a reviewed/acknowledged sign-off mechanism   _(src: docs/specs/0243-financial-migration-cluster-design-2026-07-11.md:141-144 (B5 · 0243-g11-10 — month-close checklist unsatisfiable))_
- **ruling-4-embezzlement-reclass-off-ar-q_DISPATCH** [DECIDED] — The CPA/owner ruling is the opposite of 'reclass off A/R': the Ignacio Muñoz + Anarely Alcazar 'Unauthorized Expenses' balances (~$423.7k) are KEPT as receivables (modele  _(src: memory opening-balance-and-recon-decisions-2026-07-02.md lines 23 and 29 (Jorge 2026-07-02 locked))_
- **0251-gap12-commodity-equipment-mapping** [DECIDED] — Design already specified: add catalogs commodity column requires_equipment (CHECK IN dry_van/reefer/flatbed/tanker/none); dispatch's equipment-selection validation gate r  _(src: docs/specs/0251-commodity-product-catalog-design.md lines 4,14,26,39,44-45 (gap12))_
- **P4-02_LEGAL-LINK_DISPATCH** [DECIDED] — Option B ownership boundary already locked: Legal module owns the link + handoff only (legal.contract_instance_links rows with link_type in driver/employee/... , the exec  _(src: docs/specs/LEGAL-FINANCE-OWNERSHIP-AND-FLIP-READINESS.md (LOCKED Option B) and memory legal-finance-ownership-option-b.md)_
- **bf7-cash-advance-recovery-engine** [DECIDED] — Same governing rule as 0285-df-gap1: recovery is PAY-FIRST via the net-pay floor (5% default, editable per settlement; up to full final check on termination), with escrow  _(src: memory audit-fix-decisions-2026-07-04.md items C and D, plus apps/backend/src/driver-finance/escrow-resolver.service.ts:1-4 (I3 LOCKED))_
- **0008-g3-qbo-mirror-canonical_DISPATCH** [DECIDED] — mdata.qbo_* is the canonical QBO mirror; repoint the accounting.qbo_* writers onto it (retire the accounting.qbo_* copy). Step 1 (naming the canonical) is decided; remain  _(src: docs/lockdown/00_LOCKED_DECISIONS.md §9.6 (also memory audit-fix-decisions-2026-07-04.md item G and schema-canonicalization-verdicts.md))_
- **usmca-unhide-entity-switcher** [DECIDED] — USMCA stays hidden/unlaunched (is_active gate intentional) until its July 2026 launch date; it is TMS-authoritative from day one with no QuickBooks and is never part of t  _(src: CLAUDE.md §6 ("USMCA ... launches July 2026, hidden until then") and docs/lockdown/00_LOCKED_DECISIONS.md §8.5 ("USMCA has no QuickBooks → it is TMS-authoritative from day one (2026), never part of the clone/reconcile"))_
- **h-03-open-queue-navy-cta** [DECIDED] — the navy 'Open queue' CTA is correct as-is; green is reserved exclusively for the Class pill and green/yellow section bands are explicitly forbidden, so the CTA should NO  _(src: CLAUDE.md §7 ("Palette LOCKED ... --green-pill #d1fae5 (Class pill only) ... No yellow/green section bands"))_
- **PHASE1_BILLPAY-GL_bank-mutated-no-JE_DISPATCH** [DECIDED] — not a code gap — the paid-in-full bill+bill_payment model (Post-as-bill creates a PAID bill + bank-credit payment) is the owner-approved GL treatment, gated behind BILL_G  _(src: auto-memory banking-posting-flags-go-nogo-2026-07-06.md (2026-07-07 UPDATE))_
- **0473-1-1-default-revenue-account-unmapped-line** [DECIDED] — default freight-revenue account = NONE/hard-fail: revenue credit resolves per-invoice-line to the item's mapped QBO income account; an unmapped line HARD FAILS and never   _(src: auto-memory void-cancel-governance-policy.md, "ACCOUNTING-1 / QBO decisions LOCKED (Jorge \"follow your best recommendation\", 2026-06-30)" section)_
- **0008-h-create-bill-line-items-load-id_DISPATCH** [DECIDED] — schema design is already ruled: accounting.bill_lines.load_id is additive, nullable, FK's to the canonical hub mdata.loads(id) (mirroring accounting.expense_lines.load_id  _(src: db/migrations/202607200000_bill_lines_load_id.sql (header comment + body))_
- **0473-1-6-wo-void-reversal-grain** [DECIDED] — whole-bill grain is the ruled design — a WO void reverses its whole linked bill as one net-zero reversing JE (both entries retained), reusing the existing void engine (ac  _(src: auto-memory void-cancel-governance-policy.md ("Reuse the existing void engine ... at the bill grain (a WO reverses its whole linked bill = one net-zero reversing JE)"))_
- **p1-data-encryption-at-rest** [DECIDED] — a formal key-management/rotation policy exists: the encryption key MUST be rotated annually, with key versions tracked in the audit log, and a rotation runbook is a go-li  _(src: docs/specs/IH35_CURSOR_BUILD_SPEC_V3.md MUST 3.6.3 ("...MUST be rotated annually per Part 5.6, with key versions tracked in the audit log per Part 4.7.2.3") and its go-live checklist line ("BANKING_PII_ENCRYPTION_KEY rotation procedure documented"))_
- **import-5-qbo-import-ui** [DELIBERATE-LOCK] — IMPORT-5 (the QBO-import UI) is a defined, sequenced block of the 6-block historical-import program, intentionally held behind QBO_HISTORICAL_IMPORT_ENABLED (default OFF)  _(src: docs/trackers/2026-07-02-module-sweep-17-28/import-program-v2/00-READ-FIRST-import-program-v2.txt (sequencing line "→ IMPORT-5 (v1, unchanged + STALE state rendering)" + "QBO_HISTORICAL_IMPORT_ENABLED default OFF · owner-triggered only"))_
- **factoring-asc860-cpa-control-test-open** [DECIDED] — the ASC 860 three-part control test has been applied to the actual executed Faro agreement terms (full recourse via mandatory day-95 repurchase, personal guaranty, UCC fi  _(src: auto-memory faro-factoring-contract-terms.md ("ACCOUNTING TREATMENT = SECURED BORROWING (ASC 860) ... fails ASC 860 sale condition #3 → secured borrowing. Matches the CPA lock."))_
- **ifta-sales-tax-booking-location-confirm** [DECIDED] — sales tax = none on line-haul freight — interstate/cross-border freight transportation is ruled not TX-sales-taxable, so no sales-tax module/posting is required on freigh  _(src: auto-memory opening-balance-and-recon-decisions-2026-07-02.md ("5. Sales tax: none — interstate/cross-border freight transportation is not TX-sales-taxable. No sales-tax module on line-haul."))_
- **PHASE2_LOAD-INVOICE_no-auto-ar_DISPATCH** [DECIDED] — revenue/A-R recognition is ruled to trigger AT DELIVERY, not at invoice-create — this supersedes the earlier invoice-create-triggers-AR framing and directly answers when   _(src: auto-memory revenue-recognition-at-delivery-and-no-consolidation.md ("Revenue recognition = AT DELIVERY ... supersedes the earlier locked wording 'Revenue recognized at invoice-create'"))_
- **0282-p0-catalogs-accounts-scope_PARTIAL** [DECIDED] — catalogs.accounts is ruled to be physically entity-partitioned per operating_company_id ("Path B"), not a single shared cross-entity ledger — Jorge approved Path B 2026-0  _(src: auto-memory multi-entity-coa-path-b.md ("Jorge approved Path B (2026-06-15): physically entity-partition catalogs.accounts because the 3 entities are independent legal entities ... that share nothing") and auto-memory gl-ledger-map.md)_
- **0441-mod6-insurance-no-driver-accident-link** [DECIDED] — The forward-link migration (202607410000_claim_crossmodule_fks.sql, paired with 202607250000 + 202607240000) is already authored and correct; per CLAUDE.md §1.3/§1.4 (fin  _(src: CLAUDE.md §1.3/§1.4; db/migrations/202607410000_claim_crossmodule_fks.sql:30-32; memory/held-migration-merge-runs-on-prod.md; docs/trackers/backlog-verify/safety.md:37)_
- **0242-no-auto-customer-charge-on-cancellation** [DECIDED] — Full design is written: add nullable FK dispatch.load_cancellations.billed_invoice_id -> accounting.invoices(id); on approval, when billable_to_customer=true and cancella  _(src: docs/specs/repairs/REPAIR-F-CANCELLATION-BILLING-DEDUCTION-LINKAGE-DESIGN.md (sections A and B, lines 41-58))_
- **0277-csrf-tokens-recommendation** [DECIDED] — Not a build gap: the Origin/Referer allow-list CSRF guard (G3-1) is already built, registered, and tested; the finding is an audit-note overclaim, not an unresolved owner  _(src: docs/trackers/backlog-verify/insurance.md:12; apps/backend/src/middleware/csrf-origin-guard.ts + apps/backend/src/index.ts:430,638)_
- **audit25-fx-rate-hedging-translation** [DECIDED] — No dedicated FX/hedging module is needed: home currency is locked as USD, with MXN handled via FX gain/loss + home-currency adjustment under ASC 830 — this is the full FX  _(src: memory/opening-balance-and-recon-decisions-2026-07-02.md:15; .claude/skills/ih35-cpa-accounting-decisions/resources/locked-decisions-reference.md:16; docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md:173)_
- **gated-blocks-conn-plaid-relay-edi** [DECIDED] — Not 'unbuilt': CONN-1 Plaid (and the paired CONN-3 items) are code-complete and registered; they sit HELD in db/migrations/.held-migrations.json awaiting the standing own  _(src: CLAUDE.md §1.3/§1.4; docs/trackers/backlog-verify/qbo-recon.md:23; db/migrations/.held-migrations.json)_
- **0243-g6-2-vendor-create-no-dedup-guard** [DECIDED] — Full remediation is designed and partially built: app-level case-insensitive, entity-scoped dedup (assertUniqueVendorFields / vendorNameConflictExists, already live in ve  _(src: docs/specs/0243-financial-migration-cluster-design-2026-07-11.md:61-68 (A3 · 0243-g6-2); apps/backend/src/mdata/vendors.routes.ts:156-173)_
- **0091-d1-2** [DECIDED] — Canonical AP truth is mdata.vendors; mdata.qbo_vendors is a mirror — writers on the qbo_vendors side should be repointed to the canonical table.  _(src: docs/specs/0091-CLUSTER-DISPOSITION-AND-FINANCIAL-DESIGN-2026-07-11.md:151-153 ('d1-2'))_
- **users-par-1-permission-matrix** [DELIBERATE-LOCK] — Intentionally design-only: the permission-matrix build is explicitly gated — 'Jorge approves before any build block is cut' — so the absence of a live PermissionMatrix im  _(src: docs/specs/USER-PERMISSION-MATRIX.md:3,5 ('Block: USERS-PAR-1 ... Status: DESIGN ONLY — Jorge approves before any build block is cut'))_
- **0252-audit146-workplace-safety-osha** [DECIDED] — A design/prioritization decision exists: the HR cluster plan scopes an OSHA workplace-safety dashboard layered over the existing safety.incidents/dvir tables (new hr.osha  _(src: docs/specs/0252-hr-people-cluster-design-2026-07-12.md lines 57, 72, 96-97, 123)_
- **PHASE2_CANCEL-TONU_billable-cancellation-no-charge_DISPATCH** [DECIDED] — Same underlying gap as biz-flow-3-no-auto-customer-charge-on-cancellation: REPAIR-F's design section B specifies the customer-charge leg (one invoice via existing invoice  _(src: docs/specs/repairs/REPAIR-F-CANCELLATION-BILLING-DEDUCTION-LINKAGE-DESIGN.md sections A/B (lines 12, 41-58); docs/trackers/financial-block-buildability.csv:816)_
- **flow5-escrow-limited-to-driver-bonds** [DECIDED] — Not limited by design: the canonical successor engine (settlement-bill-payment-posting.service.ts) already implements pay-first-then-escrow generically for ALL deduction   _(src: docs/specs/repairs/REPAIR-A-DEDUCTION-LEDGER-DESIGN.md; docs/trackers/MASTER-MANIFEST-2026-07-10.json id biz-flow-5-escrow-only-driver-bonds; memory/driver-escrow-is-liability.md)_
- **events-event-log-force-rls-still-blocked** [DECIDED] — Nothing left to design: the FORCE RLS migration (202607510000_events_audit_log_entity_isolation.sql) is authored correctly and its GUC prerequisite has landed; remaining   _(src: db/migrations/202607510000_events_audit_log_entity_isolation.sql:24; docs/trackers/backlog-verify/platform.md:70; CLAUDE.md §1.3/§1.4)_
- **factoring-asc860-determination-memo** [DECIDED] — The determination itself is locked even though a standalone memo file doesn't exist: Faro factoring is GAAP secured borrowing (ASC 860) despite 'sale' contract language,   _(src: docs/lockdown/00_LOCKED_DECISIONS.md §8.6; memory/faro-factoring-contract-terms.md lines 38-41; memory/cpa-locked-decisions-2026-07-01.md line 25)_
- **migrate-faro-to-rts** [DELIBERATE-LOCK] — Faro is the current factor; migration to RTS is a named future plan with no committed timeline/spec today — absence of RTS integration code is the intended current state,  _(src: docs/lockdown/00_LOCKED_DECISIONS.md §8.6 ('Faro today → RTS planned') + CLAUDE.md §6)_
- **wo-cancellation-reasons-fold-into-void-cancel-** [DECIDED] — Yes, fold: catalogs.wo_cancellation_reasons (6 rows, WO-specific) is to be mapped/backfilled into the unified per-entity catalogs.void_cancel_reasons and the old table ar  _(src: auto-memory void-cancel-governance-policy.md ('SEPARATE cleanup PR ... fold wo_cancellation_reasons (6 rows) into void_cancel_reasons ... Doc+guard locked in MULTI-ENTITY-SEPARATION.md'); confirmed tracked as open work in docs/trackers/MASTER-MANIFEST-2026-07-10.md:2922-2924)_
- **0251-gap2-vendor-gl-linkage** [DECIDED] — Already built, not a gap: mdata.vendors.default_expense_account_id (FK to catalogs.accounts, ON DELETE SET NULL) exists per migration 202607110230_vendor_qbo_parity.sql,   _(src: db/migrations/202607110230_vendor_qbo_parity.sql:9,22,27 + docs/specs/0251-book-load-financial-linkages-design.md ('Related already-satisfied blocks: gap2 (vendor GL FK ✅ mdata.vendors.default_expense_account_id)') + docs/specs/0251-charge-code-gl-catalog-design.md:57)_
- **bf4-load-invoice-ar-factoring-payment** [DECIDED] — Customer-payment posting (source_transaction_type='customer_payment') is intentionally LIVE/unguarded via applyPayment/posting-engine.service.ts — AR does clear on paymen  _(src: docs/specs/qbo-parity/CHAIN-06-INVOICE-AR-POSTING-DESIGN.md §7 ('The customer-payment leg stays as-is since it is already live via applyPayment') + apps/backend/src/accounting/posting-engine.service.ts:10,1544)_
- **0473-1-10-year-end-close-retained-earnings-asc** [DECIDED] — Year-end retained-earnings close is already designed and implemented: when period_end is Dec 31, close aggregates posted postings joined to catalogs.accounts and clears I  _(src: docs/specs/IH35_ARCHITECTURAL_DESIGN.md:902 ('Year-end retained earnings JE') + apps/backend/src/accounting/period-close-retained-earnings.service.ts (implementation exists))_
- **hiring-bypass-and-safety-contract-alerts** [DECIDED] — Hiring bypass IS intended: a new driver may be hired with the signed-contract requirement bypassed IF the contract will be uploaded later ('contract pending upload/sign'   _(src: auto-memory driver-hiring-contract-spec.md (Jorge 2026-07-05): 'Hiring bypass: ... allow hire with a contract pending upload/sign state, upload/sign later' + 'Alerts/reminders ... live on the SAFETY page')_
- **dispatch-sweep-gap-26** [DELIBERATE-LOCK] — Intentional 'estimate only' design, not a defect: the Dispatch Sheet's 'Estimated trip pay' is deliberately sourced from mdata.loads.rate_total_cents (with an explicit fo  _(src: apps/backend/src/dispatch/dispatch-sheet.routes.ts:163-226 (grossFootnote comment) + docs/trackers/MASTER-MANIFEST-2026-07-10.md:1407-1409 ('the doc's ask (pull from GL) conflicts with the intentional estimate only design'))_
- **expand-escrow-non-bond-deductions** [DECIDED] — Escrow deduction types are already specified beyond load-abandonment: the driver escrow (a liability) is returned 60-90 days after separation net of deductions for vehicl  _(src: auto-memory driver-escrow-is-liability.md (Jorge-confirmed 2026-06-30: 'net of deductions for vehicle damage, late fees, and fines') + auto-memory finance-engine-decisions-locked.md E4 ('Q1 = BUCKETED — a SEPARATE balance per deduction type (cash advance, damage chargeback, lease, insurance, …)'))_
- **public-audit-log-partitions-no-rls** [DECIDED] — The fix is already authored (an idempotent RLS-enable+FORCE+WORM-preserving migration for public.audit_log/audit_log_partitioned) and simply awaits the standard financial  _(src: CLAUDE.md §1.4 (financial-cluster migrations never self-merge) + docs/trackers/MASTER-MANIFEST-2026-07-10.md:3127 + db/migrations/202606080940_block26_partition_hot_tables.sql (creates the tables the fix targets))_
- **PHASE1_BILL-GL_create-bill-never-posts_DISPATCH** [DECIDED] — Bill creation intentionally never posts a GL entry today — this is the locked default-OFF state shared by all money-posting flags (incl. BILL_GL_POSTING_ENABLED), pending  _(src: CLAUDE.md §1.4 ('Default env flags OFF') + auto-memory finance-engine-decisions-locked.md ('All ... money flags stay OFF until CPA sign-off and a Neon balanced-entry test') + docs/trackers/MASTER-MANIFEST-2026-07-10.md:1265 ('GL posting is flag-gated (BILL_GL_POSTING_ENABLED, EXPENSE_GL_POSTING_ENABLED...)'))_
- **0490-section-c-2-reporting-vs-reports-drift** [DECIDED] — reporting.* is the canonical schema for scheduled reports (migrate reports.* rows in, archive the old) — the guard script's DEPRECATED list is the thing that's stale/wron  _(src: docs/lockdown/00_LOCKED_DECISIONS.md:126 (§9.6 Schema canonicals) + auto-memory audit-fix-decisions-2026-07-04.md item G (owner-locked 2026-07-04); scripts/verify-no-deprecated-schema-creates.mjs:25 needs to be fixed to match, not the other way around)_
- **block5-coa-new-account-type-detail-org_DISPATCH** [DELIBERATE-LOCK] — Do NOT add a catalogs.accounts.detail_type_id FK to the Block-4 per-entity detail_types catalog. Detail Type is QBO AccountSubType, stored as catalogs.accounts.account_su  _(src: auto-memory coa-detail-type-is-account-subtype.md (DECIDED 2026-07-01, Block 5 / COA-ACCT-DETAIL-01))_
- **audit10-payroll-automation-tax-withhol_DISPATCH** [DECIDED] — Driver settlements (driver_finance.*, 1099) and QBO Payroll (W-2 office staff) are two deliberately separate systems by design — B9 explicitly states driver escrow/settle  _(src: docs/specs/B9-ESCROW-DESIGN.md:12)_
- **0251-gap3-vendor-invoice-linkage** [DECIDED] — The factor IS modeled as a vendor (mdata.vendors), not a separate factoring.factor concept: gap1's approved design adds mdata.loads.factoring_vendor_id uuid REFERENCES md  _(src: docs/specs/0251-book-load-financial-linkages-design.md §1-2 (gap1/gap3))_
- **gated-blocks-usmca-launch-gate** [DELIBERATE-LOCK] — USMCA-LAUNCH is intentionally gated on entity-independence completion (the 142-wall + P1/P4 + guards), not a fixed date; once that completion bar is met every function tu  _(src: auto-memory enterprise-feature-decisions-2026-07-05.md ('USMCA-LAUNCH: gated on entity-independence completion...Not a fixed date'))_
- **0251-gap13-commodity-rate-matrix** [DECIDED] — A proposed schema already exists: catalogs.commodity_rate_matrix (product_id, origin_zone, dest_zone, equipment, rate_cents, basis), to be read by the rate-quote path as   _(src: docs/specs/0251-commodity-product-catalog-design.md (gap13, lines ~5,33,46,50))_
- **db5-resize-removal-directive-vs-current-lock** [DECIDED] — DB-5 ('remove resizable columns app-wide') is RETRACTED/PARKED as of 2026-06-28 — GUARD + Jorge confirmed the stop was correct. Do NOT remove column-resize; the shipped/e  _(src: auto-memory db5-resize-removal-parked.md)_
- **0252-audit140-compensation-structure** [DELIBERATE-LOCK] — Internal-employee compensation-structure/pay-equity benchmarking is explicitly scoped OUT and marked 'Defer' — driver pay is out of scope (1099 settlements, not benchmark  _(src: docs/specs/0252-hr-people-cluster-design-2026-07-12.md lines 62, 117 (0252-audit140 row: 'Low...Defer' / 'DESIGN-ONLY...office comp unspecced'))_
- **0473-1-8-tk-transp-lease-asc842** [DECIDED] — The underlying classification is already locked: Option A operating lease (TRK books/depreciates the truck 5-yr straight-line, books lease payments as rental income) — ac  _(src: auto-memory finance-engine-decisions-locked.md (B1/B2/B5, 'FIN-22 (#1650) SHIPPED 2026-06-29'))_
- **P4-08_WO-DOUBLE-BILL_VERIFY** [DECIDED] — Already dispositioned as OWNER-GATED with a documented remediation path (not silently deferred): root-cause fix = a UNIQUE(linked_work_order_uuid) partial index (financia  _(src: docs/trackers/DEFERRED-ITEMS.md §F (P4-08 WO→bill double-bill risk, lines 124-134))_
- **biz-flow-5-escrow-only-driver-bonds** [DECIDED] — The 'bonds-only' framing is refuted by the locked architecture itself: recovery ordering is pay-first-then-escrow GENERICALLY for every deduction bucket (advance, damage   _(src: docs/lockdown/00_LOCKED_DECISIONS.md:130-131 (§9.3 Recovery ordering, §9.4 Escrow return) + docs/specs/ACCOUNTING-ARCHITECTURE.md:171)_
- **s-12-log-event-button-navy-cta** [DECIDED] — The '+ Log Event' bg-[#1F2A44] CTA is already palette-compliant — #1F2A44 IS the one locked navy token, and navy is an approved CTA color under the §7 palette lock. No dr  _(src: CLAUDE.md:178 (§7 Palette LOCKED: --navy #1f2a44))_

### 9B — GENUINELY UNDECIDED (48) — with GUARD recommendation
- **0285-acct-gap3-manual-payment-application** [accounting]
  - REC: KEEP MANUAL (decide-as-is) — manual payment application is correct/safer than auto-apply for now; revisit only if volume demands. Close as decided.
- **0519-at2-no-db-enforced-sod** [accounting]
  - REC: BUILD (gated) — DB-enforced segregation-of-duties (approver != poster on JEs/posting_batches) is a real audit-grade internal control; given the embezzlement history this is worth building. Financial-gated.
- **audit16-budget-tracking-system** [accounting]
  - REC: DEFER — not core; use QBO budgets if needed. Low priority.
- **audit17-procurement-purchase-order-system** [accounting]
  - REC: DEFER — bills + vendors cover AP; a PO system is premature for your size.
- **audit18-treasury-management** [accounting]
  - REC: DECLINE — banking module covers cash; treasury management is enterprise-scale, N/A.
- **audit21-capex-tracking-approval** [accounting]
  - REC: DEFER — fixed-assets module exists; add capex approval only if you want a formal gate.
- **audit3-external-audit-prep-workflow** [accounting]
  - REC: DEFER — audit.row_changes + source-links exist; build a workpaper/audit-prep workflow only when a real exam/audit is scheduled.
- **audit6-sox-ifrs-compliance-dashboard** [accounting]
  - REC: DECLINE — private SMB, not SOX-regulated, US-GAAP not IFRS. Not applicable.
- **dip-mor-pre-post-petition-ap-split** [accounting]
  - REC: BUILD (gated, HIGH) — Ch.11 Monthly Operating Report REQUIRES pre/post-petition A/P split. This is a bankruptcy-reporting obligation, not optional. Design + migration, owner/CPA-gated.
- **flow2-customer-chargeback-driver-expense** [accounting]
  - REC: BUILD (gated) — when a customer chargeback is driver-fault, route it to a driver expense/deduction per your driver-fault-liability model (bf1). Cross-module linkage.
- **sweepfix1727-8** [banking]
  - REC: BUILD (frontend, non-financial) — repoint the /finance route from the stub FinanceOverviewPage to the real Finance Hub. Just ship it.
- **0257-audit-88** [compliance]
  - REC: CLOSE (RESOLVED) — border-crossing/customs module exists and is wired (border-crossing-wizard.routes.ts + history). Finding is stale.
- **P4-01_SAFETY-INSURANCE-LINK_DISPATCH** [dispatch]
  - REC: (no rec)
- **P4-03_UNIT-IDENTITY_DISPATCH** [dispatch]
  - REC: (no rec)
- **P4-04_SAFETY-COST-GL_DISPATCH** [dispatch]
  - REC: (no rec)
- **P4-05_DAMAGE-CLAIM-FK_DISPATCH** [dispatch]
  - REC: (no rec)
- **P4-06_WO-FK_DISPATCH** [dispatch]
  - REC: (no rec)
- **P4-07_PARTS-GL_DISPATCH** [dispatch]
  - REC: (no rec)
- **PHASE2_ACCESSORIAL-REVENUE_divergent-engine_DISPATCH** [dispatch]
  - REC: (no rec)
- **PHASE2_RECON-COLLECTOR_frozen-feed_DISPATCH** [dispatch]
  - REC: (no rec)
- **0518-r18-schema-fragmentation-8-dup-pairs** [factoring]
  - REC: FOLLOW DESIGN (gated) — execute the existing SCHEMA-CANONICALIZATION-VERDICTS-2026-06-28 doc (fold bank->banking etc.). Schema migration, gated.
- **factoring-g3-debtor-credit-check-decision-note** [factoring]
  - REC: DEFER — Faro provides credit today; build debtor-credit-check only after the Faro->RTS migration. Enhancement, not a defect.
- **module25-required-docs-ruleset-per-entity** [factoring]
  - REC: BUILD (gated) — per-entity required-docs ruleset (TRANSP vs TRK vs USMCA differ). Real compliance need; additive.
- **0275-audit171-data-quality-monitoring** [platform]
  - REC: DECLINE — no MDM rules-engine needed at single-carrier scale; the concrete DQ gaps (blank CDL/phone/hire-date, mis-flagged roster) are handled by the prod-read cleanup list, not a monitoring platform.
- **0275-audit174-data-security-hardening** [platform]
  - REC: CLOSE (mostly done) — field-level encryption (lib/encryption.ts), append-only audit.row_changes, and RLS already exist; DECLINE a separate 'hardening dashboard'.
- **0275-audit177-data-integration-monitoring** [platform]
  - REC: CLOSE — integration_sync_log (0175) exists and is written by 8 files; DECLINE a dedicated dashboard.
- **0275-audit178-master-data-governance** [platform]
  - REC: DECLINE — no enterprise MDM platform needed; mdata.* + RLS is the governance.
- **0275-audit181-data-lineage-tracking** [platform]
  - REC: CLOSE/DECLINE — audit.row_changes + accounting.transaction_source_links already give lineage; no separate system.
- **0275-audit182-data-profiling-system** [platform]
  - REC: DECLINE — not applicable at your scale.
- **0275-audit183-data-catalog-system** [platform]
  - REC: DECLINE — db/migrations + docs/specs are the catalog.
- **0275-audit184-data-dictionary-system** [platform]
  - REC: DECLINE — schema + specs are the dictionary.
- **0275-audit185-data-model-documentation** [platform]
  - REC: DECLINE — 73 schemas/540+ tables are self-documenting via migrations; no live model-monitoring dashboard needed.
- **0441-mod13-form425c-exhibit-c-opening-balance-** [platform]
  - REC: OWNER-ENTER (gated) — Form 425C Exhibit C opening balance is owner-entered only. You enter it; agent never posts opening balances.
- **0441-mod13-notifications-module-not-fully-audi** [platform]
  - REC: AUDIT or DROP — route to a notifications-module parity sweep, or drop if not a priority.
- **0441-mod5-retention-excludes-critical-truncate** [platform]
  - REC: RE-AUTHOR or DROP — underspecified (doc-retention truncation); no locatable target. Re-author with specifics or drop as noise.
- **0441-mod6-idvr-row-not-clickable-session-fake-** [platform]
  - REC: (no rec)
- **0473-2-5-trial-balance-002-cosmetic_CLEANUP** [platform]
  - REC: (no rec)
- **p1-analytics-systems** [platform]
  - REC: DECLINE — no product-analytics SDK; you hold financial/legal-evidence data (privacy). Financial analytics already exist as accounting reports.
- **p1-dashboard-implementation** [platform]
  - REC: CLOSE — Home/OwnerHome/QboStyleHome already shipped; DECLINE the generic 200-hr line.
- **phase8-audit165-analytics-general** [platform]
  - REC: DECLINE — operational analytics (booking-gap, late-arrival, home KPIs) already exist.
- **0091-m-factor-1** [qbo-recon]
  - REC: FIX (gated) — factoring-virtual.routes.ts:49 reads current_reserve_balance with NO write path (dead column). Either wire the write path or remove the dead read. Financial, gated.
- **bf10b-qbo-recon-six-types** [qbo-recon]
  - REC: CLOSE (likely RESOLVED) — recon-cron.service.ts:64-73 already declares all 6 QBO register sources; the '2 of 6' claim is stale. Verify live then close.
- **0270-no-auto-driver-status-from-safety-events** [safety]
  - REC: DECLINE auto (keep explicit) — the explicit-termination path is already wired; auto-changing driver status from safety events risks false triggers. Keep manual/explicit, or add an approval gate.
- **0278-safety-gap1-auto-driver-status** [safety]
  - REC: DUPLICATE of 0270 — same ruling: keep explicit-only. Close as duplicate.
- **0270-no-auto-escrow-deduction-safety-events** [settlements]
  - REC: DECLINE auto (gated) — escrow is held-in-trust liability; auto-deducting on a safety event is legally risky. Keep manual/approval-gated deductions only.
- **0473-1-9-driver-settlement-net-pay-mod_DISPATCH** [settlements]
  - REC: (no rec)
- **flow5-dual-deduction-systems-consolidate** [settlements]
  - REC: CONSOLIDATE (gated) — collapse onto canonical driver_finance.driver_settlement_deductions per lockdown §9.1; retire the duplicate deduction paths. Same ruling as 0285-df-gap2.
- **ruling-3-driver-escrow-current-vs-long_DISPATCH** [settlements]
  - REC: (no rec)

## 10. LANDMINES / STANDING NOTES
- reconcile:blocks snapshot goes stale — re-run for current numbers (was 07-12 stale all session).
- AUDIT-NOTE = registry prose in allowed_files (no file paths) → unmeasurable by counter; verify vs code/live.
- DONE in reconcile = merged, NOT verified.
- board:sync to R2 needs creds; committed block-reconciliation-data.json is what the live board reads for counts.
- 0091-repo-public: repo visibility flagged; owner-only action (agent-prohibited §1.6) — owner disregarded.
- Any cleanup writing accounting.*/catalogs.*/mdata.* or flipping a flag = financial cluster → owner-approve + GUARD live-verify, never self-merge.

## 11. PRs THIS SESSION
- Merged frontend (self, on green): #2739-#2746, #2734,#2737,#2749,#2750,#2751,#2753,#2755,#2758; CI #2747,#2748; #2742 fixed.
- Merged owner-gated (not me): #2724, #2733/#2735 (rev-rec lock), #2725-#2732.
- OPEN frontend URL-sort (safe on green): #2754,#2756,#2757,#2759,#2760,#2761,#2763.
- OPEN this session: #2752 (recon regen, superseded), **#2762 (purge + refreshed counts + this handoff)**.


---

**Cursor adversarial overlay (required reading before acting on §7 Neon or Group B CLOSE):** [`CODER-FINAL-HANDOFF-CURSOR-VERIFY-2026-07-19.md`](./CODER-FINAL-HANDOFF-CURSOR-VERIFY-2026-07-19.md)
