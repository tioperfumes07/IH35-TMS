# IH35-TMS — CODER BUILD INSTRUCTIONS (2026-07-19)

**Every ticket below is bound by the Law of the Land and the Hardline Quality Rules. These are the definition of DONE — a ticket is NOT done until all apply. No exceptions.**

## DEFINITION OF DONE (applies to EVERY ticket)
1. **§10a TOTAL CONNECTIVITY** — the record/screen must be wired to its financial primitives (vendor/customer/expense/bill/bill-payment/journal-entry/liability-or-asset account) AND to every related operational module (legal, insurance, assets, safety, maintenance, dispatch, driver, customer, vendor). **Forward AND reverse drill-through both ways.** A screen or record missing a link is NOT done.
2. **§10b VERIFY EVERYTHING, NEVER GUESS** — every "done" is backed by live evidence produced this session: schema/columns/enums verified against the Neon PROD branch (prod wins over migrations/memory), code path read + route registered/component mounted/guard wired, fix confirmed live (endpoint/health-sha/DB row/browser). **CI-green is the floor, not done.** Empty grep / 0-count → re-run (RLS masks to 0). When you cannot verify: write "UNVERIFIED — needs live check", never a guess.
3. **§10 HARDLINE** — fix the ROOT CAUSE. Never patch over, never defer, never fake-green, never take the short way. Build to reach and surpass QuickBooks / NetSuite / McLeod / Alvys — research how they actually do it before building. Every change made as if a CPA, auditor, attorney, insurer, DOT/FMCSA reviewer, or court will review it.
4. **§2 EVERY FIX GETS A STATIC CI GUARD** — so it can never regress. Named in each ticket.
5. **§7 ADDITIVE-ONLY** — never delete/remove/reorder existing modules/pages/columns/fields/tabs/routes. ARCHIVE, never DELETE. void-not-delete (set voided_at). Vocab: **+ Create / + Book** only. Locked palette. No second sidebar. Single-line names.
6. **§1.4 FINANCIAL GATING** — any ticket marked **GATED** (touches accounting.*/catalogs.*/mdata.*/db-migrations/posting/GL/ledger/flags/opening-balances) is NEVER self-merged. Build → typecheck → run migration locally → show owner `git diff --staged --stat` + full SQL → WAIT for explicit "OK to merge". Opening balances are owner-entered only. Reuse EXISTING posting/GL functions — write NO new GL math solo.
7. **§2 MIGRATION INVARIANTS** — idempotent (DO + IF NOT EXISTS), migration number > main's current max re-checked at push, UUIDv7 PKs, `security_invoker=true` on views, FORCED RLS + grants (0065 pattern), append-only audit (never UPDATE/DELETE audit_events / audit.row_changes).
8. **SCHEMA REALITY** — verify names against `db/migrations/` + PROD before writing SQL. loads=`mdata.loads`, stops=`mdata.load_stops`, bills=`accounting.bills`, bank=`banking.bank_transactions`, driver earnings=`driver_finance.settlement_lines`, HOS=`hos.duty_status_events`. There is NO `ih35_app.*` data schema. `mdata.units` uses `owner_company_id`/`currently_leased_to_company_id`, NOT `operating_company_id`.
9. **DRIVER MODEL** — drivers are hired Mexican-B1 1099 contractors, NOT owner-operators. Driver pay is a wage/fee, NEVER a % of customer linehaul (linehaul = company revenue).

## HOW TO USE THIS DOC
- Tickets are grouped by module, each with STATE / ROOT CAUSE / FILES / FIX STEPS / GUARD / GATED.
- **Skip any ticket marked ALREADY-FIXED** (re-verified on main this session — don't chase it).
- **GATED tickets:** do the design + local build, then STOP for owner's OK on the diff+SQL before merge.
- **Non-gated (frontend/UI/guard):** build, add the guard, self-merge on genuine green.
- When two tickets touch the same file, coordinate (one writer per file) to avoid the conflict treadmill.
- Order within a module by the priority the ticket states; across modules, the owner-approved D-priority leads: RECON-COLLECTOR unfreeze → DIP MOR pre/post-petition A/P split → flow5 dedup consolidation → then the rest.

---

## ★ CRITICAL FIRST (do these before frontend polish)

1. **[SECURITY+FINANCIAL, GATED] Cross-tenant IDOR — `settlements/approval.routes.ts`.** VERIFIED in code: `/line-items` uses `resolveOperatingCompanyId(client, user.uuid, requestedCompanyId)` (the "IDOR fix (xe-fin)"), but `/approve-line`, `/reject-line`, `/approval-summary` take `operating_company_id` raw from the query and pass it to the write — a user at one entity can approve/reject ANOTHER entity's settlement lines. FIX: call `resolveOperatingCompanyId` in those 3 routes (and audit `/approve`, `/finalize`, `/generate-pdf` for the same raw pattern) + add a CI guard asserting every settlements/approval route resolves the acting company. Owner OK required (financial). Critical before USMCA launch.
2. **[GATED] D#1 RECON-COLLECTOR** — feed frozen 47 days (silent `failed:false` on dead connection). Runtime fix (QBO re-auth, owner) + staleness assertion + CI guard so a dark feed can't read green (PR #2776 has the start).
3. **[GATED] DIP MOR pre/post-petition A/P split** — Ch.11 legal requirement.
4. **[GATED] flow5** — execute lockdown §9.1 (collapse the duplicate deduction paths onto `driver_finance.driver_settlement_deductions`).

## VERIFY BEFORE BUILDING (flagged, need a check first)
- ~~`LEASE_GL_POSTING_ENABLED` ON (scope)~~ — **RESOLVED 2026-07-20:** owner confirmed **"3-lease on yes"** then **"yes leases on all companies"** → TRANSP + TRK + USMCA ON. Canonical lock updated in `docs/lockdown/00_LOCKED_DECISIONS.md` §9.9. Live Neon already has all three overrides `enabled=true` (verified with `app.bypass_rls='lucia'`). Coder: do **not** flip any of the three OFF; do **not** chase as drift. SETTLEMENT stays OFF until CPA.
- Any ticket marked UNVERIFIABLE needs a gated prod read.

---


# Build Tickets — bb_1 (re-verified against current main, 2026-07-18)

Legend: STATE = STILL-OPEN | ALREADY-FIXED | UNVERIFIABLE. GATED = yes (touches accounting.*/catalogs.*/mdata.*
schema-or-data, db/migrations/*, posting/GL/ledger, feature flags, or needs CPA/legal ruling — owner OK required
before merge) | no (non-financial, safe to build+merge on green CI per §1.2).

Totals: 49 findings — 31 STILL-OPEN / 15 ALREADY-FIXED / 3 UNVERIFIABLE. GATED: 26 yes / 23 no.

---

### 0091-g9-h4  [?]  GATED?(yes)
- STATE: ALREADY-FIXED — `apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts:319,385` now call `validateLoadStopStatusWrite(...)` (from `apps/backend/src/dispatch/load-state-machine.ts:87-97`) and 409 on failure BEFORE the raw `UPDATE mdata.loads SET status=$2` at lines 337/403. Added by commit `ca52d6f26` ("G9-H4 load-resurrection guard").
- ROOT CAUSE: N/A — resurrection/bypass gap closed; writes remain raw SQL but are now state-machine-validated first.
- FILES: apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts; apps/backend/src/dispatch/load-state-machine.ts; apps/backend/src/integrations/samsara/auto-status-switch/detector.service.ts:439 (residual gap — unguarded raw status UPDATE, no `validateLoadStatusTransition` call)
- FIX STEPS: No fix needed for the original finding. Follow-up (new, smaller ticket): wire `detector.service.ts:439`'s raw `UPDATE mdata.loads SET status=$2` through the same validator.
- GUARD: verify-load-status-write-guarded.mjs — grep every `UPDATE mdata.loads SET status` call site and assert it's preceded in the same function by `validateLoadStatusTransition`/`validateLoadStopStatusWrite`; would currently flag the Samsara detector.

---

### 0270-no-auto-equipment-log-update-duplicate  [?]  GATED?(yes)
- STATE: STILL-OPEN — `grep "equipment_log" apps/backend/src/mdata/equipment-transfer.service.ts` = 0 hits. `confirmTransfer`/`finalizeDualAckTransfer` only UPDATE `mdata.equipment_transfers`/`mdata.equipment`, never INSERT `mdata.equipment_log`. Only writer of that table is `apps/backend/src/mdata/equipment-log.routes.ts:156` (manual entry only).
- ROOT CAUSE: Transfer confirm/dual-ack finalize mutate `mdata.equipment.assigned_driver_id` but never write a corresponding `mdata.equipment_log` event, so the equipment activity timeline misses transfer events.
- FILES: apps/backend/src/mdata/equipment-transfer.service.ts; apps/backend/src/mdata/equipment-log.routes.ts (INSERT shape to reuse)
- FIX STEPS: 1) In `confirmTransfer` and `finalizeDualAckTransfer`, after the `UPDATE mdata.equipment` call, add `INSERT INTO mdata.equipment_log` using the same columns as `equipment-log.routes.ts:156`. 2) Set `event_type='transfer'`, `equipment_id`, `event_at=now()`, actor + from/to driver ids. 3) Keep inside the existing transaction so it's atomic with the transfer confirm. 4) Add an integration test asserting one `equipment_log` row per confirmed transfer.
- GUARD: verify-equipment-transfer-logs-event.mjs — assert every function doing `UPDATE mdata.equipment SET assigned_driver_id` in equipment-transfer.service.ts also contains an `INSERT INTO mdata.equipment_log` in the same function body.

---

### 0518-r10-qbo-sync-workers-off-mirror-stale  [?]  GATED?(yes)
- STATE: STILL-OPEN — `apps/backend/src/qbo/master-data-sync.cron.ts:12-15` gates both the nightly full sync and 15-min delta sync on `QBO_MASTERDATA_SYNC_ENABLED !== "true"` (returns early). No seed sets it true anywhere; confirmed default OFF.
- ROOT CAUSE: The recurring QBO master-data sync is fully built and wired but its own env-var kill switch defaults OFF, so the QBO mirror only refreshes if an operator manually sets the flag in Render.
- FILES: apps/backend/src/qbo/master-data-sync.cron.ts; apps/backend/src/health/health.routes.ts:190-209 (staleness alarm reads the same flag)
- FIX STEPS: 1) Ask Jorge whether mirror staleness is acceptable or the cron should be turned on. 2) If yes: set `QBO_MASTERDATA_SYNC_ENABLED=true` in Render backend env (config, not code). 3) Confirm `/api/v1/healthz` deep check shows the flag enabled and staleness metric moving.
- GUARD: existing `0243-a1-1-qbo-mirror-staleness-self-disable` guard — confirm it still passes and reports the current effective default so "cron code exists" isn't mistaken for "cron runs."

---

### 0033-audit-schema-manifest-tool  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED (substitute exists; original spec'd artifact never built) — `scripts/audit-schema.mjs` and `docs/schema/SCHEMA-MANIFEST.json` confirmed absent (0 hits, repo-wide). Substitute `scripts/verify-backend-schema-contract.mjs` is real but is a static regex parser of `db/migrations/*.sql` vs backend `.ts` — no live-DB introspection.
- ROOT CAUSE: The originally-specified live schema-manifest tool was never built; the functional substitute can't catch prod/migration drift since it never connects to a DB.
- FILES: scripts/verify-backend-schema-contract.mjs (exists, static-only); no docs/schema/ directory exists
- FIX STEPS: 1) Decide with Jorge whether a true live-DB manifest tool is still wanted (needs prod DB read access — gated per §1.5, ask before connecting). 2) If yes: write `scripts/audit-schema.mjs` using `information_schema`/`pg_catalog` (RLS-immune), output to `docs/schema/SCHEMA-MANIFEST.json`. 3) Run as an on-demand script (not CI, since it needs prod creds) or against a Neon branch. 4) Document the static/live split in `verify-backend-schema-contract.mjs`'s header.
- GUARD: N/A — missing-tool finding, not a regression; if built, add a "manifest generated <N days ago>" staleness check.

---

### 0091-d1-2  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — `mdata.vendors` referenced in 81 backend files, `mdata.qbo_vendors` in 33, with real overlap (`tms-vendor-push.handler.ts`, `qbo-recon-reads.ts`, `qbo/push.service.ts`, `reconciliation-worker.service.ts`). No canonicalization has happened.
- ROOT CAUSE: `mdata.vendors` (TMS-native) and `mdata.qbo_vendors` (QBO mirror) remain two live, independently-written tables with no unification — awaiting Jorge's canonical-table decision (per `.block-ready/0243-d1-2-vendors-split-two-tables_DISPATCH.json`).
- FILES: apps/backend/src/outbox/handlers/tms-vendor-push.handler.ts; apps/backend/src/qbo/push.service.ts; apps/backend/src/accounting/qbo-recon-reads.ts; apps/backend/src/qbo/unlinked-entities.routes.ts; apps/backend/src/qbo/sync-conflict-detection.routes.ts
- FIX STEPS: 1) Get Jorge's explicit ruling on the canonical vendor table — do not decide solo. 2) Design a migration adding `mdata.vendors.qbo_vendor_id` or a unified `security_invoker=true` view. 3) Repoint qbo_vendors call sites to read through the canonical path. 4) Add a reconciliation check that every vendor maps to at most one counterpart row.
- GUARD: verify-vendor-table-single-writer.mjs — enumerate INSERT/UPDATE sites against both tables; flag any new write path bypassing the future canonical service.

---

### 0091-m-lists-2  [accounting]  GATED?(no)
- STATE: UNVERIFIABLE — `.block-ready/0091-m-lists-2.json` contains only generic boilerplate ("NEEDS-VERIFY... table/column/fk/rls/route/mounted proven") with no module/table/route name anywhere in the file. No `0091-m-lists-2.txt` source spec exists in the repo.
- ROOT CAUSE: N/A — nothing concrete to verify against code.
- FILES: .block-ready/0091-m-lists-2.json
- FIX STEPS: Locate the original dispatch spec text (outside this repo) before any coder can act; do not build blind against a placeholder.
- GUARD: N/A

---

### 0242-no-auto-customer-charge-on-cancellation  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — full read of `apps/backend/src/dispatch/cancellation.service.ts` (233 lines): `cancelLoad` inserts `billable_to_customer`/`cancellation_charge_cents` into `dispatch.load_cancellations` as data only (lines 62-87); no invoice/bill/accounting.* call anywhere in the file.
- ROOT CAUSE: Marking a cancellation billable never triggers an actual customer invoice/AR charge — it's intent-only data, so cancellation fees aren't billed unless a human creates an invoice manually elsewhere.
- FILES: apps/backend/src/dispatch/cancellation.service.ts; accounting invoice-creation service (e.g. apps/backend/src/accounting/invoices.routes.ts) to call into
- FIX STEPS: 1) STOP — financial/posting logic; get Jorge's sign-off on which GL account a cancellation fee posts to before writing code. 2) In `cancelLoad`, when `billable_to_customer && cancellation_charge_cents`, call the existing invoice-creation service (reuse GL infra, write no new GL math) to create a line item tied to `load_id`. 3) Add a gated migration linking the created invoice id back onto `dispatch.load_cancellations` for drill-through. 4) Add an audit event alongside the existing `appendCrudAudit` call.
- GUARD: verify-cancellation-charge-creates-invoice.mjs — assert any code path setting `billable_to_customer=true` with non-null `cancellation_charge_cents` is followed in the same transaction by an invoice/AR-charge creation call.

---

### 0243-g4-deploy-smoke-fixed-unit-test-owner  [accounting]  GATED?(yes)
- STATE: UNVERIFIABLE — code supports overrides: `scripts/ci-boot-aggregate-smoke.mjs:19` (`IH35_SMOKE_USER_EMAIL`, default `integration.owner@test.invalid`) and `:157,163` (`IH35_SMOKE_UNIT_ID`). Whether these are actually set in the live Render env, and whether the test-owner identity is excluded from prod `identity.users` listings, needs live env/DB access this task doesn't have.
- ROOT CAUSE: Override support exists in code; live-configuration state is unverifiable from the repo alone.
- FILES: scripts/ci-boot-aggregate-smoke.mjs (lines 19, 157-163)
- FIX STEPS: 1) Check Render dashboard/env for `IH35_SMOKE_UNIT_ID`/`IH35_SMOKE_USER_EMAIL` being set on the backend preDeploy env. 2) If not set: gated prod DB read (ask first per §1.5) to check whether `integration.owner@test.invalid` leaks into real driver/dispatcher listings. 3) If it leaks, add an exclusion filter (or `is_system_test_account` flag) to the relevant list queries.
- GUARD: verify-smoke-test-owner-excluded-from-listings.mjs — grep user/driver-listing queries for exclusion of the synthetic test-owner email; fail if a new listing lacks it.

---

### 0251-gap11-commodity-gl  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — `db/migrations/0313_border_crossing_wizard.sql:24-25` adds `commodity TEXT`/`commodity_value_cents BIGINT` (free text, no FK). No commodity→GL-account mapping table or code exists anywhere in accounting/catalogs/mdata.
- ROOT CAUSE: Commodity is stored as free text for border paperwork only; no lookup ties a commodity type to a revenue/COGS account.
- FILES: db/migrations/0313_border_crossing_wizard.sql; apps/backend/src/mdata/loads.routes.ts; new migration for a commodity-GL map table
- FIX STEPS: 1) Get Jorge/CPA sign-off on whether commodity-level GL mapping is even wanted (may be redundant with existing customer/lane-level mapping — check `ih35-cpa-accounting-decisions` first). 2) If approved: gated migration for `catalogs.commodity_gl_map(commodity_code, revenue_account_id, is_active)` with FORCE RLS + grants. 3) Add a normalization step so free-text `commodity` maps to a controlled `commodity_code`. 4) Wire the mapping into the GL posting service that determines revenue account.
- GUARD: N/A yet (nothing built) — once built: verify-commodity-gl-map-fk-integrity.mjs.

---

### 0251-gap22-lumper-expense_VERIFY  [accounting]  GATED?(yes)
- STATE: ALREADY-FIXED — `lumper-posting-rules.ts`, `lumper-auto-invoice.ts`, `lumper-cash-advance-split.ts` all exist in `apps/backend/src/cash-advances/`. `lumper-cash-advance-split.ts:19-21` gates all behavior on `process.env.LUMPER_LIFECYCLE_ENABLED === "true"` (strict-equality, default OFF). Migration `202606251700_lumper_expense_category_map.sql:14` confirms category/GL seed is app-layer-gated by the same flag.
- ROOT CAUSE: N/A — built as designed; correctly OFF pending owner sign-off, not a defect.
- FILES: apps/backend/src/cash-advances/lumper-posting-rules.ts; lumper-auto-invoice.ts; lumper-cash-advance-split.ts; db/migrations/202606251700_lumper_expense_category_map.sql
- FIX STEPS: None required. To enable later: 1) Verify balanced-JE proof on a Neon branch. 2) Get explicit Tier-1 owner sign-off. 3) Flip `LUMPER_LIFECYCLE_ENABLED=true`.
- GUARD: verify-lumper-flag-default-off.mjs — assert the strict `=== "true"` check remains (not loosened to truthy) so a refactor can't silently default-enable.

---

### 0251-gap3-vendor-invoice-linkage  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — `accounting.bills.vendor_id` is soft TEXT (`0090_p5_d2_bill_payment_balance.sql:32`). A real FK migration `202607220000_bills_mdata_vendor_fk.sql` adds `mdata_vendor_id uuid REFERENCES mdata.vendors(id)` but is listed HOLD-FOR-JORGE in `.held-migrations.json:242-244`, not run on prod. No service writes/reads `mdata_vendor_id` yet.
- ROOT CAUSE: Migration authored but held; even once run, no writer repoints bill creation onto the real FK — bills stay keyed on soft TEXT `vendor_id`.
- FILES: db/migrations/202607220000_bills_mdata_vendor_fk.sql; db/migrations/.held-migrations.json; apps/backend/src/accounting/bills.service.ts
- FIX STEPS: 1) Get Jorge's explicit OK to un-hold the migration. 2) Backfill script resolving existing `vendor_id` text to `mdata.vendors.id`. 3) Repoint bill-creation writers to dual-write `mdata_vendor_id`. 4) Follow-up migration to prefer the FK column once backfilled to 100%.
- GUARD: verify-bills-vendor-fk-populated.mjs — assert new bill rows created after cutover have non-null `mdata_vendor_id` when `vendor_id` text is set.

---

### 0251-gap8-accessorials-gl_VERIFY  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED — `deriveRevenueCode` (`apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts:22-37`) maps accessorial/tonu/tax/adjustment line types to `"accessorial"` revenue_code; `resolveInvoiceLineRevenueAccountId` calls `resolveAccountForCategory` (`apps/backend/src/accounting/expense-category-map/resolver.service.ts:29-53`) which does a real `SELECT account_id FROM accounting.expense_category_account_map` and returns a concrete account, throwing `ExpenseCategoryMapResolutionError` if no active mapping row exists.
- ROOT CAUSE: N/A — working as designed.
- FILES: apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts; apps/backend/src/accounting/expense-category-map/resolver.service.ts
- FIX STEPS: None required — verify live-prod (per §10b) that a mapping row exists for every `operating_company_id`, since a missing row throws rather than defaulting.
- GUARD: verify-revenue-code-map-coverage.mjs — for every active operating_company_id, assert an active mapping row exists for category_kind='revenue', code='accessorial' (and other derived codes).

---

### 0280-05-factoring-balance-invoice-linkage  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED — `apps/frontend/src/pages/home/OwnerHome.tsx:372-373,395` renders a real Factoring Balance tile linking to `/factoring`, showing `{fb.invoices_factored} invoices factored` sourced from a real query; backend field confirmed at `apps/backend/src/home/home-widgets.routes.ts:44` (`invoices_factored: result.invoice_count`).
- ROOT CAUSE: N/A — tile and link wired end-to-end to a real field and route.
- FILES: apps/frontend/src/pages/home/OwnerHome.tsx; apps/backend/src/home/home-widgets.routes.ts
- FIX STEPS: None required.
- GUARD: verify-ownerhome-tile-links.mjs — static check that every KPI tile's `to=` prop resolves to a registered route.

---

### 0280-42-wo-to-expense-flow  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED — `apps/backend/src/accounting/maintenance-posting/poster.service.ts:35,190` has a real `work_order_id` field and memo `Auto-created from work order ${wo.display_id}`, used across the posting queries (lines 132,151,187,210,232); test coverage exists in `__tests__/poster-work-order-to-bill.test.ts`.
- ROOT CAUSE: N/A — real, wired posting logic with FK and audit memo.
- FILES: apps/backend/src/accounting/maintenance-posting/poster.service.ts
- FIX STEPS: None required.
- GUARD: (existing test suite) — optional verify-wo-posting-memo-format.mjs to lock the memo string format.

---

### 0285-acct-gap2-no-auto-invoice-send  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — `grep "sendInvoice|invoiceEmail|emailInvoice|send-invoice"` across apps/backend/src returns 0 hits for any invoice-send trigger; no cron/event auto-emails an invoice. Duplicate of `biz-flow-6-no-automatic-invoice-sending` (see below) — same underlying gap, different id.
- ROOT CAUSE: Invoice delivery is fully manual today; no auto-send-on-create or scheduled digest exists.
- FILES: apps/backend/src/accounting/invoices.service.ts; apps/backend/src/accounting/invoices.routes.ts (manual `/send` endpoint already exists, at line 601 — reuse it)
- FIX STEPS: 1) Design doc first (customer-facing money document — needs Jorge sign-off on trigger: on-create vs on-status-change vs digest). 2) In the invoice-creation path, call the existing manual `/send` logic (reuse `enqueueEmail`, don't duplicate). 3) Gate behind a per-customer/company preference, not hardcoded always-on. 4) Add a feature flag default OFF. 5) Add an audit_events row per send.
- GUARD: verify-invoice-auto-send-wiring.mjs — if a future `INVOICE_AUTO_SEND_ENABLED` flag is true, assert the creation path calls the send helper.

---

### 0441-mod10-cashflow-accounting-routes-dead  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED (finding's premise was false — neither route is dead) — both `apps/backend/src/cash-flow/cash-flow.routes.ts` (`registerCashFlowRoutes`, index.ts:1036) and `apps/backend/src/accounting/cash-flow.routes.ts` (`registerCashFlowModuleRoutes`, index.ts:1014) are registered AND actively consumed by distinct frontend callers: `cash-flow/*` by `apps/frontend/src/api/cashFlow.ts` (a daily-prediction/adjustment tool) vs `accounting/cash-flow` by `apps/frontend/src/api/reports.ts:467` `getCashFlowStatementReport` (a statement report). They are two different features that share a name, not a duplicate/dead route.
- ROOT CAUSE: N/A.
- FILES: apps/backend/src/cash-flow/cash-flow.routes.ts; apps/backend/src/accounting/cash-flow.routes.ts
- FIX STEPS: None required. Optional cosmetic-only: rename directories to disambiguate (`cash-flow-projection` vs `cash-flow-statement`).
- GUARD: verify-no-duplicate-route-paths.mjs — assert no two registered route strings collide (confirms these two don't).

---

### 0441-mod13-inventory-accounting-none_DESIGN  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — 0 hits for accounting/GL/journal/posting references in `apps/backend/src/maintenance/parts*.routes.ts` or `apps/frontend/src/pages/inventory/*`. Parts/inventory tracks physical stock and WO usage in `maintenance.*` only.
- ROOT CAUSE: Inventory module never posts a GL entry (no inventory-asset debit/COGS relief) — valuation is entirely outside the accounting subledger.
- FILES: apps/backend/src/maintenance/parts.routes.ts; parts-inventory.routes.ts; parts-invoice-links.routes.ts; apps/frontend/src/pages/inventory/*
- FIX STEPS: 1) Design doc first — confirm with Jorge whether this is an intentional DESIGN-hold (check docs/specs/qbo-parity/ for a marker) or genuinely in-scope now. 2) If in-scope: add `catalogs.accounts` inventory-asset + COGS mapping (gated migration). 3) New posting service mirroring `accounting/maintenance-posting/poster.service.ts`, triggered on parts consumption/receipt. 4) Flag default OFF.
- GUARD: verify-inventory-design-hold-documented.mjs — fail CI if inventory routes exist with zero accounting references AND no explicit DESIGN-hold doc entry exists.

---

### 0441-mod4-dispatch-settings-localstorage-only  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — `apps/frontend/src/pages/dispatch/DispatchSettingsPage.tsx:43,54` reads/writes `window.localStorage` for `default_sort`, `alert_yellow_minutes`, `alert_red_minutes`, `auto_routing_enabled`, `auto_routing_respect_hos`, `auto_routing_respect_equipment`. Only `defaultView` persists via the real `/api/v1/dispatch/preferences` API. The page's own footnote (lines 235-237) admits it.
- ROOT CAUSE: Backend dispatch-preferences table/route never got columns for sort/thresholds/auto-routing — only the default-view field was added.
- FILES: apps/frontend/src/pages/dispatch/DispatchSettingsPage.tsx; backend route implementing `/api/v1/dispatch/preferences`; new migration
- FIX STEPS: 1) Migration adding `default_sort text, alert_yellow_minutes int, alert_red_minutes int, auto_routing_enabled bool, auto_routing_respect_hos bool, auto_routing_respect_equipment bool` to the preferences table. 2) Extend `getDispatchPreferences`/`updateDispatchPreferences` to read/write these fields. 3) Swap `DispatchSettingsPage.tsx`'s local read/write calls to hit the API. 4) Remove the footnote. 5) One-time client migration pushing existing localStorage values to the API on first load post-cutover.
- GUARD: verify-dispatch-settings-no-localstorage.mjs — fail if the page still calls `window.localStorage.setItem` for any of the 6 non-view fields.

---

### 0441-mod7-bill-subnav-filters-not-creators_UI  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED — `BillsPage.tsx` has `data-testid="bills-create-cta"` wired to `setCreateOpen(true)`, rendering `CreateBillModal` fully.
- ROOT CAUSE: N/A.
- FILES: apps/frontend/src/pages/accounting/BillsPage.tsx
- FIX STEPS: None required.
- GUARD: generic verify-create-cta-wired.mjs pattern (every `data-testid="*-create-cta"` must have a matching modal bound to local state in the same file).

---

### 0441-mod7-myaccountant-flag-no-seed  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED — `db/migrations/202607590000_my_accountant_flag_seed.sql` inserts `MY_ACCOUNTANT_ENABLED` into `lib.feature_flags` with `default_enabled=false`; registered in `PER_ENTITY_ONLY_FLAG_KEYS` (`apps/backend/src/lib/feature-flags/service.ts:123,201`).
- ROOT CAUSE: N/A — migration + registration present, default OFF as required.
- FILES: db/migrations/202607590000_my_accountant_flag_seed.sql; apps/backend/src/lib/feature-flags/service.ts
- FIX STEPS: None in repo; confirm live-prod (§10b) that the migration actually ran (check migrations ledger / deep healthz).
- GUARD: verify-per-entity-flags-seeded.mjs — for every key in `PER_ENTITY_ONLY_FLAG_KEYS`, assert a corresponding INSERT exists in db/migrations/.

---

### 0441-mod8-tx-fields-captured-not-sent  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — `BankingTransactionsDesignView.tsx` captures `checkNo/classId/location/billable/tags` in draft state and UI inputs, but `postTransaction()` sends only category/GL/vendor/customer/item/driver/unit/trailer/load/memo to `categorizeBankTransaction`. Neither the client fn nor backend `categorizeBodySchema` (`apps/backend/src/banking/categorization.routes.ts:43-68`) accept these 5 fields. No migration ever added them to `banking.bank_transactions`.
- ROOT CAUSE: UI captures 5 QBO-parity fields with no DB columns or API contract to persist them — pure cosmetic capture.
- FILES: db/migrations/ (new); apps/backend/src/banking/categorization.routes.ts; apps/frontend/src/api/banking.ts; apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx
- FIX STEPS: 1) Migration: `ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS check_number text, class_id uuid REFERENCES catalogs.classes(id), location text, is_billable boolean, tags text`. 2) Extend `categorizeBodySchema` with the 5 optional fields. 3) Extend `categorizeBankTransaction()` body type. 4) Wire `postTransaction()` to send `draft.checkNo/classId/location/billable/tags`. 5) Persist in the route handler's UPDATE.
- GUARD: verify-bank-tx-captured-fields-persisted.mjs — diff the DraftState field list against the categorize schema keys; fail if a captured field has no matching schema key.

---

### 0473-1-1-default-revenue-account-unmapped-line  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED — finding's "no written sign-off exists" claim is stale/false. `posting-engine.service.ts:91-99,529` hard-fails (`INVOICE_LINE_REVENUE_UNRESOLVED`) with no default fallback. Written sign-off exists: `docs/specs/qbo-parity/CHAIN-06-INVOICE-AR-POSTING-DESIGN.md:72` cites "owner decision ACCOUNTING-1, 2026-06-30," echoed in `docs/trackers/CODER-FINAL-HANDOFF-2026-07-19.md:542`.
- ROOT CAUSE: N/A — decision made and implemented.
- FILES: apps/backend/src/accounting/posting-engine.service.ts
- FIX STEPS: None required.
- GUARD: existing `posting-engine.service.test.ts:276-304` already asserts the hard-fail — this IS the guard.

---

### 0473-1-6-wo-void-reversal-grain  [accounting]  GATED?(yes — policy sign-off only)
- STATE: ALREADY-FIXED (code) / policy sign-off outstanding as claimed — `void.service.ts`'s `postVoidReversal` (line 181) + `readOriginalGlPostings` (line 131) pull every GL line for the whole source document and reverse them into one journal entry — confirmed whole-document-grain, unit-tested. No dedicated static guard pins this grain choice — `scripts/verify-je-void-reverses-not-voids.mjs` guards a different function.
- ROOT CAUSE: Code-wise nothing missing; "guard-pinned" was overstated (it's test-pinned, not static-guard-pinned). CPA written confirmation of the grain choice is still outstanding (policy, not code).
- FILES: apps/backend/src/accounting/void.service.ts; scripts/verify-je-void-reverses-not-voids.mjs (existing, different scope)
- FIX STEPS: 1) (Optional hardening, non-financial) add `scripts/verify-void-reversal-whole-document-grain.mjs`. 2) Get the CPA sign-off on grain choice — paperwork, no code change proposed.
- GUARD: verify-void-reversal-whole-document-grain.mjs — static check that `postVoidReversal` inserts exactly one `journal_entries` row per call and reverses the full original-line set.

---

### 0473-1-8-tk-transp-lease-asc842  [accounting]  GATED?(yes)
- STATE: **OWNER-RESOLVED (flag half) 2026-07-20** — Jorge confirmed `LEASE_GL_POSTING_ENABLED` ON for **all companies** ("3-lease on yes" → **"yes leases on all companies"**). Doc drift closed in `docs/lockdown/00_LOCKED_DECISIONS.md` §9.9. Live Neon already has TRANSP + TRK + USMCA overrides `enabled=true` (bypass-verified) — **no further migration required to "turn on"**; do **not** flip any OFF. Residual (optional paperwork): CPA/counsel ASC 842 common-control / useful-life confirmation — not a reason to disable lease posting after this owner line.
- ROOT CAUSE (historical): §9.9 (2026-07-04) said lease OFF until CPA; go-live `202607052300` only seeded TRK ON; prod later had all three ON while docs lagged until owner re-confirmed 2026-07-20.
- FILES: docs/lockdown/00_LOCKED_DECISIONS.md (§9.9); db/migrations/202607052300_per_entity_posting_flag_golive.sql; apps/backend/src/accounting/lease-asc842/lease-posting.service.ts
- FIX STEPS: **None for the flag** (prod already matches owner intent). Optional: file CPA ASC 842 confirmation when counsel returns it. Never self-flip SETTLEMENT/FACTORING.
- GUARD: N/A for disable; if adding a guard, assert TRANSP/TRK/USMCA lease overrides remain enabled=true when present (do not invent a "must be OFF" check).

---

### 0519-at2-no-db-enforced-sod  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — `accounting.journal_entries` (`0092_p5_d4_manual_journal_entries.sql:5-20` + all later ALTERs checked) has no `approved_by`/`posted_by` column and no CHECK constraint enforcing approver≠creator.
- ROOT CAUSE: Segregation-of-duties for JE posting is enforced nowhere in the schema — one user can create and post the same JE.
- FILES: db/migrations/ (new); apps/backend/src/accounting/journal-entries.service.ts
- FIX STEPS: 1) Owner ruling needed first (Option A vs B per `docs/specs/db-integrity-hardening-0519.md`'s AT2 item — explicitly flagged as "needs owner ruling before any DDL"). 2) Migration adds `approved_by_user_id uuid REFERENCES identity.users(id)` + `CHECK (approved_by_user_id IS NULL OR approved_by_user_id <> created_by_user_id)`. 3) Update the posting path to populate/require it per the ruling.
- GUARD: verify-je-sod-enforced.mjs (post-ruling) — assert the CHECK constraint exists via information_schema.

---

### 0519-es1-58-unscoped-tables  [accounting]  GATED?(no — audit/classification pass; any resulting DDL is gated)
- STATE: STILL-OPEN — `docs/specs/db-integrity-hardening-0519.md:119-127` header literally reads "ES1 — 58 tables with no operating_company_id... (partial)"; body confirms the per-table enforced-parent-FK audit was never completed and overlaps the RI1(a) gap.
- ROOT CAUSE: The ES1 audit tranche is explicitly marked partial in its own spec.
- FILES: docs/specs/db-integrity-hardening-0519.md
- FIX STEPS: 1) Complete the classification pass per the doc's own "Approach" section — per table, classify global-catalog vs child-of-scoped-parent. 2) For each child, prove the parent FK is enforced (ties to RI1). 3) Escalate any table with neither an opco column nor an enforced parent FK to owner for a migration.
- GUARD: verify-es1-child-table-fk-enforced.mjs — for the 58 enumerated tables, assert each has an operating_company_id column or a provably-enforced FK to a scoped parent.

---

### 0519-ri1-689-orphan-fk-columns  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — `scripts/verify-orphan-fk-inventory.mjs` header confirms it's a ratchet-only guard (fails only on NEW orphan columns). Current baseline in `verify-orphan-fk-inventory.baseline.json` is 740 (up from 689 at finding time — count still accurate directionally as "not decreasing"). Adding real FK constraints is explicitly owner-gated.
- ROOT CAUSE: The guard prevents new regressions but never adds an actual FK to any of the 740 baselined columns.
- FILES: scripts/verify-orphan-fk-inventory.mjs; scripts/verify-orphan-fk-inventory.baseline.json; db/migrations/ (future FK-adding migrations)
- FIX STEPS: 1) Per the doc's rollout order (RI1(b) priority FKs: `bill_lines→bills`, `bills→vendor`, `bank_tx matched_*`), author a migration adding the real FK after an orphan pre-check. 2) Add a matching `verify-*-fk.mjs` per house pattern. 3) Shrink the baseline (`UPDATE_ORPHAN_FK_BASELINE=1`) once added.
- GUARD: existing verify-orphan-fk-inventory.mjs; optional companion asserting the baseline trends down over time.

---

### a-03-expenses-fullpage-form-not-list-drawer  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED — `ExpensesListPage.tsx:65,183-197` confirms `+ Create` opens `RecordExpenseModal` (a `ParityDrawer`), and the file's own comment states the list is the canonical creator hub; `/accounting/expenses/new` remains an additive alias (route still exists, not removed).
- ROOT CAUSE: N/A — matches the finding's description exactly.
- FILES: apps/frontend/src/pages/accounting/ExpensesListPage.tsx; apps/frontend/src/components/expenses/RecordExpenseModal.tsx
- FIX STEPS: None required. NOTE: see `expenses-list-routing-bug` below — a-03's fix only covers the subnav entry point, NOT the canonical `/accounting/expenses` route or Topbar/AccountingHub links, which are still broken. Track as one block, not separately.
- GUARD: N/A currently; could add verify-expenses-create-is-drawer-not-fullpage.mjs to lock against regression.

---

### a-05-bills-no-page-level-create-button  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED — `BillsPage.tsx:505-510` has `data-testid="bills-create-cta"` wired to `setCreateOpen(true)`, rendering `CreateBillModal` (lines 522-527) bound to state driven partly by `?create=1` query param.
- ROOT CAUSE: N/A.
- FILES: apps/frontend/src/pages/accounting/BillsPage.tsx
- FIX STEPS: None required.
- GUARD: N/A currently (existing data-testid test coverage sufficient); optional verify-bills-create-cta-present.mjs.

---

### audit19-ma-due-diligence-framework  [accounting]  GATED?(no — recommend NOT building)
- STATE: STILL-OPEN (no module exists) — but the original "hit" was a false positive: `legal-template-library.generated.ts` uses "acquisition" strictly for physical truck/asset purchase language (`LEASE_TO_OWN_CATEGORY = "asset_acquisition"`), zero actual M&A/due-diligence text. No M&A module exists anywhere.
- ROOT CAUSE: No M&A due-diligence module has ever been built or requested; not a real product gap for an operating carrier.
- FILES: none — nothing to fix
- FIX STEPS: Recommend closing as a non-issue/audit false-positive, not dispatching a build ticket. IH35 is an operating carrier, not a firm doing M&A; a due-diligence module is out of scope unless Jorge is preparing a specific sale/acquisition transaction (a legal/deal-specific engagement, not a TMS feature).
- GUARD: N/A — no feature to guard.

---

### audit2-internal-controls-approval-workflow  [accounting]  GATED?(yes)
- STATE: STILL-OPEN (general engine) — narrow flows confirmed real and substantial: `apps/backend/src/settlements/approval.service.ts` (18.8KB) and `apps/backend/src/accounting/role-home/pending-approvals-gl.service.ts` (27.7KB). No third, generalized configurable approval-workflow/internal-controls engine exists.
- ROOT CAUSE: Two purpose-built approval flows exist; no rules-driven engine (amount-threshold routing, multi-tier sign-off) spans modules.
- FILES: new apps/backend/src/internal-controls/ (routes.ts, approval-rules.service.ts, types.ts) — pattern-copy apps/backend/src/safety/anomaly/ (closest existing configurable-rule-engine shape)
- FIX STEPS: 1) Migration for `accounting.approval_rules` (rule_slug, threshold_cents, entity_scope, required_role, is_active). 2) `approval-rules.service.ts` evaluating rules against a submitted action. 3) Wire into existing touch-points as a shared check, not a replacement. 4) Seed default rules per entity.
- GUARD: verify-approval-rules-enforced.mjs — assert money-moving mutations above threshold call the shared approval-rules check before commit.
- NOTE (relevance): Low priority for a single-owner private carrier — segregation-of-duties matters most with multiple non-owner approvers; today's two narrow flows likely cover real risk adequately.

---

### audit20-dividend-tracking-system  [accounting]  GATED?(no — do not build)
- STATE: STILL-OPEN (confirmed absent) — `grep -rni "dividend"` = 2 hits, both static CoA account-type label strings in `NewAccountDrawerForm.tsx` (no service/table/route).
- ROOT CAUSE: No dividend-tracking module; only artifact is an unused CoA label option.
- FILES: N/A
- FIX STEPS: N/A. Not a legitimate gap — IH35 is a private Ch.11 operating carrier with no outside shareholders taking dividends. Over-broad audit boilerplate; do not build.
- GUARD: N/A

---

### audit23-royalty-tracking-system  [accounting]  GATED?(no — do not build)
- STATE: STILL-OPEN (confirmed absent, trivially) — 0 hits for "royalty" anywhere in either app.
- ROOT CAUSE: No royalty concept in the domain model; trucking carrier has no licensing/IP royalty streams.
- FILES: N/A
- FIX STEPS: N/A. Not applicable to this business — irrelevant audit finding. Do not build.
- GUARD: N/A

---

### audit24-franchise-tracking-system  [accounting]  GATED?(no — do not build)
- STATE: STILL-OPEN (confirmed absent, trivially) — 0 hits for "franchise" anywhere in either app.
- ROOT CAUSE: No franchise concept; single owner-operated carrier, not a franchisor/franchisee.
- FILES: N/A
- FIX STEPS: N/A. Not applicable — do not build.
- GUARD: N/A

---

### audit25-fx-rate-hedging-translation  [accounting]  GATED?(yes — pending a data check)
- STATE: STILL-OPEN (module absent) — only `mx-tolls.routes.ts`'s `exchange_rate_used` (a point MXN→USD conversion at toll entry, not a rate table/hedge) touches FX at all. Zero hits for fx_gain/fx_loss/remeasurement/translation logic anywhere. `currency_code` (USD/MXN) IS a live column on `mdata.loads`, `accounting.invoices`, `catalogs.accounts` — schema supports MXN transactions, nothing downstream revalues them.
- ROOT CAUSE: `currency_code` exists as a tag but nothing consumes it for period-end revaluation — no rate source, no realized/unrealized FX gain-loss GL entries.
- FILES: new apps/backend/src/accounting/fx/ (fx-rates.routes.ts, revaluation.service.ts) — pattern-copy mx-tolls.routes.ts for rate-capture shape
- FIX STEPS: 1) BEFORE building anything: query how many real invoices/bills actually have `currency_code <> 'USD'` — if all real transactions are USD (common carrier practice even on Mexico-leg freight), this is dead schema and should NOT be built. 2) If real exposure exists: migration for `accounting.fx_rates` (gated). 3) Period-end revaluation job posting to existing GL functions (no new GL math). 4) Surface FX exposure on balance-sheet/AR-AP aging.
- GUARD: verify-fx-exposure-has-revaluation.mjs (N/A until step 1 confirms real exposure).
- NOTE (relevance): Do the data check first — this may be over-scoped "hedging" language from a multinational audit template that doesn't fit a Laredo drayage/OTR carrier settling in USD.

---

### audit4-tax-return-automation  [accounting]  GATED?(no — corporate-return piece should not be built)
- STATE: ALREADY-FIXED (partial scope, exactly as claimed) — `accounting/sales-tax/routes.ts` has real prepare/file endpoints; `tax-documents/` has real 1099-NEC/1042-S box-1 aggregation + PDF rendering. Zero hits for corporate/income-tax-return (Form 1120) automation.
- ROOT CAUSE: Sales-tax and 1099/1042-S automation are built; corporate income-tax-return prep genuinely doesn't exist.
- FILES: N/A for corporate returns
- FIX STEPS: N/A — every private company this size uses an outside CPA/tax preparer for entity returns, especially mid-Ch.11. In-house 1120 automation would be over-engineering with real IRS-liability risk. No action needed.
- GUARD: N/A

---

### audit5-fraud-anomaly-detection  [accounting]  GATED?(yes)
- STATE: STILL-OPEN (GL-wide) — `apps/backend/src/integrations/fuel/fraud-detector/routes.ts` (real, fuel-specific, severity/resolved_at confirmed). `integrity/anomaly-detector.service.ts` only runs `detectOrphanedBills`/`detectDriversWithoutMedCard`/`detectUnitsOverduePm` (data-integrity, not dollar-pattern fraud). `safety/anomaly/` is scoped to safety telemetry, not ledger fraud.
- ROOT CAUSE: Fuel-fraud detection is real and fuel-specific; no general ledger-wide fraud/anomaly detector (duplicate vendor payments, round-dollar clustering, off-hours postings) exists.
- FILES: new apps/backend/src/accounting/fraud-detection/ (routes.ts, ledger-anomaly-detector.service.ts, rules.service.ts) — pattern-copy apps/backend/src/integrations/fuel/fraud-detector/ directly
- FIX STEPS: 1) Design doc first — define GL/AP anomaly heuristics (duplicate vendor+amount+date clusters, round-number bias, off-hours postings, vendor-spend spikes). 2) Migration for `accounting.ledger_fraud_alerts` (mirror fuel fraud_alerts shape). 3) Detector cron job (mirror fuel-fraud-detector-worker). 4) Alert routes + severity/resolved_at UI.
- GUARD: verify-ledger-fraud-detector-wired.mjs — assert the detector worker is registered in index.ts and its alerts have an owner-facing surface.
- NOTE (relevance): Legitimate and worth prioritizing — a carrier mid-Ch.11 with factoring/driver settlements has real duplicate-payment/vendor-fraud exposure (ties to the existing "embezzlement reclass" / factoring-balance-in-flux memory items).

---

### audit7-cost-center-tracking  [accounting]  GATED?(yes — low priority)
- STATE: STILL-OPEN — 0 hits for a dedicated cost-center module. `operating_company_id` (1,489 files) is the only cost-segmentation axis in the schema, used for the TRANSP/TRK/USMCA multi-entity split.
- ROOT CAUSE: No sub-entity dimension (by lane/terminal/driver-group) exists for finer cost rollups; `operating_company_id` already serves as the de facto cost center at the entity level.
- FILES: if built: new apps/backend/src/catalogs/cost-centers/ — pattern-copy apps/backend/src/catalogs/accounts.routes.ts
- FIX STEPS: 1) Confirm with Jorge whether entity-level segmentation is sufficient or sub-entity rollups are wanted. 2) If yes: migration for `catalogs.cost_centers` + nullable FK on expense/bill tables (gated). 3) Reporting view joining expenses by cost center.
- GUARD: N/A until scope confirmed.
- NOTE (relevance): Marginal for a 3-entity carrier this size; recommend low-priority/skip unless Jorge specifically wants sub-entity P&L splits.

---

### audit8-revenue-leakage-detection  [accounting]  GATED?(no — pure read-only report)
- STATE: STILL-OPEN — `load-profitability.service.ts` and `dispatch-margin.routes.ts` confirmed real (net_profit_cents/margin_pct math, with a real prior bug-fix comment about a silently-failing insurance-allocation query). Zero hits for actual leakage-detection logic (unbilled accessorials, missed detention).
- ROOT CAUSE: Margin computation exists; nothing flags likely-missed billable events (e.g. a load with detention-eligible dwell but no detention invoice line).
- FILES: new apps/backend/src/accounting/revenue-leakage/ — pattern-copy load-profitability.service.ts's read-only-computation shape, joining `mdata.load_stops` dwell data against `accounting.invoices` line items
- FIX STEPS: 1) Define leakage rules (e.g. `dwell_time > free_time_hours AND no detention line exists`) using `master-data/customers/free-time-detention.routes.ts` as the threshold source. 2) Build detector, read-only over existing tables (no new GL math). 3) Surface flagged loads on a report/dashboard tile. 4) No migration needed if purely computed (becomes GATED only if persisting alert rows to a new accounting.* table).
- GUARD: verify-revenue-leakage-detector-uses-real-thresholds.mjs — assert the detector reads free-time-detention config rather than a hardcoded threshold.
- NOTE (relevance): High-value and legitimate — missed detention/accessorial billing is a common real-money leak for Laredo cross-border freight with variable border-wait dwell.

---

### audit9-expense-validation-duplicate-detection  [accounting]  GATED?(yes — if persisting flags)
- STATE: STILL-OPEN (general module) — `fuel-transaction-import.ts`'s `ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING` (idempotency, not fraud dup-detection) and `ap/payment-application.routes.ts`'s `duplicate_bill_in_applications` check confirmed real. No general fuzzy-match duplicate-bill detector exists.
- ROOT CAUSE: The two existing checks only catch duplicates within their own narrow insertion paths; they don't catch a vendor bill keyed twice by different staff on different days.
- FILES: new apps/backend/src/accounting/duplicate-detection/ — pattern-copy apps/backend/src/integrations/fuel/fraud-detector/ (rule → alert → severity → resolved_at shape)
- FIX STEPS: 1) Define a fuzzy-match rule (vendor_id + amount within tolerance + bill_date within N days) across `accounting.bills`. 2) Build detector (batch job or on-create check) flagging candidates for human review only (never auto-voids). 3) Add resolved_at/dismissed workflow mirroring fuel-fraud-detector. 4) Migration only needed if persisting a `duplicate_bill_flags` table.
- GUARD: verify-duplicate-bill-detector-covers-manual-entry.mjs — assert the general detector also covers manually-keyed bills, not just the two already-guarded import/application paths.
- NOTE (relevance): Legitimate, reasonably scoped real AP-fraud/error vector.

---

### banking-b4-driver-vendor-account-mapping  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED — `index.ts:36-37,677,1275` confirms `registerDriverVendorMappingIntegrityRoutes` and `initializeDriverVendorMappingWorker` are both imported AND called. The worker runs `checkAllMappings`/`persistFindings` on a 24h loop, notifying Owner/Accounting on critical drift.
- ROOT CAUSE: N/A — finding's premise (built-but-never-registered) does not hold for this worker.
- FILES: none required
- FIX STEPS: None required.
- GUARD: verify-driver-vendor-mapping-worker-registered.mjs — grep index.ts for both the import and the call site; fail if either import exists without a call.

---

### banking-grid-sort-resize-rows-per-page  [accounting]  GATED?(no)
- STATE: ALREADY-FIXED — `BankingTransactionsDesignView.tsx:462,469,1294-1299` confirms real sortBy state, `useTablePref` column-width resize, and `[50,75,100,200,300]` pageSize buttons; all 18 `TableHeaderCell` instances default to `sortable=true` (no override found). A prior stale audit note claiming `sortable={false}` everywhere is incorrect against current code.
- ROOT CAUSE: N/A — a stale audit-note claim, not a current defect.
- FILES: none required
- FIX STEPS: None required. If the stale claim is still circulating in `docs/trackers/backlog-verify/accounting.md:49`, correct it there.
- GUARD: verify-banking-grid-sort-wired.mjs — assert no `sortable={false}` literal exists and every `TableHeaderCell` includes `onToggleSort=`.

---

### biz-flow-6-no-automatic-invoice-sending  [accounting]  GATED?(no)
- STATE: STILL-OPEN — DUPLICATE of `0285-acct-gap2-no-auto-invoice-send` (same underlying gap). `apps/backend/src/accounting/invoices.routes.ts:601` has a manual `POST /:id/send` (calls `enqueueEmail` at line 698); nothing in the invoice-creation path calls it automatically. Zero hits for send_invoice/autoSend/sendOnCreate.
- ROOT CAUSE: Invoice creation never triggers the existing manual send/email path.
- FILES: apps/backend/src/accounting/invoices.service.ts; apps/backend/src/accounting/invoices.routes.ts
- FIX STEPS: (Same as 0285 above — track as ONE ticket, not two.) 1) In the invoice-creation flow, add a call to the existing send logic used by `POST /:id/send` (reuse). 2) Gate behind a company/customer preference. 3) Add CI guard once wired.
- GUARD: verify-invoice-auto-send-wiring.mjs — if `INVOICE_AUTO_SEND_ENABLED` is true, assert the creation path calls the send helper.

---

### db249-finance-schema-naming-drift  [accounting]  GATED?(yes)
- STATE: STILL-OPEN (scope claim confirmed accurate: 2 tables, not 10) — `202606160100_fh3_amortization_data_model.sql:11,14,37` creates a standalone `finance` schema with `finance.loans`/`finance.loan_amortization_rows`. Every other apparent `finance.*` hit in a naive grep is actually `driver_finance.*` (a substring false-positive) — the canonical settlement schema, unaffected.
- ROOT CAUSE: The FH-3 amortization engine was built under a new ad-hoc `finance` schema instead of `accounting.*` or the existing `driver_finance` schema, creating a third finance-adjacent schema name.
- FILES: db/migrations/202606160100_fh3_amortization_data_model.sql; new rename migration; all backend refs to `finance.loans`/`finance.loan_amortization_rows`
- FIX STEPS: 1) Author a migration creating `accounting.loans`/`accounting.loan_amortization_rows` (or `ALTER TABLE ... SET SCHEMA accounting`), preserving FKs/RLS/grants. 2) Update all backend references. 3) Re-run FORCE RLS + grants (0065 pattern) under the new schema. 4) Verify the `FINANCE_HUB_AMORTIZATION_ENABLED` flag path still resolves post-rename.
- GUARD: verify-no-finance-schema-tables.mjs — fail CI if any CREATE TABLE targets a bare `finance.*` schema (only `accounting.*`/`driver_finance.*` allowed for money tables).

---

### db249-index-optimization-3  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — none of the 3 specified composite indexes exist. `safety.safety_events` has company/kpi/subject indexes but no `(operating_company_id, subject_driver_id, occurred_at)` combo; `accounting.invoices` has customer/company-date indexes but no `(customer_id, status, issue_date)`; `maintenance.work_orders` has unit/driver/status indexes but no `(unit_id, status, opened_at)`.
- ROOT CAUSE: The 3 specified composite indexes were never authored; existing indexes cover adjacent but different column combinations, so filtered list queries under RLS may do broader scans.
- FILES: db/migrations/ (new)
- FIX STEPS: 1) Confirm the actual hot-path WHERE clauses in the relevant list/filter services before finalizing column order. 2) Author one idempotent migration adding the 3 `CREATE INDEX IF NOT EXISTS` statements. 3) Run EXPLAIN before/after to confirm plan improvement (advisory). 4) Ship as a pure perf migration, no data/schema-shape change.
- GUARD: verify-composite-index-presence.mjs — grep migrations for the 3 named composite indexes by exact column tuple.

---

### dip-mor-pre-post-petition-ap-split  [accounting]  GATED?(yes)
- STATE: UNVERIFIABLE (code confirmed absent; the real question needs CPA + bankruptcy counsel, not a code check) — zero hits for pre_petition/post_petition/petition_status in any `.ts`/`.sql` source or migration (only doc/tracker restatements of this same finding).
- ROOT CAUSE: No pre-petition/post-petition AP classification field exists anywhere; the Ch.11 DIP/MOR split has never been modeled.
- FILES: none to touch yet — design/decision doc first
- FIX STEPS: 1) STOP — get a CPA + bankruptcy-counsel ruling on classification basis (ASC 852 liabilities-subject-to-compromise vs post-petition) before any schema work. 2) Once ruled, draft (not merge) a migration adding e.g. `accounting.bills.petition_status`. 3) Never self-merge — financial cluster + legal sign-off per §1.3/§1.4.
- GUARD: N/A until a ruling exists.

---

### dispatch-sweep-gap-21  [accounting]  GATED?(yes)
- STATE: STILL-OPEN — no `BillOcrPanel`, `ocr-extractor.service.ts`, or `category-classifier.service.ts` exist anywhere on main. Scoped spec found at `docs/dispatch/batches/GAP-21-BILL-OCR-SPLIT-CATEGORY-GO.md`, listing exact target files, none of which exist on disk.
- ROOT CAUSE: GAP-21 was scoped/dispatched but never built — the whole feature is unbuilt.
- FILES: apps/backend/src/accounting/bills/ocr/ocr-extractor.service.ts (new); .../category-classifier.service.ts (new); .../ocr.routes.ts (new); apps/frontend/src/components/bills/BillOcrPanel.tsx (new); OcrLineItemEditor.tsx (new); apps/frontend/src/pages/accounting/bills/BillCreate.tsx (edit)
- FIX STEPS: 1) Build `ocr-extractor.service.ts` reusing the existing rate-con OCR module (Tesseract/Textract) per the spec. 2) Build `category-classifier.service.ts` using vendor historical category distribution. 3) Wire `POST /api/accounting/bills/ocr/extract` and `/classify-lines`. 4) Build `BillOcrPanel.tsx`/`OcrLineItemEditor.tsx`, embed in `BillCreate.tsx`. 5) Add `scripts/verify-bill-ocr-flow.mjs` per the spec.
- GUARD: verify-bill-ocr-flow.mjs (already specified in the GAP-21 doc) — once built, assert the files exist and routes are registered.

---

### dispatch-sweep-gap-25  [accounting]  GATED?(no)
- STATE: STILL-OPEN — service files exist (`integrations/samsara/active-driver-set/{recompute,query}.service.ts`, `routes.ts`) and `jobs/active-driver-set-recompute.ts:70` exports `initializeActiveDriverSetRecomputeWorker`. `grep "active-driver-set" apps/backend/src/index.ts` = 0 hits — neither the worker nor the route registrar is called anywhere.
- ROOT CAUSE: The active-driver-set cache/recompute feature was fully built but never bootstrapped — same "built but never registered" pattern seen elsewhere.
- FILES: apps/backend/src/index.ts (add import + call); apps/backend/src/jobs/active-driver-set-recompute.ts; apps/backend/src/integrations/samsara/active-driver-set/routes.ts
- FIX STEPS: 1) In index.ts, add `import { registerActiveDriverSetRoutes } from "./integrations/samsara/active-driver-set/routes.js"` + `await registerActiveDriverSetRoutes(app)` alongside other route registrations. 2) Add `import { initializeActiveDriverSetRecomputeWorker } from "./jobs/active-driver-set-recompute.js"` + call it alongside other worker inits. 3) Confirm `recomputeActiveDriverSet` reads `mdata.drivers`/telematics tables correctly under `operating_company_id` scoping before enabling. 4) Add a CI guard.
- GUARD: verify-active-driver-set-worker-registered.mjs — grep index.ts for both call sites; fail if the source files exist but neither call exists.

---

### expenses-list-routing-bug  [accounting]  GATED?(no)
- STATE: STILL-OPEN — DIRECTLY CONTRADICTS/complements `a-03` above. `apps/frontend/src/routes/manifest.tsx:3765-3768`: the canonical no-suffix path `/accounting/expenses` still renders `<ExpenseCreatePage />` (the wizard), not the list. The list only lives at the explicit `/accounting/expenses/list` suffix (:3757-3760).
- ROOT CAUSE: The canonical `/accounting/expenses` route was never swapped to render `ExpensesListPage`; a-03's fix only covered the subnav entry point, not this route or Topbar/AccountingHub/QboStyleHome links (per `docs/trackers/backlog-verify/accounting.md:58`, those still point at the wizard too).
- FILES: apps/frontend/src/routes/manifest.tsx (line ~3765-3768); apps/frontend/src/components/Topbar.tsx:241; AccountingHubPage tab; QboStyleHomePage (x2 links)
- FIX STEPS: 1) At manifest.tsx:3765-3768, change the element for path `/accounting/expenses` from `<ExpenseCreatePage />` to `<ExpensesListPage />`. 2) Keep `/accounting/expenses/new` and `/accounting/expenses/list` as additive aliases (§7 additive-only rule — don't delete either). 3) Fix the other entry points (Topbar, AccountingHub, QboStyleHome) that still link to the wizard.
- GUARD: verify-expenses-canonical-route-is-list.mjs — parse manifest.tsx for the exact-path `/accounting/expenses` route and assert its element is `ExpensesListPage`, not `ExpenseCreatePage`.
- NOTE: Track this + `a-03-expenses-fullpage-form-not-list-drawer` + duplicate `expenses-list-route-still-shows-create-wizard` as ONE block — they describe facets of the same underlying bug.

# Build Tickets — bb_2 (re-verified vs current `main` @ 52bae3a19)

Counts: **STILL-OPEN 36 / ALREADY-FIXED 11 / UNVERIFIABLE 2** (total 49). **GATED 31 / non-GATED 18.**

---

### fact-par-1-submission-workflow  [accounting]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `submission-queue.routes.ts:103` hardcodes `channel: "manual_download"` on every batch submit; the owner decision (email vs portal/FTP channel, `docs/trackers/2026-07-02-module-sweep-17-28/parity/FACTORING-PARITY-FINDINGS.txt:25`) is still open and no adapter exists for either.
- FILES: `apps/backend/src/factoring/submission-queue.routes.ts`, `apps/backend/src/factoring/batch.service.ts`
- FIX STEPS:
  1. Get owner decision on FARO channel (email-with-attachments vs portal/FTP) — STOP, this is the blocking decision noted in the parity doc.
  2. Add a `factoring.submission_channel_config` (or similar) row keyed by `factor_id`, channel type, config (migration — GATED).
  3. Implement one adapter (`sendViaEmail` or `sendViaFileDrop`) behind the config, called from `submit-batch` instead of the literal string.
  4. Write the resolved channel (not a hardcoded literal) into the `appendCrudAudit` `channel` field.
- GUARD: `verify-factoring-submission-channel-configured.mjs` — fails if `channel: "manual_download"` is a literal (not a variable) in `submission-queue.routes.ts`.

### factoring-asc860-cpa-control-test-open  [accounting]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `docs/accounting/FACTORING-POSTER-DESIGN.md:12` locks the ASC 860 secured-borrowing conclusion and a static guard enforces the poster stays secured-borrowing, but no signed CPA control-test document mapping the poster's actual behavior against ASC 860-10-40-5(a-c) criteria exists anywhere in the repo.
- FILES: `docs/accounting/FACTORING-POSTER-DESIGN.md`
- FIX STEPS:
  1. Draft a control-test section in the design doc: for each of ASC 860-10-40-5(a), (b), (c), cite the specific poster behavior/table that satisfies it.
  2. Get CPA sign-off (name + date) appended to the doc.
  3. No code change — this is a documentation/audit deliverable, not a build ticket.
- GUARD: `verify-factoring-asc860-control-test-documented.mjs` — fails if the doc lacks a `## ASC 860 Control Test` section with a sign-off date field.

### fh-unit-allocation-ui-view-missing  [accounting]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `accounting.bill_unit_allocation` is fully wired on the backend (`apps/backend/src/accounting/bills.routes.ts:453-518` inserts/reads it) but zero frontend files match `*unit-alloc*`/`*UnitAlloc*` — no page/route/api-client consumes it.
- FILES: `apps/frontend/src/pages/accounting/` (new page), `apps/frontend/src/routes/manifest.tsx`, `apps/frontend/src/api/accounting.ts`
- FIX STEPS:
  1. Confirm `bills.routes.ts` GET endpoint already returns the allocation rows (it does, line 518) — add an API client function in `api/accounting.ts` if missing.
  2. Build `UnitAllocationView.tsx` (FH-7) showing per-unit allocated amounts for a bill.
  3. Add a Route in `manifest.tsx` and a link from the Bill Detail page.
- GUARD: `verify-fh7-unit-allocation-view-mounted.mjs` — fails if no route imports a component consuming `bill_unit_allocation`.

### flow2-customer-chargeback-driver-expense  [accounting]  GATED-yes
- STATE: ALREADY-FIXED — evidence is stale. `settlement-contract-terms.service.ts:403-421` (`computeLateDeliveryPassthrough`) creates a canonical `late_delivery_passthrough` deduction on the driver's settlement whenever `mdata.loads.customer_chargeback_requested = true AND customer_chargeback_driver_fault = true AND customer_chargeback_amount_cents > 0`; wired into the settlement build at line 754.
- ROOT CAUSE: n/a (fixed).
- FILES: `apps/backend/src/driver-finance/settlement-contract-terms.service.ts`
- FIX STEPS: none.
- GUARD: none needed (already covered by `settlement-contract-terms.service.test.ts`).

### flow3-cancellation-auto-customer-charge  [accounting]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `cancellation.service.ts` (`cancelLoad`) writes `billable_to_customer`/`cancellation_charge_cents` to `dispatch.load_cancellations` but never calls an invoice/charge creator — confirmed zero `createInvoice`/`createCharge` calls anywhere in the file.
- FILES: `apps/backend/src/dispatch/cancellation.service.ts`, `apps/backend/src/accounting/invoices.service.ts`
- FIX STEPS:
  1. In `approveCancellation` (line 179), when `billable_to_customer = true` and `cancellation_charge_cents > 0`, call the existing invoice-creation service to raise a cancellation-fee invoice line.
  2. Link the new invoice back to the cancellation row (see next ticket for the FK).
  3. Emit an `appendCrudAudit` entry for the auto-charge.
- GUARD: `verify-cancellation-billable-charge-creates-invoice.mjs` — asserts `approveCancellation`/`cancelLoad` calls an invoice-creation function when `billable_to_customer` is true.

### flow3-cancellation-billing-deduction-linkage  [accounting]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `grep -rn "cancellation_id" db/migrations/*.sql` returns 0 hits — no FK column exists on `accounting.invoices` or `driver_finance.driver_settlement_deductions` to trace back to `dispatch.load_cancellations`.
- FILES: new migration under `db/migrations/`
- FIX STEPS:
  1. Add nullable `cancellation_id uuid REFERENCES dispatch.load_cancellations(id)` to `accounting.invoices` (and/or a settlement-deduction line table) — idempotent `ADD COLUMN IF NOT EXISTS`.
  2. Populate it from the flow3-cancellation-auto-customer-charge fix above.
  3. Add an index on the new column.
- GUARD: `verify-sql-column-existence.mjs` — add `accounting.invoices.cancellation_id` (and the deduction table) to `TARGET_TABLES`/schema baseline once shipped.

### flow6-auto-invoice-sending  [accounting]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `invoices.routes.ts:646` (`POST /api/v1/accounting/invoices/:id/send`) is the only status-transition path off `draft`; there is no cron/trigger that auto-fires on leaving draft and no reminder cadence for unpaid invoices anywhere in the file.
- FILES: `apps/backend/src/accounting/invoices.routes.ts`, new cron under `apps/backend/src/cron/` (or wherever recon/audit crons live per `render-crons-never-provisioned-no-blueprint` memory — verify the cron actually runs in-process before relying on it)
- FIX STEPS:
  1. Owner decision: define the auto-send trigger condition (e.g., on delivery-confirmed) and the reminder cadence (e.g., 7/14/30 days past due).
  2. Add a scheduled job that queries `accounting.invoices WHERE status = 'sent' AND due_date < now()` and sends reminders via the existing send/email infra.
  3. Add an explicit trigger call to the `/send` logic from the load-delivery completion path, gated by a feature flag (default OFF).
- GUARD: `verify-invoice-reminder-cron-registered.mjs` — fails if no cron/job file references the reminder query.

### flow6-auto-payment-application  [accounting]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `apply.service.ts` `normalizeApplications()` (line 69) throws `no_applications` when the caller-supplied `applications` array is empty — confirmed no FIFO/oldest-invoice-first auto-allocation logic exists in `apps/backend/src/accounting/payments/*.ts`.
- FILES: `apps/backend/src/accounting/payments/apply.service.ts`
- FIX STEPS:
  1. Owner/CPA decision: confirm FIFO-oldest-invoice-first is the desired default allocation policy.
  2. Add an `autoAllocatePayment(client, {customerId, amountCents})` helper that queries open `accounting.invoices` ordered by `due_date ASC` and builds the `applications` array.
  3. Call it from `applyPayment` only when the caller omits `applications` (explicit opt-in, don't silently override manual allocation).
- GUARD: `verify-payment-auto-allocation-fifo.mjs` — a DB test asserting oldest invoice is applied first when auto-allocation is invoked.

### global-column-resize-sort-parity-table-phase-a  [accounting]  GATED-no
- STATE: ALREADY-FIXED — Phase A is shipped: `ParityTable.tsx` implements drag-to-resize + sort with `storageKey` persistence, used across 153 call sites, and CI-enforced by `verify-parity-table-resize-sort-contract.mjs` (wired at `.github/workflows/ci.yml:896-897`). The remaining "everywhere" gap (raw `<table>` surfaces) is tracked separately as `qbo-parity-resizable-columns-everywhere`.
- ROOT CAUSE: n/a.
- FILES: n/a.
- FIX STEPS: none — see `qbo-parity-resizable-columns-everywhere` for Phase B.
- GUARD: already wired (`verify:parity-table-resize-sort-contract` in `ci.yml`).

### h-05-home-kpi-no-date-range-toggle  [accounting]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `OwnerHome.tsx:195` and `DefaultHome.tsx:182` both hardcode the subtitle string `"Workspace snapshot for the last three days"` — no date-range control exists; KPI queries (`kpiSummaryQuery`, `todayRevenueQuery`, `factoringBalanceQuery`, etc.) take no date param.
- FILES: `apps/frontend/src/pages/home/OwnerHome.tsx`, `apps/frontend/src/pages/home/roles/DefaultHome.tsx`, `apps/backend/src/reports/*.ts` (KPI summary endpoints)
- FIX STEPS:
  1. Add a `DateRangePicker` (reuse existing component) to both Home pages, default to "last 3 days" to preserve current behavior.
  2. Thread the selected range into `getKpiSummary` and the other `useQuery` calls as query params.
  3. Update backend KPI routes to accept `from`/`to` and filter `mdata.loads`/`accounting.*` queries accordingly.
- GUARD: `verify-home-kpi-date-range-control.mjs` — fails if the subtitle string is a literal and no `DateRangePicker` import exists in either file.

### ifta-sales-tax-booking-location-confirm  [accounting]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/202607011000_transp_coa_role_map_seed.sql:69` comment is unchanged: `sales_tax_payable: intentionally NOT seeded (freight not sales-taxed — confirm N/A)` — the owner confirmation was never closed out.
- FILES: `db/migrations/202607011000_transp_coa_role_map_seed.sql` (or a follow-up migration)
- FIX STEPS:
  1. STOP — get Jorge's explicit confirmation: is TRANSP freight revenue subject to sales tax in any jurisdiction it operates (accessorials, storage, etc.)?
  2. If N/A confirmed: replace the comment with a dated confirmation note (no functional change).
  3. If tax applies to some line items: seed the `sales_tax_payable` role via a new idempotent migration.
- GUARD: n/a (documentation/decision closure, not a regression-prone code path).

### ledger-write-proof-operational-not-found  [accounting]  GATED-yes
- STATE: UNVERIFIABLE — needs owner/spec clarification, not a live DB check.
- ROOT CAUSE: `.block-ready/ledger-write-proof-operational-not-found.json` is a generic MASTER-6 dispatch template with no concrete table/column/route named — there is nothing specific to grep for or verify against code. A near-duplicate `.block-ready/core-ledger-write-proof-trucking-evidence.json` has the identical generic template.
- FILES: `.block-ready/ledger-write-proof-operational-not-found.json`, `.block-ready/core-ledger-write-proof-trucking-evidence.json`
- FIX STEPS:
  1. Do not build against this block as-is — it names no concrete target.
  2. Ask Jorge/the source dispatch (06-TIER3-BLOCKS) what specific ledger write-proof was intended (which GL table, which posting path).
  3. Once named, re-file as a concrete ticket.
- GUARD: n/a until the target is named.

### s-04-no-from-to-date-range-safety-lists  [accounting]  GATED-no
- STATE: STILL-OPEN
- ROOT CAUSE: `SafetyIncidentsClusterSurface.tsx` (damage-reports/trailer-interchange/cargo-claims) only has a single `DatePicker` at line 350 for the **create-form's** `incident_date` field — there is no from/to filter pair on the list view, unlike `AccidentsPage.tsx`/`SafetyEventsPage.tsx` which now have both.
- FILES: `apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx`
- FIX STEPS:
  1. Add `fromDate`/`toDate` `DatePicker` controls to the list header, mirroring `AccidentsPage.tsx`'s pattern.
  2. Wire them into the `useQuery` that fetches the incident list (add `from`/`to` query params).
  3. Update the backend safety-incidents list route to accept and apply the date filter.
- GUARD: `verify-safety-lists-date-range-parity.mjs` — fails if any safety incident cluster surface lacks a from/to filter pair.

### usmca-unhide-entity-switcher  [accounting]  GATED-yes
- STATE: STILL-OPEN (by design — awaiting owner launch decision, not a code defect)
- ROOT CAUSE: `companies.routes.ts:13-18` correctly gates USMCA behind `USMCA_ACTIVE` (default OFF, env var) as defense-in-depth per the entity-independence law. The entity is intentionally hidden until the July-2026 launch; today's date is inside that window, so it remains hidden pending the owner's explicit go-live call.
- FILES: `apps/backend/src/org/companies.routes.ts`
- FIX STEPS:
  1. No code change needed — the gate is correctly implemented.
  2. When Jorge confirms USMCA is ready to launch: set `USMCA_ACTIVE=1` in the Render env for the backend service (owner action, not a PR).
  3. Confirm the company picker + `identity/company-context.routes` switch-company both reflect it live (both consume `filterPreLaunchEntities`).
- GUARD: already wired (`filterPreLaunchEntities` is shared across every company-list surface).

### 0242-no-auto-equipment-log-on-transfer  [banking]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/mdata/equipment-transfer.service.ts` calls `appendCrudAudit` 4x (generic audit trail) but never `INSERT INTO mdata.equipment_log` — the dedicated equipment-log table (0008 migration) is not auto-populated on transfer. Note: this service isn't even the canonical transfer engine anymore (see `dispatch/equipment-transfer/{dual-confirm,request}.service.ts`, both mounted simultaneously via `mdata/index.ts` + `dispatch/equipment-transfer/routes.ts` — a split-brain worth flagging separately).
- FILES: `apps/backend/src/mdata/equipment-transfer.service.ts`, `apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts`, `apps/backend/src/dispatch/equipment-transfer/request.service.ts`
- FIX STEPS:
  1. Decide the canonical equipment-transfer engine (both are live-mounted today) — flag the split-brain to the owner.
  2. In the canonical engine's completion path, `INSERT INTO mdata.equipment_log (equipment_id, event_type='transfer', ...)`.
  3. Keep `appendCrudAudit` as-is (it's the generic audit trail, not a substitute for the domain log).
- GUARD: `verify-equipment-transfer-writes-equipment-log.mjs` — DB test asserting a completed transfer produces an `mdata.equipment_log` row.

### 0285-banking-transfer-gl-gap_VERIFY  [banking]  GATED-yes
- STATE: ALREADY-FIXED — evidence is stale. `transfers.service.ts:7,21-58,227,303` imports and calls `postSourceTransaction`/`reversePostedSourceTransaction` from the shared `accounting/posting-engine.service.ts`, gated per-entity behind the `TRANSFER_GL_POSTING_ENABLED` flag (migration `202607150000`, default OFF per finance-flags-off policy). GL posting is wired at both creation (line 227) and reversal (line 303) — reuses existing posting infra, no new GL math.
- ROOT CAUSE: n/a (fixed, flag-gated).
- FILES: `apps/backend/src/banking/transfers.service.ts`
- FIX STEPS: none for code. Flipping `TRANSFER_GL_POSTING_ENABLED` per entity is an owner decision (§1.3/§1.4) — STOP and ask before flipping.
- GUARD: already covered by the `BANKING-GL-COMPLETION` flag discipline + posting-engine tests.

### 0441-mod2-wo-split-brain  [banking]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: Two live `POST` routes both insert into `maintenance.work_orders` with different display-ID generators: `work-orders.routes.ts:641` calls `generateWorkOrderNumber()` (own scheme: `W-{yyyymm}-{seq}`, `maintenance.work_order_seq_per_month`) while `maintenance/work-orders.routes.ts:759` calls `maintenance.next_wo_display_id()` (the canonical `WO-{UNIT}-{TYPE}-{MM-DD-YYYY}-{NNNN}-{V5}` format per CLAUDE.md §7). Both `registerWorkOrdersV1Routes` (index.ts:971) and `registerMaintenanceWorkOrderRoutes` (index.ts:970) are mounted.
- FILES: `apps/backend/src/work-orders/work-orders.routes.ts`, `apps/backend/src/work-orders/wo-number.service.ts`, `apps/backend/src/maintenance/work-orders.routes.ts`
- FIX STEPS:
  1. STOP — get owner OK: the canonical scheme per CLAUDE.md §7 is `maintenance.next_wo_display_id()`; migrating the `/api/v1/work-orders` POST route to use it may require a migration to normalize already-issued `W-{yyyymm}-{seq}` IDs.
  2. Repoint `work-orders.routes.ts`'s create handler to call `maintenance.next_wo_display_id()` instead of `generateWorkOrderNumber()`.
  3. Deprecate (don't delete) `wo-number.service.ts`'s month-sequence path — archive per additive-only rule.
- GUARD: `verify-single-wo-display-id-generator.mjs` — fails if more than one function inserting into `maintenance.work_orders` computes `display_id` independently.

### 0441-mod5-auto-deductions-team-splits-dead  [banking]  GATED-no
- STATE: STILL-OPEN
- ROOT CAUSE: `DriversPage.tsx:15,19,29-30` defines `DRIVERS_AUTO_DEDUCTIONS_SUBTAB_PATH = "/drivers/auto-deductions"` and `DRIVERS_TEAM_SPLITS_SUBTAB_PATH = "/drivers/team-splits"` and renders real content (`AutoDeductionPoliciesPanel`/`TeamSplitConfigPanel`) when the pathname matches — but `manifest.tsx` has explicit `<Route>` entries for `/drivers/profiles`, `/settlements`, `/pre-settlements`, `/cash-advances`, `/permits`, `/pay-rate-templates`, `/deductions`, `/disputes`, `/leave` and none for `/drivers/auto-deductions` or `/drivers/team-splits` — the catch-all `<Route path="*" element={<Navigate to="/" replace />}>` (manifest.tsx:4150) intercepts both.
- FILES: `apps/frontend/src/routes/manifest.tsx`
- FIX STEPS:
  1. Add `<Route path="/drivers/auto-deductions" element={<ProtectedRoute><DriversPage initialSubnav="auto_deductions" /></ProtectedRoute>} />` next to the other `/drivers/*` routes (~line 862).
  2. Add the equivalent for `/drivers/team-splits`.
  3. Click both NavLinks in a live run to confirm they no longer land on the catch-all redirect.
- GUARD: `verify-drivers-subnav-routes-registered.mjs` — asserts every path in `DriversPage.tsx`'s `EXTENDED_SUBNAV`/`DRIVERS_SUBNAV` has a matching `<Route>` in `manifest.tsx`.

### 0441-mod6-hos-violations-source-enum-mismatch  [banking]  GATED-no
- STATE: ALREADY-FIXED / not a defect — confirmed the DB CHECK constraint (`0051_p3_t11_17_2_safety_v6_4_schema.sql:13`, `('samsara_auto','manual_office','dot_citation')`), backend zod (`hos-violations.ts:13,23`), and frontend dropdown (`HosViolationCreateModal.tsx:137-139`) all use the identical three literals. No mismatch exists.
- ROOT CAUSE: n/a.
- FILES: n/a.
- FIX STEPS: none.
- GUARD: none needed.

### 0441-mod8-auto-match-button-dead  [banking]  GATED-no
- STATE: ALREADY-FIXED / not a defect — `ReconciliationWorkspace.tsx:192-205` has a real `onClick` that navigates to `/banking/reconciliation?account_id=...&period_start=...&period_end=...`, gated behind `canOpenAutoMatchSuggestions`. Button is wired, not dead.
- ROOT CAUSE: n/a.
- FILES: n/a.
- FIX STEPS: none.
- GUARD: none needed.

### 0441-mod8-plaid-sign-deposits-negative  [banking]  GATED-no
- STATE: ALREADY-FIXED — evidence is stale. `BankAccountDetail.tsx:26-30` defines `formatBankTransactionSignedAmount()` which correctly derives sign from `is_credit` via the shared `spentReceived()` helper, and the render call at line 268 uses that function (not a naive `money()`). No unsigned/negative-deposit bug present.
- ROOT CAUSE: n/a.
- FILES: n/a.
- FIX STEPS: none.
- GUARD: none needed (covered by existing `spentReceived` convention shared with the live register).

### 0441-mod8-section7-palette-violation  [banking]  GATED-no
- STATE: STILL-OPEN (progress made, not resolved) — evidence's count (150) is stale; current ratchet baseline in `scripts/verify-section7-palette-financial.mjs:38` is **135** off-palette classes (confirmed by running the script: `OK ... 135 off-palette status classes == baseline`), down from 481 originally, but not zero.
- ROOT CAUSE: legacy off-palette Tailwind classes remain on financial banking surfaces; the guard only prevents net-new violations, it doesn't require fixing existing ones.
- FILES: `scripts/verify-section7-palette-financial.mjs` (baseline), the flagged banking components it scans
- FIX STEPS:
  1. Run the guard's diagnostic mode to list the 135 remaining offending class usages.
  2. Batch-fix them to the locked §7 palette tokens (`--navy`, `--slate`, etc.), a handful of components at a time.
  3. Lower `BASELINE` in the script after each batch (ratchet only downward, per the script's own instruction).
- GUARD: already wired — just needs the baseline driven to 0.

### 0441-mod9-customer-taxonomy-mismatch  [banking]  GATED-no
- STATE: STILL-OPEN
- ROOT CAUSE: `Customers.tsx:33-60` defines a 12-entry `CUSTOMER_TABS` (Transaction List, Activity Feed, Statements, Recurring Transactions, Projects, Customer Details, Late Fees, Notes, Tasks, Opportunities, Conversations, COI Requests) while `CustomerDetail.tsx:86` defines an unrelated 13-entry `tabs` (Profile, Contacts, Billing & Receivables, Quality & History, Lanes & Pricing, Documents, COI, Contracts, Portal Users, Tasks, Loads, Per-Customer P&L, Audit History) — no shared vocabulary/enum between the list-preview and detail-page taxonomies.
- FILES: `apps/frontend/src/pages/Customers.tsx`, `apps/frontend/src/pages/CustomerDetail.tsx`
- FIX STEPS:
  1. Define one shared `CustomerTabId` type/config consumed by both surfaces.
  2. Reconcile overlapping concepts (`COI Requests` vs `COI`, `Tasks` appears in both already) and additive-merge the rest.
  3. Re-point both `SecondaryNavTabs` usages at the shared config.
- GUARD: `verify-customer-tab-taxonomy-shared.mjs` — fails if `Customers.tsx` and `CustomerDetail.tsx` define independent tab-id lists.

### biz-flow-8-no-equipment-log-auto-update  [banking]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `dispatch/equipment-transfer/{dual-confirm,request}.service.ts` (the canonical transfer engine per in-code comments) have zero `INSERT INTO mdata.equipment_log` calls — confirmed via grep, no hits for `equipment_log`/`notif`/`email`/`push`/`outbox` in either file.
- FILES: `apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts`, `apps/backend/src/dispatch/equipment-transfer/request.service.ts`
- FIX STEPS: same as `0242-no-auto-equipment-log-on-transfer` — this is the same underlying gap on the canonical engine specifically. Implement the `mdata.equipment_log` INSERT in the transfer-completion transaction of `dual-confirm.service.ts`.
- GUARD: `verify-equipment-transfer-writes-equipment-log.mjs` (same guard as above, scoped to the canonical engine).

### biz-flow-8-no-transfer-notifications  [banking]  GATED-no
- STATE: STILL-OPEN
- ROOT CAUSE: confirmed zero notification/email/push/outbox calls in `dispatch/equipment-transfer/{dual-confirm,request}.service.ts` — a driver requesting/receiving equipment gets no notification.
- FILES: `apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts`, `apps/backend/src/dispatch/equipment-transfer/request.service.ts`
- FIX STEPS:
  1. Identify the existing notification/outbox infra used elsewhere (e.g. driver-inbox or push-notification service).
  2. On transfer request creation, notify the `to_driver`; on confirm/reject, notify the `from_driver`/initiator.
  3. Use the outbox pattern (append job, let the worker send) to avoid blocking the transaction.
- GUARD: `verify-equipment-transfer-notifies.mjs` — asserts both service files reference the outbox/notification enqueue function.

### fk-equipment-transfer-log-0289  [banking]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/202606080204_equipment_transfer_requests.sql:7` declares `equipment_uuid uuid NOT NULL` with **no** `REFERENCES` clause (unlike `from_driver_uuid`/`to_driver_uuid` which do reference `mdata.drivers`), and there is no FK to `mdata.equipment_log` anywhere. Combined with the two items above, nothing writes an equipment_log row from this table's lifecycle either.
- FILES: new migration under `db/migrations/`
- FIX STEPS:
  1. Confirm `equipment_uuid` should reference `mdata.units(id)` or `mdata.equipment` (verify the correct target table against live schema, not memory — landmine risk).
  2. Add `ALTER TABLE dispatch.equipment_transfer_requests ADD CONSTRAINT ... FOREIGN KEY (equipment_uuid) REFERENCES <correct_table>(id)` (idempotent, `DO $$ ... IF NOT EXISTS $$`).
  3. Backfill-check for orphan `equipment_uuid` values before adding the constraint (or it will fail on apply).
- GUARD: `verify-sql-column-existence.mjs` baseline update once the FK lands; also add a static check that `equipment_uuid` insertions validate against the target table.

### flow8-equipment-transfer-notifications  [banking]  GATED-no
- STATE: STILL-OPEN — duplicate of `biz-flow-8-no-transfer-notifications` (same files, same gap, confirmed independently).
- ROOT CAUSE: see `biz-flow-8-no-transfer-notifications`.
- FILES: `apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts`, `apps/backend/src/dispatch/equipment-transfer/request.service.ts`
- FIX STEPS: same as `biz-flow-8-no-transfer-notifications` — fix once, closes both tickets.
- GUARD: `verify-equipment-transfer-notifies.mjs` (same guard).

### flow8-no-auto-equipment-log-notify  [banking]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/mdata/equipment-log.routes.ts:156,194` only does `INSERT INTO mdata.equipment_log` + `appendCrudAudit` — no notification call fires when a log entry is created manually either.
- FILES: `apps/backend/src/mdata/equipment-log.routes.ts`
- FIX STEPS:
  1. After the successful INSERT (line ~194), enqueue a notification to relevant parties (assigned driver, ops) via the same outbox infra used for the transfer-notification fix.
  2. Keep this additive — don't change the existing audit call.
- GUARD: `verify-equipment-transfer-notifies.mjs` extended to also check `equipment-log.routes.ts`.

### qbo-parity-resizable-columns-everywhere  [banking]  GATED-no
- STATE: STILL-OPEN
- ROOT CAUSE: drag-to-resize only exists inside `ParityTable.tsx` (153 call sites use it), but there are ~200+ raw `<table>` surfaces in the frontend with no resize capability — "everywhere" is not accurate; this is the Phase B of `global-column-resize-sort-parity-table-phase-a`.
- FILES: each raw `<table>`-using page (audit via `grep -rl "<table" apps/frontend/src`)
- FIX STEPS:
  1. Triage the raw-table surfaces by traffic/importance (start with financial list pages: banking, invoices, bills).
  2. Migrate each to `ParityTable.tsx` incrementally (additive, one PR per surface or batched by module).
  3. Track progress with a countable metric (raw-table count trending to 0) rather than a binary "done".
- GUARD: extend `verify-parity-table-resize-sort-contract.mjs` (or a new script) to report the raw-`<table>` count as a ratchet, same pattern as the §7 palette guard.

### 0243-g6-2-vendor-create-no-dedup-guard  [compliance]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `mdata/vendors.routes.ts:163,296,442` has app-level case-insensitive + opco-scoped dedup (G6-2), but no DB-level partial `UNIQUE INDEX` on `lower(btrim(vendor_name))` scoped by `operating_company_id` exists in `db/migrations/` (confirmed: only `uq_mdata_vendors_company_qbo_vendor_id`, which dedupes on QBO id, not name) — a direct SQL insert (or a race) can still create a duplicate.
- FILES: new migration under `db/migrations/`
- FIX STEPS:
  1. `CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_vendors_company_name_ci ON mdata.vendors (operating_company_id, lower(btrim(vendor_name))) WHERE is_active` (or equivalent, matching the app-level logic exactly).
  2. Run against a fresh-DB CI branch first to catch any pre-existing duplicate that would block the index.
  3. Add a `verify-vendor-dedup-db-index.mjs` static guard.
- GUARD: `verify-vendor-dedup-db-index.mjs` — asserts the migration ledger contains the unique index and the app-level dedup logic matches its expression.

### 0252-audit136-hr-policy-tracking  [compliance]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: confirmed zero hits for `hr_policy`/`policy_acknowledg` across `apps/backend/src`, `apps/frontend/src`, `db/migrations` — only unrelated insurance/session/password "policy" modules exist. No HR-policy-acknowledgment tracking exists.
- FILES: new migration, new backend module, new frontend page
- FIX STEPS:
  1. Owner scope decision: which HR policies need acknowledgment tracking (handbook, safety policy, etc.) and for which roles (drivers/employees).
  2. New table `mdata.hr_policy_acknowledgments` (driver_id/user_id, policy_id, policy_version, acknowledged_at) — append-only, void-not-delete.
  3. Build the acknowledgment UI (onboarding step + a periodic re-ack prompt) and a compliance-dashboard KPI for outstanding acks.
- GUARD: `verify-hr-policy-ack-table-exists.mjs` once built.

### 0257-audit-100  [compliance]  GATED-yes
- STATE: STILL-OPEN (block-ready itself is a generic template, but the underlying gap is code-confirmed)
- ROOT CAUSE: only a narrow `OnboardingStepI9.tsx` upload step exists plus a `visa_expiration`-adjacent field in Mexico-ops permits — no dedicated I-9 verification/tracking module (List A/B/C document tracking, reverification due-dates, E-Verify case tracking) exists anywhere.
- FILES: `apps/frontend/src/pages/drivers/onboarding/OnboardingStepI9.tsx`, new backend module
- FIX STEPS:
  1. Get the concrete scope from the MASTER-6 06-TIER3 dispatch (the block-ready file itself names nothing specific — ask for the source `.txt`).
  2. If scope = full I-9 module: add `mdata.driver_i9_verifications` (document list, reverification date), build a dedicated verification page beyond the onboarding upload step.
- GUARD: `verify-i9-reverification-tracked.mjs` once built.

### 0257-audit-76  [compliance]  GATED-yes
- STATE: UNVERIFIABLE — the block-ready file (`0257-audit-76.json`) is a verbatim generic MASTER-6 acceptance template ("table/column/fk/rls/route/mounted proven...") with no concrete table/column/route named, identical boilerplate to `ledger-write-proof-operational-not-found` and `core-ledger-write-proof-trucking-evidence`. Nothing to grep or verify against.
- FILES: `.block-ready/0257-audit-76.json`
- FIX STEPS: ask the source dispatch what `audit-76` actually refers to before filing a real ticket.
- GUARD: n/a until named.

### 0275-audit173-data-privacy-compliance  [compliance]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: RLS/company-isolation is real (865 `CREATE POLICY` statements confirmed, close to the cited 856 — minor migration-count drift, not material), but no GDPR/CCPA consent-management table, data-subject-rights (access/delete/portability request) workflow, or privacy dashboard exists anywhere in the repo.
- FILES: new migration, new backend module, new frontend page
- FIX STEPS:
  1. Owner/legal scope decision: which jurisdictions' privacy laws apply (drivers are Mexican B1 contractors, customers may be US-based) — this determines GDPR vs CCPA vs neither.
  2. If required: add `identity.data_subject_requests` (request type, subject, status, fulfilled_at) and a request-intake + fulfillment workflow.
- GUARD: `verify-privacy-dsr-workflow-exists.mjs` once scoped and built.

### 0441-mod11-ifta-drift-two-preparers  [compliance]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/index.ts:881` registers `registerIftaQuarterlyPreparerRoutes` (`/api/v1/ifta/preparations/*`, file `ifta/ifta-quarterly-preparer.routes.ts`) and `apps/backend/src/index.ts:877` registers `registerReportsRoutes` which internally mounts `registerReportsIftaRoutes` (`/api/v1/reports/ifta/*`, file `reports/ifta/routes.ts`) — both engines are live simultaneously with separate draft/preparation storage and separate `/prepare`, `/draft`, `/mark-filed` semantics. Two sources of truth for a regulatory filing (IFTA) is a real drift risk.
- FILES: `apps/backend/src/ifta/ifta-quarterly-preparer.routes.ts`, `apps/backend/src/reports/ifta/routes.ts`
- FIX STEPS:
  1. STOP — get owner OK: pick the canonical IFTA preparer engine (recommend the newer `reports/ifta/routes.ts` draft/approve/mark-filed flow if it's the one the Compliance dashboard actually links to — verify via frontend routing first).
  2. Migrate any data in the non-canonical engine's tables to the canonical one (migration, GATED).
  3. Deprecate (archive, don't delete) the non-canonical route registration and routes file.
- GUARD: `verify-single-ifta-preparer-engine.mjs` — fails if `index.ts` registers more than one IFTA-preparation route module.

### 0441-mod12-eld-module-fake-stub  [compliance]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/frontend/src/components/layout/sidebar-config.ts:67,72` still marks `eld` as `NAV_HIDDEN_STUB_IDS` with the comment "placeholder/stub page (no real backend)"; confirmed no real ELD backend exists (`apps/backend/src/safety/eld-audit-trail` is unrelated — an audit-trail folder, not an ELD integration).
- FILES: `apps/frontend/src/components/layout/sidebar-config.ts`, new backend ELD integration module
- FIX STEPS:
  1. Owner decision: is a real ELD integration (Samsara HOS feed already exists per `hos.duty_status_events` — confirm whether that IS the "ELD" data source and the sidebar item is just mislabeled/redundant, vs. a genuinely separate ELD device-management module is needed).
  2. If genuinely separate: scope + build the backend module before unhiding.
  3. If redundant with existing HOS/Samsara data: retire the stub sidebar entry per the additive-only rule (archive, keep hidden, note as resolved-by-consolidation) rather than building a duplicate.
- GUARD: n/a until the owner decision resolves which path to take.

### 0441-mod13-compliance-tabs-local-usestate-not-  [compliance]  GATED-no
- STATE: ALREADY-FIXED — evidence is stale. `ComplianceDashboardPage.tsx:75,79-85` now uses `useSearchParams` and syncs the module tab (`filings`/`hos_tracker`/`hos_viewer`/`violations`/`hos_history`/`required_docs`) to `?tab=`, shipped in PR #2765 ("fix(compliance): sync dashboard tabs to ?tab= URL"), confirmed via `git log` on this file.
- ROOT CAUSE: n/a (fixed). Note: `severityFilter`/`typeFilter`/`ownerTypeFilter` (secondary filters *within* the Violations tab) remain plain `useState` — a lesser, separate concern from the tab-selection defect the evidence described.
- FILES: n/a.
- FIX STEPS: none for the cited defect. Optionally file a new, smaller ticket for the sub-filter persistence if desired.
- GUARD: none needed for the tab-sync fix (already shipped).

### 0441-mod3-fuel-compliance-not-available-rows  [compliance]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/frontend/src/pages/fuel/components/CompliancePanel.tsx:16-17` hardcodes the literal string `"Not available yet"` for both the "Last week non-compliance count" and "Top non-compliance reason" KPI rows — no backend query backs them.
- FILES: `apps/frontend/src/pages/fuel/components/CompliancePanel.tsx`, backend fuel-compliance route
- FIX STEPS:
  1. Identify the fuel non-compliance source data (likely IFTA mileage/fuel-purchase mismatch records).
  2. Add a backend aggregate endpoint returning last-week count + top reason.
  3. Wire the two `Row` components to real `useQuery` data, keep "Not available yet" only as the loading/empty fallback.
- GUARD: `verify-fuel-compliance-kpis-live.mjs` — fails if the literal string appears outside a loading/empty-state conditional.

### 0441-mod6-hos-create-violation-mislabeled-link  [compliance]  GATED-no
- STATE: ALREADY-FIXED / not a defect — `HoursOfServicePage.tsx:151-158` button reads `"+ Create"` (matches the locked `+ Create` vocab per CLAUDE.md §7) with `onClick={() => setCreateOpen(true)}` correctly opening the create modal. Not mislabeled, not dead.
- ROOT CAUSE: n/a.
- FILES: n/a.
- FIX STEPS: none.
- GUARD: none needed.

### 0441-mod6-hos-exceptions-archived-stub  [compliance]  GATED-no
- STATE: ALREADY-FIXED / not a defect (deliberate) — `HosExceptionsPage.tsx:1` is explicitly marked `// ARCHIVE (A23-6): orphan exceptions surface — linked from HoursOfServicePage. Sunset 2026-09-01. Do not extend.` This is an intentional archive per the additive-only/archive-don't-delete rule, not a live bug.
- ROOT CAUSE: n/a.
- FILES: n/a.
- FIX STEPS: none — do not extend or "fix" this page per its own header comment.
- GUARD: none needed.

### 0441-mod6-hos-violations-void-hardcoded-reason  [compliance]  GATED-no
- STATE: ALREADY-FIXED / not a defect — `hos-violations.ts:36` requires a real user-supplied zod-validated `reason` (`min(3)`) written to `void_reason` (line 207/221); the frontend passes user-entered text through. Not hardcoded.
- ROOT CAUSE: n/a.
- FILES: n/a.
- FIX STEPS: none.
- GUARD: none needed (void/cancel governance already requires a reason per the void-cancel-governance-policy rule).

### 0441-mod9-vendor-contact-fields-notes-blob  [compliance]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `vendorProfileMeta.ts:18-67` (`VendorProfileMeta`, `parseVendorNotes`) serializes `primaryContactName/Title/Phone/Email`, `secondaryContact*`, `generalEmail`, `accountingContact`, `disputesContact` into the `mdata.vendors.notes` text blob behind an `IH35_VENDOR_PROFILE_V1::` marker — no real columns exist for any of these on `mdata.vendors`.
- FILES: new migration adding columns to `mdata.vendors`, `apps/frontend/src/lib/vendorProfileMeta.ts`, vendor create/edit forms
- FIX STEPS:
  1. Add real columns (`primary_contact_name`, `primary_contact_email`, etc.) to `mdata.vendors` via idempotent migration.
  2. Write a one-time backfill that parses existing `notes` blobs (via the existing `parseVendorNotes`) into the new columns.
  3. Repoint the vendor forms/API to read/write the real columns; keep `parseVendorNotes` only as a legacy-notes fallback during transition.
- GUARD: `verify-vendor-contact-fields-are-columns.mjs` — fails if `vendorProfileMeta.ts` still serializes contact fields into a notes blob after the migration ships.

### systemic-pattern-column-drift-guard  [compliance]  GATED-no
- STATE: STILL-OPEN
- ROOT CAUSE: `scripts/verify-sql-column-existence.mjs:43-60` only validates columns for 15 curated `TARGET_TABLES`; `verify-maintenance-insert-column-drift.mjs` is scoped only to maintenance inserts. No systemic, repo-wide phantom-column guard exists — confirmed current `TARGET_TABLES` set is unchanged/still narrow.
- FILES: `scripts/verify-sql-column-existence.mjs`
- FIX STEPS:
  1. Extend `TARGET_TABLES` incrementally to cover more high-traffic schemas (`dispatch.*`, `maintenance.*`, `driver_finance.*` beyond what's listed).
  2. Longer-term: replace the curated allowlist with a full schema-introspection pass (parse every `INSERT`/`SELECT` against the live migration-derived schema baseline) rather than a hand-maintained table list.
- GUARD: this ticket IS the guard improvement — track its own coverage % as the regression metric.

### 0243-g6-3-customer-dedup-case-sensitive-unscop  [customers-vendors]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `mdata/customers.routes.ts:230-235,609,915` (`assertUniqueCustomerFields`, G6-3) implements case-insensitive + opco-scoped dedup at the app level, but no DB-level `UNIQUE INDEX` on `lower(btrim(...))` scoped by `operating_company_id` exists for customer name (only `uq_customer_contacts_primary_per_customer` and `uq_customer_classifications_active_tag`, neither is a name-dedup index).
- FILES: new migration under `db/migrations/`
- FIX STEPS: same pattern as `0243-g6-2-vendor-create-no-dedup-guard` — add the matching partial unique index on `mdata.customers`, mirroring the exact app-level expression in `assertUniqueCustomerFields`.
- GUARD: `verify-customer-dedup-db-index.mjs`.

### 0280-32-revenue-to-customer-linkage  [customers-vendors]  GATED-yes
- STATE: ALREADY-FIXED — fully wired. `apps/backend/src/reports/customer-profitability.routes.ts` groups revenue by `customer_id` from `mdata.loads`, registered via `reports/index.ts:28`; `CustomerProfitabilityPage.tsx` is mounted at `/reports/customer-profitability` (`manifest.tsx:2974`); AND `CustomerDetail.tsx:525-538,1731,1754` reuses the exact same report endpoint for its "Per-Customer P&L" tab with a direct forward link to the standalone report page — both forward and reverse drill-through confirmed live.
- ROOT CAUSE: n/a.
- FILES: n/a.
- FIX STEPS: none.
- GUARD: none needed — already cross-linked per the total-connectivity law.

### 0441-mod13-inventory-part-to-vendor-none  [customers-vendors]  GATED-no
- STATE: STILL-OPEN
- ROOT CAUSE: `parts-inventory.routes.ts:12,64,72` supports a real `vendor_id` column on the part record, but `PartsInventoryTable.tsx` (frontend) never surfaces it — the create form only has a free-text `vendor_invoice_number` field, no vendor picker/dropdown, no link rendered to the vendor record.
- FILES: `apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx`
- FIX STEPS:
  1. Add a vendor picker (reuse the standard vendor-select component with inline "+ Add new vendor") to the part create/edit form, wired to `vendor_id`.
  2. Render an `EntityLink` to the vendor on each part row.
  3. No backend change needed — `vendor_id` already exists and is already accepted by the route.
- GUARD: `verify-parts-vendor-link-rendered.mjs` — fails if `PartsInventoryTable.tsx` has no vendor field/link.

### 0441-mod9-coi-duplicated-feature-unequal  [customers-vendors]  GATED-no
- STATE: STILL-OPEN (partially — evidence's vocab claim is stale, the duplication is real)
- ROOT CAUSE: `Customers.tsx:26,581` mounts `CustomerCOITab` (list-preview) and `CustomerDetail.tsx:67,1629` mounts a disjoint `CoiRequestsTab` (full-page) — two separate, unconsolidated components for the same COI-request feature. Both DO correctly use `+ Create COI`/`+ Create` (`CustomerCOITab.tsx:126,161`, `CoiRequestsTab.tsx:81,173`) — the evidence's "neither uses '+ Create' vocab" claim is wrong/stale — but the two-implementations duplication itself is confirmed.
- FILES: `apps/frontend/src/pages/customers/CustomerCOITab.tsx`, `apps/frontend/src/pages/customers/tabs/CoiRequestsTab.tsx`
- FIX STEPS:
  1. Consolidate into one shared `CoiTab` component parameterized by context (list-preview vs full-page), reused from both `Customers.tsx` and `CustomerDetail.tsx`.
  2. Keep both mount points (additive-only) but point them at the same underlying component/query.
- GUARD: `verify-coi-single-component.mjs` — fails if both files import a differently-named COI component.

### 0441-mod9-customers-list-12-tabs-9-stubs  [customers-vendors]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: `Customers.tsx:47-60` defines 12 `CUSTOMER_TABS`, but the render switch (`activeTab === ...` at lines 529, 580, 586) only handles 3 (`transaction_list`, `coi_requests`, `customer_details`) — the other 9 (Activity Feed, Statements, Recurring Transactions, Projects, Late Fees, Notes, Tasks, Opportunities, Conversations) fall through to `CustomerTabComingState`, a stub.
- FILES: `apps/frontend/src/pages/Customers.tsx`
- FIX STEPS:
  1. Prioritize the financially-relevant stubs first (Statements, Late Fees, Recurring Transactions — these read `accounting.invoices`/`accounting.payments`) since those are the highest-value gaps.
  2. Build each real tab component incrementally, reusing existing endpoints where they exist elsewhere (e.g. `CustomerDetail.tsx`'s "Billing & Receivables" likely already covers some of this — check for reuse before building new).
  3. Ship additively, one tab per PR to keep review small.
- GUARD: `verify-customer-tabs-no-stub.mjs` — counts stub-rendering tabs as a ratchet metric (must trend to 0), same pattern as the §7 palette guard.

### 0441-mod9-four-disjoint-vendor-tables  [customers-vendors]  GATED-yes
- STATE: STILL-OPEN
- ROOT CAUSE: confirmed four live, disjoint vendor tables — `mdata.vendors` (`0008_mdata_init.sql`), `mdata.qbo_vendors` (`0142_mdata_qbo_master_data_tables.sql`), `accounting.qbo_vendors` (`0321_qbo_vendors_push_sync_status.sql`), and `catalogs.maintenance_vendors` (dynamically created via `format()` in `0066_p3_t11_21_5a_maintenance_catalogs.sql:16`) — no `REFERENCES` constraint links any of the four to each other (only scattered FKs *to* `mdata.vendors` from unrelated tables like `road_service_tickets` and `work_order_qbo_vendor_linkage`, which reference `mdata.qbo_vendors` instead, deepening the split).
- FILES: new migration under `db/migrations/`
- FIX STEPS:
  1. STOP — get owner OK: this needs an architectural decision on which table is the single source of truth for vendor identity (recommend `mdata.vendors` with the others as FK'd projections/mirrors).
  2. Add FK columns linking `mdata.qbo_vendors`, `accounting.qbo_vendors`, and `catalogs.maintenance_vendors` back to `mdata.vendors(id)` where a natural match exists (may require a backfill/matching pass first).
  3. Update `road_service_tickets`/`work_order_qbo_vendor_linkage` to reference the canonical table once merged, or document why they intentionally target the QBO-mirror table.
- GUARD: `verify-vendor-tables-linked.mjs` — fails if any of the four vendor tables lacks a FK path to the canonical one.

# Build Tickets — bb_3 (re-verified against current `main`, 2026-07-19)

Counts: **32 STILL-OPEN**, **12 ALREADY-FIXED**, **5 UNVERIFIABLE** (of 49 findings).
GATED: **25 yes** / **7 no** among the 32 still-open tickets (financial/mdata-write/migration/GL/flags → owner OK required before merge).

---

## customers-vendors

### cust1-vend1-pager-total-count-bug  [customers-vendors]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `totalCount` passed to the pager is `customersSorted.length` (client array length after `limit:5000` fetch), not a real server-side COUNT — pager math is cosmetic-correct only up to 5000 rows.
- FILES: `apps/frontend/src/pages/Customers.tsx:249,466`; `apps/backend/src/mdata/customers.routes.ts` (list route)
- FIX STEPS:
  1. Add `SELECT count(*) OVER()` (or a separate count query) to the customers list route, return `total_count` in the response envelope.
  2. Thread `total_count` through `listCustomers()` in `apps/frontend/src/api/mdata.ts`.
  3. Replace `totalCount={customersSorted.length}` at Customers.tsx:466 with the server total.
  4. Repeat for Vendors (see `vend1-pagination-total-vs-length` below — same fix, same PR).
- GUARD: new `scripts/verify-customers-vendors-total-count-is-server.mjs` — static-asserts neither page passes `.length` into `totalCount`.

### custvend-par1-vendor-credits-no-ui  [customers-vendors]  GATED? yes (touches accounting.vendor_credits — AP-reducing document)
- STATE: STILL-OPEN
- ROOT CAUSE: Full vendor-credits stack exists (backend routes, migration, `apps/frontend/src/api/vendor-credits.ts` client) but zero `.tsx` files import the client — no screen renders or applies a vendor credit.
- FILES: `apps/frontend/src/api/vendor-credits.ts` (client, unused); new file needed e.g. `apps/frontend/src/pages/vendors/VendorCreditsTab.tsx`; mount point in vendor detail page.
- FIX STEPS:
  1. Build a Vendor Credits tab/panel on the vendor detail page using `listVendorCredits`/`applyVendorCredit`/`voidVendorCredit` from the existing client.
  2. Wire a "+ Create" vendor credit action from the vendor detail page (parity vocab — `+ Create`, not `+ New`).
  3. Add drill-through from Bills/Bill Payments to any applied credit (cross-module linkage rule).
- GUARD: `scripts/verify-vendor-credits-ui-wired.mjs` — fails if no `.tsx` imports `api/vendor-credits`.

### vend1-pagination-total-vs-length  [customers-vendors]  GATED? no
- STATE: STILL-OPEN (same defect as `cust1-vend1-pager-total-count-bug`, vendor side)
- ROOT CAUSE: `apps/frontend/src/pages/Vendors.tsx:300` `totalCount={vendorsSorted.length}`; `listVendors({limit:5000})` at line 86 fetches full roster instead of paging server-side.
- FILES: `apps/frontend/src/pages/Vendors.tsx:86,300`; `apps/backend/src/mdata/vendors.routes.ts` (GET list route, ~line 213)
- FIX STEPS: same as customer ticket above — add server COUNT to `GET /api/v1/mdata/vendors`, thread through `listVendors()`, replace `.length`.
- GUARD: same guard script covers both pages (see above).

### vend3-test-vendor-rows-visible  [customers-vendors]  GATED? yes (data cleanup on mdata.vendors — owner-gated by design)
- STATE: UNVERIFIABLE (needs prod check)
- ROOT CAUSE: Two mitigations are already live — (1) `IS_PROD_ENV && isTestVendorFixtureName(b.name)` blocks NEW `TEST-VENDOR*` creation on POST/PATCH (`apps/backend/src/mdata/vendors.routes.ts:301,444`, guarded by `scripts/verify-vendor-test-fixture-guard.mjs`), and (2) `admin-jobs.service.ts:465` `vendors.archive_test_rows` owner-gated job sets `deactivated_at` on existing `TEST-VENDOR-{1..4}` rows. Vendors.tsx defaults `listStatus="active"` and filters `deactivated_at == null` client-side, so once the job has run, rows disappear from the default view. Whether the job has actually been **run against prod** is a live-data fact, not a code fact.
- FILES: n/a (no code change) — action item: run `admin-jobs` operation `vendors.archive_test_rows` for TRANSP (and any other entity with legacy TEST-VENDOR rows), or confirm it already ran.
- FIX STEPS:
  1. Prod check (gated, ask Jorge): `SELECT id, vendor_name, deactivated_at FROM mdata.vendors WHERE vendor_name ILIKE '%TEST-VENDOR%'`.
  2. If any have `deactivated_at IS NULL`, trigger `vendors.archive_test_rows` via the admin-jobs UI (owner action).
  3. Re-check Vendors.tsx default list renders clean.
- GUARD: existing `verify-vendor-test-fixture-guard.mjs` already covers creation-blocking; no new guard needed for the data-cleanup step (it's a one-time data action, not a regression-prone code path).

---

## dispatch

### 0008-d-abandonment-pay-first-then-escr_DISPATCH  [dispatch]  GATED? yes (driver_finance escrow = liability)
- STATE: STILL-OPEN
- ROOT CAUSE: `grep -i escrow` returns zero hits in `abandonment.service.ts` (369 lines) / `abandonment.routes.ts` — the "pay driver first, escrow only the shortfall" sequencing from the design doc is entirely unimplemented; only the newer `emitAutoProposedEscrowEvents()` path (called from `loads.routes.ts` transition handler) exists.
- FILES: `apps/backend/src/driver-finance/abandonment.service.ts`, `apps/backend/src/driver-finance/abandonment.routes.ts`
- FIX STEPS:
  1. Design doc first (per finance build directive — never build GL/escrow math solo): confirm with Jorge whether "pay-first-then-escrow-shortfall" is still the intended flow, since `emitAutoProposedEscrowEvents` may have superseded it.
  2. If confirmed, add the pay-first step to `abandonment.service.ts`, computing shortfall against `driver_finance.settlement_lines` before creating an escrow liability entry.
  3. Reuse existing escrow-liability posting function — no new GL math.
- GUARD: `scripts/verify-abandonment-pay-first-escrow-order.mjs` asserting settlement payout precedes escrow liability creation in the service.

### 0008-g3-qbo-mirror-canonical_DISPATCH  [dispatch]  GATED? yes (accounting.qbo_* / mdata.qbo_* schema)
- STATE: STILL-OPEN
- ROOT CAUSE: Both `accounting.qbo_*` (23 files reference it) and `mdata.qbo_*` (108 files reference it) mirror tables still exist and are actively written; no writer repoint/retirement to a single canonical QBO mirror location was ever performed.
- FILES: search hits across `apps/backend/src/integrations/qbo/*`, `apps/backend/src/accounting/*`, `apps/backend/src/mdata/*`
- FIX STEPS:
  1. Inventory every writer of `accounting.qbo_*` vs `mdata.qbo_*` (a script, not memory).
  2. Design doc: pick ONE canonical location (this is a cross-cutting schema decision — Jorge sign-off).
  3. Migrate + repoint writers; leave old tables as read-only views during transition (append-only law).
- GUARD: `scripts/verify-qbo-mirror-single-writer.mjs` — fails if both `accounting.qbo_*` and `mdata.qbo_*` tables receive live INSERT/UPDATE from app code.

### 0008-h-create-bill-line-items-load-id_DISPATCH  [dispatch]  GATED? yes (DB migration, HELD)
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/202607200000_bill_lines_load_id.sql` exists and is correctly marked `HOLD-FOR-JORGE` in `db/migrations/.held-migrations.json`; `accounting.bill_lines.load_id` does not exist on prod. This is intentional-pending, not a code bug.
- FILES: `db/migrations/202607200000_bill_lines_load_id.sql`
- FIX STEPS: no code change needed — surface the HELD migration to Jorge for explicit "OK to merge/run" per §1.3/1.4; nothing else blocks it.
- GUARD: n/a (guard would just re-assert HELD status; `.held-migrations.json` already tracks it).

### 0010-f1-orphan-fk-columns_DISPATCH  [dispatch]  GATED? no
- STATE: **ALREADY-FIXED** — `scripts/verify-orphan-fk-inventory.mjs` IS wired into CI: `.github/workflows/locked-guards.yml:1165` runs both `--selftest` and the real `npm run verify:orphan-fk-inventory` step (comment there cites "0010-f1"). Evidence's claim ("not wired into any CI workflow") is stale/incorrect for current main.
- No further action.

### 0091-b1-3-bill-unit-allocation-delete-not-void_DISPATCH  [dispatch]  GATED? yes (accounting.bill_unit_allocation)
- STATE: STILL-OPEN
- ROOT CAUSE: `bills.routes.ts:453` does `DELETE FROM accounting.bill_unit_allocation WHERE bill_id = $1 AND tenant_id = $2` then re-`INSERT`s fresh allocation rows on every allocation-method change — hard DELETE, violates void-not-delete (CLAUDE.md §2). No `is_active`/`voided_at` column on the table.
- FILES: `apps/backend/src/accounting/bills.routes.ts:453-467`
- FIX STEPS:
  1. Migration (gated): add `voided_at TIMESTAMPTZ`, `is_active BOOLEAN NOT NULL DEFAULT true` to `accounting.bill_unit_allocation`; `REVOKE DELETE` from `ih35_app`.
  2. Replace the `DELETE` at line 453 with `UPDATE ... SET voided_at = now(), is_active = false WHERE bill_id = $1 AND is_active = true`.
  3. INSERT the new allocation rows as before (now additive, not replacing).
  4. Update every reader of `accounting.bill_unit_allocation` (line ~518) to filter `is_active = true`.
- GUARD: `scripts/verify-no-hard-delete-financial-tables.mjs` (or extend the existing void-not-delete guard) to include `accounting.bill_unit_allocation`.

### 0091-g10-h1  [dispatch]  GATED? yes (GRANT/role change on mdata.loads)
- STATE: STILL-OPEN — root cause corrected from evidence
- ROOT CAUSE: `0034_loads_schema.sql:211-212` shows the original asymmetry (loads: no DELETE grant; load_stops: DELETE granted) — but migration `0116_p6_privilege_reconciliation.sql` later `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mdata TO ih35_app`, which silently re-grants DELETE on `mdata.loads` too. No later migration issues `REVOKE DELETE ON mdata.loads FROM ih35_app` (unlike the several other tables that DO have explicit `REVOKE DELETE` — see `202607110200_civil_fines_voidable.sql`, `202607111000_block02_driver_escrow_separation_return.sql`, etc.). Both tables are now hard-deletable by the app role, contradicting void-not-delete.
- FILES: new migration under `db/migrations/`; confirm via `mdata.loads`, `mdata.load_stops` grants.
- FIX STEPS:
  1. Migration (gated): `REVOKE DELETE ON mdata.loads FROM ih35_app; REVOKE DELETE ON mdata.load_stops FROM ih35_app;`
  2. Audit any code path relying on hard DELETE of load_stops (none should exist per void-not-delete) before revoking.
  3. Add default-privilege guard so future `mdata` tables don't silently inherit DELETE from a blanket grant again.
- GUARD: `scripts/verify-no-delete-grant-mdata-loads.mjs` — queries `information_schema.role_table_grants` (or a static list) asserting `ih35_app` has no DELETE on `mdata.loads`/`mdata.load_stops`.

### 0091-g7-1_DISPATCH  [dispatch]  GATED? yes (driver_finance settlement payments)
- STATE: STILL-OPEN
- ROOT CAUSE: `settlement-payment.service.ts` implements a full state machine with `validateTransition()`, but no test file references `validateTransition` anywhere in the repo (`grep -rl validateTransition apps/backend/src` returns only the service itself) — no transition-matrix pinning test exists.
- FILES: `apps/backend/src/driver-finance/settlement-payment.service.ts`; new test `apps/backend/src/driver-finance/__tests__/settlement-payment-transitions.test.ts`
- FIX STEPS:
  1. Enumerate every state pair in the service's transition table.
  2. Write a pinning test asserting each valid transition succeeds and every other pair throws/rejects.
  3. Include an illegal-transition regression case matching any known past bug.
- GUARD: the pinning test itself IS the guard (add to CI test run, not a separate `.mjs`).

### 0091-info-b3-3  [dispatch]  GATED? yes (GRANT/role change)
- STATE: STILL-OPEN — confirms the underlying fact (same root cause as `0091-g10-h1` above): `0116_p6_privilege_reconciliation.sql:17` grants `DELETE ON ALL TABLES IN SCHEMA mdata` (mdata is explicitly in that migration's schema list) to `ih35_app`, so `ih35_app` CAN hard-delete `mdata.loads` today. No FK/trigger blocks it.
- FILES / FIX STEPS / GUARD: identical to `0091-g10-h1` — same PR should close both tickets.

### 0091-m-lists-1  [dispatch]  GATED? n/a
- STATE: UNVERIFIABLE — evidence is generic boilerplate with no extractable, checkable claim ("Same generic boilerplate block file, no specific claim extractable to verify against code"). Cannot produce a ticket without a concrete assertion. Recommend dropping this id from the registry or re-deriving it from source with a specific claim.

### 0243-b3-3-fuel-g18-trigger-hard-delete-gap  [dispatch]  GATED? yes (DB migration, G18 diesel/load FK — CLAUDE.md §4 "critical")
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/0300_create_fuel_transactions.sql:10` — `load_id uuid NULL REFERENCES mdata.loads(id) ON DELETE SET NULL`, not `RESTRICT`. Per CLAUDE.md §4, every diesel/roadside expense MUST FK to a load; `ON DELETE SET NULL` lets the load disappear (if a hard delete ever executes — see `0091-g10-h1`) while silently orphaning the fuel transaction's load link instead of blocking it. No guard asserts fuel transactions can't lose their load link.
- FILES: new migration touching `fuel.fuel_transactions.load_id` FK
- FIX STEPS:
  1. Fix `0091-g10-h1` first (remove DELETE grant on `mdata.loads`) — that closes the actual attack surface.
  2. Migration (gated): change `fuel.fuel_transactions.load_id` FK from `ON DELETE SET NULL` to `ON DELETE RESTRICT` (or keep SET NULL only if soft-delete via `soft_deleted_at` is the sole removal path — confirm with Jorge which is intended for G18).
  3. Add a regression test load+delete-attempt case.
- GUARD: `scripts/verify-fuel-transactions-load-fk-not-nullable-on-delete.mjs` (or extend the G18 FK guard family) asserting the FK action.

### 0243-c1-4-dead-duplicate-components-dispatchli  [dispatch]  GATED? n/a
- STATE: UNVERIFIABLE — evidence names no specific component pair ("No specific duplicate component pair named in registry; not located within available time"). No actionable claim to verify.

### 0243-d1-2-vendors-split-two-tables_DISPATCH  [dispatch]  GATED? yes (mdata schema, QBO mirror)
- STATE: STILL-OPEN — clarified: the "second vendor table" is `mdata.qbo_vendors` (created in `db/migrations/0142_mdata_qbo_master_data_tables.sql:6`), a QBO-mirror table distinct from canonical `mdata.vendors` (`0008_mdata_init.sql`). This is the same underlying dual-table/no-canonical-repoint issue as `0008-g3-qbo-mirror-canonical`.
- FILES: `db/migrations/0142_mdata_qbo_master_data_tables.sql`; any reader/writer of `mdata.qbo_vendors`
- FIX STEPS: fold into the `0008-g3` canonicalization work — same PR/design doc should resolve both.
- GUARD: covered by `verify-qbo-mirror-single-writer.mjs` from `0008-g3`.

### 0243-d1-3-inline-drawers-drop-captured-fields  [dispatch]  GATED? yes (one fix step needs a migration for `mobile`)
- STATE: STILL-OPEN — partially superseded: migration `202607110230_vendor_qbo_parity.sql` landed and the backend (`apps/backend/src/mdata/vendors.routes.ts`) NOW accepts/persists `city`, `state`, `website`, `print_on_check_name` — but `NewVendorDrawerForm.tsx`'s `createVendor()` call still only sends `name, vendor_type, email, phone, address, operating_company_id` (comment at line 57-58 is stale — it still says these fields are "held back until migration 202607110230 lands," but that migration has landed). The `mobile` field has NO backend column at all (`grep -n mobile vendors.routes.ts` = zero hits) — that part of the gap is real and unaddressed.
- FILES: `apps/frontend/src/components/parity/drawers/NewVendorDrawerForm.tsx:57-66`; `apps/backend/src/mdata/vendors.routes.ts`
- FIX STEPS:
  1. Non-gated: update `NewVendorDrawerForm.tsx`'s `createVendor()` call to also send `city`, `state`, `website`, `printOnChecks→print_on_check_name` — backend already supports them.
  2. Gated: migration adding a `mobile` column to `mdata.vendors` (or confirm there's an existing "alt phone" column to repoint to instead of adding a new one).
  3. Wire `mobile` through the create/patch routes once the column exists.
- GUARD: `scripts/verify-vendor-drawer-fields-not-dropped.mjs` diffing the drawer's form-state keys against the fields actually sent in `createVendor()`.

### 0243-g10-h1-load-stops-delete-grant-live  [dispatch]  GATED? yes — duplicate of `0091-g10-h1`
- STATE: STILL-OPEN — same evidence, same root cause, same fix/guard as `0091-g10-h1`. Merge into one ticket/PR.

### 0243-g11-5-period-close-no-reopen_DISPATCH  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** — `apps/backend/src/accounting/p7-wave2.routes.ts:335` implements `POST /api/v1/accounting/periods/:id/reopen`, gated by `MONEY_CONTROL_PERIOD_REOPEN_ENABLED` (line 21), throws `period_reopen_disabled` → 409 when the flag is off (line 351/368), and audits via `appendCrudAudit(..., "accounting.period_reopened", ...)` (line 364). The "no reopen" premise is refuted on current main.
- No further action.

### 0243-g11-7-factoring-reserve-two-place_DISPATCH  [dispatch]  GATED? yes (DB migration, HELD; accounting.factoring_reserve_movements)
- STATE: STILL-OPEN
- ROOT CAUSE: `reserve-tracker.service.ts` reads `accounting.factoring_reserve_movements`, but migration `202607130000_factoring_reserve_movements.sql` is HELD (`db/migrations/.held-migrations.json`: "[HOLD-FOR-JORGE — TIER 1] CONN-2 ... storage/reporting only, no new GL math; FACTORING_GL_POSTING_ENABLED stays OFF"). The table does not exist on prod, so the service reads from a table that isn't there yet.
- FILES: `db/migrations/202607130000_factoring_reserve_movements.sql`
- FIX STEPS: no code change — surface the HELD migration for explicit "OK to run" per §1.3/1.4. Once approved and applied, `reserve-tracker.service.ts` starts working with no further code change needed.
- GUARD: n/a beyond existing `.held-migrations.json` tracking.

### 0243-g4-idem1-money-routes-off-allowli_DISPATCH  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** — `apps/backend/src/middleware/idempotency.ts` implements exactly the described control: `REQUIRED_MATCHERS` (lines ~40-50) is a route-level allowlist requiring an `Idempotency-Key` header on `driver-finance/settlements`, `accounting/invoices`, `accounting/bills`, `accounting/bill-payments`, `expenses`, `accounting/payments`, `accounting/journal-entries`, `accounting/factoring-advances`, `banking/transactions`, `banking/manual-je`, `qbo-sync/*`. Backed by tests (`apps/backend/src/middleware/__tests__/idempotency.test.ts`). Evidence's claim of "no evidence found" is stale.
- No further action.

### 0243-g4-tx1-source-gl-two-transactions_DISPATCH  [dispatch]  GATED? n/a
- STATE: UNVERIFIABLE — evidence itself states no matching code/pattern was located for "source GL two transactions" within available time. No concrete claim to re-verify; recommend re-deriving with a specific file/line before ticketing.

### 0243-g9-h4-load-status-advisory-not-enforced  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** — `validateLoadStopStatusWrite()` (`apps/backend/src/dispatch/load-state-machine.ts:87`) is actively called and enforced (not advisory) at `apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts:319,385` and `apps/backend/src/driver/loads.routes.ts:473,533` — both arrival and departure endpoints block invalid transitions. The "advisory not enforced" premise is refuted on current main.
- No further action.

### 0243-g9-m-eight-workflow-status-defects  [dispatch]  GATED? yes (auto-pay/escrow-wiring/mark_factored are financial)
- STATE: STILL-OPEN (partial) — PR #2131 fixed load-number-500 and the bulk `set_status` emit-only defect; its own commit message explicitly defers auto-pay wiring, escrow wiring, and `mark_factored` as financial work requiring separate gated PRs. Those three remain open.
- FILES: search for `mark_factored`, auto-pay hooks, and escrow-wiring call sites left as TODO/deferred near the bulk status-change path (dispatch board bulk actions).
- FIX STEPS:
  1. Locate the exact TODO/deferred markers PR #2131 left (grep its diff/commit for "defer").
  2. Design doc (gated, per finance directive) for auto-pay-on-delivery and mark_factored wiring.
  3. Implement using existing settlement/escrow posting functions — no new GL math.
- GUARD: add pinning tests for each of the 3 deferred behaviors once implemented.

### 0243-h3-2-three-posting-flags-unprotected_DISPATCH  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** — `apps/backend/src/lib/feature-flags/routes.ts` gates every write route (`POST /api/feature-flags`, `PATCH /api/feature-flags/:flag_key`, `POST/DELETE /api/feature-flags/overrides`) behind `ownerUser(req, reply)`, PLUS a posting-flag-specific defense-in-depth (`isPostingFlag(flagKey) && wantsGlobalEnable` → 400 `posting_flag_global_enable_forbidden`, lines 117-125) forcing per-entity-only overrides for posting flags. Evidence's "cannot confirm state either way" is resolved — flags are protected.
- No further action.

### 0243-h6-1-qbo-refresh-token-race  [dispatch]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/integrations/qbo/qbo-oauth.service.ts:490` `refreshAccessToken()` has no `pg_advisory_lock`/mutex; grep for `advisory_lock|mutex|lock(` near it returns nothing. The hourly cron and an on-demand `getValidAccessToken()` (line 569) can both call `refreshAccessToken` concurrently, and QBO refresh tokens are one-time-use — a race invalidates one caller's token.
- FILES: `apps/backend/src/integrations/qbo/qbo-oauth.service.ts:490-570`
- FIX STEPS:
  1. Wrap `refreshAccessToken()` body in `pg_advisory_xact_lock(hashtext(connectionId))` (or a Redis lock, matching existing outbox/lock patterns in the repo).
  2. On lock-miss, re-read the connection row — another caller may have already refreshed it — and use that token instead of refreshing again.
  3. Add a concurrency test (two simultaneous calls, assert only one network refresh happens).
- GUARD: the concurrency test above; optionally a static guard requiring `refreshAccessToken` body to contain a lock acquisition call.

### 0251-gap10-commodity-product-catalog  [dispatch]  GATED? yes (new catalogs.* table + migration)
- STATE: STILL-OPEN — confirmed no commodity/product catalog table exists anywhere in `db/migrations` or backend routes.
- FILES: new `db/migrations/*_commodity_catalog.sql`; new `apps/backend/src/catalogs/commodities.routes.ts`
- FIX STEPS: 1) Design doc + Jorge sign-off (new financial-adjacent catalog). 2) Migration: `catalogs.commodities` (code, description, hazmat flag, default weight class). 3) CRUD routes + "+ Create" inline-add UI per product-lock vocab.
- GUARD: `scripts/verify-commodity-catalog-wired.mjs` once built.

### 0251-gap12-commodity-equipment-mapping  [dispatch]  GATED? yes (new catalogs.* table + migration)
- STATE: STILL-OPEN — confirmed no commodity↔equipment mapping table or route exists.
- FILES/FIX STEPS: depends on `gap10` landing first (commodity catalog must exist before a mapping table references it); then a `catalogs.commodity_equipment_map` table + routes.
- GUARD: pending build.

### 0251-gap13-commodity-rate-matrix  [dispatch]  GATED? yes (new accounting/catalogs table + migration)
- STATE: STILL-OPEN — confirmed no rate_matrix or commodity-rate table/route exists anywhere in the repo.
- FILES/FIX STEPS: depends on `gap10`; design a `catalogs.commodity_rate_matrix` (lane × commodity × rate) once the commodity catalog exists.
- GUARD: pending build.

### 0251-gap16-charge-code-catalog  [dispatch]  GATED? yes (new catalogs.* table + migration)
- STATE: STILL-OPEN — confirmed `accounting.invoice_lines.line_type` is a fixed `CHECK` enum (10 values, e.g. `0060_p3_t11_20_1_accounting_invoices_schema.sql:65`), not an editable charge-code catalog table.
- FILES: `db/migrations/0060_p3_t11_20_1_accounting_invoices_schema.sql` (current CHECK); new migration for `catalogs.charge_codes`
- FIX STEPS: 1) Design doc (gated — touches `accounting.invoice_lines`). 2) Migration adding `catalogs.charge_codes` + FK from `invoice_lines.line_type`-replacement column, migrating existing CHECK values as seed rows. 3) CRUD UI with inline "+ Add new charge code."
- GUARD: pending build.

### 0251-gap17-charge-code-default-rates  [dispatch]  GATED? yes (depends on gap16)
- STATE: STILL-OPEN — no charge-code catalog exists yet, so no default-rate field/table either (same root cause as gap16).
- FIX STEPS: add `default_rate_cents` column to the `catalogs.charge_codes` table built for gap16 — same PR.
- GUARD: pending build.

### 0251-gap21-stop-location-catalog  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** (false-positive finding) — `mdata.locations` (`0008_mdata_init.sql`) exists, `mdata.load_stops.location_id` FKs to it (`0034_loads_schema.sql:67`), and is joined/used throughout (`0036_locations_expansion.sql`). The stop-location catalog already exists and is in active use.
- No further action.

### 0251-gap5-chargecode-gl-mapping_DISPATCH  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** (false-positive finding) — `apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts` implements real charge-line→GL mapping: `deriveRevenueCode()` maps every `line_type` (linehaul/fsc/detention/layover/lumper/tonu/accessorial/tax/adjustment/other) to a `revenue_code`, then `resolveInvoiceLineRevenueAccountId()` calls `resolveAccountForCategory(operating_company_id, "revenue", revenue_code)` to get a real `account_id`. Has test coverage (`invoice-line-revenue-resolution.test.ts`). The mapping exists and works.
- No further action.

### 0251-gap9-charge-line-audit-trail  [dispatch]  GATED? yes (accounting.invoice_lines)
- STATE: STILL-OPEN
- ROOT CAUSE: `accounting.invoice_lines` only has `soft_deleted_at`/`soft_deleted_by` (added by `202606271580_inv2_accounting_soft_delete.sql`) — no field-level change-history/audit-chain table records prior values when a charge line's amount/type/description is edited.
- FILES: `db/migrations/202606271580_inv2_accounting_soft_delete.sql`; new migration for line-level audit
- FIX STEPS: 1) Confirm whether the generic `audit.row_changes` append-only table already captures `accounting.invoice_lines` UPDATE diffs (check its trigger coverage) before building anything new — CLAUDE.md §2 requires every table get audit; if `audit.row_changes` already covers it via a generic trigger, this finding may already be moot. 2) If not covered, add the table to the audit-trigger coverage list (no new bespoke audit table needed — reuse `audit.row_changes`).
- GUARD: `scripts/verify-audit-row-changes-coverage.mjs` (or extend existing coverage guard) asserting `accounting.invoice_lines` has an audit trigger.

### 0270-no-auto-driver-termination-walkoff-noshow  [dispatch]  GATED? yes (mdata.drivers status write, intersects escrow/settlement)
- STATE: STILL-OPEN
- ROOT CAUSE: `dispatch/loads.routes.ts` fires escrow events on `driver_walkoff`/`driver_no_show` (via `emitAutoProposedEscrowEvents`), but there is no hook from that load-status transition into the driver termination workflow (`mdata.drivers.status = 'Terminated'`, set only manually via `workflow-routes.ts:350`). The link from load event → driver record is one-way (load references driver, not vice versa for lifecycle consequences).
- FILES: `apps/backend/src/dispatch/loads.routes.ts` (transition handler, near `emitAutoProposedEscrowEvents` call); `apps/backend/src/mdata/workflow-routes.ts:350`
- FIX STEPS:
  1. Design doc (gated — HR/compliance + money consequence): should walkoff/no-show auto-terminate, or just flag-for-review? (Jorge decision — driver model note: drivers are 1099 contractors, termination has contract implications.)
  2. If approved: call the existing `Terminated` status-set logic from the load transition handler when status becomes `driver_walkoff`/`driver_no_show`, reusing `workflow-routes.ts`'s update pattern (not duplicating it).
  3. Ensure this doesn't fire twice (idempotent — check current status first).
- GUARD: `scripts/verify-walkoff-noshow-termination-hook.mjs` asserting the load transition handler calls the driver-termination path.

### 0280-03-open-loads-driver-unit-linkage  [dispatch]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `getOpenLoadsBreakdown()` (`apps/backend/src/dispatch/active-loads-count.ts:83-84`) uses `assigned_primary_driver_id` for assigned/unassigned counts but has zero reference to `assigned_unit_id`/equipment — no unit-linkage breakdown on the open-loads dashboard tile.
- FILES: `apps/backend/src/dispatch/active-loads-count.ts`
- FIX STEPS: 1) Add a parallel `assigned_unit_id IS NOT NULL/NULL` count alongside the existing driver counts. 2) Surface both breakdowns in the dashboard tile UI. 3) Add drill-through link to the unassigned-unit loads list.
- GUARD: `scripts/verify-open-loads-breakdown-has-unit-dimension.mjs`.

### 0280-12-message-queue-driver-customer-linkage  [dispatch]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `loadIncomingMessageQueue()` (`apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts:304-333`) joins `mdata.driver_profile_messages` → `mdata.drivers` → `mdata.loads` (driver+load only) — no customer join. `DispatcherHome.tsx` renders `incomingMessageQueue={data?.pending_actions.incoming_message_queue ?? 0}` as a raw count with no `Link`/drill-through to the underlying messages.
- FILES: `apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts:304-333`; `apps/frontend/src/pages/home/roles/DispatcherHome.tsx:33,106`
- FIX STEPS: 1) Add `JOIN mdata.loads l2 ... mdata.customers c` (or reuse existing customer join pattern) to attribute each queued message to a customer. 2) Make the dashboard tile a link to a filtered message-queue view (cross-module linkage rule — no dead-end counts).
- GUARD: `scripts/verify-dashboard-tiles-have-drillthrough.mjs` (or extend existing dashboard-linkage guard) to include this tile.

### 0280-20-cooling-drivers-last-load-linkage  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** (false-positive finding) — `dm-home.service.ts` cooling-drivers query (lines ~280-330) already correctly `LEFT JOIN`s an `mdata.loads` `load_activity` subquery to compute `days_idle` per driver, filters `days_idle >= 14`, and surfaces it as a home-page KPI item. The linkage exists and is used.
- No further action.

### 0394-qbo-transaction-pull-missing_DISPATCH  [dispatch]  GATED? yes (accounting.qbo_* mirror / QBO sync)
- STATE: STILL-OPEN — confirmed with a concrete gap (evidence was truncated; verified the actual missing set).
- ROOT CAUSE: The ongoing incremental sync `CDC_ENTITIES` (`apps/backend/src/integrations/qbo/qbo-cdc.service.ts:6-7`) = `Invoice,Bill,Payment,BillPayment,JournalEntry,CreditMemo,Customer,Vendor,Item,Account`. The one-time `forensic-import.service.ts:33-45` `TXN_TYPES` pulls a much richer set: `Bill, Invoice, Payment, JournalEntry, Transfer, Deposit, Expense, Check, CreditCardCharge, BillPayment, VendorCredit, CreditMemo, RefundReceipt, SalesReceipt` (plus `ENTITY_TYPES` includes `Class`). **`Transfer`, `Deposit`, `Expense`, `Check`, `CreditCardCharge`, `RefundReceipt`, `SalesReceipt`, and `Class` are captured only once during the initial forensic import and never synced again** — any of those transaction types created in QBO after go-live will silently never appear in the mirror.
- FILES: `apps/backend/src/integrations/qbo/qbo-cdc.service.ts:6-7`; translators under `apps/backend/src/integrations/qbo/translators/` (some already exist for `expense.ts`, `payment.ts`, `bill_payment.ts` — reuse them)
- FIX STEPS:
  1. Add the missing entity types to `CDC_ENTITIES`.
  2. For each newly-added type, confirm a translator exists (expense/payment translators already do; Transfer/Deposit/Check/CreditCardCharge/RefundReceipt/SalesReceipt need translators or explicit reuse of an existing one).
  3. Backfill a one-time catch-up pull for anything created in QBO since go-live but before this fix ships.
- GUARD: `scripts/verify-qbo-cdc-entities-match-forensic-import.mjs` — fails if `CDC_ENTITIES` is missing any type present in `forensic-import.service.ts`'s `TXN_TYPES`/`ENTITY_TYPES`.

### 0441-mod10-cashflow-income-loadid-plaintext  [dispatch]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `EarningsSection.tsx:26` renders `<td className="py-1">{line.id}</td>` under a "Load" column header — raw text, no `Link`/drill-through to the load record.
- FILES: `apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx:24-27`
- FIX STEPS: 1) Wrap `line.id` in a `<Link to={`/dispatch/loads/${line.id}`}>` (or the app's load-detail route). 2) Confirm `line.id` is actually the load id (not settlement-line id) before wiring — verify against the caller that builds `Line[]`.
- GUARD: `scripts/verify-driver-finance-earnings-load-link.mjs`.

### 0441-mod11-dispatch-margin-cash-500  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** — `apps/backend/src/reports/dispatch-margin.routes.test.ts` (CODER-14) is a live regression test titled "settlement_lines.load_id 500-safety," asserting `GET .../dispatch-margin` returns 200 (not a 42703 500) when `settlement_lines.load_id` is absent. The fix and its guard are both present.
- No further action.

### 0441-mod11-profit-per-truck-cron-double-count  [dispatch]  GATED? yes (financial correctness — profit figures shown to owner)
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/reports/queries/profit-per-truck-weekly.ts` does `mdata.units u LEFT JOIN mdata.loads l ON ... LEFT JOIN maintenance.work_orders wo ON ...` in a single query, then `SUM(...)` over both joined sets in one `GROUP BY u.id`. This is a classic fan-out join: if a unit has N loads and M work orders in the 7-day window, the join produces N×M rows, so `revenue_cents` gets summed M times too many and `wo_cost_cents` gets summed N times too many.
- FILES: `apps/backend/src/reports/queries/profit-per-truck-weekly.ts`
- FIX STEPS:
  1. Split into two pre-aggregated CTEs: `load_revenue AS (SELECT unit_id, SUM(rate_total_cents) ... FROM mdata.loads ... GROUP BY unit_id)` and `wo_cost AS (SELECT unit_id, SUM(total_actual_cost) ... FROM maintenance.work_orders ... GROUP BY unit_id)`.
  2. `LEFT JOIN` both CTEs to `mdata.units` (1:1 now, no fan-out) and combine.
  3. Add a regression test with a unit that has ≥2 loads AND ≥2 work orders in the same window, asserting revenue/cost are NOT multiplied.
- GUARD: the regression test above, run in CI.

### 0441-mod12-docs-lowest-uuid-company-bug-live  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** — `apps/backend/src/docs/files.routes.ts` upload schema accepts an explicit `operating_company_id` in the body (line 55), validates the caller has access to it (line 196-199, throws `operating_company_id_forbidden` on failure), and only falls back to `resolveOperatingCompanyId()`'s (lowest-UUID) default when the caller doesn't pass one explicitly (line 201). The live-bug path from the memory note (`docs-upload-lowest-uuid-company-trap.md`) is closed on current main.
- No further action (memory note should be marked resolved).

### 0441-mod13-coa-merge-no-gl-repoint_DISPATCH  [dispatch]  GATED? n/a
- STATE: UNVERIFIABLE / not applicable — no CoA-merge / account-merge functionality (code, migration, or route) exists anywhere in the repo. There is nothing to have a GL-repoint bug, because the merge feature itself was never built. Not a ticket until/unless a CoA-merge feature is designed.

### 0441-mod13-load-cancellation-reasons-split-bra  [dispatch]  GATED? yes (catalogs.* schema, dispatch.load_cancellations)
- STATE: STILL-OPEN — confirmed a real split-brain, more precise than the truncated evidence suggested.
- ROOT CAUSE: TWO separate cancellation-reason catalogs exist. The write path — `cancellation.service.ts:48` (called by `cancel-load.routes.ts`, used by `CancelLoadModal.tsx`) — validates and stores `reason_code` against `catalogs.load_cancellation_reasons` (company-scoped, migration `0035_load_cancellation_reasons.sql`). But BOTH reporting routes — `apps/backend/src/dispatch/cancellations-report.routes.ts:71` and `apps/backend/src/dispatch/load-cancellations-analytics.routes.ts:102` — `LEFT JOIN catalogs.cancellation_reasons` (a DIFFERENT, fixed 9-code enum catalog from migration `0101_p5_f4_cancellation_reasons.sql`) to resolve the reason label. If a company's `load_cancellation_reasons` codes don't match the `0101` catalog's fixed codes (`CUSTOMER_CANCELLED`, `DRIVER_ISSUE`, etc.), the reporting JOIN silently returns NULL labels for real, correctly-recorded cancellations.
- FILES: `apps/backend/src/dispatch/cancellation.service.ts:48`; `apps/backend/src/dispatch/cancellations-report.routes.ts:71`; `apps/backend/src/dispatch/load-cancellations-analytics.routes.ts:102`; catalogs `0035_load_cancellation_reasons.sql` vs `0101_p5_f4_cancellation_reasons.sql`
- FIX STEPS:
  1. Decide the canonical catalog (design/Jorge call — likely `catalogs.cancellation_reasons` per `cancel-load.routes.ts`'s own comment calling it "the single source of truth").
  2. Migration (gated): backfill/repoint `catalogs.load_cancellation_reasons` codes to match `catalogs.cancellation_reasons`, or repoint `cancellation.service.ts`'s validation query to the `0101` table instead.
  3. Fix both reporting routes to JOIN the SAME table the write path validates against.
  4. Add a data-integrity check for any existing `dispatch.load_cancellations.reason_code` rows that don't resolve in the canonical catalog.
- GUARD: `scripts/verify-load-cancellation-reasons-single-catalog.mjs` — fails if the write-validation query and the reporting JOIN queries reference different catalog tables.

### 0441-mod4-dispatch-cancel-bypasses-approval-ga  [dispatch]  GATED? yes (void/cancel governance — Owner/Admin gated, reason-required per standing policy)
- STATE: STILL-OPEN
- ROOT CAUSE: `PATCH /api/v1/dispatch/loads/:id/transition` (`apps/backend/src/dispatch/loads.routes.ts:1192-1235`) allows a direct transition to `'cancelled'` for multiple source states (`unassigned`, `assigned_not_dispatched`, `dispatched`, `in_transit`, `delivered_pending_docs` — see `allowedTransitions` object around line 367-373) via a bare `UPDATE mdata.loads SET status = $2 WHERE id = $1` — no `cancel_reason_code`, no owner-approval check (`requires_owner_approval`), and no `dispatch.load_cancellations` audit row. This completely bypasses `cancelLoad()`/`cancellation.service.ts`'s reason-required + owner-approval gate that the dedicated `/cancel` endpoint enforces.
- FILES: `apps/backend/src/dispatch/loads.routes.ts:1192-1235` (the generic `/transition` route)
- FIX STEPS:
  1. In the `/transition` handler, when `targetStatus === "cancelled"`, reject the request (400) and require callers to use `POST /api/v1/dispatch/loads/:id/cancel` instead — OR internally delegate to `cancelLoad()`/`cancellation.service.ts` so the same reason+approval gate applies regardless of entry point.
  2. Add a regression test hitting `/transition` with `new_status: "cancelled"` and asserting it's rejected (or routed through the gate) with no direct `mdata.loads` status flip.
- GUARD: `scripts/verify-load-transition-cannot-bypass-cancel-gate.mjs` — statically asserts the `/transition` handler does not set `status = 'cancelled'` without calling the cancellation service.

### 0441-mod4-dispatch-cancellation-reasons-decoy-  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** (false-positive finding, on the write side) — `CancelLoadModal.tsx` dynamically loads reasons via `listDispatchCancellationReasons()` (a real API call to the catalog `cancellation.service.ts` reads from), sends `cancel_reason_code` (line 81), and `cancellation.service.ts` persists it to `dispatch.load_cancellations` after validating against `catalogs.load_cancellation_reasons` — this path is fully wired, not decorative. (Note: the REAL bug in this area is on the reporting/read side — see `0441-mod13-load-cancellation-reasons-split-bra` above.)
- No further action on this specific ticket.

### 0441-mod4-dispatch-chat-no-attachment-upload  [dispatch]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `DispatchChatPage.tsx`/`apps/frontend/src/api/chat.ts` has no `FormData`/file-`<input>`/upload call anywhere. `ChatMessage.msg_type` includes `"photo"`/`"document"` values, but nothing in the UI can ever produce a message with those types — they're decorative/dead code paths.
- FILES: `apps/frontend/src/pages/chat/DispatchChatPage.tsx`; `apps/frontend/src/api/chat.ts`
- FIX STEPS:
  1. Add a file-picker + `FormData` upload to the chat composer, reusing the existing R2/docs upload pipeline (`apps/backend/src/docs/files.routes.ts` pattern) rather than building a new one.
  2. Backend: new/extended chat-message route accepting an attachment reference (docs table id), storing `msg_type: "photo"|"document"` with a real payload.
  3. Render the attachment (image preview / document link) in the message thread.
- GUARD: `scripts/verify-dispatch-chat-attachment-upload-wired.mjs` — fails if `msg_type` includes photo/document but no upload call exists in the composer.

### 0441-mod4-dispatch-detention-in-shop-hardcoded  [dispatch]  GATED? n/a
- STATE: **ALREADY-FIXED** (false-positive finding) — "In shop" is driven by the real `listDispatchInShopUnits()` API call (`DispatchBoard.tsx:38,419`), and "detention" is a real, API-sourced `driver_lifecycle_stage` value (`DispatchBoard.tsx:735-743`, one of an explicit enumerated set including `detention`, `hos_break`, `accident`, `breakdown`, etc.) — not a hardcoded string.
- No further action.

# bb_4 Build Tickets — re-verified against `origin/main` @ 52bae3a (2026-07-19)

43 STILL-OPEN (31 GATED / 12 non-gated) · 6 ALREADY-FIXED · 0 UNVERIFIABLE

---

### 0441-mod4-dispatch-mapview-no-real-map  [dispatch]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `MapView.tsx` renders an honest "Map provider not configured" empty state whenever `isDispatchMapProviderConfigured()` is false — no Mapbox (or other) map ever renders, GPS positions are fetched but never plotted.
- FILES: `apps/frontend/src/pages/dispatch/MapView.tsx`, `apps/frontend/src/lib/dispatch-map-provider.ts`
- FIX STEPS:
  1. Add a Mapbox (or chosen provider) access-token env var + wire `isDispatchMapProviderConfigured()` to check it.
  2. Add a real map component (e.g. `react-map-gl`/`mapbox-gl`) rendering `positions` as markers, focused via `focusLoadId`/`focusDriverId`.
  3. Keep the existing honest-empty branch as the `!mapConfigured` fallback (don't delete it — additive-only).
- GUARD: new `scripts/verify-dispatch-map-provider-wired.mjs` asserting a real map library import + marker-render call exists when the provider flag path is exercised (self-test both configured/unconfigured branches).

---

### 0441-mod5-onboarding-step-data-only  [dispatch]  GATED? yes (writes `mdata.units`/`mdata.drivers`)
- STATE: STILL-OPEN
- ROOT CAUSE: `onboarding.routes.ts` merges the `vehicle_assignment` step's payload into `identity`/onboarding `step_data` jsonb only; no query ever writes `mdata.units` or `mdata.drivers.assigned_primary_driver_id`.
- FILES: `apps/backend/src/safety/onboarding.routes.ts`
- FIX STEPS:
  1. In the `vehicle_assignment` step handler, after the `step_data` merge (~line 166-174), parse the assigned unit/driver ids from `body.data.step_data`.
  2. `UPDATE mdata.drivers SET assigned_primary_driver_id ...` — actually the assignment likely lives on `mdata.units.assigned_driver_id` (verify column name against `db/migrations/` before writing SQL, per §4) and mirror onto the driver record if a reciprocal column exists.
  3. Wrap in the same `withCurrentUser` transaction as the step_data write so it's atomic; add `appendCrudAudit`.
- GUARD: `scripts/verify-onboarding-vehicle-assignment-writes-mdata.mjs` — asserts the vehicle_assignment step handler contains an `UPDATE mdata.units`/`mdata.drivers` statement, not just a step_data merge.

---

### 0441-mod7-invoices-plaintext-audit-log_DISPATCH  [dispatch]  GATED? no
- STATE: ALREADY-FIXED — `InvoiceDetailPage.tsx:325` navigates to `/accounting/audit-trail?source_type=invoice&source_id=...`, and that route is registered live at `apps/frontend/src/routes/manifest.tsx:3589`.

---

### 0441-mod7-je-rows-no-onclick_DISPATCH  [dispatch]  GATED? no
- STATE: ALREADY-FIXED — `ManualJEListPage.tsx:163` `onRowClick={(entry) => navigate(\`/accounting/journal-entries/${entry.id}\`)}` is present and wired.

---

### 0441-mod9-merge-vendors-no-gl-repoint_DISPATCH  [dispatch]  GATED? yes (accounting.bills / GL)
- STATE: STILL-OPEN
- ROOT CAUSE: `createDriverVendorMerge` (`data-infra.service.ts`) only writes `mdata.driver_vendor_merges` + optionally repoints `mdata.drivers.qbo_vendor_id`; it never touches any bill already posted against the old vendor — GL-linked bills stay pointed at the pre-merge vendor.
- FILES: `apps/backend/src/data-infra/data-infra.service.ts`
- FIX STEPS:
  1. After the `mdata.drivers.qbo_vendor_id` UPDATE (~line 88), query `accounting.bills` for open/unpaid bills keyed to `from_qbo_vendor_id` for this driver/company.
  2. Repoint those bills' vendor reference to `to_qbo_vendor_id` (or mark them for reconcile re-match, per the parallel-books/reconcile-only architecture — do NOT invent new GL postings).
  3. Extend the `appendCrudAudit` call to record how many bills were repointed.
  4. Never do this outside a Jorge-reviewed migration/PR — this is financial-cluster.
- GUARD: `scripts/verify-vendor-merge-repoints-bills.mjs` — asserts `createDriverVendorMerge` contains an `accounting.bills` UPDATE/repoint step, not just the `mdata.drivers` pointer.

---

### 0441-mod9-quality-history-cant-attach-load-inv  [dispatch]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: Backend `customer-quality-events.routes.ts` accepts `related_load_id`/`related_invoice_id` (both present, inserted into `0026_customer_quality_flags.sql`'s table), but `CustomerDetail.tsx`'s create-quality-event form (`qualityForm` state, ~line 400-807) has no load/invoice picker field.
- FILES: `apps/frontend/src/pages/CustomerDetail.tsx`, `apps/backend/src/mdata/customer-quality-events.routes.ts` (reference only)
- FIX STEPS:
  1. Add `related_load_id`/`related_invoice_id` to `qualityForm` state.
  2. Add a load picker (reuse existing load-search combobox) and invoice picker (reuse `EntityLink`/invoice search) to the quality-event modal.
  3. Pass both through the `createCustomerQualityEvent` mutation call (~line 800-807).
- GUARD: `scripts/verify-quality-event-form-has-load-invoice-pickers.mjs` — greps `CustomerDetail.tsx` quality form for both field names.

---

### 0473-2-4-ap-aging-partial-mismatch_DISPATCH  [dispatch]  GATED? yes (accounting.bills, AP aging)
- STATE: STILL-OPEN
- ROOT CAUSE: `fin20-aging.service.ts:401` filters `b.status IN ('unpaid', 'partial')`, but the real write paths (`bills.service.ts:183`, `vendor-bill-payments.routes.ts:42`, `ap/payment-application.routes.ts:34`, `bill-payments/cc-payment.routes.ts:22`) all set bill status to `'partially_paid'`, not `'partial'` — partially paid bills are silently excluded from AP aging once the feature flag is enabled.
- FILES: `apps/backend/src/accounting/fin20-aging.service.ts`
- FIX STEPS:
  1. Change line 401 to `AND b.status IN ('unpaid', 'partial', 'partially_paid')` (mirror the existing `OPEN_BILL_STATUSES` pattern already used in `bank-recon/match.service.ts:185`).
  2. Cross-check every other AP-aging status filter in the same file for the same drift.
  3. Add a unit test seeding a `partially_paid` bill and asserting it appears in the aging buckets.
- GUARD: `scripts/verify-ap-aging-status-set-matches-write-paths.mjs` — statically diffs the set of bill statuses written across `accounting/*.ts` against the set read by `fin20-aging.service.ts`; fails on any write-status not covered by a read-filter.

---

### 0490-critical-users3-owner-mint-approval-path  [dispatch]  GATED? no (security-critical — flag for Jorge anyway)
- STATE: STILL-OPEN
- ROOT CAUSE: `identity/workflow-routes.ts` decide-route gates ALL workflow decisions (including `WF-064-IDENT-002` role-change) behind `isAdminRole()` (`role === "Owner" || role === "Administrator"`, line 75-77) — no additional check that granting the **Owner** role specifically requires the *caller* to already be Owner. An Administrator can approve a WF-064-IDENT-002 request that mints another user to Owner.
- FILES: `apps/backend/src/identity/workflow-routes.ts`
- FIX STEPS:
  1. In the `WF-064-IDENT-002` branch (~line 304-312), after `extractToRole(workflow.payload)`, add: if `toRole === "Owner" && authUser.role !== "Owner"` → return `{ error: "owner_grant_requires_owner_approver" }`.
  2. Return a 403 for that error in the route handler.
  3. Add a regression test: Administrator attempts to approve a to-Owner role-change request → rejected.
- GUARD: `scripts/verify-owner-role-grant-requires-owner-approver.mjs` — statically asserts the WF-064-IDENT-002 branch contains an Owner-caller check before the `UPDATE identity.users SET role`.

---

### 0490-new3-c2-1-detectitemsdrift-scoping  [dispatch]  GATED? yes (catalogs.items)
- STATE: STILL-OPEN
- ROOT CAUSE: `drift-detector.ts`'s `detectItemsDrift` `missingQbo` query (~line 172-179) selects from `catalogs.items` with no `operating_company_id` filter — even though the function receives `operatingCompanyId` and uses it for `insertDrift`, the SELECT itself is unscoped, so cross-entity items can be misattributed as this entity's drift.
- FILES: `apps/backend/src/qbo-sync/drift-detector.ts`
- FIX STEPS:
  1. Add `AND operating_company_id = $1` to the `missingQbo` query, passing `operatingCompanyId` as `$1`.
  2. Verify RLS doesn't already silently scope this (it likely doesn't — the sibling `missingLocal` query below explicitly filters `qi.operating_company_id = $1::uuid`, proving the pattern is known but wasn't applied here).
  3. Re-run against a two-entity fixture to confirm TRK items no longer surface as TRANSP drift.
- GUARD: `scripts/verify-cross-entity-leak-audit.mjs` (or extend it) — add `detectItemsDrift`'s `missingQbo` query to the known cross-entity-leak audit's checked list.

---

### 0490-section-c-2-reporting-vs-reports-drift  [dispatch]  GATED? no (doc/CI-guard consistency — flag per §9, don't silently pick)
- STATE: STILL-OPEN — genuine, confirmed contradiction
- ROOT CAUSE: `docs/lockdown/00_LOCKED_DECISIONS.md:126` (§9.6) declares `reporting.*` canonical ("migrate `reports.*` rows in, archive the old"). `scripts/verify-no-deprecated-schema-creates.mjs:9,25` declares the OPPOSITE — its own header comment says "reporting (reports 8 vs 2)" (i.e. `reports` has more tables) and its `DEPRECATED` array lists `"reporting"` as the deprecated twin, blocking new `CREATE TABLE reporting.*`.
- FILES: `docs/lockdown/00_LOCKED_DECISIONS.md`, `scripts/verify-no-deprecated-schema-creates.mjs`
- FIX STEPS: **Do not silently resolve.** Surface to Jorge: "`00_LOCKED_DECISIONS.md` §9.6 says `reporting.*` is canonical; the CI guard's own table-count comment says `reports` (8 tables) is canonical and `reporting` (2 tables) is deprecated — which one is real?" Once ruled:
  1. If `reports.*` is canonical: update §9.6 to correct the direction (migrate `reporting.*` into `reports.*`).
  2. If `reporting.*` is canonical: remove `"reporting"` from the guard's `DEPRECATED` array and add `"reports"` instead (re-run `--write-baseline`).
- GUARD: none until the decision lands — this IS the guard-vs-doc consistency gap; add a one-line cross-check script (`verify-canonical-schema-doc-matches-guard.mjs`) once resolved, so the two can never diverge again.

---

### 0519-lg1-5-nullable-financial-columns_DISPATCH  [dispatch]  GATED? yes (accounting.* DDL, migration)
- STATE: STILL-OPEN
- ROOT CAUSE: `docs/specs/db-integrity-hardening-0519.md` LG1 itself says "not-built"; confirmed no `SET NOT NULL` exists anywhere in `db/migrations/` for any of the 5 named columns.
- FILES: new migration under `db/migrations/`; targets `accounting.bill_lines.account_id`, `accounting.bill_payments.amount_cents`, `accounting.bills.amount_cents`, `accounting.invoice_lines.account_id`, `accounting.vendor_balances.operating_company_id`
- FIX STEPS (per the spec doc's own approach, owner-gated):
  1. Prod pre-check: `SELECT count(*) FROM <table> WHERE <col> IS NULL` for each of the 5 — do NOT guess.
  2. If 0 NULLs and no legitimate NULL seed path: idempotent migration, `DO` block asserting 0 NULLs before `ALTER COLUMN ... SET NOT NULL` (skip gracefully if not 0, so fresh-DB CI stays green).
  3. If NULLs exist: owner-decided backfill/quarantine per column BEFORE the constraint.
  4. Never widen a shipped NOT NULL back to nullable.
- GUARD: `scripts/verify-financial-notnull-columns.mjs` (named in the spec doc, does not yet exist) — asserts the migration contains `SET NOT NULL` for each of the 5 columns and fails if any is ever loosened.

---

### P4-01_SAFETY-INSURANCE-LINK_DISPATCH  [dispatch]  GATED? yes (HELD migration, accounting/insurance FK)
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/202607250000_phase4_crossmodule_fks.sql` (adds `safety.accident_reports.insurance_claim_id` FK) is listed in `.held-migrations.json` with no `applied_on_prod: true` flag — confirmed NOT run on prod. Backfill/resolver/route wiring is separately deferred per the hold entry's own note.
- FILES: `db/migrations/202607250000_phase4_crossmodule_fks.sql`, `.held-migrations.json`
- FIX STEPS: Owner applies the held migration on a Neon branch → ledger-backfill → then build the deferred backfill/resolver/route wiring for `safety.accident_reports.insurance_claim_id` as its own PR.
- GUARD: existing GUARD-verified 0-orphan check in the migration itself; add `verify-hold-migrations-registered` coverage confirmation (should already cover this file — re-run to confirm still green).

---

### P4-02_LEGAL-LINK_DISPATCH  [dispatch]  GATED? yes (HELD migration, legal FK)
- STATE: STILL-OPEN
- ROOT CAUSE: Same held batch `202607250000_phase4_crossmodule_fks.sql` (adds `legal.matters.{insurance_claim_id,insurance_lawsuit_id,incident_id,unit_id}`), not applied on prod per `.held-migrations.json`.
- FILES: `db/migrations/202607250000_phase4_crossmodule_fks.sql`
- FIX STEPS: Owner applies on Neon branch → ledger-backfill → build the deferred `legal.matters` resolver + route wiring for the 4 new FK columns.
- GUARD: same migration's built-in 0-orphan check; confirm `legal.matters` UI surfaces the new links once wired.

---

### P4-03_UNIT-IDENTITY_DISPATCH  [dispatch]  GATED? yes (HELD migration, mdata FK)
- STATE: STILL-OPEN
- ROOT CAUSE: Same held batch (`mdata.assets.unit_id` FK to `mdata.units`), not applied on prod. Per-unit cost reconciliation via the bridge unproven.
- FILES: `db/migrations/202607250000_phase4_crossmodule_fks.sql`
- FIX STEPS: Owner applies on Neon branch → ledger-backfill → build a per-unit cost reconciliation report/query proving `mdata.assets` ↔ `mdata.units` cost roll-up is correct.
- GUARD: migration's own 0-orphan check; add a reconciliation report guard once built.

---

### P4-04_SAFETY-COST-GL_DISPATCH  [dispatch]  GATED? yes (new GL posting code)
- STATE: STILL-OPEN
- ROOT CAUSE: No journal-entry/posting code exists anywhere under `apps/backend/src/insurance` or `apps/backend/src/safety` for claim payout/settlement/legal-fee. The only `journal_entry_id` references in `insurance/policy-cancel.service.ts` and `insurance/refund-obligation.service.ts` are for policy-cancellation UNEARNED-PREMIUM refunds — an unrelated flow. `insurance/claim.routes.ts` has zero posting code.
- FILES: `apps/backend/src/insurance/claim.routes.ts` (new posting call site), reuse existing posting engine (never write new GL math per §2)
- FIX STEPS:
  1. Design doc first (per Constitution §1.4 — never build finance/posting solo): define DR/CR legs for claim payout/settlement/legal-fee against the existing chart-of-accounts roles.
  2. Add a `SAFETY_INSURANCE_COST_GL_POSTING_ENABLED` flag (default OFF, per-entity) via migration.
  3. Call the EXISTING journal-entry poster (do not write new GL math) from the claim-settlement route, gated behind the flag.
- GUARD: `scripts/verify-claim-settlement-posts-balanced-je.mjs` — once built, asserts every claim-settlement JE call site produces balanced DR=CR lines.

---

### P4-05_DAMAGE-CLAIM-FK_DISPATCH  [dispatch]  GATED? yes (HELD migration)
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/202607240000_incidents_auto_claim_fk.sql` (`safety.incidents.auto_created_claim_id -> insurance.claim`) is HELD in `.held-migrations.json` with no `applied_on_prod` flag — confirmed not run.
- FILES: `db/migrations/202607240000_incidents_auto_claim_fk.sql`
- FIX STEPS: Owner applies on Neon branch (NOT VALID + `VALIDATE` step per the migration's own design) → ledger-backfill.
- GUARD: migration's built-in 0-orphan check before VALIDATE.

---

### P4-06_WO-FK_DISPATCH  [dispatch]  GATED? yes (HELD migration)
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/202607230000_work_orders_unit_driver_fk.sql` header explicitly says `[HOLD-FOR-JORGE] DO NOT RUN ON PROD`; merged as PR #2334 but confirmed still not executed on prod (`.held-migrations.json` entry has no `applied_on_prod` flag). `vendor_id` mirror→AP-truth repoint is separately deferred per the hold note.
- FILES: `db/migrations/202607230000_work_orders_unit_driver_fk.sql`
- FIX STEPS: Owner applies on Neon branch → ledger-backfill → separately scope the deferred `vendor_id` AP-truth repoint as its own PR.
- GUARD: migration's built-in 0-orphan + `VALIDATE` step.

---

### P4-07_PARTS-GL_DISPATCH  [dispatch]  GATED? yes (new GL posting code)
- STATE: STILL-OPEN
- ROOT CAUSE: `maintenance/internal-labor.routes.ts:216-224` has an explicit comment: a prior GL-posting attempt was REMOVED because it wrote an unbalanced, lineless JE (a real defect); the correct balanced-posting follow-up is documented as design-only, never built.
- FILES: `apps/backend/src/maintenance/internal-labor.routes.ts`
- FIX STEPS:
  1. Design doc: DR Vehicle Maintenance Expense / CR Internal Labor Clearing (or equivalent, per the file's own comment) — never build solo.
  2. Add a flag (default OFF) via migration gating the posting call.
  3. Call the EXISTING posting engine (never new GL math) with balanced `journal_entry_postings` lines, not just a header row.
- GUARD: `scripts/verify-no-lineless-journal-entries.mjs` — generic guard asserting every JE header insert has ≥2 corresponding posting lines in the same transaction (would have caught the original defect too).

---

### PHASE2_CANCEL-TONU_billable-cancellation-no-charge_DISPATCH  [dispatch]  GATED? yes (accounting.invoices)
- STATE: STILL-OPEN
- ROOT CAUSE: `dispatch/cancellation.service.ts` records `billable_to_customer`/`cancellation_charge_cents` on `dispatch.load_cancellations` but has zero `invoice`/`Invoice` references (confirmed 0 hits) — a TONU (truck-ordered-not-used) charge is captured as data but never becomes an actual invoice/AR line.
- FILES: `apps/backend/src/dispatch/cancellation.service.ts`
- FIX STEPS:
  1. When `billable_to_customer === true` and `cancellation_charge_cents > 0`, call the existing invoice-creation path (reuse, don't reinvent) to create a TONU line item against the load's customer.
  2. Link the created invoice id back onto `dispatch.load_cancellations` (new nullable FK column via migration).
  3. Gate behind a flag (default OFF) until owner sign-off on the AR treatment.
- GUARD: `scripts/verify-billable-cancellation-creates-invoice.mjs` — asserts the billable-cancellation code path calls the invoice-creation function.

---

### PHASE2_LOAD-INVOICE_no-auto-ar_DISPATCH  [dispatch]  GATED? yes (accounting.invoices)
- STATE: STILL-OPEN — root cause refined
- ROOT CAUSE: A full auto-invoice-on-delivery service DOES exist (`apps/backend/src/factoring/packet-assemble.service.ts` — `assembleFactoringPacket`/`sweepAndAssemblePackets`, which auto-creates an invoice via the existing `createInvoiceFromLoad` route), but it is **dead code** — confirmed zero callers anywhere (no route, no cron registers it; only a phantom-schema-ban test file references its path). The header comment claiming it's "wired by callers, e.g. pod.routes.ts" is false on current main.
- FILES: `apps/backend/src/factoring/packet-assemble.service.ts`, `apps/backend/src/dispatch/pod.routes.ts` (wiring target)
- FIX STEPS:
  1. Wire `assembleFactoringPacket` into `pod.routes.ts` on POD-approval (as the header already claims but doesn't do), and/or into the load-status-transition handler on `'delivered'`.
  2. Register `sweepAndAssemblePackets` as a cron job if it's meant to run as a sweep (currently registered nowhere).
  3. Correct the header comment once actually wired, or delete it if this trigger point is superseded by a different design — confirm with Jorge which trigger point is intended before wiring (financial cluster).
- GUARD: `scripts/verify-packet-assemble-service-has-caller.mjs` — fails if `assembleFactoringPacket`/`sweepAndAssemblePackets` have zero call sites outside their own file/tests.

---

### bf10c-driver-conduct-catalogs-scorecard  [drivers]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `PerformanceScorecardSection.tsx` renders only Samsara telematics fields (score, harsh_braking, speeding, distracted, rank) — no linkage to `mdata.driver_safety_events` (conduct events) or any catalogs-backed conduct taxonomy.
- FILES: `apps/frontend/src/components/driver-profile/PerformanceScorecardSection.tsx`
- FIX STEPS:
  1. Add a query for the driver's `mdata.driver_safety_events` (existing table, no migration needed) count/severity breakdown for the same 30-day window.
  2. Render a "Conduct events" card block alongside the existing Samsara cards (additive).
  3. If owner wants a formal conduct-category catalog (not just event count), scope that as a separate gated migration — don't build schema solo here.
- GUARD: `scripts/verify-scorecard-includes-conduct-events.mjs` — greps the component for a `driver_safety_events` (or equivalent) data source alongside the Samsara fields.

---

### bf2-walkoff-termination-trigger  [dispatch]  GATED? yes (mdata.drivers writes)
### biz-flow-1-termination-not-linked-to-load  [dispatch]  GATED? yes (mdata.drivers / new table)
### flow1-auto-termination-walkoff-noshow  [dispatch]  GATED? yes (mdata.drivers writes)
### linkage-walkoff-no-auto-termination  [dispatch]  GATED? yes (mdata.drivers writes)
- STATE: STILL-OPEN — **all four are the same confirmed root cause**, ticketed once
- ROOT CAUSE: `dispatch/loads.routes.ts:1224-1231` — when a load status transitions to `driver_walkoff`/`driver_no_show`/`abandoned`, the ONLY side effect is `emitAutoProposedEscrowEvents`. No code anywhere sets `mdata.drivers.status='Terminated'`/`deactivated_at`, and the driver-deactivate route (`mdata/drivers.routes.ts:1477` `/deactivate`) has no `load_id`/triggering-load parameter — termination and the triggering load are never linked. `fk-termination-load-0289` additionally confirms there's no `driver_finance.terminations` (or equivalent) event table with a `source_load_id` FK.
- FILES: `apps/backend/src/dispatch/loads.routes.ts`, `apps/backend/src/mdata/drivers.routes.ts`
- FIX STEPS:
  1. New migration: `driver_finance.driver_terminations` (or similar canonical name) with `source_load_id uuid REFERENCES mdata.loads(id)`, `reason` (walkoff/no_show/abandoned/voluntary/etc.), `driver_id`, void-not-delete columns.
  2. In `loads.routes.ts`'s status-transition handler, alongside `emitAutoProposedEscrowEvents`, insert a termination-proposal row referencing `params.data.id` as `source_load_id` — auto-PROPOSE, don't auto-execute (mirrors the existing escrow "auto-proposed" pattern so a human still confirms before `mdata.drivers.status` flips).
  3. Extend `/mdata/drivers/:id/deactivate` to accept an optional `source_termination_id`/`source_load_id` and stamp it.
  4. Wire the escrow separation flow (`driver_finance.driver_escrow_separations`) to reference the same termination row (closes `fk-escrow-termination-0289` too — see below).
- GUARD: `scripts/verify-walkoff-noshow-links-to-termination.mjs` — asserts the load-status-transition handler for `driver_walkoff`/`driver_no_show` calls a termination-proposal function, and `verify-driver-deactivate-has-load-reference.mjs` for the second half.

---

### biz-flow-6-payment-application-manual_DISPATCH  [dispatch]  GATED? no
- STATE: ALREADY-FIXED — `CustomerDetail.tsx` has both the oldest-first auto-apply waterfall (default on, line 417 `useState(true)`) AND a full manual override: unchecking "Auto-match oldest open invoices first" (line 1991) reveals a per-invoice checkbox + `MoneyInput` amount field (line 2020-2045) so a user can hand-pick which invoices get how much. The finding's evidence (auto-apply exists, default-on, oldest-first) is accurate but doesn't describe a defect — manual application already exists as a toggle.

---

### biz-flow-7-no-automatic-team-assignment  [dispatch]  GATED? yes (writes mdata.loads.team_id)
### flow7-auto-team-assignment  [dispatch]  GATED? yes (writes mdata.loads.team_id)
- STATE: STILL-OPEN — same root cause, ticketed once
- ROOT CAUSE: `book-load.service.ts` treats `team_id` as a pure manual pass-through (line 114, 222, 292, 379, 458, 996+) — confirmed zero hits for `autoAssignTeam`/`suggestTeam`/`detectTeam` anywhere in the backend.
- FILES: `apps/backend/src/dispatch/book-load.service.ts`
- FIX STEPS:
  1. Add a `suggestTeamForDriver(driverId, operatingCompanyId)` helper reading `mdata.driver_teams` for the assigned driver's active team.
  2. In `book-load.service.ts`, when `input.team_id` is absent but `assigned_primary_driver_id` is set, auto-populate `team_id` from the suggestion before the INSERT at line 996 (still let dispatcher override).
  3. Surface the auto-derived value in the booking UI as a pre-filled (editable) field, not a silent hidden write.
- GUARD: `scripts/verify-book-load-auto-derives-team-id.mjs` — asserts `book-load.service.ts` calls a team-lookup helper when `team_id` is absent and a driver is assigned.

---

### bl-04-no-rate-con-pdf-generation  [dispatch]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: Only inbound rate-con OCR extraction exists (`dispatch/ratecon-extract.routes.ts`/`.service.ts`); no outbound Rate Confirmation PDF generator exists anywhere in the repo.
- FILES: new `apps/backend/src/dispatch/ratecon-generate.service.ts` (or similar), new route
- FIX STEPS:
  1. Build a PDF renderer (reuse the existing PDF infra pattern from `driver-finance/settlement-pdf-renderer.service.ts`) populating carrier/customer/load/rate/stop data onto a Rate Confirmation template.
  2. Add `POST /api/v1/dispatch/loads/:id/ratecon-pdf` route.
  3. Add a "Generate Rate Con" button on the load detail/booking screen, storing the generated PDF via the existing document-evidence (R2) pipeline.
- GUARD: `scripts/verify-rate-con-pdf-generator-exists.mjs` — asserts a rate-con PDF render function + route exist and are called from the frontend.

---

### coder-work-order-t1-7-escrow-ui-zero-callers  [dispatch]  GATED? yes (accounting.escrow)
### 0441-mod7-escrow-read-only  [drivers]  GATED? yes (accounting.escrow)
- STATE: STILL-OPEN — same root cause (same file), ticketed once
- ROOT CAUSE: `EscrowPage.tsx` only calls the read endpoints (`accountsQuery`, `postingsQuery`); confirmed zero frontend calls to the three mounted write routes `POST /api/v1/accounting/escrow/open`, `/deposit`, `/release` (`accounting/escrow/routes.ts:41,106,123`).
- FILES: `apps/frontend/src/pages/accounting/EscrowPage.tsx`
- FIX STEPS:
  1. Add "Open account" / "Deposit" / "Release" action buttons + modals on `EscrowPage.tsx`, each a `useMutation` calling the corresponding existing backend route (no backend change needed — routes already exist and are correct).
  2. Gate Release behind Owner/Administrator role per void/cancel governance policy.
  3. Invalidate `accountsQuery`/`postingsQuery` on success.
- GUARD: `scripts/verify-escrow-page-has-write-callers.mjs` — asserts `EscrowPage.tsx` calls `/escrow/open`, `/escrow/deposit`, and `/escrow/release`.

---

### custvend-par1-g3-customer-statement-en_DISPATCH  [dispatch]  GATED? yes (reads accounting.invoices)
- STATE: STILL-OPEN
- ROOT CAUSE: `Customers.tsx` Statements tab is an explicit stub: `"Needs a customer statement generator endpoint - flagged as a follow-up."` (line 136) — no backend endpoint exists.
- FILES: `apps/frontend/src/pages/Customers.tsx`, new backend endpoint under `apps/backend/src/accounting/` or `apps/backend/src/mdata/`
- FIX STEPS:
  1. Build `GET /api/v1/accounting/customers/:id/statement?from=&to=` — aggregates `accounting.invoices`/`accounting.payments` for the customer within the date range (read-only, reuse existing aging/query helpers — no new GL math).
  2. Wire the Statements tab to call it and render a QBO-style running-balance statement.
  3. Add a "Generate PDF" export reusing the existing PDF renderer pattern.
- GUARD: `scripts/verify-customer-statement-endpoint-exists.mjs` — asserts the route is registered and the frontend tab calls it (no more `COMING_STATE_COPY` stub text for `statements`).

---

### d-02-cancel-load-shown-on-unsaved-load  [dispatch]  GATED? no
- STATE: ALREADY-FIXED — `LoadDetailDrawer.tsx:158` (`canCancelPersistedLoad = Boolean(load && load.status !== "cancelled")`) plus the footer render (~line 706-716) now shows a plain secondary "Close" button for unsaved/loading/not-found loads, and only the red "Cancel Load" for persisted, non-cancelled loads. The comment on line 158 explicitly names this as the "d-02" fix.

---

### dispatch-board-db2-db7-fixes  [dispatch]  GATED? no
- STATE: STILL-OPEN (partial) — DB-2 and DB-4 confirmed shipped in `DispatchKanban.tsx`; DB-3 ("gear+scroll fix") still has zero code trace (no `DB-3` string, no gear icon, no scroll-specific marker in `DispatchKanban.tsx`/`DispatchBoard.tsx`) and no spec text defines exactly what "gear" refers to (`docs/specs/DISPATCH-MODULE-SPEC.md` has no `DB-3` entry either).
- FILES: `apps/frontend/src/components/dispatch/DispatchKanban.tsx`
- FIX STEPS:
  1. **Clarify with Jorge first** — "gear+scroll fix" has no surviving spec text; confirm the exact ask (likely: a column-visibility/settings gear icon on the board header + a horizontal-scroll behavior fix on the lane container) before building.
  2. Once confirmed: add the gear icon control + fix the identified scroll issue (candidate: `overflow-x-auto` container at line 703 or `max-h-[68vh] overflow-y-auto` lane container at line 595).
  3. Do NOT re-attempt DB-5 (parked per standing memory decision).
- GUARD: `scripts/verify-dispatch-board-sections-and-columns.mjs` (existing) — extend with a DB-3-specific check once the ask is clarified and built.

---

### dispatch-sweep-gap-11  [dispatch]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: No `DocumentUploadWidget.tsx` exists; no `verify-upload-widget-presence.mjs` guard; confirmed not embedded in Expense/Bill/Estimate/WO/BookLoad forms per the GAP-11 spec target.
- FILES: new `apps/frontend/src/components/shared/DocumentUploadWidget.tsx`
- FIX STEPS:
  1. Build a shared upload widget (reuse the existing R2/document-evidence upload API used elsewhere, e.g. POD upload).
  2. Embed it in the 5 named forms (Expense, Bill, Estimate, Work Order, Book Load), additive only.
  3. Ensure it writes to the correct evidence-linkage table per form (don't invent a new one if one exists per form already).
- GUARD: `scripts/verify-upload-widget-presence.mjs` (named in the finding, doesn't exist yet) — asserts `DocumentUploadWidget` is imported by all 5 target forms.

---

### dispatch-sweep-gap-15  [dispatch]  GATED? yes (gates driver settlement lock)
- STATE: STILL-OPEN — root cause refined
- ROOT CAUSE: The GAP-15 spec's exact target files (`apps/backend/src/accounting/settlements/pre-settlement-validation/validator.service.ts`, `routes.ts`, `apps/frontend/src/components/settlements/PreSettlementValidationPanel.tsx`, `scripts/verify-pre-settlement-validation.mjs`) are all confirmed absent. Note: `apps/backend/src/driver-finance/pre-settlement.routes.ts` and `apps/backend/src/settlements/pre-settlements.routes.ts` DO exist but are a different feature (settlement statement PDF generation/settle-now, not the debt/acknowledgment/escrow-balance warning validator this GAP asks for) — don't confuse the two.
- FILES: new files per the GAP-15 spec (`docs/dispatch/batches/GAP-15-VALIDATION-PRE-SETTLEMENT-DEBT-WARNINGS-GO.md`)
- FIX STEPS:
  1. Build `validator.service.ts` checking: outstanding driver debt over policy threshold, pending driver acknowledgments, near-completion deductions, escrow balance issues — read-only checks against existing tables, no new GL math.
  2. Build `routes.ts` exposing the validation result.
  3. Embed `PreSettlementValidationPanel.tsx` in `SettlementDetail.tsx`/`SettlementLock.tsx`, gating the lock action on unacknowledged warnings.
- GUARD: `scripts/verify-pre-settlement-validation.mjs` (named in the spec, build per spec's own PIECE A/B breakdown).

---

### fk-termination-load-0289  [dispatch]  GATED? yes (new driver_finance table + FK)
- STATE: STILL-OPEN — see the combined bf2/biz-flow-1/flow1/linkage-walkoff ticket above; this is the schema half of the same gap (confirmed: no `driver_finance.terminations`-equivalent table with a `source_load_id` FK exists in any migration).
- FILES: new migration under `db/migrations/`
- FIX STEPS: see combined ticket above (step 1).
- GUARD: see combined ticket above.

---

### load-cancellations-fk-per-entity-repoi_DISPATCH  [dispatch]  GATED? yes (catalogs.cancellation_reasons)
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/202606300130_load_cancellations_per_entity_fk.sql` added the per-entity FK (`dispatch.load_cancellations.reason_code_id -> catalogs.load_cancellation_reasons`) + backfill, but its own header explicitly defers repointing 5 live backend consumers still reading the legacy global `catalogs.cancellation_reasons` table (the cancel-load write path, reason dropdown, `listCancellations`, and 2 analytics reports).
- FILES: per the migration's own deferred list — `dispatch/cancellation.service.ts` and the 4 other named consumers (see `docs/dispatch/BLOCK-10-load-cancellations-fk-mapping.md`)
- FIX STEPS:
  1. Repoint the cancel-load write path to read `billable_to_customer_default`/`requires_owner_approval` from `catalogs.load_cancellation_reasons` (now carries both columns per the migration) instead of `catalogs.cancellation_reasons`.
  2. Repoint the reason dropdown + `listCancellations` + the 2 analytics reports to the same per-entity table.
  3. Once all 5 consumers are repointed and verified, archive (never drop) `catalogs.cancellation_reasons`.
- GUARD: `scripts/verify-load-cancellation-reads-per-entity-catalog.mjs` — asserts none of the 5 named consumers reference `catalogs.cancellation_reasons` anymore.

---

### phase14-audit-241  [dispatch]  GATED? no
- STATE: STILL-OPEN (partial) — root cause identified via `docs/trackers/MASTER-MANIFEST-2026-07-10.md:2423` (the id itself carries no distinguishing text, but the manifest resolves it to "scalability tracking/dashboard/analytics"). Confirmed live: `.github/workflows/load-test-nightly.yml`, `scripts/verify-load-test-baseline.mjs`, `db/migrations/202606080205_load_test_runs.sql` all exist and run nightly. Confirmed absent: any scalability dashboard or capacity-planning UI/doc (`find -iname '*scalability*dashboard*' / '*capacity-planning*'` = 0 hits).
- FILES: new frontend page/report
- FIX STEPS:
  1. Build a scalability/capacity-planning dashboard reading from the existing `load_test_runs` table (populated nightly already).
  2. Add capacity-planning documentation summarizing baseline + trend.
- GUARD: `scripts/verify-scalability-dashboard-exists.mjs`.

---

### ruling-4-embezzlement-reclass-off-ar-q_DISPATCH  [dispatch]  GATED? yes (accounting/QBO — CPA action)
- STATE: STILL-OPEN — **not a pure code defect**
- ROOT CAUSE: Per `docs/trackers/MASTER-MANIFEST-2026-07-10.md:99`, the actual required action is a QuickBooks-SIDE subtype reclassification of the two "Unauthorized Expenses" (~$407k embezzlement) accounts off A/R, PLUS a CPA ruling (write off as theft loss vs. book as recoverable) — this is an owner/CPA action inside QBO itself, not a TMS code change. `forensic-report.service.ts` already has the TMS-side forensic reporting built.
- FILES: none to change in-repo for the reclass itself; `apps/backend/src/integrations/qbo/forensic-report.service.ts` (reference)
- FIX STEPS:
  1. This ticket cannot be closed by a coder — surface to Jorge/CPA: reclassify the 2 QBO accounts + rule on theft-loss vs. recoverable treatment (see memory `qbo-balance-in-flux-embezzlement`).
  2. The ONE buildable coder task: add a TMS-side tracking flag/note on the forensic report noting "pending CPA reclass ruling" so the balance is visibly flagged as provisional wherever it's displayed.
- GUARD: none (owner/CPA action) beyond the existing forensic-report tests.

---

### sweep-fix-17-27-fixture-names-and-pager  [dispatch]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `scripts/verify-no-test-fixture-names.mjs`'s `TEST_PATTERNS` array (line 7-9) only matches `TEST-VENDOR`; `@example.com`/`m2-probe`/`m2-stop` were never added as blocked patterns despite being named in the original fix instruction.
- FILES: `scripts/verify-no-test-fixture-names.mjs`
- FIX STEPS:
  1. Add `/@example\.com/i`, `/m2-probe/i`, `/m2-stop/i` to `TEST_PATTERNS`.
  2. Run the guard against current `apps/` source to confirm no live violations before merging (or add to an allowlist if any legitimate hit surfaces).
- GUARD: this IS the guard — just needs the pattern list completed; add a self-test case for each new pattern.

---

### 0243-g5-2-qbo-txn-inside-db-transaction  [drivers]  GATED? yes (mdata.drivers write path)
- STATE: STILL-OPEN
- ROOT CAUSE: `createDriverWithQboVendor` (`qbo-vendor-linkage.service.ts:528-604`) calls `createQboVendor` (an external HTTP call to QuickBooks) at line 557, INSIDE the `withCurrentUser` callback — and `withCurrentUser` (`auth/db.ts:211-236`) wraps its callback in an explicit `BEGIN`...`COMMIT` on a pooled connection. The QBO HTTP round-trip holds a DB connection + open transaction for its full duration — a pool-exhaustion/lock-hold risk under QBO latency or timeout.
- FILES: `apps/backend/src/integrations/qbo/qbo-vendor-linkage.service.ts`, `apps/backend/src/auth/db.ts` (reference)
- FIX STEPS:
  1. Split `createDriverWithQboVendor` into two phases: (a) `withCurrentUser` transaction that only INSERTs `mdata.drivers` and COMMITs; (b) outside any transaction, `await createQboVendor(...)`, then a SECOND short `withCurrentUser` call to UPDATE `qbo_vendor_id`/append the linkage audit event.
  2. Preserve the existing best-effort semantics (failed QBO call still leaves the driver created, vendor left to reconcile) — this refactor changes only where the HTTP call sits relative to the transaction boundary, not the business logic.
  3. Add a test asserting the DB transaction commits before the QBO HTTP call is made.
- GUARD: `scripts/verify-no-http-calls-inside-with-current-user.mjs` — generic static guard scanning for `fetch(`/`axios`/known-HTTP-client calls inside a `withCurrentUser(...)` callback body across the backend (catches this class of bug everywhere, not just here).

---

### 0280-18-driver-kpi-profile-linkage  [drivers]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `dm-home.service.ts` returns `scoring_leaderboard` (top/bottom performer KPIs), but `DriverManagerHome.tsx`'s local `DriverManagerRoleHomeResult` type (line 17-34) omits `scoring`/`scoring_leaderboard` entirely — the data is fetched by the backend and thrown away by the frontend type, never rendered.
- FILES: `apps/frontend/src/pages/home/roles/DriverManagerHome.tsx`
- FIX STEPS:
  1. Add `scoring_leaderboard: { top: DriverScoringLeaderboardEntry[]; bottom: DriverScoringLeaderboardEntry[] }` to the `DriverManagerRoleHomeResult` type.
  2. Render a top/bottom performer leaderboard card, each row linking to the driver's profile.
- GUARD: `scripts/verify-driver-manager-home-renders-scoring.mjs` — greps the page for the `scoring_leaderboard` field being both typed and rendered.

---

### 0441-mod13-lists-driver-vs-drivers-parallel-tr  [drivers]  GATED? no
- STATE: ALREADY-FIXED — `DriverCatalogDeprecatedBanner.tsx` exists and is rendered by every page in `deprecated-subcatalog-pages.tsx`, each pointing (`<Link to={canonicalPath}>`) at the canonical plural `/drivers` path — matches additive-only/archive-don't-delete per §7.

---

### 0441-mod5-dqf-panel-free-text-no-fk  [drivers]  GATED? yes (new reference/catalog table)
- STATE: STILL-OPEN
- ROOT CAUSE: `DriverDqfPanel.tsx`'s "Add checklist item" (line 19, 62-74) is a plain free-text `<input>` posted as `item_name` string via `createDriverQualificationItem`; no reference/catalog table of standard DQF item types exists in any migration to select from.
- FILES: `apps/frontend/src/pages/drivers/components/DriverDqfPanel.tsx`, new migration for a DQF item-type reference table
- FIX STEPS:
  1. New migration: `catalogs.dqf_item_types` (or `reference.dqf_item_types`) seeded with the standard FMCSA DQF checklist items (CDL, MVR, Med Card, Road Test, etc. — see `ih35-fmcsa-compliance` skill for the canonical list) + an "Other" free-text fallback.
  2. Replace the free-text input with a `SelectCombobox` sourced from the new table, keeping the existing "+ Add new ___" inline-create affordance per §7 for one-off items.
  3. Backend: FK `item_name`/add `item_type_id` column to the DQF item table (additive), keep `item_name` for backward compat / free-text overflow.
- GUARD: `scripts/verify-dqf-checklist-uses-reference-table.mjs` — asserts `DriverDqfPanel.tsx` no longer posts a bare free-text field without a reference-table select.

---

### biz-flow-9-no-automatic-driver-status-update-s  [drivers]  GATED? yes (mdata.drivers writes)
- STATE: STILL-OPEN
- ROOT CAUSE: `driver-safety-events.routes.ts` has no disciplinary-status auto-escalation logic (confirmed 0 hits for probation/suspension/escalate) — a driver's disciplinary status never auto-updates based on safety-event severity.
- FILES: `apps/backend/src/mdata/driver-safety-events.routes.ts`
- FIX STEPS:
  1. Design the escalation policy first (severity thresholds → probation/suspension) — owner-reviewed since it affects driver status/employment (mdata.drivers writes).
  2. Add the escalation check in the safety-event create route: on exceeding a threshold within a rolling window, propose (don't silently auto-execute) a status change, requiring a manager confirm — mirrors the existing "auto-proposed escrow event" pattern.
  3. Add an audit trail entry for every auto-proposed escalation.
- GUARD: `scripts/verify-safety-event-severity-triggers-escalation-proposal.mjs`.

---

### dh-01-driver-hub-overview-stub  [drivers]  GATED? no
- STATE: STILL-OPEN
- ROOT CAUSE: `DriverHubPage.tsx`'s "overview" tab (line 60) renders only `<DriverInbox>` — no availability grid, on-duty status board, or driver metrics component.
- FILES: `apps/frontend/src/pages/home/DriverHubPage.tsx`
- FIX STEPS:
  1. Add an availability-grid component reading `views.drivers_with_hos_status` (already used elsewhere per `dispatch/loads.routes.ts:618`) for on-duty/off-duty status per driver.
  2. Add a metrics summary row (active drivers, on-duty now, HOS violations today) above/beside `<DriverInbox>` — additive, don't remove the inbox.
- GUARD: `scripts/verify-driver-hub-overview-has-availability-grid.mjs`.

---

### driver-d-cluster-scope-guard-missing  [drivers]  GATED? no
- STATE: ALREADY-FIXED — `scripts/verify-driver-profile-scope.mjs` exists (added by PR #2661, `f5c803741`), is registered in `package.json` (`verify:driver-profile-scope`), and is wired into CI at `.github/workflows/locked-guards.yml:699-702` (both `--selftest` and the real run). The finding's evidence (0 hits) is stale.

---

### fk-escrow-termination-0289  [drivers]  GATED? yes (driver_finance schema)
- STATE: STILL-OPEN
- ROOT CAUSE: `driver_finance.driver_escrow_separations` (`202607111000_block02_driver_escrow_separation_return.sql`) captures `separation_date` but has no termination-reason FK/column — `termination_id` never existed anywhere in the repo (confirmed 0 hits), so the escrow-separation row can't be traced back to WHY the driver was terminated (walkoff/no-show/voluntary/etc.).
- FILES: same new migration as the combined bf2/biz-flow-1/flow1/linkage-walkoff ticket above (`driver_finance.driver_terminations`) + additive column on `driver_finance.driver_escrow_separations`
- FIX STEPS:
  1. Once the `driver_finance.driver_terminations` table exists (see combined ticket above), add `termination_id uuid REFERENCES driver_finance.driver_terminations(id)` to `driver_finance.driver_escrow_separations` (additive, nullable).
  2. Backfill is not derivable for existing separations (no source data) — leave NULL for historical rows, populate going forward only.
- GUARD: `scripts/verify-escrow-separation-links-termination.mjs`.

---

## Summary
- STILL-OPEN: 43
- ALREADY-FIXED: 6 (`0441-mod7-invoices-plaintext-audit-log_DISPATCH`, `0441-mod7-je-rows-no-onclick_DISPATCH`, `biz-flow-6-payment-application-manual_DISPATCH`, `d-02-cancel-load-shown-on-unsaved-load`, `0441-mod13-lists-driver-vs-drivers-parallel-tr`, `driver-d-cluster-scope-guard-missing`)
- UNVERIFIABLE: 0
- GATED (of the 43 still-open): 31
- NON-GATED: 12

# Build Tickets — bb_5 (verified against `origin/main` @ 52bae3a19, 2026-07-19)

All findings re-verified by reading live code/migrations on `origin/main` (local `main` was 8 commits
behind; verification used `git show origin/main:<path>` / `git grep <pat> origin/main --`).

---

### flow1-escrow-linked-to-termination-record  [drivers]  GATED (driver_finance escrow)
- STATE: STILL-OPEN
- ROOT CAUSE: `recordDriverEscrowSeparation` gates only on `mdata.drivers.status==='Terminated' && deactivated_at` — never reads `termination_reason_id` / `catalogs.driver_termination_reasons`, so a voluntary resignation and a for-cause termination start the same 90-day escrow clock with no reason-based branching.
- FILES: `apps/backend/src/driver-finance/escrow-separation.service.ts` (lines ~111-147); `apps/backend/src/mdata/driver-safety-events.routes.ts` (has `termination_reason_id`); `db/migrations/0023_driver_safety_file.sql` (catalog + severity).
- FIX STEPS:
  1. In `recordDriverEscrowSeparation`, after loading the driver, join `mdata.driver_safety_events` (latest `event_type='termination'`) to get `termination_reason_id` + its `catalogs.driver_termination_reasons.severity`.
  2. Store `termination_reason_id` on `driver_finance.driver_escrow_separations` (add column via a HOLD-FOR-JORGE migration) and branch retention logic if severity indicates for-cause vs voluntary.
  3. Update `appendCrudAudit` payload to include the reason.
- GUARD: new `scripts/verify-escrow-separation-termination-reason.mjs` asserting every `driver_escrow_separations` row has a non-null `termination_reason_id` once the driver has a termination safety event.

---

### hiredate-provenance-partial  [drivers]  GATED (db migration — `mdata.drivers.hire_date_source` is HELD)
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/202606300050_drivers_hire_date_source.sql` (adds `mdata.drivers.hire_date_source`) is listed in `db/migrations/.held-migrations.json` — it has **never run on prod** — yet `applySamsaraHireDateEstimates()` unconditionally `UPDATE`s `hire_date_source = 'samsara_estimate'`, and the route that calls it (`POST /api/v1/telematics/driver-hire-date/apply`) is live and registered (`apps/backend/src/mdata/index.ts:30`). Calling it on prod today will 500 (unknown column).
- FILES: `db/migrations/202606300050_drivers_hire_date_source.sql`; `db/migrations/.held-migrations.json`; `apps/backend/src/integrations/samsara/samsara-hire-date.service.ts`; `apps/backend/src/mdata/driver-hire-date-apply.routes.ts`.
- FIX STEPS:
  1. Get Jorge's explicit "OK to merge" on `202606300050_drivers_hire_date_source.sql` (PROTECTED/ALTER-existing-table gate) and release it from `.held-migrations.json`.
  2. Re-verify prod has the column via `information_schema.columns` before enabling the apply route in any UI.
  3. Add a startup/health check in `driver-hire-date-apply.routes.ts` that 503s cleanly (not 500) if the column is missing, as defense-in-depth for future holds.
- GUARD: `scripts/verify-held-migration-columns-not-referenced.mjs` — fails CI if any `*.routes.ts`/`*.service.ts` writes to a column whose defining migration is currently in `.held-migrations.json`.

---

### notif-b-android-block  [drivers]  not gated
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/driver-pwa` has zero Capacitor/Cordova dependency and no native Android project — confirmed via `git grep -il "capacitor\|cordova"` (0 hits) and no `android/` directory in the tree. Push notifications / native-only APIs are unavailable to the driver PWA on Android.
- FILES: `apps/driver-pwa/package.json`; (new) `apps/driver-pwa/android/`.
- FIX STEPS:
  1. Decide notification strategy: Web Push (service-worker, no native shell) vs. Capacitor wrap. Web Push is far less work and additive to the existing PWA.
  2. If Web Push: add a service-worker `push` handler + `PushManager.subscribe`, backend VAPID keys, and a subscriptions table.
  3. If native: `npm i @capacitor/core @capacitor/android`, `npx cap add android`, wire FCM.
- GUARD: `scripts/verify-driver-pwa-notification-channel.mjs` asserting the chosen mechanism (service-worker push handler or Capacitor plugin) is present.

---

### s-08-no-driver-unit-type-date-filters-incident  [drivers]  not gated
- STATE: STILL-OPEN
- ROOT CAUSE: `SafetyIncidentsClusterSurface.tsx` (shared by `DamageReportsPage.tsx` and `TrailerInterchangesPage.tsx`) renders only a header + table (Date/Driver/Unit/Location/Status/Action) with zero filter controls anywhere in the component — confirmed by full-file read, no `<select>`/date-input outside the create-drawer pickers.
- FILES: `apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx`.
- FIX STEPS:
  1. Add a filter bar above the table: driver picker (`listDrivers`), unit picker (`listUnits`), incident-type-specific field (none extra needed), and a date-range pair (`DatePicker` x2).
  2. Wire filters into `listSafetyIncidents(operatingCompanyId, config.incidentType, filters)` query params; extend the backend `GET` route to accept `driver_id`/`unit_id`/`date_from`/`date_to`.
  3. Persist filter state in the existing `useListState` pattern used elsewhere in the app.
- GUARD: extend `scripts/verify-sidebar-contract.mjs`-style static check, or add `scripts/verify-list-surfaces-have-filters.mjs` scanning cluster-surface components for filter inputs when they render >N columns.

---

### 0091-g10-h3  [factoring]  GATED (accounting.payments / driver_finance escrow — money routes)
- STATE: PARTIALLY-FIXED / 2 of 3 sub-routes STILL-OPEN
  - **Factoring reconcile-apply — ALREADY-FIXED.** `apps/backend/src/banking/obligation-reconcile.routes.ts` handles `obligation_type: "factoring_batch"` via `applyMatch()` from `factoring/bank-match.service.ts`; route is registered (`index.ts:226`) and the UI (`ReconMatchSuggestions.tsx` inside `BankingObligationReconcilePage.tsx`, mounted at `/banking/reconcile` in `manifest.tsx:1349`) calls it.
  - **Payment unapply — ALREADY-FIXED.** `apps/backend/src/accounting/payment-applications.routes.ts` has `DELETE /api/v1/accounting/payments/:paymentId/applications/:id`, correctly `export default fp(...)`-wrapped so `@fastify/autoload` picks it up under `registerAccountingRoutes` (`accounting/index.ts`). Frontend `unapplyPayment()` in `api/accounting.ts` calls the exact path; wired into `PaymentDetailPage.tsx`.
  - **Escrow forfeit — STILL-OPEN.** Frontend `forfeitEscrow()` (`apps/frontend/src/api/driverFinance.ts`) POSTs `/api/v1/driver-finance/escrow/:driverId/forfeit`, wired into `EscrowForfeitModal.tsx` + `EscrowRecordTab.tsx` with a live "Forfeit" button — but **zero backend route exists** anywhere in `apps/backend/src` (`git grep -n forfeit apps/backend/src` returns only comments). Clicking Forfeit 404s in prod today.
- ROOT CAUSE: escrow forfeit shipped frontend-first; the `driver-finance/escrow-*.routes.ts` set (separation, deduction-pending) never got a `forfeit` route added.
- FILES: (new) `apps/backend/src/driver-finance/escrow-forfeit.routes.ts`; register in `apps/backend/src/index.ts` next to `registerDriverEscrowSeparationRoutes`; reuse `driver_finance.driver_escrow_separations` / escrow ledger tables.
- FIX STEPS:
  1. Design the forfeiture posting (GL: debit escrow liability, credit forfeiture-income or damage-recovery) — reuse existing GL posting infra per §2, do not write new GL math.
  2. Add `POST /api/v1/driver-finance/escrow/:driverId/forfeit` accepting `{operating_company_id, driver_uuid, amount, reason, linked_liability_id}`, Owner-only, with an audit row + a `blocked` status path when a signed clause is missing (matches the `result.status === "blocked"` branch already coded in `EscrowRecordTab.tsx`).
  3. Register the route file in `index.ts`.
  4. Add an integration test hitting the live route from `EscrowForfeitModal`'s exact payload shape.
- GUARD: `scripts/verify-frontend-backend-route-parity.mjs` — scan `apps/frontend/src/api/*.ts` for every `apiRequest`/fetch URL template and assert a matching Fastify route path exists in `apps/backend/src` (would have caught this).

---

### 0091-g11-5  [factoring]  GATED (accounting.periods / month-close)
- STATE: STILL-OPEN
- ROOT CAUSE: `getMonthCloseStatus`/`lockMonthClose` in `month-close.service.ts` requires `arOverdueCount === 0 && apOverdueCount === 0` to set `canLock = true`. The AR-overdue query (`accounting.invoices WHERE amount_open_cents > 0 AND due_date < periodEnd`) has **no carve-out for factored/assigned invoices** — under the locked factoring-as-secured-borrowing model, invoices stay on the books as AR until collected, so any invoice sitting past its due date (routine for a factoring carrier) permanently blocks month-close.
- FILES: `apps/backend/src/accounting/month-close.service.ts` (lines ~127-193).
- FIX STEPS:
  1. Decide (owner/CPA call, per §1.4) whether overdue-but-assigned-to-factor invoices should be excluded from the AR-aging gate, or whether the gate should be advisory (warn, don't block) instead of hard-blocking.
  2. If excluding: join `accounting.invoices` to `accounting.factoring_advances`/`ar_assigned_to_factor` status and exclude rows already assigned+funded from `arOverdueCount`.
  3. Add a `checklist.ar_aging_review.override_reason` field so a Manager can acknowledge-and-proceed with an audit trail if the business decision is "informational only."
- GUARD: a period-close integration test seeding one overdue-but-factored invoice, asserting `canLock` reflects the owner's chosen policy (not silently always-false).

---

### 0243-b1-2-factor-reserve-default-liability-fal  [factoring]  GATED (catalogs.accounts / coa-roles)
- STATE: STILL-OPEN
- ROOT CAUSE: `resolver.service.ts`'s own comment documents the bug ("the code's old `factor_reserve_default`, which the shape-fallback mis-typed as a Liability") but `ROLE_FALLBACKS.factor_reserve_default` still reads `{ type: ["Liability"], ... }` while the canonical `factor_reserve_held` role (Asset) supersedes it. `factor_reserve_default` remains live/selectable in the CoA Roles admin UI (`CoaRolesPage.tsx`) and in every enum-seeding migration through `202607013000`, so a user mapping an account under this legacy role today gets steered to a Liability-typed suggestion for what should be an Asset (factoring reserve held-back).
- FILES: `apps/backend/src/accounting/coa-roles/resolver.service.ts` (line 59); `apps/frontend/src/pages/accounting/CoaRolesPage.tsx`.
- FIX STEPS:
  1. Fix the fallback: `factor_reserve_default: { type: ["Asset"], nameHints: [...] }` — OR deprecate the role entirely (mark it non-selectable in `CoaRolesPage.tsx`, point everything at `factor_reserve_held`).
  2. Grep all `accounting.chart_of_accounts_roles` rows keyed `factor_reserve_default` in every environment (dev/staging) and re-map to `factor_reserve_held` if any exist.
  3. Add a migration comment / CHANGELOG entry so the next reader doesn't re-introduce the mistype.
- GUARD: `scripts/verify-coa-role-fallback-types-match-canonical.mjs` — cross-checks `ROLE_FALLBACKS[role].type` against the account-type recorded in the migration that introduced the canonical replacement role, failing CI on mismatch.

---

### 0243-g10-h3-six-ui-features-404-routes  [factoring]  UNVERIFIABLE
- STATE: UNVERIFIABLE — the source dispatch never enumerated the "six UI features," and no registry/tracker entry lists them. A generic 404-route sweep of `apps/frontend/src/pages/factoring` did surface one concrete orphan independently (`fact-par1-submissionqueue-unrouted`, below) but that is tracked separately.
- ROOT CAUSE: cannot be determined without the original six-item list.
- FILES: n/a until scoped.
- FIX STEPS:
  1. Before building anything, get the original "six UI features" enumerated (check `docs/trackers/MASTER-MANIFEST-2026-07-10.json` or ask Jorge which six).
  2. Once named, re-run the same orphan-route check used for `fact-par1-submissionqueue-unrouted` against each.
- GUARD: n/a until scoped; recommend the `verify-frontend-backend-route-parity.mjs` guard proposed under `0091-g10-h3` also flags orphaned frontend *pages* (not just API calls) missing from `routes/manifest.tsx`.

---

### 0251-gap1-factoring-vendor-fk-not-stored  [factoring]  ALREADY-FIXED
- STATE: ALREADY-FIXED — cited evidence is proof-of-build, not a gap. `mdata.customers.factoring_company_vendor_id` (FK → `mdata.vendors`, `db/migrations/0022_customer_factoring_config.sql`) and `accounting.factoring_advances.factoring_company_vendor_id` (`NOT NULL REFERENCES mdata.vendors`, `db/migrations/0061_p3_t11_20_5_factoring_tracking.sql`) both exist on `origin/main` and are actively joined/grouped in `0061`'s views.
- No further action needed.

---

### 0251-gap4-driver-vendor-mapping  [factoring]  ALREADY-FIXED
- STATE: ALREADY-FIXED — `mdata.drivers.qbo_vendor_id` exists (`db/migrations/0091_p5_d3_qbo_vendor_driver_asset_linkage.sql`) and is consumed directly: `apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts:341-348` selects `qbo_vendor_id` and derives `driverVendorId = String(driverRes.rows[0]?.qbo_vendor_id ?? settlement.driver_id)`, then stores it on the posting row.
- No further action needed.

---

### 0441-mod8-factoring-virtual-hardcodes-zero  [factoring]  ALREADY-FIXED (finding mischaracterized)
- STATE: ALREADY-FIXED — `apps/backend/src/banking/factoring-virtual.routes.ts` selects real `current_reserve_balance`/`current_chargeback_balance` from `accounting.factoring_companies`; `COALESCE(..., 0)` is standard NULL-handling, not a hardcode. No zero-hardcoding found.
- No further action needed.

---

### 0518-r18-schema-fragmentation-8-dup-pairs  [factoring]  GATED (schema consolidation)
- STATE: STILL-OPEN (4 of 8 pairs remain)
- ROOT CAUSE: confirmed live dual-writes: `docs.*` (27 files) vs `documents.*` (21 files); `mdata.*` (431 files) vs `master_data.*` (10 files); `maint.*` (3 files, down from 10) vs `maintenance.*` (93 files); `reports.*`/`reporting.*` fragmentation also persists. No consolidation migration exists for any of the 4.
- FILES: n/a — this is a multi-PR consolidation program, not a single fix.
- FIX STEPS:
  1. For each pair, pick the canonical schema (by file-count/data-volume — `mdata`, `maintenance`, `documents`(or `docs`, whichever has the audit trail), `reporting`).
  2. Write a `CREATE VIEW`-forwarding shim from the legacy schema name to canonical tables (additive, no drops) per `create-replace-view-append-only` house rule.
  3. Migrate call sites file-by-file behind the shim, retiring writers to the legacy schema last.
- GUARD: `scripts/verify-schema-fragmentation-pairs.mjs` counting live query sites per schema pair per PR, failing CI if the fragmented (non-canonical) side count increases.

---

### core-ledger-write-proof-trucking-evidence  [factoring]  STILL-OPEN
- STATE: STILL-OPEN — confirmed via `docs/trackers/CODER-FINAL-HANDOFF-2026-07-19.md` and `MASTER-MANIFEST-2026-07-10.json` itself: no `docs/proofs/` directory, no `apps/backend/src/accounting/__proofs__/core-ledger-write-proof.spec.ts` file exists anywhere on `origin/main`.
- ROOT CAUSE: the Neon-branch proof harness that ties the 5 operational posters (invoice/bill/expense/receive-payment/bill-payment) to correct GL accounts + TB/BS/P&L/month-close tie-out was never built.
- FILES: (new) `apps/backend/src/accounting/__proofs__/core-ledger-write-proof.spec.ts`; (new) `docs/proofs/CORE-LEDGER-WRITE-PROOF-operational.md`.
- FIX STEPS:
  1. Build a Neon-branch-only spec that posts one of each of the 5 operational transaction types and asserts GL debits/credits balance and land in the correct roles (reuse existing posting functions per §2 — write no new GL math).
  2. Assert Trial Balance / Balance Sheet / P&L tie-out for the branch after posting.
  3. Document results in `docs/proofs/CORE-LEDGER-WRITE-PROOF-operational.md`.
- GUARD: the spec itself IS the guard — run it in CI on a throwaway Neon branch, never against prod.

---

### fact-fix1-duplicate-vendors-banner  [factoring]  not gated (frontend wiring only)
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/factoring/scan-duplicate-vendors.routes.ts` is registered (`index.ts:233,960`) but confirmed zero frontend callers anywhere in `apps/frontend/src`.
- FILES: `apps/backend/src/factoring/scan-duplicate-vendors.routes.ts` (read for the exact response shape); (new) a banner component + `api/factoring.ts` caller.
- FIX STEPS:
  1. Read the route's response shape and add `scanDuplicateVendors()` to `apps/frontend/src/api/factoring.ts`.
  2. Render a dismissible banner on `FactoringHome.tsx` (or wherever vendors are managed) when duplicates are found, linking to the vendor merge flow (`createDriverVendorMerge` already exists and is wired).
- GUARD: `scripts/verify-frontend-backend-route-parity.mjs` (proposed above) would catch this class going forward.

---

### fact-par-1-factoring-submission-gating  [factoring]  GATED (factoring batch submission — money route)
- STATE: STILL-OPEN
- ROOT CAUSE: `submission-queue.service.ts` computes `is_submittable = hasPod && hasRatecon` but that flag is never checked by the reachable submission path — `batch.routes.ts`/`batch.service.ts` (`submitBatch`) only validates `status === 'draft'`, with zero reference to `is_submittable`/`has_approved_pod`/`has_rate_confirmation`. A batch can be submitted to the factor with no POD and no rate confirmation.
- FILES: `apps/backend/src/factoring/batch.service.ts` (submit-transition logic, ~line 245-270); `apps/backend/src/factoring/submission-queue.service.ts`; `apps/frontend/src/pages/factoring/BatchWizard.tsx`.
- FIX STEPS:
  1. Export a reusable `checkSubmittable(client, loadId/invoiceId)` from `submission-queue.service.ts`.
  2. Call it inside `batch.service.ts`'s submit path before the `UPDATE ... SET status='submitted'`; throw a `FactoringBatchError("missing_documents", 422, {missing})` if not satisfied.
  3. Surface the specific missing-docs list in `BatchWizard.tsx`'s submit confirmation.
- GUARD: an integration test submitting a batch with no POD and asserting a 422, added next to the existing `batch.service.ts` tests.

---

### fact-par1-submissionqueue-unrouted  [factoring]  not gated (frontend wiring only)
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/frontend/src/pages/factoring/SubmissionQueue.tsx` and `apps/frontend/src/pages/factoring/index.tsx` (`FactoringIndexPage`, with a "Submit to Factor" tab rendering `<SubmissionQueue />`) are never imported by `apps/frontend/src/routes/manifest.tsx`. The routed factoring pages are `FactoringHome.tsx` (mounted, different subnav: Reserve Tracker/Recourse Pipeline/Chargebacks/Statements/Faro Imports/Equipment Loans/Vendor Merges — no Submission Queue tab) and `BatchWizard`/`FactorAdmin`/`ReserveDashboard` (mounted directly). `SubmissionQueue.tsx` is dead code with no reachable path in the app today.
- FILES: `apps/frontend/src/pages/factoring/SubmissionQueue.tsx`; `apps/frontend/src/pages/factoring/index.tsx`; `apps/frontend/src/routes/manifest.tsx`; `apps/frontend/src/pages/factoring/FactoringHome.tsx`.
- FIX STEPS:
  1. Add a "Submit to Factor" tab to `FactoringHome.tsx`'s `SUBNAV` rendering `<SubmissionQueue />` (simplest: fold it into the already-routed home page rather than mounting the separate unused `FactoringIndexPage`).
  2. Alternatively, add `/factoring/submit` to `manifest.tsx` pointing at `FactoringIndexPage` directly if the tab-set in `index.tsx` (Submit/Workqueue/Batch Wizard/Factors/Reserves) is meant to fully replace `FactoringHome`'s subnav — this needs an explicit decision to avoid two competing factoring shells.
  3. Wire the fix for `fact-par-1-factoring-submission-gating` here too — this is the screen that should surface `is_submittable`.
- GUARD: the same `verify-frontend-backend-route-parity`-style guard extended to also flag frontend page components with zero import sites in `manifest.tsx`.

---

### factoring-asc860-determination-memo  [factoring]  not code-gated (documentation/CPA sign-off)
- STATE: STILL-OPEN
- ROOT CAUSE: `docs/accounting/FACTORING-ASC860-DETERMINATION.md` does not exist; no ASC-860 memo anywhere in the repo (only `.block-ready` stub JSON files reference the id).
- FILES: (new) `docs/accounting/FACTORING-ASC860-DETERMINATION.md`.
- FIX STEPS:
  1. Draft the memo stating the sale-vs-secured-borrowing determination for Faro factoring (already locked as secured-borrowing per `ih35-cpa-accounting-decisions` skill / CPA rulings) with the ASC 860-10 criteria walkthrough (control, recourse, servicing).
  2. Route to Jorge/CPA for sign-off before treating it as final (this is a legal/audit-evidence document, not code).
- GUARD: n/a (documentation). Recommend adding a repo-root doc-presence check if audit-evidence docs are tracked elsewhere.

---

### factoring-coder-directive-item-c-unconfirmed  [factoring]  GATED (factoring posting corrections)
- STATE: PARTIALLY-FIXED — draft-vs-posted immutability half is real (`batch.service.ts` throws `batch_already_submitted`/`batch_already_funded` on re-transition). The reason-coded true-up half is **STILL-OPEN**: `faro-csv-import.ts:278` only *describes* the intended behavior in a comment ("a later FARO correction is a separate, reason-coded true-up adjustment, never a silent edit") — no `reason_code` column, adjustment table, or correction route exists anywhere in `apps/backend/src/factoring` or `apps/backend/src/accounting`.
- FILES: `apps/backend/src/factoring/faro-csv-import.ts` (line ~278); `apps/backend/src/factoring/batch.service.ts`.
- FIX STEPS:
  1. Design a `factoring_true_up_adjustments` table (operating_company_id, factoring_advance_id, reason_code, delta_cents, created_by, linked posting id) — additive, HOLD-FOR-JORGE migration.
  2. Add a route to file a true-up when a FARO funding report corrects a previously-funded batch, posting the delta via existing GL posting infra (never editing the original entry).
  3. Have `faro-csv-import.ts`'s variance detection route corrections into this new path instead of leaving it as a comment-only intent.
- GUARD: integration test re-importing a corrected FARO CSV for an already-funded batch, asserting the original JE is untouched and a new true-up JE with a `reason_code` appears.

---

### factoring-g3-debtor-credit-check-decision-note  [factoring]  owner-decision-pending, not a code defect
- STATE: UNVERIFIABLE as a build ticket — the source doc itself frames this as an owner-decision-pending enhancement ("Defer / likely N/A"), not a defect. Confirmed zero debtor-credit-check-via-factor-data surface exists in `apps/backend` or `apps/frontend`.
- FIX STEPS: no code steps until Jorge decides whether this is worth building; if approved, scope as a new design doc first (feature touches customer credit limits, which per §6 already has three sources: `factor`/`manual`/`rmis_future`).
- GUARD: n/a until scoped.

---

### 0451-fin2-finance-lands-on-stub-not-hub  [finance-hub]  ALREADY-FIXED
- STATE: ALREADY-FIXED — `apps/frontend/src/routes/manifest.tsx:4115` now routes `/finance` to `FinanceHubPage`, with `/finance/overview` kept as the placeholder alias per the code comment: *"FIN-2 — canonical Finance entry mounts the real read-only Hub. The placeholder Overview remains reachable at /finance/overview... /finance/hub remains mounted as an additive legacy alias."*
- No further action needed.

---

### 0091-m-woid-1  [fleet]  UNVERIFIABLE
- STATE: UNVERIFIABLE — the `.block-ready/0091-m-woid-1.json` file is boilerplate with no source spec text (`source_file` not present in repo), so no concrete claim can be extracted or checked against code.
- FIX STEPS: locate the original dispatch text (check `docs/trackers/MASTER-MANIFEST-2026-07-10.json` for `0091-m-woid-1`) before scoping.
- GUARD: n/a until scoped.

---

### 0441-mod13-inventory-part-to-unit-none  [fleet]  not gated
- STATE: STILL-OPEN (real gap, not just "unclear")
- ROOT CAUSE: `maintenance.parts_inventory` (the part master — `db/migrations/0049_p3_t11_6_1_wo_format_vendor_inventory_integrity.sql`) has no `unit_id` column at all; `maintenance.parts_invoice_links` only carries `work_order_id` (→ unit indirectly via `work_orders.unit_id`). Consumption is trackable per-WO, but there is no unit-level parts-usage-history surface anywhere in the frontend — `git grep -rl parts_invoice_links apps/frontend/src` returns only `WorkOrderDetailModal.tsx` and `InventoryAssignmentsPage.tsx`, neither reachable from a unit/vehicle profile page.
- FILES: `apps/backend/src/maintenance/parts-invoice-links.routes.ts`; `apps/frontend/src/pages/fleet/VehicleProfilePage.tsx`.
- FIX STEPS:
  1. Add `GET /api/v1/maintenance/units/:unitId/parts-history` joining `maintenance.parts_invoice_links` → `maintenance.work_orders` (`WHERE wo.unit_id = :unitId`).
  2. Render a "Parts Used" section on `VehicleProfilePage.tsx` (reverse drill-through, per §10a Total Connectivity) alongside the existing `ServiceTimeline`.
- GUARD: `scripts/verify-cross-module-linkage.mjs`-style check (if one exists, extend it) asserting every unit-scoped financial/operational table has a reverse-drill render site on `VehicleProfilePage.tsx`.

---

### 0441-mod5-actionbar-dead-links  [fleet]  ALREADY-FIXED (no defect found)
- STATE: ALREADY-FIXED — read `apps/frontend/src/components/vehicle-profile/ActionBar.tsx` in full: every button/anchor has a live `onClick` prop or real `href` (Edit, Change Status, `+ Create Work Order`, View on Map, Export PDF, Archive). No dead links.
- No further action needed.

---

### 0441-mod9-create-trailer-no-manual-path  [fleet]  ALREADY-FIXED
- STATE: ALREADY-FIXED — `apps/frontend/src/components/fleet/CreateTrailerModal.tsx` calls `createEquipment()` (→ `POST /api/v1/mdata/equipment`) and is mounted from `apps/frontend/src/pages/fleet/FleetHomePage.tsx` behind a `+ Create Trailer` button (`data-testid="fleet-create-trailer"`).
- No further action needed.

---

### 0441-mod9-fleet-roster-no-create-actions  [fleet]  ALREADY-FIXED
- STATE: ALREADY-FIXED — `FleetHomePage.tsx` (the canonical `/fleet` page, which wraps the same `FleetTablePage` roster component) has a `data-testid="fleet-roster-create-actions"` block with both `+ Create Unit` and `+ Create Trailer` buttons, opening `CreateUnitModal`/`CreateTrailerModal`. The code comment cites this exact block id: *"Create CTAs (0441-mod9-fleet-roster-no-create-actions): + Create Unit / + Create Trailer open modals wired to POST /api/v1/mdata/units and POST /api/v1/mdata/equipment."*
- No further action needed.

---

### 0441-mod9-second-create-unit-backend-orphaned  [fleet]  ALREADY-FIXED
- STATE: ALREADY-FIXED — `CreateUnitModal.tsx` calls `createUnit()` → `POST /api/v1/mdata/units`, and is mounted from `FleetHomePage.tsx` (same evidence as above). The route is no longer orphaned.
- No further action needed.

---

### owner-batch-s2-units-value-catalog  [fleet]  GATED (would touch fixed-asset/accounting if built)
- STATE: STILL-OPEN — confirmed no unit-value/valuation catalog table, service, or route exists anywhere (`git grep -in "unit.value|unit_valuation|units_value|equipment_valuation"` returns zero relevant hits).
- ROOT CAUSE: feature never built; scope itself was never written down beyond the block id.
- FILES: n/a until scoped.
- FIX STEPS:
  1. Get scope from Jorge: is this a depreciation/book-value catalog (ties to the locked 5-yr depreciation decision in `enterprise-feature-decisions-2026-07-05`) or a market/resale-value catalog?
  2. Once scoped, this is financial-cluster (touches fixed assets/depreciation) — design doc first, no solo build.
- GUARD: n/a until scoped.

---

### 0251-gap7-fuel-surcharge-gl_VERIFY  [fuel]  ALREADY-FIXED (verification confirms it works)
- STATE: ALREADY-FIXED — `apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts`'s `deriveRevenueCode()` maps `line_type: "fsc" → "fuel_surcharge"`, and `resolveInvoiceLineRevenueAccountId()` resolves that code to a real GL account via `resolveAccountForCategory(operatingCompanyId, "revenue", revenue_code)` (`accounting/expense-category-map/resolver.service.js`). The `_VERIFY` suffix on this id reflects that the check was pending, not that a bug was found — verification here confirms the mapping is real and wired.
- No further action needed (verify the operating company has an actual account mapped to the `fuel_surcharge` revenue category in `catalogs.accounts` if invoices in that category ever fail to post — that would be a data-config gap, not a code gap).

---

### 0441-mod3-fuel-fraud-detector-cron-never-invok  [fuel]  not gated
- STATE: STILL-OPEN
- ROOT CAUSE: `initializeFuelFraudDetectorWorker()` (`apps/backend/src/jobs/fuel-fraud-detector-worker.ts:117`) is defined but `git grep -rn initializeFuelFraudDetectorWorker apps/backend/src` returns only its own definition — never imported/called from `index.ts` or any scheduler/jobs index.
- FILES: `apps/backend/src/jobs/fuel-fraud-detector-worker.ts`; `apps/backend/src/index.ts`.
- FIX STEPS:
  1. Read the worker's tick logic to confirm what it needs (DB client, interval) and add an `import { initializeFuelFraudDetectorWorker } from "./jobs/fuel-fraud-detector-worker.js"` + call in `index.ts` alongside the other `initialize*Cron`/`initialize*Worker` calls.
  2. Confirm flag-gating (per §2, default OFF) if this worker posts anything or sends alerts — check for an `isEnabled`/feature-flag guard inside the file; add one if missing before wiring it live.
- GUARD: `scripts/verify-no-dead-cron-initializers.mjs` — scan `apps/backend/src/jobs/*.ts` and `apps/backend/src/cron/*.ts` for every exported `initialize*` function and assert it has at least one call site in `index.ts`.

---

### 0252-audit148-remote-work-policy  [insurance]  DEFERRED BY DESIGN (not a code gap)
- STATE: ALREADY-ADDRESSED as a decision, not a defect — `docs/specs/0252-hr-people-cluster-design-2026-07-12.md` itself classifies this as "Very low (field workforce) → Defer / likely N/A" and "DESIGN-ONLY." Confirmed no remote-work/telework code exists, matching the deferral, not an oversight.
- FIX STEPS: none unless Jorge reverses the deferral decision.
- GUARD: n/a.

---

### 0277-csrf-tokens-recommendation  [insurance]  not gated (security middleware) — needs re-scoping
- STATE: PARTIALLY-CONFIRMED / residual claim UNVERIFIABLE — `apps/backend/src/middleware/csrf-origin-guard.ts` is real, well-reasoned, and wired (`index.ts:430,638`): it enforces an Origin/Referer allow-list on cookie-authenticated state-changing requests. Confirmed genuine and live. The evidence text is truncated mid-sentence ("adversarial pass found the item overclaims RESOLVED on a gap that is actua...") so the *specific* residual gap the adversarial pass found could not be identified from available evidence.
- FIX STEPS:
  1. Recover the full original adversarial-pass note (check `docs/trackers/BLOCK-RECONCILIATION-2026-07-*.md` around this id) to learn the exact residual gap before scoping a fix.
  2. Common residual gaps for Origin/Referer-only CSRF defenses: browsers/proxies that strip `Referer` and have no `Origin` on same-origin GETs converted to POST via redirect, or older browsers not sending `Origin` on POST — confirm `csrf-origin-guard.ts`'s fallback behavior for missing-both-headers is fail-closed (403), not fail-open.
- GUARD: n/a until the specific residual gap is recovered.

---

### 0441-mod9-fleet-insurance-summary-never-render  [insurance]  ALREADY-FIXED
- STATE: ALREADY-FIXED — `apps/frontend/src/pages/fleet/VehicleProfilePage.tsx` renders `<InsuranceSummarySection insuranceSummary={profile.insurance_summary} />` inside `<div data-testid="vp-section-6b-insurance-summary">`, directly consuming the `insurance_summary` field computed by `unit-aggregate.service.ts`.
- No further action needed.

---

### 0441-mod12-legal-no-reverse-drill-through  [legal]  PARTIALLY-FIXED — fleet/insurance side STILL-OPEN
- STATE: PARTIALLY-FIXED. `apps/frontend/src/pages/DriverDetail.tsx` **does** have a working reverse drill-through: a "Legal Matters" tab (Owner/Administrator-gated) querying `legalMattersApi` by `driver_id`, rendering rows that link to `/legal/matters/:id`. But `git grep -ln "legal.matter|legal_matter|LegalMatter" apps/frontend/src/pages/fleet apps/frontend/src/pages/insurance` returns **zero hits** — the fleet (`VehicleProfilePage.tsx`) and insurance pages still have no reverse link back to their linked legal matters, matching the original finding for those two surfaces.
- FILES: `apps/frontend/src/pages/fleet/VehicleProfilePage.tsx`; `apps/frontend/src/pages/insurance/*` (Claims/Lawsuits tabs); reference `apps/frontend/src/pages/DriverDetail.tsx` (lines ~318-1390) as the working pattern to copy; `apps/frontend/src/api/legal-matters.ts` (`legalMattersApi`).
- FIX STEPS:
  1. Copy the `DriverDetail.tsx` pattern: query `legalMattersApi` filtered by `unit_id` (fleet) / `claim_id` (insurance) instead of `driver_id`.
  2. Add a "Legal Matters" section/tab to `VehicleProfilePage.tsx` and to the insurance Claims/Lawsuits tabs, same Owner/Administrator gate.
- GUARD: extend whatever `cross-module-linkage` guard exists (per `cross-module-linkage-rule` memory) to assert legal-matter reverse links exist on driver AND unit AND insurance-claim detail pages, not just driver.

---

### 0091-h2-3  [maintenance]  not gated (dependency, but touches session auth — treat cautiously)
- STATE: STILL-OPEN — confirmed identical to `0243-h2-3` below (same underlying dependency).
- (see `0243-h2-3-lucia-deprecated-auth-lib` for full ticket — duplicate finding, single fix)

---

### 0091-h5-1  [maintenance]  GATED (schema/growth-control migration)
- STATE: STILL-OPEN — confirmed identical to `0243-h5-1-append-only-spine-unbounded-growth` below (same underlying gap, different id).
- (see `0243-h5-1-append-only-spine-unbounded-growth` for full ticket — duplicate finding, single fix)

---

### 0243-h2-3-lucia-deprecated-auth-lib  [maintenance]  not gated for research/PoC; STOP before flipping the live auth path
- STATE: STILL-OPEN
- ROOT CAUSE: `root package.json` still pins `lucia@3.2.2` + `@lucia-auth/adapter-postgresql@3.1.2`; `apps/backend/src/auth/lucia.ts:18-19` still does `import { Lucia } from "lucia"` and `import { NodePostgresAdapter } from "@lucia-auth/adapter-postgresql"` as the live session engine. `arctic`/`oslo` are present in `package.json` (successor libs) but confirmed unused — no migration off Lucia has started.
- FILES: `package.json`; `apps/backend/src/auth/lucia.ts`; `apps/backend/src/auth/db.ts` (`luciaPool`); `apps/backend/src/auth/session-cookie-policy.ts`.
- FIX STEPS:
  1. Design (not solo-build) a migration to Arctic (OAuth) + Oslo (session/crypto primitives) replacing Lucia's session management — this touches every authenticated request path, so scope as its own PR series behind a flag, never a single swap.
  2. Build a seam: a thin `SessionAdapter` interface both the Lucia and the new implementation satisfy, so the swap is behind one call site.
  3. Migrate reads first (session validation) behind a flag; migrate writes (session creation) last; remove `lucia`/`@lucia-auth/adapter-postgresql` from `package.json` only after a full soak.
- GUARD: keep `scripts/verify-lucia-bypass-guard-pattern.mjs` (already exists) green throughout; add a new guard asserting no NEW file imports from `"lucia"` once the migration starts (ratchet).

---

### 0243-h5-1-append-only-spine-unbounded-growth  [maintenance]  GATED (schema/retention migration)
- STATE: STILL-OPEN
- ROOT CAUSE: `events.event_log` (and `audit.row_changes`) have no partition/retention/archival strategy. The only partitioning migration on `origin/main`, `202606080940_block26_partition_hot_tables.sql`, targets `public.audit_log`/`public.banking_transactions`/`public.fuel_card_transactions` — a **different, legacy/dormant table set** (note the `public.` schema, not the live `audit.row_changes`/`events.event_log`/`outbox.events`). The only migration referencing `events.event_log` around this area (`202607510000`) is a HOLD-FOR-JORGE RLS fix, not growth control.
- FILES: (new) a range-partition migration for `events.event_log` / `audit.row_changes` / `outbox.events`, modeled on `db/migrations/202606080940_block26_partition_hot_tables.sql`'s shadow-table-swap pattern.
- FIX STEPS:
  1. Confirm current row counts/growth rate for the three tables (read-only prod check, gated per §1.5 — ask before connecting).
  2. Write a HOLD-FOR-JORGE migration applying the same zero-downtime shadow-table partition-by-month pattern, honoring the 7-year IRS retention already established in block26's comment for financial append-only tables.
  3. Never touch `events.log_event`'s existing SECURITY DEFINER write path without first reconciling the `app.current_operating_company_id` GUC issue block26's own comment flags as the reason `events.event_log` was excluded from the earlier force-tail pass.
- GUARD: a scheduled (cron) row-count/partition-lag check alerting before any of the three tables crosses an unpartitioned-growth threshold.

---

### 0441-mod2-vendor-ap-disconnected  [maintenance]  UNVERIFIABLE
- STATE: UNVERIFIABLE — evidence itself admits the specific "disconnected" claim was never verified. `apps/backend/src/accounting/bills.routes.ts` has a real `vendor_id` column/param wired through query, body, and update paths (lines 32/43/51/117/188/388) — on its face this looks connected, not disconnected.
- FIX STEPS: re-run this finding with a concrete repro (which vendor, which bill, what breaks) before treating it as a ticket.
- GUARD: n/a until reproduced.

---

### 0441-mod9-maintenance-vendor-linkage-broken  [maintenance]  ALREADY-FIXED (finding appears stale)
- STATE: ALREADY-FIXED — read `apps/backend/src/maintenance/vendors.routes.ts` in full: `createSchema`/`patchSchema` both accept `mdata_vendor_id`, `buildVendorMetadata()` DOES write it (line 101: `...(input.mdata_vendor_id !== undefined ? { mdata_vendor_id: input.mdata_vendor_id } : {})`), it's persisted inside the catalog's `metadata` jsonb column (the standard pattern for this generic catalog-items table), and `mapVendorRow()` correctly reads it back out (line 120). No "correlation filter always resolves NULL" code was found anywhere (`git grep -n mdata_vendor_id apps/backend/src` has zero hits outside this one file) — the claimed downstream filter reading a non-existent top-level column could not be located, so either it was fixed already or never existed as described.
- FIX STEPS (only if a specific broken correlation query surfaces later): confirm any AP-reconciliation query that filters maintenance vendors by `mdata_vendor_id` reads `metadata->>'mdata_vendor_id'`, not a bare column.
- GUARD: n/a — no live break found to guard.

---

### 0519-dc2-maint-schema-144-rows-active-alongsid  [maintenance]  GATED (schema consolidation)
- STATE: STILL-OPEN — confirmed `maint.*` still has 3 actively-queried files and `maintenance.*` has 93, on `origin/main` today. Fragmentation persists; no consolidation migration found.
- FILES/FIX STEPS/GUARD: same program as `0518-r18-schema-fragmentation-8-dup-pairs` above (this is one of the 4 unresolved pairs — `maint`/`maintenance`). Consolidate onto `maintenance.*` (93 files, clearly canonical by volume) and retire the 3 `maint.*` writers.

---

### wo-cancellation-reasons-fold-into-void-cancel-  [maintenance]  not gated (catalogs consolidation, non-financial)
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/catalogs/wo-cancellation-reasons.routes.ts` still exists as its own standalone route/table and is actively registered (`apps/backend/src/catalogs/index.ts:9`); `catalogs.void_cancel_reasons` (`db/migrations/202606300030_void_cancel_reasons_catalog.sql`) was built "modeled column-for-column / policy-for-policy" as the intended replacement, but no fold/migration consolidates WO-cancellation reasons into it.
- FILES: `apps/backend/src/catalogs/wo-cancellation-reasons.routes.ts`; `apps/backend/src/catalogs/void-cancel-reasons.routes.ts`; `db/migrations/202606300030_void_cancel_reasons_catalog.sql`.
- FIX STEPS:
  1. Add a `reason_category` or `applies_to` discriminator column to `catalogs.void_cancel_reasons` (if not already present) so WO-cancellation reasons can live in the same table.
  2. Migrate existing `wo_cancellation_reasons` rows into `void_cancel_reasons` via an additive HOLD-FOR-JORGE migration (INSERT, never move-and-drop).
  3. Repoint the WO-cancellation UI/routes at `void-cancel-reasons.routes.ts`, then retire (archive, don't delete) `wo-cancellation-reasons.routes.ts` per the void-cancel-governance policy.
- GUARD: extend `void-cancel-governance` tests to cover WO-cancellation reason codes once folded.

---

### 0010-f2-unscoped-financial-tables  [platform]  GATED (db migration held)
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/202606300090_af3_catalogs_classes_per_entity.sql` (adds `operating_company_id` to `catalogs.classes`) is in `db/migrations/.held-migrations.json` (reason: `[HOLD-FOR-JORGE — TIER 1] AF-3`) — never run on prod. `catalogs.classes` therefore remains unscoped by entity today.
- FILES: `db/migrations/202606300090_af3_catalogs_classes_per_entity.sql`; `.held-migrations.json`.
- FIX STEPS:
  1. Get Jorge's explicit "OK to merge" (financial-cluster, PROTECTED gate) and release from `.held-migrations.json`.
  2. Re-verify (post-merge) that `catalogs.classes` RLS policies actually key off the new column, not just that the column exists.
- GUARD: `scripts/verify-fk-integrity` style check, or simplest: a CI check that fails if any table in `catalogs.*`/`accounting.*` lacks `operating_company_id` and isn't on an explicit global-reference allowlist (mirrors the `excl` array pattern already used in `202606290002_rls_force_tail.sql`).

---

### 0010-f3-rls-missing-force  [platform]  GATED (RLS/security migration)
- STATE: STILL-OPEN
- ROOT CAUSE: `db/migrations/202606290002_rls_force_tail.sql` runs a one-time `DO $$` loop over `pg_class` AT THE TIME IT EXECUTES — it forces RLS on every table matching `relrowsecurity=true AND relforcerowsecurity=false` that existed then, but any table created **after** this migration ran with RLS enabled-but-not-forced gets no automatic FORCE. It is not drift-proof.
- FILES: `db/migrations/202606290002_rls_force_tail.sql`.
- FIX STEPS:
  1. Add a lightweight ongoing CI/cron check (not a new migration) that re-runs the same `pg_class` sweep query read-only and reports any newly-drifted table.
  2. For actual enforcement going forward, adopt a habit/lint rule: every new `CREATE TABLE ... ENABLE ROW LEVEL SECURITY` migration must also include `FORCE ROW LEVEL SECURITY` in the same file (the `ih35-financial-migrations` skill's template should be updated to include this by default).
- GUARD: (new) `scripts/verify-rls-force-drift.mjs` — connects read-only (or runs in CI against a fresh migrated DB) and asserts zero tables have `relrowsecurity=true AND relforcerowsecurity=false` outside the documented exclude-list.

---

### 0033-verify-fk-integrity-guard  [platform]  not gated (CI tooling)
- STATE: STILL-OPEN
- ROOT CAUSE: only `scripts/verify-fk-integrity-fault-da-records.mjs` exists, narrowly scoped to fault/DA records — no general-purpose orphan-FK scan across `accounting.*`/`mdata.*`/`catalogs.*`.
- FILES: (new) `scripts/verify-fk-integrity-general.mjs`, modeled on the existing narrow script.
- FIX STEPS:
  1. Read `scripts/verify-fk-integrity-fault-da-records.mjs` for the existing query pattern (likely `information_schema` FK introspection + orphan-row COUNT).
  2. Generalize it: enumerate all FK constraints in `accounting`/`mdata`/`catalogs`/`driver_finance`/`banking` schemas via `information_schema.referential_constraints`, run an orphan-check (`NOT EXISTS` on the referenced side) for each, fail CI on any non-zero count outside a documented allowlist (soft-deleted parents, etc).
- GUARD: the script itself is the guard — add it to the CI pipeline (`package.json` scripts + workflow yaml).

---

### 0219-nested-modals  [platform]  UNVERIFIABLE
- STATE: UNVERIFIABLE — `.block-ready/0219-nested-modals.json` is boilerplate with no source spec text; no nested-modal defect could be located or ruled out in the frontend from the id alone.
- FIX STEPS: locate the original spec/repro before scoping.
- GUARD: n/a until scoped.

---

### 0243-g2-2-operating-company-id-trusted-raw-ten  [platform]  GATED (settlements — cross-tenant/financial)
- STATE: STILL-OPEN — and worse than a generic "trust raw ID" note: this is a live, reproducible cross-tenant access gap.
- ROOT CAUSE: `apps/backend/src/settlements/approval.routes.ts` has a **known, already-half-fixed** class of bug: the sibling `GET /api/v1/settlements/:id/line-items` route was patched with an explicit "IDOR fix (xe-fin)" comment calling `resolveOperatingCompanyId(client, user.uuid, requestedCompanyId)` (which validates the caller's membership in that company) — but `GET /api/v1/settlements/:id/approval-summary` (lines 60-78), `POST /api/v1/settlements/approve-line` (~lines 100-125), and `POST /api/v1/settlements/reject-line` (~lines 128-150) all still do `const operatingCompanyId = String(query.operating_company_id || "")` with **only a truthiness check, no membership validation**, then pass it straight into `approvalService.getSettlementSummary`/`approveLineItem`/`rejectLineItem`. Any authenticated Owner/Administrator/Manager/Accountant/Payroll-role user can pass a different company's UUID and read/approve/reject that company's driver settlement line items.
- FILES: `apps/backend/src/settlements/approval.routes.ts` (routes at lines ~60, ~100, ~128); reference the already-fixed `/line-items` route (line ~89-99) as the exact pattern to copy; `apps/backend/src/auth/operating-company-scope.js` (`resolveOperatingCompanyId`).
- FIX STEPS:
  1. In `/approval-summary`, replace the raw `String(query.operating_company_id || "")` with `await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId)` inside the `withCurrentUser` callback, exactly as `/line-items` already does.
  2. Apply the identical fix to `/approve-line` and `/reject-line` (and any other route in this file still doing the raw-trust pattern — re-grep the whole file, not just the three found).
  3. Add a cross-tenant integration test: user in Company A calls each of these three routes with Company B's `operating_company_id` and a real Company-B settlement id; assert 403/404, not data leakage.
- GUARD: `scripts/verify-operating-company-id-membership-checked.mjs` — statically scans every route file for `query.operating_company_id`/`body.operating_company_id` reads and flags any that don't flow through `resolveOperatingCompanyId`/`assertCompanyMembership` before use in a query. This exact bug class is called out in the `cross-entity-leak-audit-usmca` memory ("~16 endpoints blend entities") — this file should be added to that audit's list.

---

### 0243-h2-2-stale-backend-lockfile-unshipped-cve  [platform]  ALREADY-FIXED
- STATE: ALREADY-FIXED — evidence confirms the regenerated `package-lock.json` commit is an ancestor of `origin/main` (i.e., already merged/shipped).
- No further action needed.

---

### 0243-h5-3-no-r2-evidence-check-dr-drill-stub-7  [platform]  ALREADY-FIXED
- STATE: ALREADY-FIXED — `apps/backend/src/cron/evidence-presence-reconcile.cron.ts` (399 lines) + test exist, `run-dr-drill-evidence-check.ts` imports `runDrDrillEvidenceCheck` from it, `scripts/backup-restore-drill.sh` invokes that, and `initializeEvidencePresenceReconcileCron` is imported and called in `apps/backend/src/index.ts:453,1448` — the whole chain is real and wired, not a stub.
- No further action needed.

---

### 0243-h6-2-cash-advance-display-id-no-lock-no-u  [platform]  ALREADY-FIXED
- STATE: ALREADY-FIXED — `apps/backend/src/cash-advances/display-id.ts` genuinely uses `pg_advisory_xact_lock(hashtext(scope))` (line 15) to serialize display-ID generation, with a dedicated test `display-id-advisory-lock.test.ts`. No missing-lock/uniqueness gap found.
- No further action needed.

---

## Counts

- **STILL-OPEN:** 27 (flow1-escrow-linked-to-termination-record; hiredate-provenance-partial; notif-b-android-block; s-08-no-driver-unit-type-date-filters-incident; 0091-g10-h3 [escrow-forfeit sub-route]; 0091-g11-5; 0243-b1-2-factor-reserve-default-liability-fal; 0518-r18-schema-fragmentation-8-dup-pairs; core-ledger-write-proof-trucking-evidence; fact-fix1-duplicate-vendors-banner; fact-par-1-factoring-submission-gating; fact-par1-submissionqueue-unrouted; factoring-asc860-determination-memo; factoring-coder-directive-item-c-unconfirmed [true-up half]; 0441-mod13-inventory-part-to-unit-none; owner-batch-s2-units-value-catalog; 0441-mod3-fuel-fraud-detector-cron-never-invok; 0441-mod12-legal-no-reverse-drill-through [fleet/insurance side]; 0091-h2-3/0243-h2-3-lucia-deprecated-auth-lib; 0091-h5-1/0243-h5-1-append-only-spine-unbounded-growth; 0519-dc2-maint-schema-144-rows-active-alongsid; wo-cancellation-reasons-fold-into-void-cancel-; 0010-f2-unscoped-financial-tables; 0010-f3-rls-missing-force; 0033-verify-fk-integrity-guard; 0243-g2-2-operating-company-id-trusted-raw-ten)
- **ALREADY-FIXED:** 15 (0451-fin2-finance-lands-on-stub-not-hub; 0441-mod5-actionbar-dead-links; 0441-mod9-create-trailer-no-manual-path; 0441-mod9-fleet-roster-no-create-actions; 0441-mod9-second-create-unit-backend-orphaned; 0251-gap1-factoring-vendor-fk-not-stored; 0251-gap4-driver-vendor-mapping; 0441-mod8-factoring-virtual-hardcodes-zero; 0251-gap7-fuel-surcharge-gl_VERIFY; 0441-mod9-fleet-insurance-summary-never-render; 0441-mod9-maintenance-vendor-linkage-broken; 0243-h2-2-stale-backend-lockfile-unshipped-cve; 0243-h5-3-no-r2-evidence-check-dr-drill-stub-7; 0243-h6-2-cash-advance-display-id-no-lock-no-u; 0091-g10-h3 [2 of its 3 sub-routes: reconcile-apply + payment-unapply])
- **UNVERIFIABLE / owner-decision-pending / deferred-by-design:** 5 (0243-g10-h3-six-ui-features-404-routes; 0091-m-woid-1; 0441-mod2-vendor-ap-disconnected; 0219-nested-modals; factoring-g3-debtor-credit-check-decision-note; 0252-audit148-remote-work-policy [deferred by design]; 0277-csrf-tokens-recommendation [residual claim unverifiable])

(Note: 47 input findings; several map to a single combined ticket where two ids described the same underlying gap — 0091-h2-3=0243-h2-3, 0091-h5-1=0243-h5-1 — and one finding, 0091-g10-h3, split across 3 sub-states. Counts above tally the effective verdicts, not raw id count.)

## GATED vs non-gated

- **GATED** (touches `accounting.*`/`catalogs.*`/`mdata.*`/db migrations/posting/GL/flags — needs owner OK before merge): **19** — flow1-escrow-linked-to-termination-record; hiredate-provenance-partial; 0091-g10-h3 (escrow forfeit posting); 0091-g11-5; 0243-b1-2-factor-reserve-default-liability-fal; 0251-gap1/0251-gap4 (already-fixed, but schema-touching class); 0518-r18-schema-fragmentation-8-dup-pairs; fact-par-1-factoring-submission-gating; factoring-coder-directive-item-c-unconfirmed; owner-batch-s2-units-value-catalog; 0091-h5-1/0243-h5-1; 0519-dc2-maint-schema-144-rows-active-alongsid; 0010-f2-unscoped-financial-tables; 0010-f3-rls-missing-force; 0243-g2-2-operating-company-id-trusted-raw-ten; factoring-g3-debtor-credit-check-decision-note; factoring-asc860-determination-memo (CPA sign-off, not code, but financial-determination); 0091-h2-3/0243-h2-3-lucia (auth path, treated cautiously though not accounting.*).
- **Not gated** (safe to build+PR on green CI, no accounting/schema/GL/prod-migration touch): **remainder** — notif-b-android-block; s-08-no-driver-unit-type-date-filters-incident; 0441-mod13-inventory-part-to-unit-none; 0441-mod3-fuel-fraud-detector-cron-never-invok; 0441-mod12-legal-no-reverse-drill-through (frontend-only reverse links); fact-fix1-duplicate-vendors-banner; fact-par1-submissionqueue-unrouted; 0033-verify-fk-integrity-guard (CI tooling only); wo-cancellation-reasons-fold-into-void-cancel- (catalogs consolidation, non-financial data); plus all ALREADY-FIXED / UNVERIFIABLE items (no build needed).

# bb_6 Build Tickets — Re-Verified Against Current `main`

Re-verification method: 4 parallel read-only research passes over current `main` (real greps/reads, no guessing), one per batch of the 49 input findings. Every STATE below is grounded in a cited file/line or explicit "zero hits" grep result from this session — no finding was carried over unverified from the input evidence text.

**Totals:** 49 tickets — **43 STILL-OPEN**, **6 ALREADY-FIXED**, **0 pure-UNVERIFIABLE** (one ticket, 0441-mod11, has a still-open half and an unverifiable-without-live-data half — counted under STILL-OPEN). **GATED: 20** (touches accounting.\*/catalogs.\*/mdata.\* schema, db-migrations, posting/GL, prod-DB access, or a CPA/owner ruling) vs **29 non-gated**.

---

## Cross-cutting note (read before the HR block)

Findings `0252-audit139/141/142/143/144/145/147/150` (8 tickets) are not code bugs — they are **feature-builds for modules that don't exist**. There is **no `mdata.employees` table and no W2/office-staff profile model anywhere in the repo** — the only person-records are `identity.users` (auth accounts) and `mdata.drivers` (1099 contractor profiles, per CLAUDE.md driver model: "hired Mexican-B1 1099 contractors, NOT employees"). Benefits-admin, wellness, diversity/EEO, and employee-relations/grievance are classically W2-employee constructs. **Recommend resolving the driver(1099)-vs-W2-employee scope question once, before any of these 8 are built** — it identically gates audit141/144/147/150 and shapes what table the others attach to. `audit144` (diversity/EEO) and `audit150` (employee-relations/grievance) additionally carry **legal-sensitivity** beyond a normal migration review (EEO data has legally-mandated handling rules; grievance/disciplinary records are litigation-discoverable) — flag to Jorge before design, not just before merge.

---

## module: platform

### 0252-audit139-performance-management  [platform]  GATED: yes
- STATE: STILL-OPEN — grepped `performance_review`, `scorecard`, `annual_review`; only hit is a **driver telematics safety scorecard** (`apps/backend/src/mdata/driver-aggregate.service.ts:268-355`, `apps/frontend/src/components/driver-profile/PerformanceScorecardSection.tsx`) — harsh-braking/speeding/fleet-rank, not an HR review cycle (no goals/ratings/manager sign-off). No performance-management module exists.
- ROOT CAUSE: feature-build — no performance-review module exists in backend or DB.
- FILES: nearest analog only — `apps/backend/src/mdata/driver-aggregate.service.ts`, `apps/frontend/src/components/driver-profile/PerformanceScorecardSection.tsx` (UI pattern to reuse, not the same data model).
- FIX STEPS: 1) Resolve driver-vs-W2-staff scope (see cross-cutting note). 2) Migration for new review/cycle/rating table(s), idempotent + FORCE RLS/GRANTs per §2. 3) `apps/backend/src/hr/performance-reviews/{routes,service}.ts` following the `master-data/drivers/operations-depth/routes.ts` register-loader pattern. 4) Register in `apps/backend/src/index.ts`. 5) Frontend section under a driver-profile tab or new `apps/frontend/src/pages/hr/` page (additive-only, §7).
- GUARD: `verify-hr-performance-review-routes-registered.mjs` — asserts the route file exists and its `register*Routes` call appears in `index.ts`, plus a migration-ledger check the table exists.

### 0252-audit141-benefits-administration  [platform]  GATED: yes
- STATE: STILL-OPEN — grepped `benefits`; only hit is a read-only QBO payroll aggregate (`apps/backend/src/payroll-integration/qbo-payroll-pull.ts` → `total_benefits_cents`, surfaced in `apps/frontend/src/pages/payroll-integration/PayrollIntegrationPage.tsx:41`). No plans/enrollment/eligibility/elections workflow exists.
- ROOT CAUSE: feature-build; also a business-model threshold question (1099 drivers don't receive employer benefits under this model).
- FILES: pattern references only — `apps/backend/src/payroll-integration/aggregate.routes.ts`, `qbo-payroll-pull.ts`.
- FIX STEPS: 1) Confirm audience (W2 staff, who have no profile table today — may require a `hr.employees`-linked table set first). 2) Migration for `hr.employee_benefit_plans`/`hr.employee_benefit_elections` (RLS+grants). 3) `apps/backend/src/hr/benefits/routes.ts`+service. 4) Make `PayrollIntegrationPage.tsx`'s "Benefits" tile drill into the new module instead of dead-ending on the QBO number.
- GUARD: `verify-hr-benefits-admin-module-wired.mjs` — route registered + "Benefits" tile is a drill-through link, not a dead-end number.

### 0252-audit142-engagement-tracking  [platform]  GATED: yes
- STATE: STILL-OPEN — grepped `engagement`/`pulse`/`survey`; hits are `customers/relationship-score/scorer.service.ts` (customer engagement, unrelated) and `master-data/drivers/operations-depth/pwa-engagement.service.ts` (driver PWA app-usage telemetry, not sentiment). No employee engagement/pulse-survey program exists.
- ROOT CAUSE: feature-build.
- FILES: none existing to attach to (naming collision with `pwa-engagement.service.ts` only, unrelated).
- FIX STEPS: 1) Migration for `hr.engagement_surveys`/`hr.engagement_responses` (idempotent, RLS). 2) `apps/backend/src/hr/engagement/routes.ts`+service, `{slug, loader}` pattern from `operations-depth/routes.ts`. 3) Register in `index.ts`. 4) Survey-taking + results page under `apps/frontend/src/pages/hr/engagement/`.
- GUARD: `verify-hr-engagement-routes-registered.mjs` — route-registration + a source-honesty self-test that aggregate responses aren't fabricated/mocked.

### 0252-audit143-turnover-analysis  [platform]  GATED: partial — no if driver-scoped (existing columns), yes if it needs an employee table
- STATE: STILL-OPEN — grepped `turnover`/`attrition`; zero hits anywhere in backend, frontend, or migrations.
- ROOT CAUSE: feature-build (metric/report). Raw signal already exists for **drivers**: `mdata.drivers.deactivated_at`/`archived_at` (§4). No equivalent exists for W2 staff (no table).
- FILES: `mdata.drivers` (existing timestamp columns, no new schema needed if driver-scoped).
- FIX STEPS: 1) Decide scope — driver churn (buildable now, no migration) vs W2 attrition (blocked on the employee-table decision). 2) If driver-scoped: reporting service under `apps/backend/src/reports/` computing rate from `deactivated_at` over time windows. 3) Add a runner to the reports UI, `CsaFleetScoreCard.tsx` pattern.
- GUARD: `verify-driver-turnover-rate-source-honesty.mjs` — asserts the computed rate reads real `deactivated_at`, not a hardcoded value.

### 0252-audit144-diversity-metrics  [platform]  GATED: yes — also flag legal/compliance review before design
- STATE: STILL-OPEN — grepped `diversity`/`EEO`/`equal[-_]employment`; zero hits.
- ROOT CAUSE: feature-build + compliance-sensitivity: EEO/demographic data collection carries legal handling requirements (voluntary self-ID, restricted access) beyond normal CRUD.
- FILES: none existing.
- FIX STEPS: 1) STOP before design — get a legal/HR-compliance ruling on what may be collected and how access is restricted (bigger gate than a normal migration review). 2) If approved: migration with role-gated RLS (tighter than entity-only scoping). 3) Aggregate-only reporting views — never row-level exposure.
- GUARD: `verify-eeo-fields-access-restricted.mjs` — static check that any new demographic column is only ever read through an aggregate query, never a per-record API response.

### 0252-audit145-workplace-culture  [platform]  GATED: yes
- STATE: STILL-OPEN — grepped `culture`/`culture[-_]survey`/`workplace[-_]culture`; zero hits.
- ROOT CAUSE: feature-build; likely the same survey infrastructure as `audit142` — build one generic `hr.surveys` engine parameterized by `survey_type` rather than three separate modules.
- FILES: none existing.
- FIX STEPS: 1) Merge scope with `audit142` — one `hr.surveys`+`hr.survey_responses` schema, `survey_type` column. 2) `apps/backend/src/hr/surveys/routes.ts` handling all types. 3) Results dashboard filterable by type.
- GUARD: same `verify-hr-engagement-routes-registered.mjs`-style guard, parameterized to check culture is a selectable type, not a drifting duplicate module.

### 0252-audit147-wellness-program  [platform]  GATED: partial — yes if participation is tracked, no if static content only
- STATE: STILL-OPEN — grepped `wellness`; zero hits.
- ROOT CAUSE: feature-build + same business-model threshold question as `audit141` (wellness is typically a W2 perk; unclear applicability to 1099 drivers).
- FILES: none existing.
- FIX STEPS: 1) Confirm audience before building — if driver-facing, consider `apps/driver-pwa` instead of the office frontend. 2) If participation tracking needed: migration for `hr.wellness_program_enrollments`. 3) Route/service under `apps/backend/src/hr/wellness/`. 4) Frontend page/tab.
- GUARD: `verify-hr-wellness-routes-registered.mjs` — route-registration check, same family as the others.

### 0252-audit150-employee-relations  [platform]  GATED: yes — also flag legal-sensitivity (litigation-discoverable records)
- STATE: STILL-OPEN — grepped `grievance`/`disciplinary`/`employee[-_]relations`; only hit is `apps/backend/src/legal/templates/legal-template-library.generated.ts`, a generic contract-template document (no case records, no status workflow, no investigation notes).
- ROOT CAUSE: feature-build; existing `legal/templates` is a document-template library, not a case-management system.
- FILES: `apps/backend/src/legal/` is the natural parent (existing legal module) — attach a new `apps/backend/src/legal/employee-relations/` subtree there, not an unrelated top-level dir.
- FIX STEPS: 1) Migration for `legal.disciplinary_cases`/`legal.grievances` (void-not-delete, append-only audit, RLS). 2) `apps/backend/src/legal/employee-relations/routes.ts`, existing legal-module registration pattern in `index.ts`. 3) Case list/detail page under the Legal module nav (no new top-level sidebar item — §7 28-item contract). 4) Link cases forward/reverse to the driver/employee profile (§10a Total-Connectivity).
- GUARD: `verify-hr-employee-relations-case-linkage.mjs` — case table FKs to a real person record + reachable via drill-through, not orphaned.

### 0277-error-swallowing-rollback-catch  [platform]  GATED: yes for the accounting/driver-finance file subset — recommend splitting the PR
- STATE: STILL-OPEN — confirmed and **broader than the finding states**: `apps/backend/src/auth/db.ts:181,206,237` and `apps/backend/src/cron/samsara-master-sync.cron.ts:112` are exactly as described (`.catch(() => {})` after `ROLLBACK`, no `app.log`). A full repo grep found **~46 unlogged sites**, not 8, including `outbox/processor.ts`, `accounting/journal-entry-qbo-push.service.ts`, `accounting/month-close.service.ts`, `accounting/recurring.worker.ts`, `accounting/p7-wave2.routes.ts`, `driver-finance/cash-advance-owner-approval.service.ts`, `qbo/sync-with-retry.ts`, `integrations/qbo/*`, `mdata/qbo-master-write.routes.ts`, `dispatch/*`, `seed/csv-seed-import.ts`. The existing guard `scripts/verify-no-swallow-on-money-paths.mjs` only flags empty `catch(e){}`/`.catch()` on `emit*SpineEvent(...)` scoped to a narrow `MONEY` path regex — it does not match `auth/db.ts` or `cron/` paths and does not pattern-match `.catch(() => {})` chained off a literal ROLLBACK string at all.
- ROOT CAUSE: `.catch(() => {})` after ROLLBACK/ROLLBACK-TO-SAVEPOINT swallows the rollback failure with zero log signal — a stuck/half-rolled-back transaction is invisible.
- FILES: `apps/backend/src/auth/db.ts:181,206,237`; `apps/backend/src/cron/samsara-master-sync.cron.ts:112`; plus ~40 more across `accounting/*`, `driver-finance/*`, `qbo/*`, `integrations/qbo/*`, `mdata/qbo-master-write.routes.ts`, `dispatch/*`, `seed/csv-seed-import.ts`.
- FIX STEPS: 1) Add a shared helper `rollbackSafely(client, logger, context)` → `.catch((e) => logger.error({ err: e, ...context }, "rollback_failed"))`. 2) Replace every unlogged `.catch(...)` after a ROLLBACK with it, threading `app.log`/`req.log` from call sites. 3) Split into two PRs: non-financial files (`auth/db.ts`, `cron/`, `dispatch/`, `seed/`, `integrations/samsara`, `mdata/qbo-master-write.routes.ts`) self-mergeable on green; `accounting/*` and `driver-finance/*` files go through §1.3 STOP.
- GUARD: `verify-rollback-catch-logs.mjs` — repo-wide static scan for `ROLLBACK[^;]*\.catch\(` where the catch body has no `log.error|logger\.|Sentry|captureException`; no MONEY-path restriction (fixes the coverage gap in the existing guard).

### 0280-27-widget-audit-trail-logging  [platform]  GATED: no
- STATE: STILL-OPEN but scope-mismatched — the underlying feature doesn't exist. `apps/backend/src/home/home-widgets.routes.ts` (410 lines, 9 endpoints) is confirmed all-`GET` — zero audit/log-event calls, true, but also **there is no widget pin/unpin/reorder mutation endpoint anywhere in the repo** (grepped backend, frontend, migrations for pin/unpin/reorder/widget_config/widget_order — only an unrelated FE contract test hit). The finding describes auditing a mutation surface that hasn't been built.
- ROOT CAUSE: no widget-config persistence/mutation layer exists to audit.
- FILES: `apps/backend/src/home/home-widgets.routes.ts` (confirmed reads-only, no audit calls).
- FIX STEPS: 1) When/if a widget pin/unpin/reorder feature is built (new table, e.g. `mdata.user_widget_preferences`), wire `audit.ensure_row_trigger('mdata','user_widget_preferences')` into its migration. 2) Add an explicit audit write on the mutation route for user-intent metadata beyond the row diff. 3) Close this ticket as N/A until the feature exists.
- GUARD: N/A yet — add a `verify-row-changes-evidence-coverage.mjs` entry for the new table once built.

### 0280-28-api-response-zod-validation  [platform]  GATED: no
- STATE: STILL-OPEN — confirmed exactly. In `apps/frontend/src/api/home.ts`, only `fetchDriverDaySummary` (line 749) uses a real zod schema (`homeDriverDaySummaryResponseSchema.safeParse`, defined line 415). ~11 other fetchers (`fetchHomeAttentionList`, `fetchHomeFleetSnapshot`, `fetchHomeQboCustomersPushStatus`, `fetchHomeTodayRevenue`, `fetchHomeCashPosition`, `fetchHomeFactoringBalance`, `fetchHomeWeeklyRevenue`, `fetchHomeWoStatusCounts`, `fetchHomeFleetUtilization`, `fetchOwnerTodaysAttention`, `fetchSafetyOfficerRoleHome`, etc.) use manual `num()` coercion / hand-rolled type guards, no schema.
- ROOT CAUSE: no shared zod-response-schema convention was applied when these fetchers were added.
- FILES: `apps/frontend/src/api/home.ts` (`num()` helper at line 421, used ~30+ times).
- FIX STEPS: 1) Write zod schemas mirroring each backend payload shape in `home-widgets.routes.ts`. 2) Replace manual `num()`/type-guard coercion in each `fetchHome*` with `.safeParse(raw)` — preserve the intentional-null-not-zero behavior for CPA-sensitive fields (don't let zod defaults silently zero a nullable field). 3) Use `fetchDriverDaySummary`'s safeParse→manual-normalize-on-failure as the template.
- GUARD: `verify-home-api-zod-coverage.mjs` — every exported `fetch...` in `home.ts` must contain a `.safeParse(`/`.parse(` call; fail on any new fetcher without one.

### 0280-29-legacy-fallback-tests  [platform]  GATED: no
- STATE: STILL-OPEN (zero-hit confirmed, as the finding itself concedes) — grep `-ri "legacy"` across `apps/backend/src/home/` and `apps/frontend/src/**/home**` found zero backend hits; frontend hits are only the intentional legacy-fallback *implementation* itself (`apps/frontend/src/api/home.ts:20,61,72,758` — comment, `inferTypeFromLegacy`/`mapLegacySeverity`, a `legacy` local var in `fetchDriverDaySummary`'s fallback branch), not a bug or missing test.
- ROOT CAUSE: can't ground a fix without knowing which fallback path the original finding meant.
- FILES: `apps/frontend/src/api/home.ts:20,61,72,90,112-113,161,519,758-759,778`.
- FIX STEPS: 1) Confirm with the filer which fallback they meant (attention-list 404-fallback at line 106-117, or driver-day-summary safeParse-fail fallback at 749-785). 2) Add a vitest case forcing that failure path and asserting the legacy-shape normalization.
- GUARD: none until scope is confirmed — a guard for an unconfirmed defect would be guessing.

### 0441-mod13-form425c-exhibit-c-opening-balance-  [platform]  GATED: yes — feeds a bankruptcy Form 425(c) legal exhibit
- STATE: STILL-OPEN — confirmed verbatim. `apps/backend/src/reports/form-425c/exhibits/exhibit-c-bank-reconciliation.ts:30-36` contains the exact comment: "OPENING BALANCE — DEFERRED / FLAGGED FOR JORGE + COUNSEL: there is NO migration-free per-account historical daily-balance source (`banking.bank_account_balances` does not exist in any migration; it was phantom). We therefore report `opening_balance_cents = 0`..." Line 62 hardcodes `const opening = 0;`; line 64's `closing_balance_cents = opening + inflows - outflows` is net-flow-only and won't tie to a real bank statement.
- ROOT CAUSE: no per-account historical daily-balance table exists in any migration; `banking.bank_account_balances` was referenced once but never created (phantom-schema class bug) — no anchor to seed `opening_balance_cents`.
- FILES: `apps/backend/src/reports/form-425c/exhibits/exhibit-c-bank-reconciliation.ts:6,30-36,62,81`.
- FIX STEPS: 1) Design (docs-only) a `banking.bank_account_daily_balances` snapshot migration, backfillable from `banking.bank_transactions` running-balance where available. 2) Get Jorge + counsel sign-off on the reconstruction methodology (legal-evidence grade). 3) Migration + backfill under full §1.3/§1.4 STOP flow. 4) Update `buildExhibitC` to read the real snapshot and add a tie-out check against the statement ending balance.
- GUARD: `verify-exhibit-c-opening-balance-not-fabricated.mjs` — passes only if the file still has the explicit DEFERRED comment with `opening=0` (documented gap) OR reads from a named real table; fails if the comment is removed while `opening=0` remains (turns a documented gap into silent fabrication).

### 0441-mod6-idvr-row-not-clickable-session-fake-  [platform]  GATED: no
- STATE: ALREADY-FIXED — `apps/frontend/src/pages/safety/IdvrPage.tsx:102-105` passes a real `onRowClick` to `ParityTable` (`navigate(/safety/idvr/${id})`); `ParityTable.tsx:626-629` wires it to an actual `onClick` with `cursor-pointer hover:bg-gray-50`. Column-level `<EntityLink>`s (driver/unit/work_order) exist in addition to, not instead of, the row click. No mock/fake session data found in the file or its data hook (`getSafetyDvirSubmissions` in `apps/frontend/src/api/safety.ts:182-201` is a plain `apiRequest` call).
- ROOT CAUSE: N/A. The "fake session data" portion of the original claim was never located and remains unsubstantiated.
- FILES: `apps/frontend/src/pages/safety/IdvrPage.tsx:102-105`; `apps/frontend/src/components/parity/ParityTable.tsx:626-629`; `apps/frontend/src/api/safety.ts:182-201`.
- FIX STEPS: none — close the ticket.
- GUARD: none needed.

### 0473-1-10-year-end-close-retained-earnings-asc  [platform]  GATED: yes — CPA/owner ruling required before any design work
- STATE: STILL-OPEN — grepped `docs/specs/` and `docs/lockdown/` for "retained earnings"/"year-end close"/"ASC 852"/"ASC 205"; hits are only incidental mentions inside broad blueprint docs, none a dedicated locked-decision doc with acceptance criteria. `docs/lockdown/00_LOCKED_DECISIONS.md` has no entry.
- ROOT CAUSE: the ASC-topic year-end-close/retained-earnings treatment has never been put in front of Jorge/CPA for a ruling.
- FILES: none to build yet.
- FIX STEPS: 1) Draft a decision memo (design-doc only, no code) — what triggers year-end close in the parallel-books model, how retained earnings rolls forward per entity (never consolidated, per `revenue-recognition-at-delivery-and-no-consolidation`). 2) Route to Jorge+CPA for explicit ruling (§1.3 STOP). 3) Add the ruling to `docs/lockdown/00_LOCKED_DECISIONS.md`, then scope a build ticket.
- GUARD: none until the ruling exists.

### 0518-r17-147-fk-less-financial-columns  [platform]  GATED: no for the reporting-script ticket itself; yes for the downstream FK-remediation follow-on
- STATE: STILL-OPEN, but a broader guard exists than the finding credits. `scripts/verify-fk-integrity-fault-da-records.mjs` is indeed narrow (4 named FK constraints from one migration). However `scripts/verify-orphan-fk-inventory.mjs` IS a comprehensive, repo-wide static census of every `*_id`/`*_uuid` column with no inline `REFERENCES`, wired as a **required** CI step (`.github/workflows/locked-guards.yml:1164-1167`), baselined at 746 entries. It's a ratchet against *new* orphans, not a fix for existing gaps — it doesn't isolate `accounting.*`/`catalogs.*` columns from the rest, so the "147 fk-less financial columns" are almost certainly already silently baselined (frozen as accepted), not actively flagged.
- ROOT CAUSE: the existing ratchet treats all `*_id`/`*_uuid` orphans as equally acceptable-if-baselined; no stricter financial-schema-scoped subset report exists for prioritized remediation.
- FILES: `scripts/verify-fk-integrity-fault-da-records.mjs` (narrow); `scripts/verify-orphan-fk-inventory.mjs` + `scripts/verify-orphan-fk-inventory.baseline.json` (broad, 746 baselined).
- FIX STEPS: 1) Write a read-only reporting script filtering `computeInventory()` (already exported from `verify-orphan-fk-inventory.mjs`) down to `accounting.*`/`catalogs.*` keys to get the real current count. 2) Present the filtered list to Jorge/CPA for prioritization (expected no-FK columns like `operating_company_id`/`tenant_id`/QBO external ids are by design, per the script's own doc comment). 3) Each approved fix is an owner-gated migration adding the constraint (financial cluster, §1.4).
- GUARD: `verify-financial-orphan-fk-ratchet.mjs` — same ratchet mechanism scoped to `accounting.*`/`catalogs.*` only, baseline must strictly shrink.

### 0519-at1-245-tables-missing-created-by-user-id  [platform]  GATED: yes
- STATE: STILL-OPEN — confirmed both halves. `db/migrations/0092_p5_d4_manual_journal_entries.sql:12` gives `accounting.journal_entries` a `created_by_user_id` column, but the sibling table `accounting.journal_entry_postings` (lines 22-33) has none. Grepped all 13 subsequent migrations touching that table (`0123`, `0195`, `202606*`, `202607*`) for `ALTER TABLE ... ADD COLUMN created_by_user_id` — none found. No guard enforces "every table has `created_by_user_id`"; existing scripts only use the column as a test-fixture INSERT value where it already exists.
- ROOT CAUSE: `accounting.journal_entry_postings` was created without a `created_by_user_id` audit column even though its sibling has one — an inconsistency baked in at `0092`, never backfilled.
- FILES: `db/migrations/0092_p5_d4_manual_journal_entries.sql:22-33`.
- FIX STEPS: 1) Idempotent migration: `ALTER TABLE accounting.journal_entry_postings ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES identity.users(id);` (nullable — old rows stay null per void-not-delete/append-only, document explicitly). 2) Show Jorge the full SQL diff per §1.4, wait for explicit OK. 3) Wire the app-layer INSERT (reuse existing posting/GL insert code — no new GL math) to populate the column from `req.user.uuid`.
- GUARD: `verify-created-by-user-id-coverage.mjs` — static scan of every `CREATE TABLE` in `accounting.*`/`catalogs.*` for a `created_by_user_id` column or later ALTER; baseline-and-ratchet so today's gap doesn't block CI but no new gap can appear.

### 0519-mig2-4-applied-migrations-no-file-on-disk  [platform]  GATED: yes — requires gated prod Neon read access (§1.5)
- STATE: STILL-OPEN — confirmed verbatim. `docs/specs/orphaned-migration-records-runbook-0519.md` ends with "Disposition — No code/ledger change this pass — identification requires a gated prod read; remediation is owner-gated." Step 1 (diff `ih35_migrations.applied_migrations` against `ls db/migrations/*.sql` to find the 4 orphan rows) has never been run.
- ROOT CAUSE: identifying the 4 orphaned ledger rows requires a live prod query that has never been requested/run — fully designed, blocked purely on the permission gate.
- FILES: `docs/specs/orphaned-migration-records-runbook-0519.md` (full runbook, Steps 1-3 already written).
- FIX STEPS: 1) Ask Jorge for explicit one-time prod-read approval (§1.5) to run the Step-1 diff query. 2) Classify each of the 4 rows per the runbook's existing (a)/(b)/(c) buckets. 3) Record the disposition in the runbook, closing the item. 4) If any are bucket-(b) recoverable, file the SQL as a new higher-numbered migration.
- GUARD: `verify-migration-ledger-file-parity.mjs` — design already specified in the runbook; deferred until the Step-1 prod read produces the real ledger list needed for the fixture.

### biz-flow-1-abandonment-separate-from-terminati  [platform]  GATED: yes — mdata.drivers status write, cross-module financial (escrow) impact
- STATE: STILL-OPEN — `abandonment.service.ts`'s `recordLoadAbandonmentChargeback` (lines 229-239) only sets `mdata.loads.status='abandoned'` and inserts into `driver_finance.abandonment_chargebacks`; it never touches `mdata.drivers.status`. Meanwhile `driver-finance/escrow-separation.service.ts:98,121` *requires* `driver.status === "Terminated"` to release escrow — so an abandoned driver never gets terminated by this flow and stays stuck, unable to have escrow resolved.
- ROOT CAUSE: the abandonment/chargeback flow and the driver-termination flow are disconnected; escrow release is gated on a status the abandonment path never sets.
- FILES: `apps/backend/src/driver-finance/abandonment.service.ts:229-239`; `apps/backend/src/mdata/load-abandonment.routes.ts:49`; `apps/backend/src/driver-finance/escrow-separation.service.ts:98,121`; existing termination writers for reference: `apps/backend/src/mdata/workflow-routes.ts:350`, `driver-safety-events.routes.ts:565`, `drivers.routes.ts:1509`.
- FIX STEPS: 1) Get an owner/HR ruling on whether abandonment auto-terminates or moves the driver to an intermediate status distinct from voluntary Terminated. 2) In `recordLoadAbandonmentChargeback`, add the driver-status transition in the same transaction as the loads UPDATE. 3) Wire the `load.abandoned` outbox event consumer to re-check escrow-separation eligibility once status changes. 4) Add an audit event mirroring `drivers.routes.ts`'s existing pattern.
- GUARD: `verify-abandonment-driver-status-linkage.mjs` — fails if the abandonment flow writes `mdata.loads.status='abandoned'` without a corresponding `mdata.drivers` status transition in the same transaction.

### ci1-build-typecheck-flake-root-cause-and-guard  [platform]  GATED: no
- STATE: STILL-OPEN — only 6 `*.db.test.ts` files use `pg_advisory_lock` as ad-hoc mitigation (`invoice-ar-killswitch`, `chain-06-factoring-ar-tieout`, `factoring-balance-invoice-linkage`, `bank-driver-advance`, `bank-feed-gl-posting`, `bank-driver-advance-idempotency`); `scripts/verify-db-test-isolation.mjs` does not exist anywhere in the repo.
- ROOT CAUSE: shared-singleton-resource test races are mitigated file-by-file with no registry-driven guard to require the lock or catch new unguarded writers.
- FILES: the 6 files above; tracked as not-built in `docs/trackers/MASTER-MANIFEST-2026-07-10.md:246,3035-3037,3096`.
- FIX STEPS: 1) Build a static registry (JSON) mapping shared-singleton tables to the `*.db.test.ts` files that mutate them. 2) Guard fails if a registered file writes the resource without the paired `pg_advisory_lock`/`pg_advisory_xact_lock`. 3) Guard also fails if a NEW `.db.test.ts` writes a known shared-singleton table while unregistered. 4) Wire into `verify:pre-commit`/CI `build-typecheck`.
- GUARD: `verify-db-test-isolation.mjs` — as described above.

### coder-32-migration-drift-prod-triage-pending  [platform]  GATED: yes — requires gated prod Neon read access (§1.5)
- STATE: STILL-OPEN — `docs/audits/MIGRATION-DRIFT-FINDINGS.md:38-51` literally reads "PROD run — PENDING (§1.5)" with the exact unexecuted command (`node scripts/audit-migration-drift.mjs --database-url="<prod>" --out docs/audits/migration-drift-prod.txt`).
- ROOT CAUSE: tooling is built and ready; execution is blocked purely on the prod-access permission gate, not a technical gap.
- FILES: `docs/audits/MIGRATION-DRIFT-FINDINGS.md:38-51`; `scripts/audit-migration-drift.mjs`.
- FIX STEPS: 1) Get Jorge's explicit per-connection OK (§1.5). 2) Run the command against prod (read-only). 3) Diff against the §A fresh-DB baseline (18 known-benign entries) to isolate real drift. 4) File any real-drift findings as separate tickets; update the doc's §B status.
- GUARD: tool is already report-only; optional `verify-migration-drift-prod-freshness.mjs` to fail CI if the prod output file goes stale (age-based), once first produced.

### entitylink-reverse-drill-incomplete  [platform]  GATED: no
- STATE: STILL-OPEN for the coverage gap — but the finding's CI-wiring claim is **factually wrong on current main**. Real count: 209 `<EntityLink>` call sites across 106 files vs 811 non-test page files under `apps/frontend/src/pages`. But `scripts/verify-entity-link-adoption.mjs` is NOT orphaned: it's wired as `scripts/verify-steps/930-verify-entity-link-adoption.mjs`, runs inside `npm run verify:pre-commit`, invoked by `ci / build-typecheck` (`.github/workflows/ci.yml:75`), which IS a mandatory required-status-check (`.github/branch-protection-config.json`). It exits 1 on any drift vs its exact baseline (`scripts/entity-link-adoption-baseline.json`) — it's a real anti-regression ratchet, just narrow (naked-ID exposure only), not a "every page needs EntityLink" completeness contract.
- ROOT CAUSE: coverage-completeness gap is real; the "orphaned/never-in-CI" characterization is stale/incorrect.
- FILES: `scripts/verify-entity-link-adoption.mjs` (671 lines); `scripts/verify-steps/930-verify-entity-link-adoption.mjs`; `.github/workflows/ci.yml:75`; `.github/branch-protection-config.json`.
- FIX STEPS: 1) Correct the tracker text — re-file as a coverage-completeness gap only, not a CI-wiring gap. 2) If broader completeness is wanted, add a second guard flagging NEW pages that render unlinked ID-shaped fields without EntityLink. 3) Track outstanding raw-ID pages in `docs/trackers/DEFERRED-ITEMS.md` for phased conversion.
- GUARD: regression side already covered by the existing wired guard; add `verify-entity-link-coverage-ratchet.mjs` only if page-level adoption-% trending is desired.

### events-event-log-force-rls-still-blocked  [platform]  GATED: yes — requires Jorge's explicit "OK to merge/run"
- STATE: STILL-OPEN — `db/migrations/202607510000_events_audit_log_entity_isolation.sql:1-4` is explicitly marked "[HOLD-FOR-JORGE — TIER 1] ... DO NOT RUN ON PROD without Jorge's explicit approval. Build-and-HOLD." Line 22 does `ALTER TABLE events.event_log ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY` but it is unapplied to prod. (Note: the `202607510000` "day-51" style prefix is an established sequence convention here, not a typo/bug — siblings run `202607370000` through `202607600000`.)
- ROOT CAUSE: the fix is built and held for owner sign-off; `events.event_log` stays RLS-unforced on prod until then.
- FILES: `db/migrations/202607510000_events_audit_log_entity_isolation.sql:1-4,22`.
- FIX STEPS: 1) Show Jorge `git diff` + full SQL per §1.4. 2) Get explicit "OK to merge/run" before applying to any branch touching prod. 3) Apply on a Neon branch first, verify policies, then ledger-backfill so `db:migrate` doesn't silently skip it. 4) Confirm the post-apply RLS state.
- GUARD: `verify-event-log-force-rls-applied.mjs` (prod-safe, read-only) — checks `pg_class.relforcerowsecurity` for `events.event_log`/`public.audit_log`; currently would correctly report FAIL/PENDING.

### law-of-land-entitylink-reverse-drill-adoption  [platform]  GATED: no
- STATE: STILL-OPEN — same underlying fact pattern as `entitylink-reverse-drill-incomplete` above, restated under the Total-Connectivity law framing: 209 `<EntityLink>` sites in 106 of ~811 pages; broad but not exhaustive. The existing 930 guard prevents new naked-ID regressions but doesn't require net-new adoption on every page.
- ROOT CAUSE: same as above.
- FILES: same as above.
- FIX STEPS: same 3 steps as `entitylink-reverse-drill-incomplete` — treat as one remediation, not two.
- GUARD: same as above — do not build a duplicate guard for this ticket; it's the same gap.

### p1-apm  [platform]  GATED: no
- STATE: MOSTLY ALREADY-FIXED — more built than the finding suggests. `apps/backend/src/lib/sentry.ts:13-19` configures `Sentry.init({ integrations: [nodeProfilingIntegration()], tracesSampleRate: 0.1, profilesSampleRate: 0.1, ... })` — real performance tracing + profiling, not just error capture. `index.ts:566` calls `initBackendSentry()`, `:578` `registerSentryFastifyErrorHandler(app)`, `:650` `attachSentryRequestScope(req)` per request.
- ROOT CAUSE: N/A for the code side; only unverifiable-from-repo piece is external Sentry-dashboard/alert configuration.
- FILES: `apps/backend/src/lib/sentry.ts:13-19`; `apps/backend/src/index.ts:422,566,578,650`.
- FIX STEPS: 1) Confirm dashboards/alerting on the Sentry project side (not repo-verifiable). 2) If uptime/synthetic monitoring is part of "full P1 APM scope," verify separately — not found in-repo. 3) No code fix needed; re-scope the finding narrowly to "external config unverified" rather than a code defect.
- GUARD: optional `verify-sentry-tracing-config.mjs` — static check that `tracesSampleRate`/`profilesSampleRate` remain set (regression guard).

### p1-compression  [platform]  GATED: no (but is a runtime dependency bump — needs Jorge's OK per §1.3 before merge even though non-financial)
- STATE: STILL-OPEN — no `@fastify/compress` (or any compression dep) in `apps/backend/package.json`; no compression middleware registered anywhere in `apps/backend/src` (only unrelated hit is a PDF-parsing comment about "uncompressed page trees").
- ROOT CAUSE: response compression was never added.
- FILES: `apps/backend/package.json`; `apps/backend/src/index.ts:502` (Fastify instance, no compress plugin).
- FIX STEPS: 1) `npm install @fastify/compress`. 2) `app.register(fastifyCompress, { global: true, encodings: ["gzip","deflate","br"] })` near other global plugin registrations. 3) Verify `Content-Encoding` on a large JSON list endpoint. 4) Per §1.3, this is a runtime dependency bump — get Jorge's OK before merge.
- GUARD: `verify-backend-compression-registered.mjs` — greps `package.json` for `@fastify/compress` and `index.ts` for a `register(...compress...)` call.

### p1-error-handling  [platform]  GATED: no
- STATE: ALREADY-FIXED — the finding's evidence is factually wrong on current main. The SAFER/FMCSA calls are **not** fire-and-forget: `customers.routes.ts:730-739` (create) and `:1100-1145` (update) enqueue `enqueueFmcsaCustomerVerifyRequested(...)` into the durable outbox in the same DB transaction ("Durable outbox enqueue (same txn): create stays responsive; SAFER retries via OutboxProcessor"). `outbox/processor.ts` + `retry-backoff.ts` implement bounded exponential backoff with jitter, `retry_count`, `next_retry_at`, honoring `Retry-After`. The synchronous path (`/api/v1/mdata/customers/:id/verify-fmcsa`, `:1163-1209`) is fully awaited and distinguishes retryable (503+Retry-After) vs permanent (422) errors.
- ROOT CAUSE: N/A. Original line numbers cited (730/1120) don't correspond to fire-and-forget code on current main.
- FILES: `apps/backend/src/mdata/customers.routes.ts:730-739,1100-1145,1163-1209`; `apps/backend/src/outbox/processor.ts`; `apps/backend/src/outbox/retry-backoff.ts`; `apps/backend/src/integrations/fmcsa/safer.service.ts:85`.
- FIX STEPS: none — close as stale/incorrect. If re-filing, re-grep first to confirm the exact lines before citing them again.
- GUARD: none needed — existing outbox retry already covers this.

### p1-logging-system  [platform]  GATED: no
- STATE: STILL-OPEN — `apps/backend/src/index.ts:502` is `Fastify({ logger: true })`, bare boolean, default pino-to-stdout, no `transport` option anywhere for shipping to an aggregator.
- ROOT CAUSE: no log-shipping transport configured; stdout only (Render captures it, but no dedicated aggregator).
- FILES: `apps/backend/src/index.ts:502`.
- FIX STEPS: 1) Decide with Jorge on a log-aggregation target (Render's own logs may already be sufficient — ask before assuming a new vendor is wanted). 2) If adding one: `Fastify({ logger: { transport: { target: '<vendor>', options: {...} } } })`, gated behind an env var so local/dev stays plain stdout. 3) Ensure request-id middleware flows into the transport's structured fields.
- GUARD: `verify-backend-logger-transport-config.mjs` — if a `LOG_SHIPPING_ENABLED`-style flag is set, `index.ts` must configure a transport; otherwise documents stdout-only as the accepted state.

### p1-session-timeout  [platform]  GATED: no (security-sensitive — recommend flagging to Jorge before merge even though not schema/financial)
- STATE: STILL-OPEN — `apps/backend/src/auth/lucia.ts:29-42` never passes `sessionExpiresIn` to the `Lucia` constructor (`expires: false` on the cookie attributes only); falls back to the library's undocumented-in-repo default.
- ROOT CAUSE: no explicit, reviewed session lifetime was ever set.
- FILES: `apps/backend/src/auth/lucia.ts:29-34`.
- FIX STEPS: 1) Decide an explicit session lifetime with Jorge. 2) Pass `sessionExpiresIn: new TimeSpan(N, "d")` as the second `Lucia` constructor argument. 3) Confirm session-renewal-on-activity behavior still matches expectations after the explicit value lands.
- GUARD: `verify-lucia-session-expiry-explicit.mjs` — static check that `new Lucia(...)` includes a `sessionExpiresIn` key.

### p1-vulnerability-management  [platform]  GATED: no
- STATE: STILL-OPEN, with one nuance: dependency-CVE scanning IS already gated — `security-checks.yml`'s `security-audit` job (already required) contains its own "Fail on new critical/high CVEs (PR only)" step; `dependabot.yml` is just an auto-PR bot config, not a checkable gate. The **real** gap is that neither `codeql` nor `semgrep` job names appear in the 9-entry required-contexts list in `.github/branch-protection-config.json`, even though both workflows run `on: pull_request` — so a SAST hit doesn't block merge.
- ROOT CAUSE: CodeQL/Semgrep results are informational-only; not wired as required checks.
- FILES: `.github/branch-protection-config.json`; `.github/workflows/codeql.yml`; `.github/workflows/semgrep.yml`; `.github/workflows/security-checks.yml:16-96` (already-required job, for contrast); `.github/workflows/required-checks.yml`.
- FIX STEPS: 1) Decide with Jorge whether CodeQL/Semgrep should hard-block merge (may need severity thresholds to avoid false-positive lockout — see the `codeql-false-positive-in-verify-script-selftests` memory). 2) Add both job names to the mandatory list in `required-checks.yml` and to `branch-protection-config.json` contexts. 3) Re-run `scripts/verify-ci-policy-applied.mjs` to confirm live GitHub branch-protection matches.
- GUARD: extend the already-present `scripts/verify-ci-policy-applied.mjs` to assert `codeql`/`semgrep` are in the mandatory list once added.

### public-audit-log-partitions-no-rls  [platform]  GATED: yes — same remediation as `events-event-log-force-rls-still-blocked`, land together
- STATE: STILL-OPEN — `db/migrations/202606080940_block26_partition_hot_tables.sql:16-17` explicitly states "No operating_company_id: this is a cross-tenant audit log; RLS not needed" and creates `public.audit_log` (+48 monthly partitions) with GRANT SELECT/INSERT to `ih35_app` but no RLS/FORCE RLS anywhere in the file. The fix is already authored in `202607510000_events_audit_log_entity_isolation.sql` but HOLD-FOR-JORGE/unapplied.
- ROOT CAUSE: same as `events-event-log-force-rls-still-blocked` — one migration remediates both `events.event_log` and `public.audit_log`.
- FILES: `db/migrations/202606080940_block26_partition_hot_tables.sql:16-107`; fix at `db/migrations/202607510000_events_audit_log_entity_isolation.sql`.
- FIX STEPS: identical to `events-event-log-force-rls-still-blocked` — land together once Jorge approves; do not build a second, separate migration.
- GUARD: `verify-event-log-force-rls-applied.mjs` (same guard) should also assert `public.audit_log`'s `relrowsecurity`/`relforcerowsecurity`.

### systemic-pattern-mandatory-error-states  [platform]  GATED: no
- STATE: STILL-OPEN — confirmed exactly. `scripts/verify-list-error-state-coverage.mjs` header explicitly states it's a "REGRESSION guard on the pages that HAVE been given honest error states" and "does NOT try to detect every query page missing an error branch." `REQUIRED_ERROR_STATE` covers exactly 20 named pages.
- ROOT CAUSE: rollout-completeness gap, not a broken guard — the guard is correctly scoped as regression-only per its own documented intent.
- FILES: `scripts/verify-list-error-state-coverage.mjs:1-40`.
- FIX STEPS: 1) Audit remaining list/query pages repo-wide for missing `isError` → `ListErrorState` branches (excluding mutation-only pages). 2) Add each newly-fixed page to `REQUIRED_ERROR_STATE` as remediated (ratchet). 3) Track remaining rollout in `docs/trackers/DEFERRED-ITEMS.md` (the header already points there).
- GUARD: none new needed — the gap is rollout completeness, already tracked in DEFERRED-ITEMS.md per the guard's own header.

### systemic-pattern-never-toast-success-posted-fa  [platform]  GATED: no
- STATE: STILL-OPEN — no guard or reusable utility exists anywhere implementing a "never toast unconditional success when the response carries `posted:false`" rule. `ManualJEModal.tsx:126-133` toasts success unconditionally (safe today only because that specific route is balance-or-fail synchronous, 201-or-throw). `BankTransactionSplitModal.tsx:215-218` handles it correctly (per-line posted count, "X of Y posted") but that's ad hoc per-page discipline, not an enforced/reusable rule.
- ROOT CAUSE: no shared helper or static guard exists; a future async/queued posting endpoint could easily toast blanket success on a `{posted:false}` 200 response with nothing to catch it.
- FILES: `apps/frontend/src/components/accounting/ManualJEModal.tsx:126-133` (safe today, no defensive check); `apps/frontend/src/pages/banking/components/BankTransactionSplitModal.tsx:215-218` (correct ad hoc pattern).
- FIX STEPS: 1) Build an AST-scan guard for `pushToast(..., "success")` calls where the response type has a `posted` field and no `if (result.posted === false)` branch precedes it. 2) Extract `BankTransactionSplitModal`'s per-line posted-counting into a shared helper (e.g. `apps/frontend/src/lib/posting-toast.ts`). 3) Retrofit future async-posting pages (bank feed, reconciliation, settlement posting) to use the shared helper.
- GUARD: `verify-no-blanket-success-toast-on-posted-false.mjs` — as described in step 1.

### tbl-standard-raw-table-sweep-incomplete  [platform]  GATED: no
- STATE: STILL-OPEN — live count today: **195** `.tsx` files under `apps/frontend/src` contain raw `<table` without importing `ParityTable` (finding cited 202; manifest cited 157 as of 07-10 — count has fluctuated in both directions but the sweep is confirmed still incomplete).
- ROOT CAUSE: incremental ParityTable migration was never finished; no ratchet exists to prevent new raw tables from being added while the sweep is in flight.
- FILES: 195 files (re-run `grep -rl "<table" apps/frontend/src --include=*.tsx | xargs grep -L "ParityTable"` for the current exact list — not enumerated here for brevity).
- FIX STEPS: 1) Re-run the grep above to get the current exact file list. 2) Triage into full-conversion candidates vs legitimate non-data (layout-only) tables to exclude from the denominator. 3) Convert in batches per the QBO-parity table grammar/density tokens (§7). 4) Update the sweep-progress count in the relevant manifest/tracker after each batch.
- GUARD: `verify-paritytable-raw-table-count-ratchet.mjs` — fails if the raw-table count increases vs a committed baseline (mirrors the caution in the `paritytable-conversion-trips-static-guards` memory: update the guard, never weaken it).

### year-end-close-retained-earnings-asc852-freshs  [platform]  GATED: yes — CPA/counsel ruling required before design
- STATE: STILL-OPEN — confirmed exactly. Every ASC 852 mention across `docs/specs/` (8 files, incl. `CURSOR-OPERATING-CONSTITUTION.md`, `TMS-QBO-PARALLEL-BOOKS.md`, `ACCOUNTING-ARCHITECTURE.md`) explicitly says the current Ch.11 cutover uses **ASC 470-60** (debt restructuring), NOT ASC 852, and repeatedly defers ASC 852 fresh-start/year-end-close as "a separate CPA/counsel design track." `docs/trackers/MASTER-MANIFEST-2026-07-10.md:112` confirms `needs-design` with the same missing-CPA-ruling note.
- ROOT CAUSE: same underlying gap as `0473-1-10-year-end-close-retained-earnings-asc` above (recommend resolving together, one CPA ruling covers both).
- FILES: `docs/trackers/MASTER-MANIFEST-2026-07-10.md:80,112`; no design doc exists under `docs/specs/`.
- FIX STEPS: 1) Get the CPA ruling on ASC 852 applicability at Ch.11 plan confirmation (owner action). 2) Confirm period-close mechanics prerequisites land first (manifest notes `0243-g11-5`, `0243-g11-10` as not-yet-built prerequisites). 3) Author `docs/specs/YEAR-END-CLOSE-ASC852-FRESH-START-DESIGN.md` once ruled. 4) Build the posting path only after CPA approval + Jorge's explicit OK (§1.4).
- GUARD: N/A until the design lands; once built, add a balance-or-fail posting guard mirroring other posting engines (preview-first, flag default OFF).

---

## module: qbo-import

### import-1v2-trk-full-coa-equity  [qbo-import]  GATED: yes
- STATE: STILL-OPEN — TRK's CoA has grown past the original 14-account snapshot via later migrations (lease/property-tax accounts) but **zero equity accounts exist for TRK anywhere**. `db/migrations/202606300060_usmca_coa_seed.sql:46-48` seeds a full equity set (3000 Owner's Capital, 3100 Owner's Draws, 3900 Retained Earnings) for USMCA — no analogous seed exists for TRK.
- ROOT CAUSE: TRK never got a dedicated equity seed; only USMCA did.
- FILES: `db/migrations/202606161200_coa_decommingle_trk_stage3.sql` (original 14-account mirror); `db/migrations/202606290062_fin22_lease_asc842_subledger.sql` §8 (+4 TRK lessor accounts); `db/migrations/202607080310_property_tax_accrual_posting.sql` §3/§4 (+2 TRK property-tax accounts); `db/migrations/202606300060_usmca_coa_seed.sql:46-48` (USMCA-only equity pattern to mirror).
- FIX STEPS: 1) Write a migration mirroring USMCA's equity-seed pattern (Owner's Capital/Draws/Retained Earnings with `system_purpose='retained_earnings'`) scoped `WHERE code='TRK'`, guarded by `NOT EXISTS`. 2) Add the `chart_of_accounts_roles` binding for TRK's `retained_earnings` role. 3) Financial cluster — build, show Jorge the full SQL diff, wait for explicit OK, never self-merge.
- GUARD: `verify-trk-equity-coa-parity.mjs` — assert TRK has an active `retained_earnings`-role account and at least one Equity-type account, same as USMCA/TRANSP.

### import-4v2-gl-detail-hardened  [qbo-import]  GATED: no
- STATE: ALREADY-FIXED — confirmed the hardening described is real and wired. `apps/backend/src/integrations/qbo/forensic-import.service.ts` imports `forensic-batch-heartbeat.ts`, `forensic-progress.store.ts`, `forensic-audit.service.ts` (lines 14/19/20) and calls `auditBatchEvent`/`auditForensicImportError` ~25 times and `withHeartbeat` 3 times across the entities/transactions/attachments phases (lines 311-1111). All 3 sibling files exist and are non-trivial (44-147 lines).
- ROOT CAUSE: N/A.
- FILES: `apps/backend/src/integrations/qbo/forensic-import.service.ts`; `forensic-batch-heartbeat.ts`; `forensic-progress.store.ts`; `forensic-audit.service.ts`.
- FIX STEPS: none — close as already-fixed.
- GUARD: none needed.

---

## module: qbo-recon

### 0007-pattern-1-unmounted-backend  [qbo-recon]  GATED: no
- STATE: STILL-OPEN — `package.json:559` defines `"verify:frontend-api-routes": "node scripts/verify-frontend-api-routes-exist.mjs"` but grepping `.github/workflows/*.yml` for either the script name or the npm-run form returns zero hits — it's never invoked in CI.
- ROOT CAUSE: the guard script exists and presumably works, but nobody's CI pipeline runs it.
- FILES: `package.json:559`; `scripts/verify-frontend-api-routes-exist.mjs`.
- FIX STEPS: 1) Add `npm run verify:frontend-api-routes` as a step in the relevant CI workflow (alongside other `verify:*` scripts). 2) Mark it required if it's meant to gate merges. 3) Run it once on main first to confirm it currently passes before wiring as required (else it immediately reds the pipeline).
- GUARD: `verify-ci-guard-coverage.mjs` — assert every `verify:*` package.json script name appears in at least one `.github/workflows/*.yml`, catching orphaned guards generally (not just this one).

### 0091-g11-2  [qbo-recon]  GATED: yes — driver-finance settlement posting, money-moving
- STATE: STILL-OPEN — confirmed, and worse than described: there is no "hard-block at POST time" at all. `POST /api/v1/driver-finance/settlements` (`settlements.routes.ts:38-46,308-368`) inserts `gross_pay`/`deductions_total`/`reimbursements_total`/`net_pay` directly from client-supplied body fields (independent `z.number().default(0)` per field, no `.refine()` cross-checking `net_pay === gross_pay - deductions_total + reimbursements_total`). The server-computed path (`aggregateSettlementTotals` in `settlements-load-bookended.service.ts:175-219`) derives all three from a single `SUM()` over `settlement_lines` so it's internally self-consistent, but nothing cross-checks it against `driver_finance.driver_settlement_deductions.applied_to_settlement_id`, and manual deduction lines can be inserted directly into `settlement_lines` (bypassing the 5% net-floor cap in `settlement-deduction-cap.service.ts`) via `settlements.routes.ts:350` and `settlements-mvp.routes.ts:174`.
- ROOT CAUSE: net_pay is either client-trusted (no formula check) or single-query self-consistent with no independent cross-check against the deductions ledger.
- FILES: `apps/backend/src/driver-finance/settlements.routes.ts:38-46,308-368,350`; `apps/backend/src/driver-finance/settlements-load-bookended.service.ts:175-219`; `apps/backend/src/driver-finance/settlements-mvp.routes.ts:174`; `apps/backend/src/driver-finance/settlement-deduction-cap.service.ts`.
- FIX STEPS: 1) Add a zod `.refine()` on the create-body schema requiring `net_pay === gross_pay - deductions_total + reimbursements_total` (integer-cents-safe). 2) In the POST handler, discard client-supplied totals for a `'presettle'` insert and always call `aggregateSettlementTotals` server-side after inserting lines. 3) Add a DB-level CHECK constraint on `driver_finance.driver_settlements` as a second line of defense. 4) Financial cluster — never self-merge.
- GUARD: `verify-settlement-net-pay-formula.mjs` — grep that no route writes `driver_settlements.net_pay` from a client-supplied value without a formula check or a same-transaction call to `aggregateSettlementTotals`.

### 0243-e1-6-bank-geo-schema-stranded  [qbo-recon]  GATED: no (schema-organization/canonicalization decision, not a data change by itself)
- STATE: STILL-OPEN — confirmed as a genuine dual-schema situation, though the "bank.*" half of the finding's naming is slightly off: `bank.reconciliation_matches` doesn't exist as such; the real duplicate pair is `banking.reconciliation_sessions` (`banking/reconciliation.routes.ts` + migration `0075`) vs a separate `accounting/bank-recon/*` match engine (`accounting.bank-recon/match.service.ts`, `recon-worklist.service.ts` + migration `0219`) — both live, both separately queried. The geofence half is exactly as described: `geo.geofences` (dominant, 20+ files: `telematics/geofences.routes.ts`, `auto-geofence.service.ts`, `dot-dwell-detector.service.ts`, `dispatch/geofences/load-geofence-binding.service.ts`, `safety/geofence-breach.routes.ts`, `cron/geofence-breach-detector.cron.ts`, `integrations/samsara/geofences/*`) vs `geofence.fence`/`geofence.event` (`geofence/geofence.routes.ts` + migration `202606111200_w3a_geofence_engine.sql`) — a separate, smaller, independently-live engine.
- ROOT CAUSE: two parallel schema pairs for the same concept were both built and never canonicalized/retired.
- FILES: geo: `apps/backend/src/telematics/geofences.routes.ts`, `auto-geofence.service.ts`, `dot-dwell-detector.service.ts`, `geofence-detector.service.ts`, `dispatch/geofences/load-geofence-binding.service.ts`, `safety/geofence-breach.routes.ts`, `cron/geofence-breach-detector.cron.ts`, `integrations/samsara/geofences/state-machine/*.ts` vs `geofence/geofence.routes.ts` + `db/migrations/202606111200_w3a_geofence_engine.sql`. bank-recon: `accounting/bank-recon/{match.service.ts,recon-worklist.service.ts}` + `db/migrations/0219_block_29_bank_reconciliation_matches.sql` vs `banking/reconciliation.routes.ts` + `db/migrations/0075_p5_t1_1_banking_reconciliation_sessions.sql`.
- FIX STEPS: 1) Design-doc triage (no code) which geofence engine is canonical — `geo.geofences` is clearly dominant by file count; `geofence.fence`/`geofence.event` looks abandoned. 2) Same triage for `banking.reconciliation_sessions` vs `accounting/bank-recon` — check `docs/lockdown/00_LOCKED_DECISIONS.md` and the `schema-canonicalization-verdicts` memory for any existing ruling first. 3) Once ruled, retire-not-drop the loser (stop new writes, keep read-only), migrate consumers to the winner.
- GUARD: `verify-no-dual-schema-geofence.mjs` / `verify-no-dual-schema-reconciliation.mjs` — fail if both schema pairs still have live INSERT/UPDATE call sites after the canonicalization ships.

### 0243-g10-c3-sentry-half-live-crons-pwa  [qbo-recon]  GATED: no
- STATE: STILL-OPEN — count corrected: **2 of 27** cron files call Sentry (`model-lifecycle-monitor.cron.ts`, `recon.cron.ts`), not 1 of 27 as the original finding stated. `apps/driver-pwa` has a dedicated `sentry-pwa.ts` wrapper. Coverage remains lopsided.
- ROOT CAUSE: no shared cron-level Sentry wrapper exists; only 2 of 27 crons opted in individually.
- FILES: `apps/backend/src/cron/*.cron.ts` (27 files, `ls` confirmed); `model-lifecycle-monitor.cron.ts`, `recon.cron.ts` (the 2 with Sentry); `apps/driver-pwa/src/observability/sentry-pwa.ts`.
- FIX STEPS: 1) Add a shared `withCronSentryWrap(name, fn)` helper (reuse whatever the 2 existing crons already do). 2) Wrap the remaining 25 cron entry points with it. 3) Prioritize financially-relevant crons first (`bank-recon-auto-match.cron.ts`, `geofence-breach-detector.cron.ts`, `qbo-*.cron.ts`).
- GUARD: `verify-cron-sentry-coverage.mjs` — grep every `apps/backend/src/cron/*.cron.ts` and fail if it lacks a Sentry (or equivalent) call, so coverage can't silently stay at 2/27.

### 0280-04-cash-position-reconciliation-linkage  [qbo-recon]  GATED: no
- STATE: ALREADY-FIXED — `apps/frontend/src/pages/home/OwnerHome.tsx:188,363-369` binds the Cash Position tile to a real query result (`cashPositionQuery.data`) with `to="/banking"` and `subtext="Last reconciled: {formatShortDate(cp.last_reconciled_at)}"` — not a hardcoded stub.
- ROOT CAUSE: N/A. Note for the doc: this tile is a separate surface from the actual bank-reconciliation workspace (see `bnk-03` below) — both "tile shows last-reconciled" and "workspace lacks a beginning-balance/last-reconciled header" are simultaneously true and are tracked as two different tickets.
- FILES: `apps/frontend/src/pages/home/OwnerHome.tsx:188,363-369`.
- FIX STEPS: none — close as already-fixed.
- GUARD: none needed.

### 0394-qbo-sync-one-shot-not-recurring  [qbo-recon]  GATED: no
- STATE: ALREADY-FIXED — the finding's title is stale/inverted; its own evidence is correct. `apps/backend/src/index.ts:1074,1082,1089` call `initializeQboSyncQueueRunner(app)`, the qbo-inbound-sync init, and the qbo-cdc-poll init at startup (not just imported at :344-346). `cron/qbo-inbound-sync.cron.ts:6-11` and `cron/qbo-cdc-poll.cron.ts:10` both use real `setInterval`-based recurrence.
- ROOT CAUSE: N/A — all three are registered and recurring.
- FILES: `apps/backend/src/index.ts:344-346,1074,1082,1089`; `apps/backend/src/cron/qbo-inbound-sync.cron.ts:6-11`; `apps/backend/src/cron/qbo-cdc-poll.cron.ts:10`.
- FIX STEPS: none — close as already-fixed. If desired, `verify-qbo-cron-initialized.mjs` could assert the 3 `initialize*` functions each have a call site in `index.ts` as a regression guard against a future refactor silently dropping one.
- GUARD: optional only, see above.

### 0441-mod11-fuel-recon-zero-and-noop-save-link  [qbo-recon]  GATED: no
- STATE: STILL-OPEN for the noop-save-link half; the zero-values half is UNVERIFIABLE without live data — the backend computes real `SUM()`s (`fuel-reconciliation.routes.ts:87,191,223-292`, scoped by `operatingCompanyId`), not hardcoded zeros, so whether the UI shows 0 in practice depends on whether fuel-card/WO data exists for the queried period.
- ROOT CAUSE: `FuelReconciliationPage.tsx`'s "Manual match (link)" modal's "Save link" button (lines 293-312) only calls `setMatchOpen(false); setMatchNote("")` — no mutation, no API call — despite the UI implying the match was saved. The modal body text itself admits "Full matcher UI ships with Block V data services" (an acknowledged stub).
- FILES: `apps/frontend/src/pages/reports/FuelReconciliationPage.tsx:293-312` (noop save button); `apps/backend/src/reports/fuel-reconciliation.routes.ts:87,191,223-292` (real SUM-based totals, for contrast).
- FIX STEPS: 1) Build (or confirm) a `POST /api/v1/reports/fuel-reconciliation/manual-match` endpoint. 2) Wire "Save link" to call it with `{cardTxnId, woEntryId, note}`, then invalidate the fuel-recon query on success (pattern already used for `rematchFuelTxnToGps` at line 265). 3) Until built, disable the button with a tooltip rather than implying persistence — no fake-green UI.
- GUARD: `verify-fuel-recon-manual-match-wired.mjs` — assert the "Save link" onClick calls a mutation function, not just local state setters.

### bf10b-qbo-recon-six-types  [qbo-recon]  GATED: no
- STATE: STILL-OPEN — confirmed exactly 5 mapped types, not 6. `accounting/qbo-recon-reads.ts:82-88`'s `REMOTE_ENTITY_KEY` maps only `{customers, vendors, accounts, invoices, bills}`; `:95-118`'s `countsRes` query computes only those 5 object pairs. The CDC poller tracks a much larger set (`Invoice, Bill, Payment, BillPayment, JournalEntry, CreditMemo, Customer, Vendor, Item, Account`), making `Payment` the strongest candidate for the missing 6th type.
- ROOT CAUSE: `REMOTE_ENTITY_KEY` and the underlying count query were never extended past the original 5 types even as CDC ingestion grew.
- FILES: `apps/backend/src/accounting/qbo-recon-reads.ts:82-88,95-118`.
- FIX STEPS: 1) Decide the 6th object type to add (Payments is the strongest candidate given CDC already ingests it). 2) Add the count-pair to `countsRes` and a `REMOTE_ENTITY_KEY.payments` entry. 3) Confirm `accounting.qbo_remote_counts` actually collects a `payments` entity_type before wiring the join.
- GUARD: `verify-qbo-recon-entity-coverage.mjs` — assert `REMOTE_ENTITY_KEY` keys are a superset of CDC-tracked entity types that have a corresponding `mdata.qbo_*` mirror table.

### bnk-03-no-last-reconciled-no-beginning-balance  [qbo-recon]  GATED: no
- STATE: STILL-OPEN — zero hits for "last reconciled" or "beginning balance" confirmed in both `ReconciliationWorkspace.tsx` and `BankReconciliationPage.tsx`. (This does NOT conflict with `0280-04` — that tile is a dashboard summary stat, entirely separate from the actual reconciliation workspace UI; both facts are true simultaneously and this workspace gap is the real workflow deficiency vs. the QBO/McLeod-standard bank-rec screen.)
- ROOT CAUSE: the actual reconciliation workflow screens lack the standard "beginning balance / ending balance / last reconciled" header block that anchors a bank-rec session.
- FILES: `apps/frontend/src/pages/banking/ReconciliationWorkspace.tsx`; `apps/frontend/src/pages/banking/BankReconciliationPage.tsx`.
- FIX STEPS: 1) Add a header block showing statement beginning balance, ending balance, and last-reconciled date, sourced from `banking.reconciliation_sessions` (verify it already has the needed columns per migration `0075`/`0184`). 2) Surface the prior session's closing balance as the new session's beginning balance. 3) Additive UI — safe to ship non-financial on green once verified against the actual schema columns.
- GUARD: `verify-bank-recon-workspace-has-balance-header.mjs` — grep both files for both strings, fail if either is absent.

### daily-tms-qbo-reconciliation-cadence  [qbo-recon]  GATED: no
- STATE: STILL-OPEN for the tolerance/owner-assignment gap; cron + screen wiring is confirmed live and correct (06:00/19:00 CT). `TOLERANCE_ACCEPTED` is declared as an `ExceptionType` union member (`recon-engine.service.ts:33`) and listed in a DB CHECK constraint (`202607022100_recon_runs_exceptions.sql:55`) but a repo-wide grep found only those 2 definition-site hits — it's never assigned, read, or branched on anywhere in application code.
- ROOT CAUSE: `TOLERANCE_ACCEPTED` is a dead enum value with no write path (an owner-accepts-within-tolerance action) and no read path (surfaced UI resolution state) behind it.
- FILES: `apps/backend/src/accounting/recon/recon-engine.service.ts:33`; `db/migrations/202607022100_recon_runs_exceptions.sql:55`; cron confirmed live: `apps/backend/src/cron/recon.cron.ts:15-16,28,42,56` (`"0 6 * * *"`/`"0 19 * * *"`, America/Chicago).
- FIX STEPS: 1) Decide (design) what "tolerance accepted" should mean operationally — an owner manually accepting a within-tolerance recon diff, with an `actorUserId`+reason. 2) Add the write path: a route/mutation setting an exception to `TOLERANCE_ACCEPTED`, mirroring other exception-resolution audit patterns in `recon-engine.service.ts`. 3) Add the read path: surface `TOLERANCE_ACCEPTED` exceptions distinctly in the recon-exceptions UI, with owner-assignment if that's part of the design.
- GUARD: `verify-tolerance-accepted-wired.mjs` (or a generalized `verify-no-dead-enum-members.mjs`) — fail if `TOLERANCE_ACCEPTED` (or any listed ExceptionType) has zero non-definition call sites.

### qbo-parity-a1-paritytable-universal-adoption  [qbo-recon]  GATED: no
- STATE: STILL-OPEN — counts drifted slightly but the gap is unchanged in kind/scale. Current: 150 files import `ParityTable` (finding said 147); 195 `.tsx` files still hand-roll `<table` with no `ParityTable` import (finding said 202). Confirmed still hand-rolling: `apps/frontend/src/components/DataTable.tsx`, `FleetTable.tsx`, `apps/frontend/src/components/drivers/EarningsTab.tsx`.
- ROOT CAUSE: same underlying gap as `tbl-standard-raw-table-sweep-incomplete` above (platform module) — these are the same 195-file count from two different audit passes; do not build two separate remediations.
- FILES: `apps/frontend/src/components/DataTable.tsx`, `FleetTable.tsx`, `apps/frontend/src/components/drivers/EarningsTab.tsx` (highest-leverage shared components — likely reused across many pages).
- FIX STEPS: 1) Triage the 195-file list by reuse frequency; start with `DataTable.tsx`/`FleetTable.tsx` since they're shared components. 2) Migrate `DataTable.tsx`'s internal `<table>` render to compose `ParityTable` (or deprecate it in favor of direct `ParityTable` call sites — additive, no page deletions). 3) Migrate `FleetTable.tsx` and `EarningsTab.tsx` similarly. 4) Re-run the grep after each batch to track convergence.
- GUARD: same ratchet as `tbl-standard-raw-table-sweep-incomplete` — `verify-paritytable-raw-table-count-ratchet.mjs` — do not build a duplicate.

### vend4-dual-qbo-sync-single-source-of-truth-dec  [qbo-recon]  GATED: no (the decision is non-financial UX; no schema/data change needed for the ticket itself)
- STATE: STILL-OPEN — confirmed needs-design, unresolved. `docs/trackers/MASTER-MANIFEST-2026-07-10.md:763-765` (`vend4-dual-qbo-sync-single-source-of-truth-decision`, tier-2, needs-design): "Sync banner reports '0 synced / never' while 490 vendors are actually all projected from qbo_archive... Same single-source-of-truth decision as customers — apply once for both." No resolving code or design doc found elsewhere.
- ROOT CAUSE: the vendor sync-status banner shows "0 synced / never" while all 490 vendors are actually projected from QBO-sourced archive data — no owner ruling on which framing is correct, and this is the identical ambiguity already flagged on the customer side (CUST-3).
- FILES: `docs/trackers/MASTER-MANIFEST-2026-07-10.md:763-765`.
- FIX STEPS: 1) STOP-and-ask ticket, not a build ticket — surface to Jorge: should the banner read "490 synced (from QBO)" instead of "0 synced / never"? 2) Once ruled, apply identically to both the vendor banner and the customer banner (CUST-3) per the manifest's own note ("apply once for both"). 3) No migration needed — likely just a frontend label/logic fix once the semantic is decided.
- GUARD: none until the design decision lands; afterward, `verify-vendor-customer-sync-banner-parity.mjs` — assert both banners use the same source-of-truth logic (regression guard against re-diverging).

# Build Tickets — bb_7 (reports / safety / settlements)

Re-verified against current `main` on 2026-07-19. Read-only pass — no code was edited, no migrations run, no prod DB touched.

**Counts (49 findings total):**
- STILL-OPEN: 36
- ALREADY-FIXED: 13 (includes 1 "ALREADY-CONFIRMED-LIVE" — settlement engine mount that was wrongly flagged as dead)
- UNVERIFIABLE: 0 at the ticket level (2 tickets contain an unverifiable sub-item inside an otherwise-resolved bundle — flagged inline: `0243-g10-m-seven-integrity-reliability-gaps` item 7 "preflight", and the driver-create half of `safety-dot-fields-and-driver-create-fix`)
- GATED (needs owner OK before merge — touches accounting.*/catalogs.*/mdata.*/migrations/posting/GL/flags): 19
- NOT GATED (safe to self-merge on green CI per CLAUDE.md §1.2): 30

**Known duplicates across module boundaries — build once, close both IDs:**
- `0441-mod6-spawn-liability-fake-stub` (reports) == `coder-work-order-t2-6-accident-liability-stub` (safety) — same file (`apps/backend/src/safety/safety.routes.ts:544-569`), same fix, one guard.
- `0441-mod2-csv-import-mileage-phantom` (reports) and `0441-mod9-mileage-dropped-on-create-edit` (reports) — same root cause (`mdata.units` has no `mileage` column), same file (`apps/backend/src/maintenance/vehicles.routes.ts`) — coordinate into one migration + one fix.
- `0278-safety-gap1-auto-driver-status` (safety) == `linkage-safety-event-no-driver-status-update` (safety) — identical gap, one guard (`verify-safety-event-driver-status-linkage.mjs`).
- `0278-safety-gap3-auto-notifications` (safety) is STALE — superseded by `flow9-safety-event-auto-notifications` (safety), which confirms the fix already landed.
- `0008-g2-reporting-schema-canonical`, `0243-e1-3-two-scheduled-report-engines`, `0441-mod11-three-parallel-scheduled-report-sys` (all reports) all point at the same root cause — one orphaned `reporting.scheduled_reports` engine — one guard (`verify-no-orphan-scheduled-reports-engine.mjs`).

---

# MODULE: reports (23 findings)

### 0008-g2-reporting-schema-canonical  [reports]  GATED?no
- STATE: STILL-OPEN (proof: `apps/backend/src/index.ts:150-154,878-879,1430-1433` mounts `registerReportsScheduledCrudRoutes` + `registerScheduledSubscriptionRoutes` + `initializeReportsRoleScheduler` + `initializeScheduledReportsEmailer`, all against `reports.scheduled_reports`/`reports.scheduled_subscriptions`; meanwhile `apps/backend/src/scheduled-reports/scheduled-reports.routes.ts:98` (`registerScheduledReportsRoutes`, targets `reporting.scheduled_reports` per migration `db/migrations/0164_scheduled_reports.sql`) is imported ONLY by its own test `scheduled-reports-routes.test.ts:6`, and `scheduled-reports-worker.ts:136` (`initializeScheduledReportsWorker`) is imported ONLY by `scheduled-reports-worker.smoke.test.ts:19` — neither is referenced anywhere in `index.ts`.)
- ROOT CAUSE: two unconsolidated report-schedule engines exist on disk — the live one on `reports.scheduled_reports`/`reports.scheduled_subscriptions`, and a fully dead one on `reporting.scheduled_reports` (routes + worker + its own migration/table) that nothing boots.
- FILES: apps/backend/src/scheduled-reports/scheduled-reports.routes.ts, apps/backend/src/scheduled-reports/scheduled-reports-worker.ts, apps/backend/src/scheduled-reports/scheduled-reports-routes.test.ts, apps/backend/src/scheduled-reports/scheduled-reports-worker.smoke.test.ts, apps/backend/src/index.ts
- FIX STEPS:
  1. Confirm zero rows / no runtime usage of `reporting.scheduled_reports` (grep confirms no non-test caller).
  2. Archive (do not delete per repo rule) the `apps/backend/src/scheduled-reports/` directory — move to `apps/backend/src/_archive/scheduled-reports-orphaned/` or mark clearly deprecated at top of each file, and delete its test files or convert to a "must stay unregistered" guard.
  3. Leave `reporting.scheduled_reports` table (`0164`) in place (void-not-delete for schema) but stop shipping dead code that references it.
  4. Update `.block-ready`/tracker entry `0008-g2-reporting-schema-canonical` to reflect resolution.
- GUARD: add `verify-no-orphan-scheduled-reports-engine.mjs` asserting `registerScheduledReportsRoutes`/`initializeScheduledReportsWorker` are never imported by `apps/backend/src/index.ts` (fails if someone re-wires the dead engine without a deliberate migration/consolidation).

### 0091-g9-h5  [reports]  GATED?no
- STATE: STILL-OPEN (proof: legacy path fixed at `apps/backend/src/reports/profit-per-truck.routes.ts:339-388` — comment at line 339-343 explicitly documents the "G9-H5 double-count fix" using separate `load_agg`/`wo_agg` CTEs each `GROUP BY` per-unit before joining; but `apps/backend/src/reports/queries/profit-per-truck-weekly.ts:42-53` (function `profitPerTruckWeeklyQuery`, lines 17-101) still does `FROM mdata.units u LEFT JOIN mdata.loads l ... LEFT JOIN maintenance.work_orders wo ...` directly with no per-unit CTEs — classic 3-way fan-out.)
- ROOT CAUSE: `profitPerTruckWeeklyQuery` in `apps/backend/src/reports/queries/profit-per-truck-weekly.ts` joins `mdata.units → mdata.loads → maintenance.work_orders` directly, so `SUM(l.rate_total_cents)` is multiplied by the work-order count per unit and `SUM(wo cost)` is multiplied by the load count per unit.
- FILES: apps/backend/src/reports/queries/profit-per-truck-weekly.ts
- FIX STEPS:
  1. In `profitPerTruckWeeklyQuery`, replace the single 3-table join with the same pattern already proven at `profit-per-truck.routes.ts:346-374`: a `load_agg` CTE (`SELECT l.assigned_unit_id, SUM(...) FROM mdata.loads l WHERE l.operating_company_id=$1 AND l.soft_deleted_at IS NULL GROUP BY l.assigned_unit_id`) and a `wo_agg` CTE (`SELECT wo.unit_id, SUM(...) FROM maintenance.work_orders wo WHERE wo.operating_company_id=$1 GROUP BY wo.unit_id`).
  2. Join `mdata.units u JOIN load_agg la ON la.unit_id=u.id LEFT JOIN wo_agg wa ON wa.unit_id=u.id`.
  3. Keep the existing 7-day window filters inside each CTE (`created_at >= now() - interval '7 days'` / `COALESCE(wo.updated_at, wo.opened_at) >= now() - interval '7 days'`), and also add `AND l.status IS DISTINCT FROM 'cancelled'` to mirror the legacy path's exclusion.
  4. Re-run/extend `apps/backend/src/reports/__tests__/profit-per-truck-double-count.test.ts` to cover `profitPerTruckWeeklyQuery` (currently only the legacy month path is exercised, per grep — no caller of `profitPerTruckWeeklyQuery` in that test file).
- GUARD: add `verify-lane-profitability-cte-pattern.mjs`-style check specific to this file (there is already `npm run verify:lane-profitability-cte-pattern` for a sibling report — extend it or add `verify-profit-per-truck-weekly-cte-pattern.mjs` asserting the query text contains `load_agg` and `wo_agg` CTE aliases and does NOT contain a bare `LEFT JOIN mdata.loads` + `LEFT JOIN maintenance.work_orders` in the same statement).

### 0243-e1-3-two-scheduled-report-engines  [reports]  GATED?no
- STATE: STILL-OPEN (same evidence as 0008-g2-reporting-schema-canonical above — `reports.scheduled_reports` engine is live/mounted at `apps/backend/src/index.ts:150,153,878,1430`; `reporting.scheduled_reports` engine (`apps/backend/src/scheduled-reports/scheduled-reports.routes.ts` + `scheduled-reports-worker.ts`) is orphaned, referenced only by its own tests, never imported by `index.ts`.)
- ROOT CAUSE: duplicate finding of 0008-g2 — two schemas (`reports.*` vs `reporting.*`) each got a full CRUD-routes+worker engine built for the same "scheduled report" concept; only one was ever wired in.
- FILES: apps/backend/src/scheduled-reports/scheduled-reports.routes.ts, apps/backend/src/scheduled-reports/scheduled-reports-worker.ts, apps/backend/src/index.ts
- FIX STEPS: identical to 0008-g2-reporting-schema-canonical — treat as the same ticket, do not duplicate the fix. (1) archive/deprecate the `reporting.scheduled_reports` engine, (2) keep `reports.scheduled_reports` as canonical, (3) note in `docs/CLAUDE.md` §1a canonical-table map that `reporting.scheduled_reports` is RETIRE-class.
- GUARD: same as 0008-g2 (`verify-no-orphan-scheduled-reports-engine.mjs`) — do not create a second guard for the same root cause.

### 0277-any-type-reports-library-routes  [reports]  GATED?no
- STATE: ALREADY-FIXED (proof: `apps/backend/src/reports/library.routes.ts:39-41` defines `type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }`, and `relationExists`/`columnExists` at lines 45 and 50 are typed `client: Queryable`, not `any`. Line 44 has an explicit inline comment: `// 0277-any-type-reports-library-routes: DB helpers use Queryable, not an untyped client.` — the fix even cites this exact finding ID.)
- ROOT CAUSE: N/A — already remediated.
- FILES: apps/backend/src/reports/library.routes.ts
- FIX STEPS: none required. Close the finding.
- GUARD: recommend a one-line regression guard `verify-reports-library-no-any-client.mjs` asserting `library.routes.ts` contains `type Queryable` and does not contain `client: any` in `relationExists`/`columnExists` signatures, so a future edit can't silently reintroduce `any`.

### 0441-mod10-finalize-5s-staleness-race  [reports]  GATED?no
- STATE: STILL-OPEN (proof: `apps/frontend/src/pages/driver-finance/hooks/useLiveDebt.ts:46` — `const stale = Date.now() - computedAt > 5000;` — and line 41-49, the `setInterval` tick that runs this check also fires every `5000` ms (`window.setInterval(..., 5000)`). Threshold and poll period are identical, matching the finding.)
- ROOT CAUSE: the staleness check and the interval that performs the check share the exact same 5000ms constant, so a debt value can display as "fresh" for up to one full extra tick (~10s of real staleness) before the UI flips to `"?"`, or can flip to stale one tick later/earlier than intended depending on `setInterval` drift relative to `computed_at`.
- FILES: apps/frontend/src/pages/driver-finance/hooks/useLiveDebt.ts
- FIX STEPS:
  1. Decouple the two constants: keep the tick interval fast (e.g. 1000ms) but keep the staleness threshold at 5000ms, so the flip happens within ~1s of the true boundary instead of up to one full 5s tick late.
  2. Alternatively, replace the `setInterval` boundary check with a single `setTimeout` scheduled for exactly `5000 - (Date.now() - computedAt)` ms from each new `debt.computed_at`, re-armed on every `refresh()`, so the flip fires deterministically at the threshold instead of being polled.
  3. Add a unit test (e.g. `useLiveDebt.test.ts`) using fake timers that asserts `isStale` flips to `true` within ~1s of the 5000ms mark, not up to 5000ms late.
- GUARD: add `verify-live-debt-staleness-tick-granularity.mjs` asserting the poll-tick constant in `useLiveDebt.ts` is strictly less than the staleness threshold constant (fails if both are ever re-set to the same literal).

### 0441-mod11-deadhead-phantom-fuel-columns  [reports]  GATED?no
- STATE: STILL-OPEN — but in a DIFFERENT file than the prior audit checked. (Prior pass correctly found nothing in `apps/backend/src/dispatch/deadhead/optimizer.service.ts`/`routes.ts` — no fuel references there. The real bug is in `apps/backend/src/reports/deadhead.service.ts:511-524`: `SELECT ... SUM(ft.total_miles) ... SUM(ft.total_cost) ... FROM fuel.fuel_transactions ft WHERE ft.transaction_date >= $2::date AND ft.transaction_date <= $3::date`. Confirmed against `docs/schema-parity-baseline.json:4611-4645` (`fuel.fuel_transactions` columns) and `db/migrations/0300_create_fuel_transactions.sql:5-35`: the table has NO `total_miles` column and NO `transaction_date` column — real columns are `total_cost` and `transaction_at`/`purchased_at`. The query is wrapped in `.catch(() => ({ rows: [{ fuel_cost_per_mile_cents: 45 }] }))` at line 525, so the Postgres 42703 error is silently swallowed and the deadhead-cost report always falls back to a hardcoded 45c/mile instead of real fuel data.)
- ROOT CAUSE: `deadhead.service.ts`'s fuel-cost-per-mile subquery references two columns (`total_miles`, `transaction_date`) that were never added to `fuel.fuel_transactions`, and the surrounding `.catch()` masks the failure as a silent fallback rather than surfacing it.
- FILES: apps/backend/src/reports/deadhead.service.ts
- FIX STEPS:
  1. Replace `ft.transaction_date` with `ft.transaction_at` (or `ft.purchased_at`, whichever the report intends — `transaction_at` is the canonical event timestamp per `0300`) in the `WHERE` clause at lines 520-522.
  2. Remove the `ft.total_miles` reference — that column doesn't exist anywhere on `fuel.fuel_transactions`; if per-mile fuel cost needs a miles denominator, source it from `mdata.loads`/`mdata.load_stops` mileage or from the unit's odometer delta (`mdata.units.odometer_mi`), not from the fuel-transactions table.
  3. Remove or narrow the blanket `.catch()` at line 525 to only catch relation-not-exist (`to_regclass` check) rather than swallowing all query errors, so a future phantom-column bug throws instead of silently defaulting.
  4. Add/extend a test asserting `deadhead.service.ts`'s fuel query actually returns computed data (not the 45c fallback) against a seeded `fuel.fuel_transactions` row.
- GUARD: add `"fuel.fuel_transactions"` to `TARGET_TABLES` in `scripts/verify-sql-column-existence.mjs:43-59` (it is already in `docs/schema-parity-baseline.json` but not in the curated target set) — this single addition would have statically caught `ft.total_miles`/`ft.transaction_date` as phantom columns.

### 0441-mod11-help-was-this-helpful-not-persisted  [reports]  GATED?no
- STATE: STILL-OPEN (proof: `apps/frontend/src/pages/help/HelpArticlePage.tsx:10` — `const [feedback, setFeedback] = useState<"up" | "down" | null>(null);` — and the click handlers at lines 37-46 only call `setFeedback("up")`/`setFeedback("down")`. No `apiRequest`/`fetch` call and no `localStorage` write anywhere in the file.)
- ROOT CAUSE: the "Was this helpful?" widget is purely local React state with no persistence layer — feedback is lost on refresh/navigation and never reaches any backend or analytics store.
- FILES: apps/frontend/src/pages/help/HelpArticlePage.tsx
- FIX STEPS:
  1. Per `docs/CLAUDE.md` §8 ("HELP is a frontend-only module — no backend routes... If a backend Help service is added later, add `verify-help-tenant-scope.mjs`"), this is a deliberate architecture choice — so the pragmatic fix that stays within that constraint is client-side persistence, not a new backend route: write to `localStorage` keyed by article slug (e.g. `help_feedback:<articleId>`) on click, and read it on mount to restore prior state.
  2. If Jorge wants server-side help analytics, that requires a new decision (adds a backend Help service) — flag as a decision point rather than building it unasked.
  3. Add a regression test in `HelpArticlePage.test.tsx` (create if absent) asserting feedback survives a remount when localStorage has the key set.
- GUARD: add `verify-help-feedback-persisted.mjs` asserting `HelpArticlePage.tsx` writes to `localStorage` (or a documented equivalent) inside the `onClick` handlers, not just `useState`.

### 0441-mod11-owner-mint-maker-checker  [reports]  GATED?yes — role/GRANT change (CLAUDE.md §1.4)
- STATE: STILL-OPEN — the prior pass's "no 'mint' code found anywhere" is itself resolved by cross-referencing the companion finding `.block-ready/0490-critical-users3-owner-mint-approval-path.json` and `docs/trackers/CODER-FINAL-HANDOFF-2026-07-19.md:82`, which names the real file. Confirmed live in `apps/backend/src/identity/workflow-routes.ts:258-312`: `POST /api/v1/identity/workflow-requests/:id/approve` gates only on `isAdminRole(authUser.role)` (line 263; `isAdminRole` at line 75-77 returns true for BOTH `"Owner"` and `"Administrator"`), then at the `WF-064-IDENT-002` branch (lines 304-312) does `UPDATE identity.users SET role = $1 WHERE id = $2` with `toRole` taken straight from the stored request payload — no check that `toRole === "Owner"` requires the approver to be an Owner. Contrast with the already-fixed direct-PATCH path at `apps/backend/src/identity/users.routes.ts:527-534` (the "G1-1 anti-escalation" fix, guarded by `scripts/verify-user-role-escalation-guard.mjs`), which explicitly blocks `(newRole === "Owner" || oldRow.role === "Owner") && !callerIsOwner`. That guard was never ported to the async workflow-approval path.
- ROOT CAUSE: "owner-mint" = an Administrator can approve a pending `WF-064-IDENT-002` role-change request and thereby grant someone the Owner role (mint a new Owner) via `workflow-routes.ts`, bypassing the Owner-only "checker" gate that the direct PATCH endpoint already enforces — a live-exploitable privilege-escalation path parallel to the already-patched G1-1 bug.
- FILES: apps/backend/src/identity/workflow-routes.ts, scripts/verify-user-role-escalation-guard.mjs
- FIX STEPS:
  1. In `workflow-routes.ts`'s `/approve` handler, at the `WF-064-IDENT-002` branch (line 304-312), before the `UPDATE`, fetch/derive `toRole` via `extractToRole(workflow.payload)` (already done at line 305) and if `toRole === "Owner"` OR the target user's current role is `"Owner"`, require `authUser.role === "Owner"` — mirror `users.routes.ts:534`'s `owner_role_requires_owner` error shape exactly.
  2. Also port the "last active Owner can't be demoted" check from `users.routes.ts` if this workflow path can ever demote an Owner (`WF-064-IDENT-002` toRole away from Owner).
  3. Return the SAME error codes (`owner_role_requires_owner`, etc.) so frontend error-mapping stays consistent if/when a UI is built (see finding `0441-mod11-users-changerole-no-approver-ui`).
  4. This is a role/GRANT change per CLAUDE.md §1.4 — build + verify locally, show Jorge the diff, wait for explicit "OK to merge" before merging even though no migration is involved (it changes who can grant the Owner role).
- GUARD: extend `scripts/verify-user-role-escalation-guard.mjs` (currently scoped only to `apps/backend/src/identity/users.routes.ts`) to ALSO check `apps/backend/src/identity/workflow-routes.ts` for the same `owner_role_requires_owner` + `authUser.role === "Owner"` pattern in the approve handler — or add a sibling `verify-workflow-approve-owner-escalation-guard.mjs` with an equivalent required-pattern list.

### 0441-mod11-three-parallel-scheduled-report-sys  [reports]  GATED?no
- STATE: STILL-OPEN, but the framing needs correction. Confirmed 4 registration calls in `apps/backend/src/index.ts` (lines 150-154, 878-879, 1430-1433): `registerReportsScheduledCrudRoutes` (`reports.scheduled_reports` CRUD), `initializeReportsRoleScheduler` (`reports/scheduler.ts`, same table, role-based cadence), `registerScheduledSubscriptionRoutes` (`reports.scheduled_subscriptions`, a DIFFERENT table for per-user Q8 report subscriptions), `initializeScheduledReportsEmailer` (`jobs/scheduled-reports-emailer.ts` -> `reports/scheduled/runner.service.ts` -> also `reports.scheduled_subscriptions`). Two of these four pairs are legitimately separate, both-live features (role-based scheduled reports vs. per-user Q8 subscriptions), NOT duplicative. The genuine duplication is the fully orphaned FIFTH system on `reporting.scheduled_reports` (see 0008-g2/0243-e1-3 above), which this finding's phrasing conflates with the 4 live ones.
- ROOT CAUSE: naming collision ("scheduled reports" used for 3 conceptually distinct features: role-cadence CRUD reports, Q8 per-user subscriptions, and a dead 3rd engine) makes the system look like 4+ duplicate implementations when only one is actually dead/duplicate.
- FILES: apps/backend/src/index.ts, apps/backend/src/reports/scheduler.ts, apps/backend/src/reports/scheduled/routes.ts, apps/backend/src/jobs/scheduled-reports-emailer.ts, apps/backend/src/scheduled-reports/ (orphaned dir)
- FIX STEPS:
  1. Rename/document to disambiguate the two live systems in code comments: "role-based scheduled reports" (`reports.scheduled_reports`) vs. "Q8 report subscriptions" (`reports.scheduled_subscriptions`) so future audits don't re-flag the pair as duplicative.
  2. Apply the 0008-g2 fix (archive the truly orphaned `reporting.scheduled_reports` engine) — that is the only real dedup action needed here.
  3. Update the block registry note for this finding ID to point at 0008-g2/0243-e1-3 as the actual root-cause ticket, to avoid triple-tracking the same fix.
- GUARD: same as 0008-g2 (`verify-no-orphan-scheduled-reports-engine.mjs`); no additional guard needed for the two legitimate live systems.

### 0441-mod11-users-changerole-no-approver-ui  [reports]  GATED?yes — same role/GRANT approval path as 0441-mod11-owner-mint-maker-checker
- STATE: STILL-OPEN (proof: `apps/frontend/src/pages/Users.tsx:9,218-225` calls `createIdentityWorkflow` (submits a `WF-064-IDENT-002` request via `roleWorkflowMutation`) — confirmed. `apps/frontend/src/api/identity.ts:141-168` defines `listIdentityWorkflows`, `approveIdentityWorkflow`, `rejectIdentityWorkflow`, calling `GET/POST /api/v1/identity/workflow-requests*` which IS backed by a live, mounted route (`registerWorkflowRoutes` from `apps/backend/src/identity/workflow-routes.ts`, imported at `index.ts:56`). But `grep -rn "listIdentityWorkflows|approveIdentityWorkflow|rejectIdentityWorkflow" apps/frontend/src` returns ONLY the 3 definition lines in `identity.ts` itself — zero callers anywhere else in the frontend. There is no page/component that lists pending workflow requests or lets an approver act on them.)
- ROOT CAUSE: the role-change request is submit-only from the frontend — the approve/reject API functions exist and the backend endpoint is live, but no UI was ever built to consume `listIdentityWorkflows`/`approveIdentityWorkflow`/`rejectIdentityWorkflow`, so every submitted role-change request is a dead end (must be approved via raw API call, e.g. curl/Postman, today).
- FILES: apps/frontend/src/pages/Users.tsx, apps/frontend/src/api/identity.ts, apps/backend/src/identity/workflow-routes.ts (existing backend, no changes needed for the UI piece)
- FIX STEPS:
  1. Build an "Approvals" panel (e.g. on `Users.tsx` itself, gated to Owner/Administrator visibility, or a new tab) that calls `listIdentityWorkflows()` and renders pending `WF-064-IDENT-002` (and the other `WF-064-IDENT-00x`) requests with requester, target user, requested change, and reason.
  2. Wire `Approve`/`Reject` buttons to `approveIdentityWorkflow(id, reason)` / `rejectIdentityWorkflow(id, reason)`, invalidate the `["users"]` and workflow query keys on success, and toast the result — including surfacing the `owner_role_requires_owner` error from the fix in `0441-mod11-owner-mint-maker-checker` once that backend hardening lands (build the UI fix together with or after that backend fix so the approver-only-if-Owner rule is visible in the UI, not just enforced 500-side).
  3. Prevent an approver from approving their own submitted request client-side too (mirror the server-side `cannot_decide_own_request` check at `workflow-routes.ts:295-297`) for a good UX signal, though the server already blocks it.
  4. Add a component test asserting the approvals list renders and the approve/reject mutations call the right endpoints.
- GUARD: add `verify-identity-workflow-approver-ui-wired.mjs` asserting some `apps/frontend/src/**/*.tsx` file (other than `identity.ts`) imports and calls `listIdentityWorkflows`/`approveIdentityWorkflow`/`rejectIdentityWorkflow` — fails today, passes once the UI is built.

### 0441-mod13-inventory-purchases-not-built  [reports]  GATED?no
- STATE: STILL-OPEN (proof: `apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx:1-31` — titled "Purchase History" (`PageHeader title="Purchase History"` line 20), but its `useQuery` (lines 12-16) calls `listPartsInventory(companyId)` from `apps/frontend/src/api/maintenance.ts:695`, the exact same data source used by the Parts Inventory page, and renders it through `PartsInventoryTable` (line 27) — current stock-on-hand, not purchase/order history. Confirmed no backing schema exists either: `grep -rln "purchase_orders|parts_orders|inventory_purchases" apps/backend/src db/migrations` returns nothing.)
- ROOT CAUSE: "Purchase History" was never actually built as a distinct feature — there is no purchase-order/purchase-history table or endpoint anywhere in the schema; the page is a relabeled duplicate of the Parts Inventory stock view.
- FILES: apps/frontend/src/pages/inventory/InventoryPurchasesPage.tsx, apps/frontend/src/api/maintenance.ts
- FIX STEPS:
  1. Decide scope with Jorge: either (a) rename the page/nav entry to stop claiming it's purchase history until built (additive-only rule means don't delete the page — relabel/mark "Coming soon" or fold it as a stock sub-view of Parts Inventory), or (b) actually build purchase history, which requires a new schema (e.g. `maintenance.parts_purchase_orders` or extending `accounting.bills`/`accounting.bill_lines` with a parts-purchase category) — this is a NEW mdata/maintenance schema addition, so it is its own separately-gated migration block, not a quick frontend fix.
  2. If (a): update the page to either merge into the existing Parts Inventory tab or add a clear empty-state ("Purchase order history is not yet tracked in this system") instead of silently showing stock data under a misleading title.
  3. If (b): design the purchase-order data model first (vendor, PO date, parts/qty/cost, received status), tie it to `mdata.vendors` and existing `accounting.bills` where a real bill was cut for the purchase, per CLAUDE.md §10a total-connectivity law.
- GUARD: add `verify-inventory-purchases-not-parts-inventory-alias.mjs` asserting `InventoryPurchasesPage.tsx` does NOT call `listPartsInventory` (the Parts Inventory data source) directly, once real purchase-history data exists — today this guard would fail, documenting the gap until fixed.

### 0441-mod2-csv-import-mileage-phantom  [reports]  GATED?yes — writes to mdata.units data
- STATE: STILL-OPEN (proof: `apps/backend/src/maintenance/vehicles.routes.ts:346-349` — CSV bulk-import `INSERT INTO mdata.units (unit_number, vin, make, model, year, license_plate, status, notes, vehicle_type, mileage, owner_company_id, currently_leased_to_company_id, created_by_user_id, updated_by_user_id) VALUES (...)` with `row.mileage` bound at line 361. Confirmed against `docs/schema-parity-baseline.json:7619` and `db/migrations/0008_mdata_init.sql:72-91` (base table) + `db/migrations/202606280001_mdata_units_odometer_mi.sql:12` (`ADD COLUMN IF NOT EXISTS odometer_mi NUMERIC(8,1)`): `mdata.units` has NO `mileage` column — the real mileage-tracking column is `odometer_mi`. `vehicle_type` and `notes` in the same INSERT DO exist (added by `202606161400_units_add_vehicle_type.sql` and base `0008` respectively), so only `mileage` is phantom.)
- ROOT CAUSE: the CSV import's column list uses `mileage` where the schema's real column is `odometer_mi`, so every row of every CSV import that includes a mileage value throws Postgres 42703; the handler's per-row `catch` (line 367-368) pushes the error, and because `errors.length > 0` the WHOLE batch `ROLLBACK`s (lines 371-372) — a single bad column reference silently kills every CSV import that ever runs today (when `VEHICLES_CSV_IMPORT_ENABLED` is on).
- FILES: apps/backend/src/maintenance/vehicles.routes.ts
- FIX STEPS:
  1. Rename the `mileage` column reference to `odometer_mi` at line 347 (INSERT column list) — keep the CSV header/field name as `mileage` for user-facing simplicity (`parseVehiclesCsv` line 79/93 can keep reading a `mileage` CSV column), just map it to the correct DB column at INSERT time.
  2. Apply the same fix to the `createSchema`/`updateSchema` Zod schemas (lines 16-27, 29-41) if they also write to a `mileage` column anywhere else in this file for the non-CSV create/update paths — grep the file for other `mileage` write sites (line 24, 37 are just Zod field names, need to confirm what column they map to on insert/update elsewhere in the file) before shipping.
  3. Add a test seeding a CSV with a `mileage` value and asserting the imported row's `odometer_mi` is set (not a rollback/error).
  4. This writes to `mdata.units` data — per the gating rule, get Jorge's explicit OK before merging even though no migration is needed.
- GUARD: add `"mdata.units"` INSERT-column-list coverage to `scripts/verify-sql-column-existence.mjs` — today its documented scope (lines 13-19) only checks qualified `alias.column` refs and single-table unqualified refs in `IS NULL`/comparison/`SET` positions, NOT `INSERT INTO <table> (col1, col2, ...)` column lists, which is exactly why this bug wasn't caught even though `mdata.units` is already in `TARGET_TABLES` (line 47). Extend the guard to also validate INSERT column lists against the baseline for `TARGET_TABLES`, or add a narrower `verify-vehicles-csv-import-columns.mjs` that diffs the CSV-import INSERT column list against `docs/schema-parity-baseline.json["mdata.units"]`.

### 0441-mod3-fuel-expensive-states-free-text  [reports]  GATED?no
- STATE: ALREADY-FIXED (proof: `apps/frontend/src/pages/fuel/FuelPlannerHome.tsx:39` imports `ExpensiveStatesMultiselect`, rendered at `FuelPlannerHome.tsx:410`; the component (`apps/frontend/src/pages/fuel/components/ExpensiveStatesMultiselect.tsx:1-24`) is a catalog-backed checkbox list driven by `expensiveStatesCatalogClient.list()` — no free-text `<input>` remains anywhere in that settings form)
- ROOT CAUSE: N/A — already remediated.
- FILES: n/a
- FIX STEPS: none required — verify only.
- GUARD: `scripts/verify-fuel-expensive-states-catalog-wired.mjs` already exists and is aliased as `verify:fuel-expensive-states-catalog-wired` in `package.json:989`, but it is not referenced anywhere in `.github/workflows/ci.yml` — wire it in so this can't silently regress.

### 0441-mod3-fuel-loves-prices-isolated  [reports]  GATED?no
- STATE: STILL-OPEN (proof: `apps/backend/src/fuel/planner.routes.ts:105-121` queries `fuel.loves_prices_daily` only for `max(updated_at)` -> `loves_sync_at`; `views.fuel_planner_active_routes` in `db/migrations/0043_p3_t11_8_fuel_planner.sql:59-88` selects `savings_estimate`/`station_avg_baseline_cost` directly off `fuel.route_recommendations` with no join to `fuel.loves_prices_daily`; `apps/backend/src/telematics/fuel-stop-planner.service.ts` computes recommendations purely from HOS clocks + `current_fuel_gallons`/`current_mpg`, never touching price data. The comment at `apps/backend/src/fuel/fuel-transaction-import.ts:9-11` confirms by design: "the only ... 'loves-card-import' ... is a station price feed ... it carries no gallons/unit/driver/amount, so it structurally cannot populate a transaction" — prices and route economics are two disconnected systems.)
- ROOT CAUSE: `fuel.route_recommendations.savings_estimate`/`station_avg_baseline_cost` are populated (or left NULL) with no code path that ever cross-references `fuel.loves_prices_daily` by station/state, so the "savings" numbers shown in the planner cannot reflect real Love's pricing.
- FILES: apps/backend/src/telematics/fuel-stop-planner.service.ts; apps/backend/src/fuel/planner.routes.ts; whichever job/service inserts into `fuel.route_recommendations` (none currently found under `apps/backend/src` outside test fixtures — this itself is a gap); `fuel.loves_prices_daily` writers: apps/backend/src/fuel/loves-upload.routes.ts, apps/backend/src/sync/loves-card-import.ts.
- FIX STEPS:
  1. Add a station/state price lookup against `fuel.loves_prices_daily` inside `recommendFuelStopsForRecommendation` (or a new helper) keyed by the recommended stop's state/city.
  2. When persisting a route recommendation, compute `station_avg_baseline_cost` and `savings_estimate` from the joined Love's price rows instead of leaving them as whatever the (currently nonexistent) writer set.
  3. Add an explicit `LEFT JOIN fuel.loves_prices_daily` (or a `views.fuel_loves_price_by_state` helper view) into the query path that produces `views.fuel_planner_active_routes` savings columns, or document why it's intentionally state/route independent.
  4. Add a `fuel_planner_savings_uses_loves_price` field-level test asserting a changed `loves_prices_daily.price_per_gallon` moves `savings_estimate`.
- GUARD: new `scripts/verify-fuel-loves-prices-joined-into-savings.mjs` — statically assert any file that sets `savings_estimate`/`station_avg_baseline_cost` on `fuel.route_recommendations` also references `fuel.loves_prices_daily` in the same function.

### 0441-mod5-addtraining-drops-expiry  [reports]  GATED?no
- STATE: ALREADY-FIXED (proof: `apps/frontend/src/components/drivers/AddTrainingModal.tsx:91` sends `expiry_date: expiryDate || undefined`; `apps/backend/src/mdata/driver-training.routes.ts` create handler validates `expiry_date` in `createTrainingSchema:13` and inserts it at the `INSERT INTO safety.training_records (... expiry_date ...)` statement (lines 68-84, `VALUES ($1,$2,$3,$4::timestamptz,$5::date,$6)`); PATCH handler validates via `patchTrainingSchema:20` and conditionally sets `expiry_date = $n::date` at lines 111-114)
- ROOT CAUSE: N/A — already remediated.
- FILES: n/a
- FIX STEPS: none required — verify only.
- GUARD: `scripts/verify-driver-training-expiry-field.mjs` exists, aliased `verify:driver-training-expiry-field` (`package.json:1055`), but is not wired into `.github/workflows/ci.yml` — add it.

### 0441-mod5-border-creds-no-edit  [reports]  GATED?no
- STATE: ALREADY-FIXED (proof: `apps/frontend/src/components/driver-profile/BorderCredentialsSection.tsx:119` renders an `Edit` button (`data-testid="dp-edit-border-creds"`, `onClick={() => setEditOpen(true)}`) that opens a `Modal` with fields for FAST card, SENTRI, TWIC, and Mexican-license number/expiration; `save()` at lines 96-108 calls `updateDriver(driverId, borderFormStateToUpdatePayload(form))` at line 101, PATCHing the driver record)
- ROOT CAUSE: N/A — already remediated.
- FILES: n/a
- FIX STEPS: none required — verify only.
- GUARD: two guards already exist — `scripts/verify-driver-border-credentials-edit.mjs` has no package.json alias at all (dead file, never runs); `scripts/verify-driver-profile-border-credentials-complete.mjs` is aliased and is wired into CI. Add a `verify:driver-border-credentials-edit` alias and wire it in, or delete the duplicate if `verify-driver-profile-border-credentials-complete.mjs` already covers the same assertion (needs a diff of the two scripts to decide which is canonical).

### 0441-mod5-disputes-no-approve-deny-dual-check  [reports]  GATED?yes — fix triggers createCorrectiveJournalEntry (posting/GL logic)
- STATE: STILL-OPEN (proof: `apps/backend/src/settlements/disputes/disputes.routes.ts:191-197`, function `reviewSettlementDispute(userId, userRole, disputeId, input)`, gate is `if (!isOwner(userRole)) throw new Error("E_OWNER_ONLY")` where `isOwner` at line 55 is simply `role === "Owner"` — a single Owner-role user can call `PATCH /api/v1/settlement-disputes/:id/review` (registered at line 345) to move a dispute through `in_review` -> `approved`/`partial`/`denied` and trigger `createCorrectiveJournalEntry` (lines 234-243) with no second-approver / maker-checker field anywhere in the table or route)
- ROOT CAUSE: authorization is a single boolean role check, not a two-actor (submitter != approver) control, so one person can request and approve their own settlement-dispute adjustment, including the corrective GL entry.
- FILES: apps/backend/src/settlements/disputes/disputes.routes.ts; migration needed on `settlements.settlement_disputes` (add e.g. `requested_by_user_id` distinct from `reviewed_by_user_id`, enforce `!=` at decision time — or reuse existing `reviewed_by_user_id` column if one already records the submitter).
- FIX STEPS:
  1. Confirm the current columns on `settlements.settlement_disputes` (need a migration check — `created_by_user_id` vs `reviewed_by_user_id`) to see if a submitter identity is even captured today.
  2. Add (via a new migration, gated) a `NOT (reviewed_by_user_id = created_by_user_id)` check inside `reviewSettlementDispute` before allowing `approved`/`partial`/`denied`, throwing a new `E_MAKER_CHECKER_SAME_ACTOR`.
  3. Surface the block in the frontend dispute-review UI with a clear message.
  4. Add a regression test asserting the same user cannot both file and approve/deny a dispute.
- GUARD: new `scripts/verify-settlement-dispute-maker-checker.mjs` asserting `reviewSettlementDispute` contains a submitter!=approver comparison before any GL-posting branch. (Note: `scripts/verify-settlement-dispute-je-gate.mjs` already exists but only checks JE-account-gating, not dual-control — do not conflate the two.)

### 0441-mod5-teams-tab-unreachable  [reports]  GATED?no
- STATE: ALREADY-FIXED (proof: `apps/frontend/src/pages/Drivers.tsx:477-486` renders `<SecondaryNavTabs activeId={activeTab} tabs={[{id:"drivers"},{id:"teams"}]} onChange={...}>` unconditionally with no feature-flag/permission gate; `activeTab` is derived from the URL via `parseDriversHomeView(searchParams)` at line 130, and clicking "Teams" calls `setDriversHomeView(id)` at line 415, which updates the URL search param — so the tab, roster `DataTable` (lines 491-548), and `+ Create Team` button (line 494) are all reachable and URL-shareable)
- ROOT CAUSE: N/A — already remediated.
- FILES: n/a
- FIX STEPS: none required — verify only.
- GUARD: `scripts/verify-drivers-teams-tab-reachable.mjs` exists, aliased, and is wired into `.github/workflows/ci.yml` — already covered.

### 0441-mod6-spawn-liability-fake-stub  [reports]  GATED?yes — creates a liability record (accounting-adjacent)
- STATE: STILL-OPEN — duplicate of safety-module finding `coder-work-order-t2-6-accident-liability-stub`. Confirmed directly: `apps/backend/src/safety/safety.routes.ts:544-569` (`POST /accidents/:id/spawn-liability`) writes only an audit-log row via `appendCrudAudit` and hard-returns `spawned_liability_id: null` — no `safety.accident_liabilities` table exists and no escrow-posting path is called. Do not open a second, conflicting build ticket for this — treat as the SAME ticket as `coder-work-order-t2-6-accident-liability-stub` (see safety module) and build/guard it once.
- ROOT CAUSE: the endpoint was scaffolded (route + audit trail) but the actual liability-record creation and escrow-posting logic was never implemented.
- FILES: apps/backend/src/safety/safety.routes.ts (route `POST /accidents/:id/spawn-liability`, lines 544-569)
- FIX STEPS: see `coder-work-order-t2-6-accident-liability-stub` ticket (safety module) — same file, same fix, same gate. Do not duplicate the build.
- GUARD: single guard `verify-spawn-liability-not-stub.mjs` (proposed under the safety-module ticket) covers both finding IDs — do not add a second one from the reports side.

### 0441-mod7-dispute-queue-stub  [reports]  GATED?no
- STATE: STILL-OPEN (proof: `apps/frontend/src/pages/accounting/DisputeQueuePage.tsx` is exactly 19 lines — a `PageHeader` plus three `<p>` tags naming `GET /api/v1/disputes?operating_company_id=...`, `POST /api/v1/disputes/:id/start-review`, `POST /api/v1/disputes/:id/decide` as prose; there is no `useQuery`, no `apiRequest`/`fetch` call, no table, no button. The route is real and mounted — `apps/frontend/src/routes/manifest.tsx:254` lazy-imports it and `manifest.tsx:3488` renders `<DisputeQueuePage />` — and the backend endpoints it names are real and implemented: `apps/backend/src/accounting/disputes.routes.ts:81` (`GET /api/v1/disputes`), `:103` (`start-review`), `:124` (`decide`), backed by `settlement-disputes-p6.service.ts`. So the backend is fully built and reachable; only the UI is unwired.)
- ROOT CAUSE: the P6 settlement-dispute-queue backend (list/start-review/decide, role-gated via `OFFICE_READ_ROLES`/`DECIDE_ROLES` in `disputes.routes.ts:52-53`) was built with no corresponding frontend implementation — the page is a placeholder that was never replaced.
- FILES: apps/frontend/src/pages/accounting/DisputeQueuePage.tsx; add an API client (e.g. apps/frontend/src/api/disputes.ts if one doesn't exist) calling `GET /api/v1/disputes`, `POST /api/v1/disputes/:disputeId/start-review`, `POST /api/v1/disputes/:disputeId/decide`.
- FIX STEPS:
  1. Build a `useQuery` against `GET /api/v1/disputes?operating_company_id=...&status=...` with pagination (`limit`/`offset` per `queueQuerySchema` in `disputes.routes.ts:19-25`).
  2. Render a `DataTable` of the queue rows with driver/settlement/claimed-amount/status columns.
  3. Wire a row action calling `POST /api/v1/disputes/:disputeId/start-review` (role-gated `DECIDE_ROLES` server-side already — mirror in UI by hiding the action for non-Owner/Administrator/Accountant roles).
  4. Wire a decide modal capturing `decision` (`approved`/`denied`), `resolution_text` (min 10 chars per `decideBodySchema:28-31`), and optional `adjustment_cents`, POSTing to `/decide`.
  5. Handle the `E_CORRECTIVE_JE_ACCOUNTS_MISSING` error code (`disputes.routes.ts:47`) with a clear message since approving posts a corrective JE.
- GUARD: new `scripts/verify-dispute-queue-page-wired.mjs` — statically assert `DisputeQueuePage.tsx` contains `useQuery`/`apiRequest` calls to `/api/v1/disputes`, not just static text.

### 0441-mod9-mileage-dropped-on-create-edit  [reports]  GATED?yes — requires ADD COLUMN migration on mdata.units
- STATE: STILL-OPEN, same root cause as `0441-mod2-csv-import-mileage-phantom` — do not open a duplicate build (proof: `apps/backend/src/maintenance/vehicles.routes.ts` — `createSchema:24` and `updateSchema:37` both accept `mileage`; the `POST` handler's `INSERT INTO mdata.units (unit_number, vin, make, model, year, license_plate, status, notes, owner_company_id, currently_leased_to_company_id, created_by_user_id, updated_by_user_id)` at lines 195-201 has NO `mileage` column, and its `RETURNING` clause hardcodes `NULL::bigint AS mileage` (line 202); the `GET` list query also hardcodes `NULL::bigint AS mileage` (line 166); the `PATCH` handler's `add(...)` calls at lines 249-256 cover `make/model/year/vin/plate/status/notes` but never call `add("mileage", ...)`, so a PATCH with `mileage` silently no-ops it. Confirmed via grep across `db/migrations/*.sql` that no migration ever added a `mileage` column to `mdata.units` — the only `mileage` column in the schema is on the unrelated `maint.inspections` table (`db/migrations/0362_maint_inspections.sql:16`). Separately, the CSV import path at `vehicles.routes.ts:344-350` actually issues `INSERT INTO mdata.units (... vehicle_type, mileage ...)` — since neither column exists, that INSERT will 500 per-row (caught by the per-row try/catch at lines 361-364, appended to `errors[]`), which is a different failure mode (hard error, not silent drop) for the same missing-column root cause.)
- ROOT CAUSE: `mdata.units` has no `mileage` column; the create/PATCH/GET/list handlers and the CSV importer all reference a `mileage` field that doesn't exist in the schema, so every mileage input is either silently discarded (create/PATCH/list) or causes a per-row SQL error (CSV import).
- FILES: db/migrations/ (new migration adding `mdata.units.mileage`); apps/backend/src/maintenance/vehicles.routes.ts (GET list, POST create, PATCH update, CSV import block).
- FIX STEPS:
  1. [GATED] Author a new migration (`db/migrations/0XXX_mdata_units_add_mileage.sql`, idempotent `ADD COLUMN IF NOT EXISTS mileage bigint NULL CHECK (mileage IS NULL OR mileage >= 0)`) — show Jorge the full SQL and wait for explicit "OK to merge" per CLAUDE.md §1.4 before merging.
  2. Update the `GET /api/v1/maintenance/vehicles` list query (line 166) to select `u.mileage` instead of `NULL::bigint AS mileage`.
  3. Update the `POST` INSERT (lines 195-202) to include `mileage` in the column list and `RETURNING`.
  4. Update the `PATCH` handler to add `if ("mileage" in body.data) add("mileage", body.data.mileage ?? null);` alongside the other `add(...)` calls (~line 255).
  5. Fix the CSV import INSERT (lines 344-350) to drop the phantom `vehicle_type` column (also nonexistent) and keep `mileage` now that the column is real — coordinate with whoever owns `0441-mod2-csv-import-mileage-phantom` so this isn't fixed twice on divergent branches.
- GUARD: new `scripts/verify-vehicle-mileage-column-persisted.mjs` — assert (a) a migration creates `mdata.units.mileage`, and (b) `vehicles.routes.ts` never emits literal `NULL::bigint AS mileage` in a live (non-comment) SQL string once the column exists.

### f-01-fuel-home-stub  [reports]  GATED?no
- STATE: STILL-OPEN (proof: `apps/frontend/src/pages/fuel/FuelHome.tsx` — the exported `FuelHomePage` (lines 49-58) renders exactly two children: `<FuelFraudAlertsKpiCard />` and `<RelayHistoryImport />`. `FuelHomePage` is mounted as the "home" tab in `apps/frontend/src/pages/fuel/FuelPlannerHome.tsx:168` (`{tab === "home" ? <FuelHomePage /> : null}`). A backend dashboard endpoint already exists and computes exactly the missing metrics — `apps/backend/src/fuel/planner.routes.ts` `GET /api/v1/fuel/planner/dashboard` (lines 53-124) returns `mtd_spend`, `avg_price_per_gallon`, `mtd_savings`, `compliance_pct`, `fleet_mpg`, `loves_sync_at` — but a repo-wide grep for `mtd_spend`/`fleet_mpg`/`avg_price_per_gallon`/`active_plans` across `apps/frontend/src/pages/fuel/*.tsx` returns zero hits: nothing in the frontend renders this endpoint. The recent-transactions table (`FuelTransactionsTable`) exists but is only mounted under the separate `tab === "history"` branch (`FuelPlannerHome.tsx:203-230`), not on the home tab. There is no spend-by-truck breakdown or MPG-trend chart anywhere in `apps/frontend/src/pages/fuel/`.)
- ROOT CAUSE: the fuel-planner dashboard backend (`/api/v1/fuel/planner/dashboard`) was built with real MTD spend/MPG/savings/compliance aggregates, but no frontend component was ever built to consume it — `FuelHomePage` only has the two components that shipped earliest (fraud KPI card, relay import).
- FILES: apps/frontend/src/pages/fuel/FuelHome.tsx; apps/backend/src/fuel/planner.routes.ts (dashboard endpoint, already built); apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx (existing component to reuse for a "recent transactions" widget); need a new backend query for spend-by-truck (group `fuel.fuel_transactions` by `unit_id`) — not yet found anywhere in the backend.
- FIX STEPS:
  1. Add a `useQuery` in `FuelHome.tsx` calling `GET /api/v1/fuel/planner/dashboard` and render `mtd_spend`, `avg_price_per_gallon`, `fleet_mpg`, `mtd_savings`, `compliance_pct` as KPI tiles alongside the existing fraud card.
  2. Add a "recent transactions" widget reusing `FuelTransactionsTable` with a small `limit` (e.g. last 10) sourced from the same query the "history" tab uses (`fuelTransactionsQuery` in `FuelPlannerHome.tsx`), or a new lightweight endpoint.
  3. Add a new backend aggregate (e.g. `GET /api/v1/fuel/planner/spend-by-truck`) grouping `fuel.fuel_transactions` by `unit_id`/`unit_number` for MTD spend — non-financial-cluster read, no posting.
  4. Add an MPG-trend sparkline/chart component sourced from `fleet_mpg` history (may need a small time-bucketed query against `fuel.fuel_transactions` or `views.fuel_planner_active_routes`).
  5. Keep `FuelFraudAlertsKpiCard` and `RelayHistoryImport` — additive only per CLAUDE.md §7.
- GUARD: new `scripts/verify-fuel-home-dashboard-wired.mjs` — assert `FuelHome.tsx` contains a `useQuery`/fetch call to `/api/v1/fuel/planner/dashboard` and renders at least `mtd_spend` and `fleet_mpg`.

### qbo-realtime-webhook-sync  [reports]  GATED?yes — inbound sync applying to live mdata/accounting records + touches locked "reconcile-only" architecture
- STATE: STILL-OPEN, with an important design caveat (proof: `apps/backend/src/integrations/qbo/sync-inbound.worker.ts` — `processInboundSyncBatch` (lines 39-116+) fetches the live QBO entity via `qboGetEntityById`, evaluates conflict via `evaluateInboundVersusTms` (lines 96-102), then only writes a forensic row into `qbo_archive.entities_snapshot` (lines 104-136) and marks the source event `status='applied'` with `applied_to_tms_entity_table = 'qbo_archive.entities_snapshot'` and, critically, `applied_to_tms_entity_id = NULL` hardcoded even on the success path (line 178). No branch of this function ever writes to a canonical live table. The route registering this consumer, `qbo-webhook.routes.ts`, is registered + HMAC-verified at `apps/backend/src/index.ts:656`, confirming the webhook intake itself is real and wired — only the "apply" step is a no-op beyond archiving. CAVEAT: this repo has a CI-enforced, owner-locked "reconcile-only" architecture (`scripts/verify-no-qbo-write-path.mjs`: "TMS is RECONCILE-ONLY: no backend code path may CREATE or UPDATE a QuickBooks object... the books are kept in parallel and reconciled, never written back") and a second guard (`scripts/verify-no-accounting-qbo-writes.mjs`) that forbids writes to the deprecated `accounting.qbo_accounts/customers/vendors` mirror tables, stating "Canonical = mdata.qbo_*". Both guards concern outbound TMS->QBO writes and a specific deprecated mirror-table set — neither forbids applying an inbound QBO change into the canonical `mdata.qbo_*` mirror tables or a real `mdata`/`driver_finance`/`accounting` record. So the finding is real (the field exists, is documented, and is always NULL) but the fix must not reintroduce a TMS->QBO write path or resurrect `accounting.qbo_*` — it should apply into the canonical `mdata.qbo_*` mirrors per the locked schema-canonicalization decision, and needs explicit owner sign-off given it's a change to how financial data enters the ledger.)
- ROOT CAUSE: the inbound-sync worker was built to prove connectivity and detect conflicts (forensic snapshot + `evaluateInboundVersusTms`) but the "apply to TMS" half was never implemented — `applied_to_tms_entity_id` is a schema field with no writer.
- FILES: apps/backend/src/integrations/qbo/sync-inbound.worker.ts; apps/backend/src/integrations/qbo/sync-inbound-apply-guard.ts (`evaluateInboundVersusTms`); apps/backend/src/integrations/qbo/qbo-reconcile-read.service.ts (reads `applied_to_tms_entity_table/id` for the reconciliation UI); canonical mirror tables under `mdata.qbo_*` (need to locate/confirm their exact columns before writing).
- FIX STEPS:
  1. [STOP — get Jorge's explicit OK before building]: confirm with the owner whether "apply to live records" is even in scope, given the locked "QBO=SoR through 12/31/2025, no write-back" parallel-clone architecture (auto-memory `accounting-architecture-parallel-clone-reconcile.md`) — this finding may describe intended behavior, not a bug, depending on that ruling.
  2. If approved: on the non-conflict branch (currently lines 165-181), add an UPDATE/UPSERT into the matching canonical `mdata.qbo_<entity>` mirror row keyed by `qbo_entity_id`, and set `applied_to_tms_entity_table`/`applied_to_tms_entity_id` to that real table/row, not `qbo_archive.entities_snapshot`/`NULL`.
  3. Never touch `accounting.qbo_accounts/customers/vendors` (guarded, retired) and never add an outbound POST/PATCH to a QBO company URL (guarded).
  4. Extend `scripts/verify-no-accounting-qbo-writes.mjs`'s allowlist reasoning or add a companion guard (below) so the new write path is provably scoped to `mdata.qbo_*` only.
  5. Add a test asserting a non-conflicting inbound event ends with `applied_to_tms_entity_id` populated and the corresponding `mdata.qbo_*` row updated.
- GUARD: new `scripts/verify-qbo-inbound-applies-to-tms.mjs` asserting `sync-inbound.worker.ts` sets `applied_to_tms_entity_id` to a real value (not the literal `NULL`) on the `status = 'applied'` branch, and that any new write it performs targets `mdata.qbo_*` (never `accounting.qbo_*`).

# MODULE: safety (20 findings)

### 0007-pattern-9-fake-persist-evidence-loss  [safety]  GATED?no
- STATE: STILL-OPEN — evidence updated. Of the 3 named fake-persist paths: (1) DOT-inspection PDF upload is ALREADY-FIXED — `apps/backend/src/routes/safety/dot-inspections.ts:288-296` reads `file.toBuffer()`, rejects empty buffers (`file_empty`), and calls real `putObjectBytes(r2Key, fileBuffer, contentType)` (`apps/backend/src/storage/r2-client.ts:157-167`, a genuine `PutObjectCommand`). (2) accident Spawn Liability is STILL a stub (see ticket for `coder-work-order-t2-6-accident-liability-stub`). (3) damage photos is STILL a live fake-persist bug: `apps/backend/src/safety/damage-reports/photo-evidence.routes.ts:53-66` reads the real upload bytes into `buffer` and computes `r2ObjectKey`, then passes both to `attachPhotoToDamage` (`apps/backend/src/safety/damage-reports/photo-evidence.service.ts:17-95`) — that function only uses `input.buffer` to compute EXIF/SHA-256 and INSERTs `r2_object_key` + `sha256_hash` into `documents.damage_photo_evidence`; it never calls `putObjectBytes` or any R2 write. The DB row and custody-chain entries reference an R2 object that was never created — real evidence loss. `r2:verify` (`package.json:708`) has zero hits in `.github/workflows/ci.yml` (grep confirmed empty) — file-only guard, not CI-run, and it only smoke-tests R2 connectivity anyway (PUT/GET/DELETE a throwaway key), not that any specific route persisted bytes.
- ROOT CAUSE: `attachPhotoToDamage` in `photo-evidence.service.ts` discards the uploaded buffer after hashing instead of writing it to R2.
- FILES: apps/backend/src/safety/damage-reports/photo-evidence.service.ts, apps/backend/src/safety/damage-reports/photo-evidence.routes.ts, apps/backend/src/storage/r2-client.ts, .github/workflows/ci.yml
- FIX STEPS:
  1. In `photo-evidence.service.ts`, import `putObjectBytes` from `../../storage/r2-client.js` and call `await putObjectBytes(input.r2ObjectKey, input.buffer, "image/jpeg")` before the `INSERT INTO documents.damage_photo_evidence`.
  2. If the R2 write fails, throw before the INSERT so the DB row is never created referencing a non-existent object (evidence integrity).
  3. Add a `verify-bytes-persisted-before-db-row.mjs` static guard: grep every route/service under `apps/backend/src/**/*evidence*.ts` and `*photo*.ts` that INSERTs an `r2_object_key`/`*_pdf_url` column and assert a `putObjectBytes`/`PutObjectCommand` call appears in the same function before the INSERT.
  4. Wire `r2:verify` into `.github/workflows/ci.yml` (it needs R2 creds as CI secrets — confirm they're already available to the workflow before wiring).
- GUARD: new `scripts/verify-bytes-persisted-before-db-row.mjs`, wired into `ci.yml`; separately wire existing `r2:verify` into `ci.yml`.

### 0243-g10-m-seven-integrity-reliability-gaps  [safety]  GATED?yes — migration touch (HMAC signing requires ALTER FUNCTION on events schema)
- STATE: STILL-OPEN (bundle, partial) — re-verified all 7 sub-items individually. (1) HMAC/anchor STILL-OPEN: `events.calculate_event_hash` (`db/migrations/202606111051_w1a_event_log_immutable.sql:17-41`) uses plain `digest(..., 'sha256')` — no secret key, confirmed still unsigned SHA-256 on main; `audit-chain-verify.service.ts` only recomputes/compares this same keyless hash (tamper-detection, not cryptographic signing) — an attacker with DB write access can recompute consistently. (2) row_changes mutation-trigger coverage ALREADY-FIXED: PR #2132 (`7b49f3d90`) shipped `db/migrations/202607051200_g10m_row_changes_evidence_table_triggers.sql`, attaching `audit.tg_audit_row` to `mdata.load_stops/drivers/units/equipment/customers/vendors` + `dispatch.load_assignment_history`; separately `audit.row_changes` has FORCE RLS with only SELECT+INSERT policies (`db/migrations/202606251000_audit_row_changes_insert_policy.sql`) — no UPDATE/DELETE policy exists, so those ops are default-denied for `ih35_app`, functioning as an implicit mutation block. (3) stop archive/re-key ALREADY-FIXED per PR #2132 commit message (uses `soft_deleted_at`, INV-1 pattern). (4) qbo-sync 401 swallow looks correctly SCOPED, not swallowed: `apps/backend/src/integrations/qbo/qbo-sync.service.ts:521-527` checks `error.status === 401` specifically, refreshes token, retries once, else rethrows. (5) Twilio idempotency key STILL-OPEN: zero hits for "idempoten" in `apps/backend/src/outbox/handlers/twilio-sms.ts` / `twilio-whatsapp.ts`. (6) durable notifications STILL-OPEN: `apps/backend/src/safety/events/notification.service.ts:66-78` wraps `sendEmail(...)` in a bare try/catch that silently swallows failure with no retry/outbox/dead-letter ("Non-blocking when Resend is not configured"). (7) "preflight" — UNVERIFIABLE, could not locate what this sub-item refers to in code or docs; needs the original audit author to specify the concrete preflight check meant.
- ROOT CAUSE: audit hash chain uses a keyless digest; Twilio sends have no dedup key; safety-event email alerts are fire-and-forget with silent failure.
- FILES: db/migrations/202606111051_w1a_event_log_immutable.sql (or a new migration), apps/backend/src/outbox/handlers/twilio-sms.ts, apps/backend/src/outbox/handlers/twilio-whatsapp.ts, apps/backend/src/safety/events/notification.service.ts, apps/backend/src/notifications/email.service.ts
- FIX STEPS:
  1. Add a new migration to change `events.calculate_event_hash` to use `hmac(..., key-from-app-secret, 'sha256')` instead of plain `digest()` — financial/audit-cluster, owner must review full SQL before merge.
  2. Add an Idempotency-Key (e.g. outbox `event_id`) to the Twilio API call params in `twilio-sms.ts`/`twilio-whatsapp.ts` so a retried outbox job doesn't double-send.
  3. Route the `sendEmail` call in `notifySevereSafetyEvent` (`notification.service.ts:67-77`) through the existing outbox pattern (`apps/backend/src/outbox/`) instead of a direct fire-and-forget call, so failures retry instead of vanishing.
  4. Clarify/replace the "preflight" sub-item with a concrete spec before building it.
- GUARD: `scripts/verify-audit-hash-is-hmac.mjs` (grep `calculate_event_hash` body for `hmac(`, fail if it finds plain `digest(`); `scripts/verify-twilio-send-idempotency-key.mjs`.

### 0252-audit146-workplace-safety-osha  [safety]  GATED?yes — new schema/tables required
- STATE: STILL-OPEN (net-new feature, not a regression) — confirmed `grep -rn "OSHA" apps/backend/src apps/frontend/src` returns zero hits. The existing `safety.*` schema (`safety.dvir_submissions`, `safety.incidents`, `safety.safety_events`, `safety.accident_reports`) is entirely FMCSA/DOT/CSA-focused; there is no OSHA-specific workplace-safety dashboard, incident-prevention tracking, or recordkeeping (OSHA 300/300A logs) anywhere in the repo.
- ROOT CAUSE: module was never built — this is a net-new feature request, not a regression.
- FILES: would be new — e.g. apps/backend/src/safety/osha/, a new db/migrations/*_osha_recordkeeping.sql, a new frontend tab under Compliance Docs & Monitoring.
- FIX STEPS:
  1. Owner decision needed: is OSHA recordkeeping in scope for IH35 (interstate trucking is largely DOT/FMCSA-regulated, not OSHA — confirm this is actually a requirement before building).
  2. If yes: design a `safety.osha_incidents`/`osha_300_log` schema (new migration, owner-gated).
  3. Build backend routes + frontend tab following the existing `safety.incidents` pattern.
- GUARD: none yet — not applicable until built.

### 0278-eld-none-identified-contradiction  [safety]  GATED?no
- STATE: ALREADY-FIXED (as documentation, not a bug) — confirmed `apps/frontend/src/components/layout/sidebar-config.ts:45` lists `"eld"` in `SIDEBAR_ITEM_IDS`, line 67 comment states `// "eld" is a placeholder/stub page (no real backend) — hidden from nav so there are no dead-end pages.`, line 72 `NAV_HIDDEN_STUB_IDS: readonly SidebarItemId[] = ["eld"]`, and line 123 `eld: { id: "eld", label: "ELD", Icon: Radio, to: "/eld", visibleRoles: ["Owner"] }`. The code already explicitly documents ELD as a stub and hides it from nav for non-Owners. The original source doc's "no gaps" claim was wrong at the time, but the current state is intentional and self-documenting, not a silent gap.
- ROOT CAUSE: N/A — this was a stale audit claim, not a live defect.
- FILES: apps/frontend/src/components/layout/sidebar-config.ts:45,67,72,123
- FIX STEPS: 1. No code fix required. 2. If Jorge wants a real ELD backend, that is a net-new build (separate ticket), not a "fix" to this stub.
- GUARD: existing `scripts/__tests__/fixtures/verify-eld-foundation-coverage/*` fixtures already assert the stub-vs-complete states; no new guard needed.

### 0278-safety-gap1-auto-driver-status  [safety]  GATED?yes — mdata.drivers data write (status column)
- STATE: STILL-OPEN — confirmed `mdata.drivers.status` is enum `mdata.driver_status` (`db/migrations/0008_mdata_init.sql:13,57`: `'Active','Probation','Inactive','Terminated','OnLeave'`) so `'Probation'`/`'Terminated'` values already exist, but nothing writes them automatically. `apps/backend/src/safety/company-violations.routes.ts:59` defines `outcome: z.enum([...,"termination",...])` as a manual office-selected enum on a violation record; `apps/backend/src/safety/company-violations.service.ts` (checked in full) never issues an `UPDATE mdata.drivers SET status = ...` — confirmed zero hits for `mdata.drivers` in that file. No auto-escalation from severe safety events to driver status exists anywhere in `apps/backend/src/safety/`.
- ROOT CAUSE: violation `outcome = 'termination'` is stored only on the violation row; no side-effect updates `mdata.drivers.status`.
- FILES: apps/backend/src/safety/company-violations.service.ts, apps/backend/src/safety/events/safety-events.routes.ts (severe-event create path, ~line 435)
- FIX STEPS:
  1. Owner must define exact thresholds (e.g., N critical events in M days -> Probation; outcome=termination -> Terminated) before building — explicitly flagged as needing owner input in the original finding.
  2. Add an `UPDATE mdata.drivers SET status = $2 WHERE id = $1` call inside `company-violations.service.ts`'s close/outcome path when `outcome IN ('termination')`, and inside `safety-events.routes.ts`'s severe-create path when thresholds are met.
  3. Emit an audit event (`appendCrudAudit`) for the status change, same pattern already used at `safety.routes.ts:491-503`.
- GUARD: `scripts/verify-safety-event-driver-status-linkage.mjs` — assert a code path exists linking severe safety-event/violation-termination writes to an `mdata.drivers` status UPDATE. (Same underlying gap and same guard as `linkage-safety-event-no-driver-status-update` below — build once, close both.)

### 0278-safety-gap3-auto-notifications  [safety]  GATED?no
- STATE: ALREADY-FIXED — this claim ("zero notification calls") is STALE/WRONG as of current main. `apps/backend/src/safety/events/safety-events.routes.ts:7` imports `notifySevereSafetyEvent`, and the general POST `/api/v1/safety/events-log` create handler (route registered at line 276, inside `registerSafetyEventsRoutes` starting line 67) calls it directly at lines 435-446: `if (createdEvent && isSevereSafetyEventSeverity(body.data.severity)) { await notifySevereSafetyEvent(client, {...}); }`. This is the exact contradiction referenced in `flow9-safety-event-auto-notifications` below — that finding is correct and current; this finding is outdated.
- ROOT CAUSE: N/A — stale finding, superseded by the fix landed under the `flow9-safety-event-auto-notifications` source block.
- FILES: apps/backend/src/safety/events/safety-events.routes.ts:7,276,435-446
- FIX STEPS: 1. No fix needed — close this finding as duplicate/stale of `flow9-safety-event-auto-notifications`. 2. Note the remaining real gap is notification durability (see G10-M item 6 above), not notification presence.
- GUARD: none needed; existing wiring is covered by whatever test exercises `safety-events.routes.ts` create path (confirm a test asserts `notifySevereSafetyEvent` is called on high/critical severity — add one if absent).

### 0441-mod12-eld-export-pdf-window-print  [safety]  GATED?no
- STATE: STILL-OPEN — confirmed exactly as described: `apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx:82` defines `exportPdf`, line 84 `window.open("", "_blank", ...)`, line 85 popup null-check, line 101 `popup.document.write(...)` (raw HTML table), line 126 `popup.document.close()`, line 127 `setTimeout(() => popup.print(), 500)`. This is browser print-dialog based, not a real PDF file generation/export.
- ROOT CAUSE: `exportPdf()` never generates an actual PDF byte stream — it relies on the user's browser print-to-PDF, which is not scriptable, not downloadable via API, and breaks in popup-blocked/headless contexts.
- FILES: apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx:82-127,144
- FIX STEPS:
  1. Replace the `window.open`/`popup.print()` path with a real PDF generation library already in the frontend deps (check for `jspdf`/similar; if none, this needs a dependency addition — non-runtime dev dep is fine, runtime dep bump needs §1.3 OK).
  2. Alternatively, add a backend PDF-render endpoint (there is already a PDF-render precedent at `apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts`) and have `exportPdf()` call it and download the returned bytes via a `Blob`.
  3. Keep the same `data.edits` history content, just change the rendering mechanism.
- GUARD: `scripts/verify-eld-audit-pdf-is-real-export.mjs` — grep `EldAuditTrailViewer.tsx` and fail if `window.print(` or `popup.print(` appears in `exportPdf`.

### 0441-mod6-accident-edit-500-status-silent-fail  [safety]  GATED?no
- STATE: STILL-OPEN (low priority, confirmed unexecuted in prod) — `apps/backend/src/safety/safety.routes.ts:468-508` (`PATCH /api/v1/safety/accidents/:id/status`) has no try/catch — confirmed `grep -c "try {" safety.routes.ts` = 0 across the whole file (consistent house style relying on Fastify's global error handler, not a special-case bug). Frontend `setSafetyAccidentStatus` (`apps/frontend/src/api/safety.ts:256`) has exactly two references in the whole frontend: the function definition itself and a `vi.fn()` mock in `apps/frontend/src/components/safety/AccidentReportDrawer.test.tsx:15` — zero production call sites, confirmed via full-repo grep.
- ROOT CAUSE: dead/unwired frontend API function; the backend route it would call has no route-specific error handling (relies on global handler, same as every other route in the file).
- FILES: apps/backend/src/safety/safety.routes.ts:468-508, apps/frontend/src/api/safety.ts:256
- FIX STEPS:
  1. Decide: either wire `setSafetyAccidentStatus` into a real UI control (e.g., an accident status dropdown), or leave it and just note it's dead — do not delete without Jorge's explicit say-so per additive-only rules.
  2. If wired, no special try/catch is needed since the pattern is consistent with the rest of the file; if desired, add one for a friendlier error message before the UPDATE fails.
- GUARD: `scripts/verify-no-orphan-api-functions.mjs` (generic: flag frontend API functions imported nowhere outside test mocks) — could catch this class broadly, not safety-specific.

### 0441-mod6-damage-insurance-worker-unregistered  [safety]  GATED?no
- STATE: ALREADY-FIXED — confirmed `apps/backend/src/index.ts:494` imports `initializeDamageContinuityWorker` from `./jobs/damage-continuity-worker.js`, and it IS invoked at `apps/backend/src/index.ts:1372`. The finding's own id says "unregistered" but the evidence text and a direct read of `index.ts` confirm it IS registered and invoked at backend boot. The id is stale/mislabeled.
- ROOT CAUSE: N/A — no defect found; worker is wired.
- FILES: apps/backend/src/index.ts:494,1372, apps/backend/src/jobs/damage-continuity-worker.ts
- FIX STEPS: 1. Close this finding as already-fixed/false-positive. 2. If concerned about silent worker failure, add a startup log confirming the worker initialized (cosmetic, optional).
- GUARD: none needed; if desired, `scripts/verify-damage-continuity-worker-registered.mjs` asserting `initializeDamageContinuityWorker(` appears inside `index.ts`'s boot sequence (would pass today).

### 0441-mod6-insurance-no-driver-accident-link  [safety]  GATED?no
- STATE: STILL-OPEN, confirmed exactly — forward link exists: `apps/frontend/src/pages/insurance/ClaimsTab.tsx:205-212` renders a `<Link to="/safety/accidents">Accident {...}</Link>` when `graph.claim.accident_report_id` is set. Reverse link is fetched but not rendered: `graph.reverse.accidents` and `graph.reverse.incidents` are only referenced in the empty-state check at lines 224-227 (`graph.reverse.accidents.length === 0 && ...`) — unlike `graph.reverse.lawsuits` (mapped at line 216-220) and `graph.reverse.matters` (mapped at line 221-223), `accidents` and `incidents` are never `.map()`'d into visible entries.
- ROOT CAUSE: `ClaimsTab.tsx`'s reverse-graph renderer has `.map()` blocks for lawsuits and matters but was never extended to accidents/incidents when those were added to the graph payload.
- FILES: apps/frontend/src/pages/insurance/ClaimsTab.tsx:214-230
- FIX STEPS:
  1. Add a `.map()` block for `graph.reverse.accidents` between lines 220-224, rendering each as a `<Link>` to `/safety/accidents` (mirroring the existing lawsuits/matters pattern).
  2. Add the same for `graph.reverse.incidents`.
  3. Update the `data-testid`s to include distinct keys per item (`l.id`/`m.id` pattern already used).
- GUARD: `scripts/verify-claims-tab-reverse-graph-rendered.mjs` — parse `ClaimsTab.tsx`, assert every `graph.reverse.<key>` referenced in the empty-state check also appears in a `.map(` call above it.

### audit-spine-a1-a9-emit-coverage-task  [safety]  GATED?no
- STATE: STILL-OPEN, confirmed exactly — `package.json:771` defines `"verify:a8-audit-reports-section": "node scripts/verify-a8-audit-reports-section.mjs"` and the script file exists on disk (`scripts/verify-a8-audit-reports-section.mjs`), but `.github/workflows/ci.yml` has zero hits for `a8`/`A8` (confirmed via grep). By contrast A1 (line ~1221), A2, A3, A4, A5, A6, A7 (lines ~1224-1249), and `verify:audit-emit-coverage` (lines 1251-1252) are all wired as CI steps.
- ROOT CAUSE: A8's CI step was simply never added when the script was authored — a copy-paste/addition gap in `ci.yml`.
- FILES: .github/workflows/ci.yml (insert near line 1249-1251, alongside the other Ax steps), package.json:771
- FIX STEPS:
  1. Add a new step to `.github/workflows/ci.yml` immediately after the `verify:a7-audit-per-entity-tabs` step (before or after `verify:audit-emit-coverage`): a `name: verify:a8-audit-reports-section` step running `npm run verify:a8-audit-reports-section`.
  2. Run it locally first (`npm run verify:a8-audit-reports-section`) to confirm it currently passes before wiring, so CI doesn't go red on merge.
- GUARD: this IS the guard — just needs the `ci.yml` wire-in described above.

### coder-work-order-t2-6-accident-liability-stub  [safety]  GATED?yes — escrow/liability posting path + new table
- STATE: STILL-OPEN, confirmed exactly — `apps/backend/src/safety/safety.routes.ts:544` defines `POST /api/v1/safety/accidents/:id/spawn-liability`; inside the `withCompanyScope` block it only calls `appendCrudAudit` (lines 554-565) then hard-returns `return { accident_id: params.data.id, spawned_liability_id: null };` at line 566. No `safety.accident_liabilities` table exists (confirmed no migration/schema reference), and no escrow-posting call is made anywhere in this handler. (Duplicate of reports-module finding `0441-mod6-spawn-liability-fake-stub` — same file, build once.)
- ROOT CAUSE: the endpoint was scaffolded (route + audit trail) but the actual liability-record creation and escrow-posting logic was never implemented — a UI action that appears to succeed (201/200 response, real audit entry) but produces no real liability.
- FILES: apps/backend/src/safety/safety.routes.ts:544-569
- FIX STEPS:
  1. Owner must approve schema before anything else — this needs a new `safety.accident_liabilities` table (or `accounting.*`-linked liability record) via a gated migration.
  2. Reuse existing escrow/liability posting infra per CLAUDE.md §2 ("Reuse EXISTING posting/GL functions — write NO new GL math") — identify the existing escrow-liability posting function (likely in `driver_finance`/`accounting`) and call it instead of writing new posting math.
  3. Replace the hardcoded `spawned_liability_id: null` with the real inserted/posted ID.
  4. This is financial-cluster (liability/escrow posting) — branch, typecheck, show Jorge the full SQL + diff, wait for explicit "OK to merge" before merging.
- GUARD: `scripts/verify-spawn-liability-not-stub.mjs` — fail if `spawn-liability` route body contains a literal `spawned_liability_id: null` return with no preceding INSERT into a liabilities table.

### flow9-safety-event-auto-notifications  [safety]  GATED?no
- STATE: ALREADY-FIXED — confirmed accurate (this is the correct, current-state finding; `0278-safety-gap3-auto-notifications` above is the stale one). `apps/backend/src/safety/events/safety-events.routes.ts:7` imports `notifySevereSafetyEvent`; `isSevereSafetyEventSeverity` is defined in `apps/backend/src/safety/events/notification.service.ts:18-20` and returns true only for `"high"`/`"critical"`. Called at `safety-events.routes.ts:435-446` inside the POST create handler, passing `subject_driver_name`/`subject_unit_number` resolved from the just-created event row. `notifySevereSafetyEvent` itself (`notification.service.ts:22-79`) fans out to `createNotification` for Owner/Administrator/Manager/Safety roles (in-app, durable DB row) and `sendEmail` (best-effort, see G10-M ticket item 6 for its durability gap).
- ROOT CAUSE: N/A — feature is wired and working as designed; the only real gap is notification durability on the email leg, tracked separately under `0243-g10-m-seven-integrity-reliability-gaps` item 6.
- FILES: apps/backend/src/safety/events/safety-events.routes.ts:7,435-446, apps/backend/src/safety/events/notification.service.ts:18-79
- FIX STEPS: 1. No fix needed for this finding specifically. 2. Cross-reference: close `0278-safety-gap3-auto-notifications` as duplicate/stale. 3. See G10-M ticket for the durable-notification-delivery gap on the email leg.
- GUARD: none new needed here; consider a test asserting `notifySevereSafetyEvent` is NOT called for low/medium severity (negative-path coverage) if not already present.

### insurance-2-breadcrumb-desync  [safety]  GATED?no
- STATE: STILL-OPEN, confirmed exactly — `apps/frontend/src/pages/insurance/PolicyDetail.tsx:184-186` has a plain `<button type="button" className="text-xs text-slate-700 underline" onClick={() => navigate("/safety/insurance/policies")}>Back to policies</button>` instead of the shared `PageHeader` component. Confirmed `PageHeader` exists at both `apps/frontend/src/components/layout/PageHeader.tsx` and `apps/frontend/src/components/forms/shared/PageHeader.tsx`, and is used elsewhere in Safety (e.g., `SafetyHome.tsx`, `EldAuditTrailViewer.tsx`, `DriverSchedulerGridPage.tsx`) but not in `PolicyDetail.tsx`.
- ROOT CAUSE: `PolicyDetail.tsx` was built with a bespoke back-link instead of adopting the shared `PageHeader` breadcrumb pattern used across the rest of the app.
- FILES: apps/frontend/src/pages/insurance/PolicyDetail.tsx:179-194
- FIX STEPS:
  1. Import `PageHeader` from `apps/frontend/src/components/layout/PageHeader.tsx` (or the shared-forms one, matching whichever the surrounding Safety pages use).
  2. Replace the `<header>` block at lines 181-191 with a `<PageHeader>` including breadcrumb + `title={"Policy " + policy.policy_number}` following the CLAUDE.md §7 back-arrow + breadcrumb pattern.
  3. Preserve the Edit/Update button and status/insurer/coverage subtitle line.
- GUARD: `scripts/verify-insurance-pageheader-usage.mjs` (or extend an existing generic PageHeader-adoption guard) — grep insurance pages for a bespoke "Back to" text link not using `PageHeader`.

### linkage-safety-event-no-driver-status-update  [safety]  GATED?yes — mdata.drivers data write
- STATE: STILL-OPEN — same root gap as `0278-safety-gap1-auto-driver-status` above, confirmed via the same code read: no file under `apps/backend/src/safety/events/*` or any `*-safety-events.routes.ts` (`apps/backend/src/mdata/driver-safety-events.routes.ts`, `apps/backend/src/mdata/dispatcher-safety-events.routes.ts`, `apps/backend/src/safety/events/safety-events.routes.ts`) contains an `UPDATE mdata.drivers` statement. This is a duplicate of `0278-safety-gap1-auto-driver-status` — treat as one build item.
- ROOT CAUSE: same as `0278-safety-gap1-auto-driver-status` — no code path links a safety-event/violation write to `mdata.drivers.status`.
- FILES: same as `0278-safety-gap1-auto-driver-status` — apps/backend/src/safety/company-violations.service.ts, apps/backend/src/safety/events/safety-events.routes.ts
- FIX STEPS: identical to `0278-safety-gap1-auto-driver-status` — build once, close both findings together.
- GUARD: same as `0278-safety-gap1-auto-driver-status` — `scripts/verify-safety-event-driver-status-linkage.mjs`.

### s-02-insurance-sidebar-not-standalone  [safety]  GATED?no
- STATE: ALREADY-FIXED (as intentional design, not a bug) — confirmed `apps/frontend/src/components/layout/sidebar-config.ts:114`: `insurance: { id: "insurance", label: "INSURANCE", Icon: Shield, to: "/safety/insurance" }` — routes into the Safety module (`InsuranceTab.tsx`), and `apps/frontend/src/routes/manifest.tsx:4151`: `<Route path="/insurance" element={<Navigate to="/safety/insurance" replace />} />` — a router-level redirect, not a standalone top-level module. This matches the CLAUDE.md §7-documented module structure ("Compliance Docs & Monitoring > Insurance" as a Safety tab).
- ROOT CAUSE: N/A structurally — this is a deliberate nav placement, not a code defect. If Jorge wants Insurance promoted to a standalone top-level sidebar module, that is a product/nav decision, not a bug fix, and would need to respect the LOCKED 28-item sidebar contract (`SIDEBAR_ITEM_IDS` in `sidebar-config.ts`, enforced by `verify-sidebar-contract.mjs`).
- FILES: apps/frontend/src/components/layout/sidebar-config.ts:114, apps/frontend/src/routes/manifest.tsx:4151
- FIX STEPS: 1. No fix unless Jorge explicitly requests promoting Insurance to standalone top-level nav. 2. If requested: this is a §7 product-lock change — get explicit sign-off, then add a new `SIDEBAR_ITEM_IDS` entry and update `verify-sidebar-contract.mjs`'s expected count.
- GUARD: existing `scripts/verify-sidebar-contract.mjs` already protects the current (intentional) structure from silent drift.

### s-10-no-type-filter-incidents  [safety]  GATED?no
- STATE: STILL-OPEN, confirmed exactly — `apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx` is a shared component parameterized by `config.incidentType` (type `SafetyIncidentType`); its list query (`listQuery`, lines 107-111) calls `listSafetyIncidents(operatingCompanyId, config.incidentType)` — hardcoded to one type per mounted page. Confirmed only two callers: `apps/frontend/src/pages/safety/DamageReportsPage.tsx` (`incidentType: "damage_report"`) and `apps/frontend/src/pages/safety/TrailerInterchangesPage.tsx` (`incidentType: "trailer_interchange"`) — each a separate route/page with no combined list or type-filter dropdown across all incident types. Cargo claims have their own separate `SC4 CargoClaimIntakeSurface` (per the file's own header comment, lines 22-24) and are also excluded from any unified view.
- ROOT CAUSE: the surface was designed per-type-per-page from the start (component reused by config, not by a runtime filter); no unified "All Incidents" list exists. NOTE: this may be intentional design — the locked Safety module structure lists Damage Reports/Trailer Interchanges/Cargo Claims as 3 SEPARATE tabs — verify with Jorge whether a unified view is actually wanted before building.
- FILES: apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx, apps/frontend/src/pages/safety/DamageReportsPage.tsx, apps/frontend/src/pages/safety/TrailerInterchangesPage.tsx, apps/frontend/src/api/safety.ts (`listSafetyIncidents`)
- FIX STEPS:
  1. Owner decision: is a unified cross-type incidents list actually wanted, or are the separate per-type pages intentional? Confirm before building.
  2. If a unified view is wanted: add a new page/tab that calls `listSafetyIncidents` without a fixed `incidentType`, with a type-filter dropdown (`damage_report | trailer_interchange | cargo_claim`), reusing the existing table markup from `SafetyIncidentsClusterSurface.tsx:278-323`.
  3. Do not remove the existing per-type pages — additive only per §7.
- GUARD: none needed unless built; if built, `scripts/verify-incidents-unified-list-type-filter.mjs`.

### safety-dot-fields-and-driver-create-fix  [safety]  GATED?yes — already-applied migration touches safety.safety_events schema
- STATE: ALREADY-FIXED (DOT-fields portion) / UNVERIFIABLE (driver-create portion — needs the original defect spec) — confirmed `db/migrations/202607582000_safety_events_dot_fields.sql` (PR #2650, "fix(safety): Log Event DOT-required fields (s-07)") adds `location_text, injury_count, fatality_count, tow_away_required, dot_reportable, police_report_number` to `safety.safety_events`, with non-negative CHECK constraints on the two count columns. These columns are confirmed LIVE-USED in the create-handler's SELECT at `apps/backend/src/safety/events/safety-events.routes.ts:407-412`. The "driver-create fix" half of this finding's id is UNVERIFIABLE — no distinct driver-create bug description was found in `.block-ready/safety-dot-fields-and-driver-create-fix.json` (status: "PARTIAL", generic acceptance text, no concrete defect named) or in tracker cross-references (`docs/trackers/BLOCK-RECONCILIATION-2026-07-19.md:1173` just marks it an unresolved "AUDIT-NOTE"). Cannot confirm what specific driver-create defect this refers to without the original source dispatch text.
- ROOT CAUSE: DOT-fields gap was real and is fixed; the driver-create-fix component's root cause is unknown/unspecified in available docs.
- FILES: db/migrations/202607582000_safety_events_dot_fields.sql (done), apps/backend/src/safety/events/safety-events.routes.ts:407-412 (done)
- FIX STEPS: 1. Close the DOT-fields half as done. 2. For the driver-create-fix half: ask the original audit author/Jorge for the specific defect text before any build work — do not guess at what "driver-create" bug is meant.
- GUARD: none needed for the DOT-fields part (already covered by the migration's own idempotent CHECK constraints); no guard possible for the unspecified half until scoped.

### safety2-cert-expiry-nav-distinct-route  [safety]  GATED?no
- STATE: ALREADY-FIXED (intentional, well-documented, already guarded) — confirmed `apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts:131-147` has an explicit comment block explaining `SAFETY_ALIAS_TABS` exists precisely because "Cert Expiry" (mounts `ExpiryDashboard` at `/safety/cert-expiry`) is a DISTINCT route/element from `/safety/dot-compliance` (`DOTComplianceTab`, which also embeds `ExpiryDashboard` plus reminders/CFR cards) — and explicitly states it's "Intentionally NOT part of the canonical 28 ... do not add it there or the count/coverage guards break." `apps/frontend/src/routes/manifest.tsx:116-117,1479` confirms the distinct mount (`<Route path="cert-expiry" element={<ExpiryDashboard />} />`, comment: "SAFETY-2: Cert Expiry is a distinct route — ExpiryDashboard only (not DOTComplianceTab)"). A dedicated guard already exists and enforces exactly this: `scripts/verify-cert-expiry-tracking.mjs:70-82` checks the nav entry, the target route, and that the route element is `ExpiryDashboard` and not `DOTComplianceTab`.
- ROOT CAUSE: N/A — this is deliberate, documented, and guarded; not a duplicate/redundant nav entry.
- FILES: apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts:131-147, apps/frontend/src/routes/manifest.tsx:116-117,1479, scripts/verify-cert-expiry-tracking.mjs:70-82
- FIX STEPS: 1. No fix needed — close this finding.
- GUARD: already exists — `scripts/verify-cert-expiry-tracking.mjs` (confirm it's wired into `ci.yml`; worth a quick follow-up grep if this becomes a live concern).

### systemic-pattern-r2-verify-bytes-guard  [safety]  GATED?yes — turning the cron ON is a feature-flag flip
- STATE: STILL-OPEN (as described) — confirmed `apps/backend/src/cron/evidence-presence-reconcile.cron.ts` exists, is read-only/non-financial/non-mutating per its own header comment (lines 14-35), and reads `EVIDENCE_PRESENCE_RECONCILE_ENABLED` (default "false") at line 111; line 381 logs "[evidence-presence] disabled — activate this read-only monitor by turning EVIDENCE_PRESENCE_RECONCILE_ENABLED on." when off. It uses the generic `r2-client.ts` `verifyObjectExists`/`getObjectMetadata` functions. This monitor, if enabled, would have caught the damage-photo fake-persist bug from finding `0007-pattern-9-fake-persist-evidence-loss` above (an `r2_object_key` in `documents.damage_photo_evidence` with no matching R2 object) — it is currently dark.
- ROOT CAUSE: a working read-only evidence-integrity monitor exists but is default-OFF and nothing has re-reviewed/enabled it.
- FILES: apps/backend/src/cron/evidence-presence-reconcile.cron.ts:14-35,109-111,381
- FIX STEPS:
  1. Read-only + non-financial per its own comment, but flipping a feature flag is explicitly gated under this repo's rules — get Jorge's explicit OK before flipping `EVIDENCE_PRESENCE_RECONCILE_ENABLED` to true in any environment.
  2. Once approved, set the env var in Render for the backend service and confirm the cron actually fires (check logs for a run, not just deploy success).
  3. Fix the damage-photo fake-persist bug (`0007-pattern-9-fake-persist-evidence-loss`) FIRST — otherwise turning this monitor on will immediately start flagging every existing damage-photo evidence row as missing-in-R2, which is real but should be understood as "the known bug," not a surprise incident.
- GUARD: the cron itself IS the guard once enabled; add `scripts/verify-evidence-presence-reconcile-cron-scheduled.mjs` to confirm it's actually registered in the cron scheduler (not just importable) if not already covered.

# MODULE: settlements (6 findings)

### 0007-pattern-2-column-drift-500s  [settlements]  GATED?no — pure CI-guard-add, no schema/data/posting-logic change
- STATE: STILL-OPEN (confirmed via read: `scripts/verify-driver-operations-depth.mjs` is a pure wiring/structural guard — file-existence, route-registration, nav-listing checks only, zero SQL/schema assertions. The generic column guard `scripts/verify-sql-column-existence.mjs` TARGET_TABLES set, lines 42-58, contains only `driver_finance.settlement_lines` and `driver_finance.driver_settlements` — covering 2 of the ~11 distinct tables the 12 driver-Operations sub-views actually query. Confirmed unguarded tables in live code: `fuel.fuel_transactions` (`apps/backend/src/master-data/drivers/operations-depth/fuel-history.service.ts:36,55`), `driver_finance.driver_advances` (`debt-history.service.ts:33,51`), `driver_finance.escrow_ledger` (`escrow-history.service.ts:34,51`), `safety.medical_cards`/`mdata.drivers` (`permit-history.service.ts:54,70,86`), `safety.accident_reports` (`accident-history.service.ts:37,57`), `telematics.vehicle_driver_assignments` (`maintenance-assignments.service.ts:33,51`), `safety.harsh_events` (`safety-events.service.ts:34,52`), `mdata.driver_profile_messages` (`communications-log.service.ts:35,53`), `dispatch.auto_status_suggestion_responses` (`pwa-engagement.service.ts:35,54`), `docs.file_links` (`documents-vault.service.ts:34,55`).)
- ROOT CAUSE: `TARGET_TABLES` in `scripts/verify-sql-column-existence.mjs` was never extended to cover the 10 non-financial tables the driver-Operations sub-views were built against, so a column rename on any of them 500s at runtime with no CI signal.
- FILES: scripts/verify-sql-column-existence.mjs (TARGET_TABLES, lines ~42-58); docs/schema-parity-baseline.json (must contain the added tables' columns — regenerated by scripts/verify-schema-parity.mjs); optionally scripts/verify-driver-operations-depth.mjs (SUB_VIEWS list, line 8-19).
- FIX STEPS:
  1. Add `"fuel.fuel_transactions"`, `"driver_finance.driver_advances"`, `"driver_finance.escrow_ledger"`, `"safety.medical_cards"`, `"safety.accident_reports"`, `"telematics.vehicle_driver_assignments"`, `"safety.harsh_events"`, `"mdata.driver_profile_messages"`, `"dispatch.auto_status_suggestion_responses"`, `"docs.file_links"` to `TARGET_TABLES` in `scripts/verify-sql-column-existence.mjs`.
  2. Confirm/regenerate `docs/schema-parity-baseline.json` includes these tables' real columns (`npm run verify:schema-parity` generator path) so the new checks have ground truth.
  3. Run `node scripts/verify-sql-column-existence.mjs` locally; triage any newly-surfaced hits into `scripts/verify-sql-column-existence.allowlist.json` only after manual review (don't blanket-allowlist).
  4. Extend `scripts/verify-driver-operations-depth.mjs` with a new check asserting every `SUB_VIEWS` entry's primary table (map slug->table) is present in the column-existence guard's `TARGET_TABLES`, so a future 13th view can't ship unguarded either.
- GUARD: `scripts/verify-sql-column-existence.mjs` exists and needs its scope widened (step 1 above); also confirm CI wiring — the file has no npm-script entry in `package.json` and no direct `.github/workflows/ci.yml` reference; it's only reachable via `scripts/verify-static.mjs`'s glob of `scripts/verify-*.mjs` (local pre-push) and a `scripts/verify-steps/142-verify-sql-column-existence.mjs` wrapper whose inclusion in the actual CI required-checks wave is UNVERIFIABLE from static reading alone — needs a live CI run or the wave-inventory script to confirm it isn't one of the "unwired dark guards" referenced in recent repo commits.

### 0008-b-canonical-deduction-store  [settlements]  GATED?yes — driver settlement financial posting/ledger data
- STATE: STILL-OPEN (confirmed: `apps/backend/src/settlements/auto-deductions/apply.ts:64-65` — `INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount, auto_deduction_policy_id) VALUES ($1::uuid, 'auto_deduction', $2, $3, $4::uuid)` — still writes the 2nd store. Confirmed the canonical GL poster excludes it: `apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts:20-23` states in-code "Deductions are sourced ONLY from driver_finance.driver_settlement_deductions ... so the net is gross(bills) - Sum(deductions) BY CONSTRUCTION," and its only `settlement_lines` read (line 272) is for bill-linkage (`source_driver_bill_id`), not deduction amounts. `settlement-posting.service.ts:128,446,568` and `recover-from-driver.service.ts:105` likewise read/write only `driver_finance.driver_settlement_deductions`.)
- ROOT CAUSE: `applyAutoDeductionsToSettlement` (apply.ts:15) writes the policy-driven deduction as a `driver_finance.settlement_lines` row (line 64) and separately decrements `driver_finance.driver_settlements.net_pay` directly (lines 90-99), but never inserts a corresponding `driver_finance.driver_settlement_deductions` row — so the amount is invisible to the canonical GL poster, meaning the settlement's displayed/stored net_pay and the amount actually postable to GL can diverge for any settlement with an active auto-deduction policy.
- FILES: apps/backend/src/settlements/auto-deductions/apply.ts (lines 60-99); reference pattern in apps/backend/src/driver-finance/deductions.service.ts:112-168 (the canonical `driver_settlement_deductions` writer) and apps/backend/src/driver-finance/escrow-deduction-pending.service.ts:390.
- FIX STEPS:
  1. In `apply.ts`, replace the `INSERT INTO driver_finance.settlement_lines` (lines 62-68) with an `INSERT INTO driver_finance.driver_settlement_deductions` row shaped like `deductions.service.ts:125-142`'s canonical insert, carrying `policy_id`/`auto_deduction_policy_id`, `settlement_id`, `driver_id`, `amount_cents`, and a deduction-type/category consistent with the other writers.
  2. Keep (or replace with an equivalent read) the `driver_finance.auto_deduction_policies` cap/increment logic (lines 70-82) unchanged — that bookkeeping is correct.
  3. Decide whether `driver_finance.driver_settlements.net_pay` should still be updated directly here (lines 88-99) or whether that should now flow from the canonical settlement-close/posting math (`settlement-deduction-cap.service.ts` / `settlement-payrun-close.service.ts`) to avoid a second net-pay writer — do NOT ship both paths independently mutating `net_pay`.
  4. Update/add a unit test in `apps/backend/src/settlements/auto-deductions/auto-deductions.test.ts` asserting the row lands in `driver_finance.driver_settlement_deductions`, not `settlement_lines`.
  5. Verify no other live (non-`.deprecated`, non-test) caller still expects an `auto_deduction`-typed `settlement_lines` row (grep confirmed only `apply.ts` writes it for this purpose) before removing the old write path.
- GUARD: new `scripts/verify-auto-deduction-canonical-store.mjs` that fails if `settlements/auto-deductions/apply.ts` (or any live file) contains `INSERT INTO driver_finance.settlement_lines` with `line_type` `'auto_deduction'` — mirroring the existing `verify-no-payroll-settlement-writes.mjs` (G4) pattern that already guards the retired payroll ledger.

### 0091-c1-1-two-settlement-engines_DISPATCH  [settlements]  GATED?yes — accounting.* settlement-posting financial engine
- STATE: ALREADY-CONFIRMED-LIVE (not a bug — the adversarial pass's refutation is correct, verified independently) — Mount chain, exact: `apps/backend/src/index.ts:1034` -> `await registerAccountingRoutes(app)` -> `apps/backend/src/accounting/index.ts:11-19` -> `await app.register(autoload, { dir: __dirname, matchFilter: /\.routes\.(ts|js)$/, ... })` (no `dirNameRoutePrefix` override) -> `settlement-posting/settlement-posting.routes.ts:134-136` exports `fp(async (app) => { await registerSettlementPostingRoutes(app); }, ...)`. Because the file is wrapped in `fastify-plugin` (`fp`), Fastify's own `override()` short-circuits and returns the parent instance unchanged — `buildRoutePrefix` is never called, so the autoload subdirectory prefix is bypassed and the four routes register at their literal absolute paths (`/api/v1/accounting/settlement-posting/post|reverse|recover-from-driver|driver-buckets`). This is the established repo-wide pattern (verified identically in `accounting/bank-recon/recon-worklist.routes.ts` and `accounting/escrow/escrow.routes.ts`), so the engine is genuinely live at boot, not dead code.
- ROOT CAUSE (residual concern, not a defect in the mounting itself): the real open question is architectural duplication risk between this live `accounting/settlement-posting/*` engine and the write side, which the 07-15 "settlement engine collapse" already addressed for the payroll engine (see `0091-e1-4`) but did not formally reconcile against this accounting-namespace engine's read/GL role.
- FILES: apps/backend/src/accounting/settlement-posting/settlement-posting.routes.ts; apps/backend/src/accounting/index.ts; apps/backend/src/index.ts:1034.
- FIX STEPS:
  1. No mounting fix needed — close this finding as confirmed-live, not a bug.
  2. Grep confirmed zero callers of `/api/v1/accounting/settlement-posting/{post,reverse,recover-from-driver,driver-buckets}` anywhere in apps/frontend/src, scripts/, or backend tests except the route file itself — determine (ask the owning team / check docs/specs/) whether this engine is meant to be invoked by a cron/worker not yet wired, or is genuinely unused-but-correct scaffolding; if unused, either wire a caller or document why it's dormant so a future audit doesn't re-flag it as "dead."
  3. Add an explicit architecture note (docs/specs or a code comment) distinguishing this engine's role from `driver-finance/settlement-payment.service.ts` / `settlement-payrun-close.service.ts` so "two settlement engines" reads as intentional layering (posting vs. payment-state) rather than duplication.
- GUARD: none needed for mounting correctness (Fastify/fastify-plugin behavior is a framework invariant); if step 2 concludes the endpoints should be called from somewhere, add a smoke-test entry to `scripts/verify-accounting-autoload-coverage.mjs`'s expected-endpoint list once a real caller exists.

### 0091-e1-4  [settlements]  GATED?yes — driver settlement financial read data (retired ledger drift)
- STATE: STILL-OPEN, exact files confirmed: `apps/backend/src/payroll/aggregated.routes.ts:14-18` (`if (await relationExists(client, "payroll.driver_settlements")) { ... FROM payroll.driver_settlements ... }`) reads the RETIRED payroll ledger FIRST, falling back to `driver_finance.driver_settlements` only at line 26 (`else if`) — mounted live at `GET /api/v1/payroll/aggregated` (`apps/backend/src/index.ts:1055`, imported line 471). Worse, `apps/backend/src/mdata/driver-aggregate.service.ts:369,377,387` (the driver-profile "Operations" YTD/lifetime/last-4-weeks stats CTE, used by `apps/backend/src/mdata/drivers.routes.ts` and `driver-pdf-export.routes.ts`) queries `FROM payroll.driver_settlements` with no fallback at all to the canonical `driver_finance.driver_settlements`.
- ROOT CAUSE: the write side was correctly collapsed to `driver_finance.*` (payroll write routes now 308-redirect — `apps/backend/src/payroll/driver-settlement.routes.ts:1-33`, per the 2026-07-15 "settlement engine collapse Step 2" header in `apps/backend/src/payroll/driver-settlement.service.deprecated.ts:1-16`), but no corresponding read-side migration/repoint happened: `payroll.driver_settlements` stops receiving new rows going forward, so `GET /api/v1/payroll/aggregated` and the driver profile Operations tab's settlement stats silently freeze/go stale for any settlement created after the write-side cutover, while `driver_finance.driver_settlements` (where new settlements actually land) is either ignored (driver-aggregate.service.ts) or only used as a last-resort fallback that never triggers while the old table still exists (aggregated.routes.ts).
- FILES: apps/backend/src/payroll/aggregated.routes.ts (lines 8-38); apps/backend/src/mdata/driver-aggregate.service.ts (lines 358-400).
- FIX STEPS:
  1. In `mdata/driver-aggregate.service.ts`, repoint the ytd/lifetime/weeks CTEs (lines 358-400) from `payroll.driver_settlements` to `driver_finance.driver_settlements`, mapping `pay_period_end`->`period_end` (or whatever the canonical column is — verify exact column names against `driver_finance.driver_settlements` schema before writing SQL, per repo landmine history), and `status <> 'void'` to the canonical status/void semantics.
  2. In `payroll/aggregated.routes.ts`, invert the precedence in `fetchAggregatedPayroll` (lines 14-38): query `driver_finance.driver_settlements` first (or drop the `payroll.driver_settlements` branch entirely if that table is fully retired), keeping the `relationExists` fresh-DB-safety check.
  3. Confirm whether `payroll.driver_settlements` still holds pre-cutover historical rows that need to be preserved in read paths (a UNION of both, deduped by settlement id/period) versus a clean cutover — this determines whether step 1/2 need a UNION or a straight repoint; do not silently drop historical data from the driver's lifetime/YTD figures.
  4. Add a regression test alongside `apps/backend/src/payroll/__tests__/aggregated.test.ts` asserting the canonical table is queried when both relations exist (currently the test only exercises the `payroll.driver_settlements`-present branch per line 25).
- GUARD: extend `scripts/verify-no-payroll-settlement-writes.mjs` (G4)'s sibling-read guard, or add `scripts/verify-no-payroll-settlement-reads.mjs` that fails if any live (non-`.deprecated`, non-test) file queries `FROM payroll.driver_settlements` without it being explicitly allowlisted as a documented historical-fallback read.

### 0091-g1-3  [settlements]  GATED?yes — driver settlement approval/financial data cross-entity scoping
- STATE: STILL-OPEN, confirmed and worse than described: `apps/backend/src/settlements/approval.routes.ts:13` imports `withCurrentUser` (exact line match to the finding); the file registers 9 handlers (not 8 — one more than the prior audit counted), lines 62, 83, 105, 131, 158, 180, 202, 239, 261. Confirmed zero hits for `assertCompanyMembership`/`withCompanyScope` anywhere in the file. Of the 9 handlers, 6 (`approval-summary`:62, `approve-line`:105, `reject-line`:131, `approve`:158, `finalize`:180, `trip-link-queue/assign`:239) take `operating_company_id` as a raw, unvalidated string straight from `req.query`/body and pass it directly into `approvalService.*`/SQL with no membership check at all. The other 3 (`line-items`:83, `trip-link-queue`:202, `generate-pdf`:261) DO call `resolveOperatingCompanyId(client, user.uuid, ...)` (`apps/backend/src/auth/operating-company-scope.ts:102-130`), which is a real, differently-named membership check (throws `OperatingCompanyMembershipError` -> 403) — so those 3 are actually scoped, just not via the specific function names the earlier grep targeted. Worst case: `POST /api/v1/settlements/trip-link-queue/assign` (line 239) never receives/uses `operating_company_id` at all — `tripLinkEngine.assignTripLink` (`apps/backend/src/settlements/trip-link.engine.ts:247-263`) does `UPDATE driver_finance.trip_link_queue ... WHERE id = $3` with zero company predicate anywhere in the call chain — any authenticated Owner/Administrator/Manager/Accountant/Payroll user at any company can assign any other company's trip-link-queue row by id. Confirmed `settlements/approval.routes.ts` is not in `REQUIRED_MEMBERSHIP_ASSERT_FILES` in `scripts/verify-company-membership-assert.mjs`, whose own doc comment (lines 46-56) explicitly documents "~94 route files that inline set_config... from a request-supplied opco... Deferred from this sweep" as the exact bucket this file falls into.
- ROOT CAUSE: `settlements/approval.routes.ts` was built against a local `authUser()` role check (line 49-57) only, never wired to the canonical `assertCompanyMembership`/`resolveOperatingCompanyId` tenant boundary for 6 of 9 handlers, and `assignTripLink` was built without any company predicate at all.
- FILES: apps/backend/src/settlements/approval.routes.ts (handlers at lines 62, 105, 131, 158, 180, 239); apps/backend/src/settlements/trip-link.engine.ts (lines 247-263); apps/backend/src/auth/operating-company-scope.ts (reuse `resolveOperatingCompanyId`, lines 102-130).
- FIX STEPS:
  1. In each of the 6 unscoped handlers, replace the raw `String(query.operating_company_id || "")` read with `await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId)` (the pattern already used at lines 95, 213, 277) inside the `withCurrentUser` callback, and pass the resolved id (not the raw request value) into `approvalService.*` calls.
  2. Add an `operating_company_id` query/body param to `POST /api/v1/settlements/trip-link-queue/assign` (line 239), resolve it via `resolveOperatingCompanyId`, and change `assignTripLink` (`trip-link.engine.ts:247-263`) to accept and add `AND operating_company_id = $4` to the `UPDATE driver_finance.trip_link_queue` WHERE clause (line 261).
  3. Also scope the SELECT/lookup that resolves `queue_id`->`load_id`/`load_number` (if any precedes this call) by the same resolved company id — verify no other unscoped read leaks a cross-entity queue id into the response.
  4. Add `apps/backend/src/settlements/approval.routes.ts` to `REQUIRED_MEMBERSHIP_ASSERT_FILES` in `scripts/verify-company-membership-assert.mjs` once fixed, so a regression is caught.
  5. Add/extend a test in `apps/backend/src/settlements/__tests__/approval-service-canonical.db.test.ts` asserting a user from Company B gets 403 (not data) when passing Company A's `operating_company_id`/queue id to each of the 9 endpoints.
- GUARD: `scripts/verify-company-membership-assert.mjs` — add this file to `REQUIRED_MEMBERSHIP_ASSERT_FILES` (step 4); this is the exact existing guard mechanism for this class of bug, just never extended to this file.

### 0091-g9-h1  [settlements]  GATED?yes — driver settlement payment-state posting/ledger integrity
- STATE: STILL-OPEN, confirmed precisely. `loadSettlement()` (`apps/backend/src/driver-finance/settlement-payment.service.ts:38-54`) issues `SELECT id, operating_company_id, driver_id, status, payment_state, payment_method, payment_bank_reference FROM driver_finance.driver_settlements WHERE id = $1 AND operating_company_id = $2 LIMIT 1` (SELECT statement at line 45, matching the finding exactly) with no `FOR UPDATE` — confirmed via full-file grep, zero `FOR UPDATE` occurrences anywhere in this file. All 5 UPDATE statements are unguarded by any prior read-lock or compare-and-swap predicate: `queuePayment`'s `UPDATE ... SET payment_state='queued' ... WHERE id=$1 AND operating_company_id=$2` (line 147); `markSentToBank`'s (line 189); `markCleared`'s (line 232); `markBounced`'s (line 281); `markPaidManually`'s (line 344) — every one of the 5 filters only by `id`/`operating_company_id`, never by the `payment_state` value that was read moments earlier in `loadSettlement`. The only concurrency guard is an in-process `validateTransition()` check (lines 113-123) run against the state read by the unlocked SELECT — classic TOCTOU: two concurrent requests (e.g. `markSentToBank` and `markBounced`) can both read the same pre-transition state, both pass `validateTransition`, and both UPDATEs succeed sequentially, each appending a payment event and (for `markCleared`) enqueuing a QBO sync job. Confirmed no DB-level backstop either: `db/migrations/0088_p5_t5_settlement_payment_state.sql` only has a value-domain `CHECK (payment_state IN (...))` (lines 11, 27) — no transition-state trigger, no partial unique index, no advisory lock.
- ROOT CAUSE: `loadSettlement` performs a plain (non-locking) SELECT and every subsequent UPDATE in this file re-filters only by `id`/`operating_company_id`, omitting the previously-read `payment_state` (or any row version/timestamp) from the UPDATE's WHERE clause — so there is no atomic check-then-act guarantee across the 5 payment-state transition functions.
- FILES: apps/backend/src/driver-finance/settlement-payment.service.ts (lines 38-54 loadSettlement; UPDATE sites at 147, 189, 232, 281, 344).
- FIX STEPS:
  1. Add `FOR UPDATE` to the SELECT in `loadSettlement` (line 45-49) so concurrent callers serialize on the row inside the same transaction (`withCurrentUser` already wraps each call — confirm it runs in a real transaction, not autocommit, before relying on row locking alone).
  2. Independently (defense-in-depth, works even outside a lock), add `AND payment_state = $N` (the exact state read, e.g. 'unpaid'/'queued'/'sent_to_bank'/'bounced') to each of the 5 `UPDATE ... WHERE id = $1 AND operating_company_id = $2` clauses (lines 151-152, 194-195, 236-237, 285-286, 349-350), and check `updateRes.rows[0]` is present — if the row-count is 0 despite the settlement existing, throw a specific `settlement_payment_state_changed` error instead of the current generic `*_failed` error, so a lost race surfaces distinctly from "not found."
  3. Re-run/extend the existing test suite for this file (search found none currently under a `driver-finance/__tests__` name specific to `settlement-payment.service`; check `apps/backend/src/driver-finance/__tests__/` for coverage) adding a concurrency test that fires two conflicting transition calls and asserts exactly one succeeds.
  4. Apply the same `FOR UPDATE` + CAS-predicate pattern to any other `driver_finance.driver_settlements` state-mutating function found to share this SELECT-then-blind-UPDATE shape (e.g. `settlement-payrun-close.service.ts`, `settlement-deduction-cap.service.ts`) — scope that as a follow-up audit, not assumed fixed here.
- GUARD: add a new static guard, e.g. `scripts/verify-settlement-payment-state-cas.mjs`, asserting every `UPDATE driver_finance.driver_settlements SET payment_state = ` statement in `settlement-payment.service.ts` has a `payment_state = ` (or `FOR UPDATE` on the preceding read in the same function) predicate in its WHERE clause — same static-pattern style as `scripts/verify-settlement-reversal-atomicity.mjs` and `scripts/verify-no-silent-noop-posting.mjs`, which already exist for adjacent settlement-posting atomicity concerns.

# Build tickets — bb_8 (settlements + users-docs-help)

Verified against `origin/main` (`db89f4734`, fetched live this session — local `main` was one commit behind, so all reads used `git show origin/main:<path>` / `git grep origin/main`). Read-only: no code edited, no prod DB touched.

---

### 0242-no-auto-escrow-deduction-driver-fault-can  [settlements]  GATED: yes (driver_finance deduction/escrow write + likely new migration)
- STATE: STILL-OPEN
- ROOT CAUSE: `dispatch/cancel-load.routes.ts` has zero references to `deduction` or `escrow` — cancelling a load for driver-fault reason codes never creates a settlement deduction or escrow contribution. Confirmed by grep: 0 hits in that file for `deduction|escrow`. Duplicate of `biz-flow-3-no-auto-escrow-deduction-driver-fau`, `biz-flow-3-no-cancellation-deduction-linkage`, `flow3-cancellation-auto-escrow-deduction` (same root cause, one fix closes all four).
- FILES: `apps/backend/src/dispatch/cancel-load.routes.ts`; `apps/backend/src/driver-finance/deductions.service.ts` (`createSettlementDeduction`); `apps/backend/src/driver-finance/escrow-deduction-pending.service.ts` (`emitAutoProposedEscrowEvents`, currently only called from `dispatch/loads.routes.ts` and `mdata/loads.routes.ts` for abandonment/walkoff).
- FIX STEPS:
  1. In the cancel-load handler, after the cancellation reason code is persisted, branch on driver-fault reason codes (reuse the same reason-code taxonomy as `mdata.loads.customer_chargeback_driver_fault`).
  2. For driver-fault cancellations, call `emitAutoProposedEscrowEvents` (mirroring the abandonment/walkoff call sites) so a pending escrow/deduction proposal is created instead of a silent no-op.
  3. Add a `dispatch.load_cancellations.deduction_id` FK once created (see `fk-cancellation-deductions-0289` below — same migration can cover both).
  4. Add an audit event (`appendCrudAudit`) on the new deduction/escrow proposal, scoped to `operating_company_id`.
- GUARD: new `scripts/verify-cancellation-triggers-escrow-deduction.mjs` — asserts `cancel-load.routes.ts` imports and calls `emitAutoProposedEscrowEvents` (or its successor) for driver-fault reason codes; fail if the import is absent.

---

### 0243-c1-1-orphaned-payroll-settlement-engine  [settlements]  GATED: yes (mdata/driver_finance financial read path)
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts` still actively queries the retired `payroll.driver_settlements` / `payroll.driver_settlement_line_items` tables. Confirmed live: lines 61 (`has_table_privilege(..., 'payroll.driver_settlements', ...)`), 115 (`FROM payroll.driver_settlements s`), 189 (`FROM payroll.driver_settlement_line_items`).
- FILES: `apps/backend/src/driver-finance/settlement-pdf-renderer.service.ts`.
- FIX STEPS:
  1. Repoint the PDF renderer's data source from `payroll.driver_settlements`/`payroll.driver_settlement_line_items` to `driver_finance.driver_settlements` / `driver_finance.settlement_lines` (the canonical engine already used by `settlement-posting.service.ts` and `approval.routes.ts`).
  2. Remove the `has_table_privilege('payroll.driver_settlements', ...)` capability probe entirely — it exists only to support the deprecated fallback.
  3. Re-run/update the PDF golden-output tests against the new source tables.
- GUARD: extend `scripts/verify-no-orphan-routes.mjs` (or a new `scripts/verify-no-payroll-schema-reads.mjs`) to grep backend `src/**/*.ts` (excluding `payroll/*` and tests) for `payroll.driver_settlement` and fail if any non-deprecated file matches.

---

### 0243-e1-4-driver-settlements-four-schemas  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: Same defect as `0243-c1-1` — `payroll.driver_settlements`/`payroll.driver_settlement_line_items` is still actively read by `settlement-pdf-renderer.service.ts` (and by `mdata/driver-aggregate.service.ts`, see `0441-mod5-settlements-card-deprecated-table`), so the "four schemas" fragmentation (payroll.*, driver_finance.*, plus the deprecated `payroll/driver-settlement.service.deprecated.ts` writer) has not been collapsed to one.
- FILES: same as `0243-c1-1` plus `apps/backend/src/mdata/driver-aggregate.service.ts` (lines 369/377/387).
- FIX STEPS: same as `0243-c1-1` + `0441-mod5-settlements-card-deprecated-table` (single consolidated PR; both files repoint to `driver_finance.*`).
- GUARD: same guard as `0243-c1-1` covers this.

---

### 0243-g1-3-settlement-cash-advance-approvals-no  [settlements]  GATED: yes (cross-entity IDOR on financial approval endpoints)
- STATE: STILL-OPEN
- ROOT CAUSE: In `apps/backend/src/settlements/approval.routes.ts`, the `approve-line`, `reject-line`, `approve`, `finalize`, and `approval-summary` handlers read `operatingCompanyId = String(query.operating_company_id || "")` directly and pass it straight into `approvalService.*` with **no membership check**. Contrast the same file's `line-items`, `trip-link-queue`, and `generate-pdf` handlers, which correctly call `resolveOperatingCompanyId(client, user.uuid, requestedCompanyId)` — the helper that 403s (`OperatingCompanyMembershipError`) on a company the caller doesn't belong to. `assertCompanyMembership` (the sibling helper used elsewhere, e.g. `accounting/collections.routes.ts`) is never imported into this file either. A user with an approver role could pass another entity's `operating_company_id` and approve/reject/finalize that entity's settlement lines.
- FILES: `apps/backend/src/settlements/approval.routes.ts` (lines ~68, ~115, ~141, ~168, ~190).
- FIX STEPS:
  1. In `approval-summary` (GET, ~line 66), `approve-line` (POST, ~115), `reject-line` (POST, ~141), `approve` (POST, ~168), `finalize` (POST, ~190): replace the raw `String(query.operating_company_id || "")` read with `await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId)` inside the `withCurrentUser` callback, exactly as `line-items`/`generate-pdf` already do.
  2. 400/403 consistently on missing/foreign company id (the helper already throws `OperatingCompanyMembershipError`, statusCode 403).
  3. Add a regression test asserting a user from Company B gets 403 on `POST /api/v1/settlements/approve` with Company A's `settlement_id`+`operating_company_id`.
- GUARD: new `scripts/verify-settlement-approval-membership-check.mjs` — statically asserts every mutating handler in `approval.routes.ts` calls `resolveOperatingCompanyId` (or `assertCompanyMembership`) before calling into `approvalService`.

---

### 0243-g11-2-two-deduction-subledgers-dont-recon  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: The real duplication is the dead, policy-based `applyAutoDeductionsToSettlement` (`settlements/auto-deductions/apply.ts`) vs the live `driver_finance.driver_settlement_deductions` subledger (written by `deductions.service.ts::createSettlementDeduction`, applied by `settlement-deduction-cap.service.ts::applyPendingDeductionsToSettlementWithNetFloor`). Confirmed: repo-wide grep for `applyAutoDeductionsToSettlement(` matches only its own definition — zero real callers outside its unit test.
- FILES: `apps/backend/src/settlements/auto-deductions/apply.ts`; `apps/backend/src/driver-finance/deductions.service.ts`; `apps/backend/src/driver-finance/settlement-deduction-cap.service.ts`.
- FIX STEPS:
  1. Decide (design doc, not solo-built) whether `auto-deductions/apply.ts`'s policy engine is retired (ARCHIVE per §7, never delete) or migrated to write through `createSettlementDeduction` so it feeds the one live subledger.
  2. If retiring: mark the module `.deprecated.ts`, remove it from any UI-reachable path, and update `AutoDeductionPoliciesPanel` (`apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx`) to call the live deduction-creation path instead.
  3. If migrating: have the policy engine call `createSettlementDeduction` per matched policy at settlement-open time, so `settlement-deduction-cap.service.ts` picks it up automatically — no second apply path.
- GUARD: reuses/extends the guard proposed under `0441-mod10-deductions-never-reduce-settlement` below.

---

### 0243-g9-h1-settlement-double-pay-race  [settlements]  GATED: yes (money-movement race condition)
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/driver-finance/settlement-payment.service.ts` — every state-transition function (`queuePayment`, `markSentToBank`, `markCleared`, `markBounced`, `markPaidManually`) reads `currentState` via `loadSettlement`, calls `validateTransition(currentState, next)`, then issues `UPDATE driver_finance.driver_settlements ... WHERE id = $1 AND operating_company_id = $2` with **no `AND payment_state = $currentState` guard** and no `SELECT ... FOR UPDATE` row lock. Two concurrent calls (double-click, retry) can both pass the read-time `validateTransition` check before either commits, then both UPDATE succeed — a compare-and-swap gap on money-movement state. Confirmed at `queuePayment` (line ~125-153) and identically in `markSentToBank`/`markCleared`/`markBounced` (lines ~177-297).
- FILES: `apps/backend/src/driver-finance/settlement-payment.service.ts`.
- FIX STEPS:
  1. Add `AND payment_state = $N` (the pre-read `currentState`) to every mutating `UPDATE driver_finance.driver_settlements` in this file, checking `updateRes.rowCount === 0` as a genuine CAS failure (throw `invalid_payment_state_transition`), not just `!updated`.
  2. Alternative/complementary: wrap `loadSettlement` + validate + update in one transaction with `SELECT ... FOR UPDATE` on the settlement row.
  3. Add a concurrency test firing two `queuePayment` calls in parallel and asserting exactly one succeeds.
- GUARD: new `scripts/verify-settlement-payment-cas-guard.mjs` — greps `settlement-payment.service.ts` UPDATE statements and fails if any lacks `payment_state = ` in its WHERE clause.
- NOTE: this same gap is why `docs/trackers/backlog-verify/_SUMMARY.json` explicitly links this finding to `0441-mod10-payment-status-panel-404` ("land the CAS fix before exposing these money endpoints") — fix this ticket first.

---

### 0280-19-attention-items-driver-settlement-link  [settlements]  GATED: no
- STATE: UNVERIFIABLE — likely not a defect
- ROOT CAUSE: `dm-home.service.ts` (`apps/backend/src/driver-manager/role-views/dm-home.service.ts:402`) links the "N settlements pending validation" attention item to the generic `/driver-finance/settlements` list. This is an aggregate COUNT item (N settlements, no single id to deep-link to) and the sibling `pending_layovers` item (line 388) uses the same generic-link pattern (`/drivers`, no filter param). The evidence provided contains no stated defect — it just recites the fact.
- FILES: `apps/backend/src/driver-manager/role-views/dm-home.service.ts`.
- FIX STEPS (only if Jorge confirms a real gap): 1. Add a status query param (e.g. `?status=draft,submitted`) to the `action_url` and 2. have the settlements list page honor it as a pre-filter.
- GUARD: none needed unless the above fix is built (then add a route-param round-trip test).

---

### 0285-df-gap1-no-escrow-for-cash-advances  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: Zero `escrow` references in `apps/backend/src/cash-advances/cash-advance-disburse.ts` or `cash-advance-create.ts` — confirmed by grep. Cash advances bypass the escrow-resolver/contribution path entirely (unlike the regular settlement pay-run, which contributes to the driver's escrow liability via `escrow-resolver.service.ts` up to the $2,000 cap).
- FILES: `apps/backend/src/cash-advances/cash-advance-disburse.ts`, `apps/backend/src/cash-advances/cash-advance-create.ts`, `apps/backend/src/driver-finance/escrow-resolver.service.ts`.
- FIX STEPS:
  1. Design decision needed (CPA/owner): should a cash advance disbursement also trigger/accelerate an escrow contribution, or is cash-advance intentionally escrow-exempt? Do not build solo — this is GL-adjacent.
  2. If yes: call the existing escrow-resolver contribution math from `cash-advance-disburse.ts` at disbursement time, reusing `ESCROW_CAP_CENTS` and the driver-keyed bridge (`accounting.escrow_accounts`) — never build a parallel resolver.
- GUARD: new `scripts/verify-cash-advance-escrow-policy.mjs` once the design decision lands, asserting the chosen behavior is implemented.

---

### 0285-df-gap2-dual-deduction-systems  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: Same as `0243-g11-2` — `settlements/auto-deductions/apply.ts` (policy-based) is dead code, only invoked from its own unit test, running parallel to the live `driver_finance.driver_settlement_deductions` subledger.
- FILES: same as `0243-g11-2`.
- FIX STEPS: same as `0243-g11-2`.
- GUARD: same as `0243-g11-2`.

---

### 0441-mod10-autodeductionpolicies-fully-dead  [settlements]  GATED: yes
- STATE: STILL-OPEN (partially fixed — UI half only)
- ROOT CAUSE: `AutoDeductionPoliciesPanel` IS now mounted (`apps/frontend/src/pages/drivers/DriversPage.tsx:87`, imported line 9) — confirmed live, so the panel is no longer literally invisible. But its backend counterpart, `applyAutoDeductionsToSettlement()` (`apps/backend/src/settlements/auto-deductions/apply.ts`), still has zero real callers — confirmed by repo-wide grep. The panel can create/edit policies that are never applied to any real settlement.
- FILES: `apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx`; `apps/backend/src/settlements/auto-deductions/apply.ts`; the settlement-close pipeline (`apps/backend/src/driver-finance/settlements-load-bookended.service.ts`).
- FIX STEPS: same consolidation as `0243-g11-2` — wire `applyAutoDeductionsToSettlement` (or its replacement) into `settlements-load-bookended.service.ts`'s close pipeline, or repoint the UI panel to write through `createSettlementDeduction` directly.
- GUARD: new `scripts/verify-auto-deduction-policies-wired.mjs` — asserts `settlements-load-bookended.service.ts` (or the successor close pipeline) imports and calls the auto-deduction applier.

---

### 0441-mod10-cashflow-driverpay-hardcoded-empty  [settlements]  GATED: no (frontend/cash-flow forecast display, no schema/GL/mdata touch)
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/cash-flow/cash-flow.service.ts` declares `kind: "driver_pay" | "bill_due" | "adjustment"` (line 43) but the service body only ever constructs `kind: "bill_due"` (line 236) and `kind: "adjustment"` (line 261) — `driver_pay` is never emitted, confirmed by grep. `DailyPredictionTab.tsx` has a label ready for `driver_pay` rows that can never arrive.
- FILES: `apps/backend/src/cash-flow/cash-flow.service.ts`; `apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx`.
- FIX STEPS:
  1. In `cash-flow.service.ts`, add a query over upcoming/queued driver settlement payments (`driver_finance.driver_settlements` with `payment_state IN ('queued','sent_to_bank')` or scheduled pay-run dates) and emit `kind: "driver_pay"` prediction rows alongside the existing bill_due/adjustment rows.
  2. Confirm `DailyPredictionTab.tsx`'s existing `driver_pay` label renders correctly once real rows arrive (no FE change should be needed).
- GUARD: new `scripts/verify-cash-flow-driver-pay-populated.mjs` — greps `cash-flow.service.ts` for at least one `kind: "driver_pay"` construction.

---

### 0441-mod10-deductions-never-reduce-settlement  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: Identical to `0243-g11-2`/`0285-df-gap2` — `applyAutoDeductionsToSettlement` (`settlements/auto-deductions/apply.ts`) is defined and unit-tested but has no caller in any real settlement compute/finalize path.
- FILES: same as `0243-g11-2`.
- FIX STEPS: same as `0243-g11-2`.
- GUARD: same as `0243-g11-2` / `0441-mod10-autodeductionpolicies-fully-dead`.

---

### 0441-mod10-holddeduction-id-mismatch_DISPATCH  [settlements]  GATED: yes (driver_finance write, though not GL-posting)
- STATE: STILL-OPEN
- ROOT CAUSE: `SettlementDetailPage.tsx::toDeductionRows()` (line ~43-48) sets `id: String(line.id)` from `driver_finance.settlement_lines.id`. `HoldDeductionModal` then PATCHes `/api/v1/driver-finance/deduction-schedules/:id/hold` with that id. But the backend handler (`apps/backend/src/driver-finance/deductions.routes.ts:38-84`) runs `UPDATE driver_finance.deduction_schedule SET is_held = true ... WHERE id = $1` — a completely different table/PK space (`deduction_schedule.id`, not `settlement_lines.id`). The PATCH always affects 0 rows and 404s (`deduction_schedule_not_found`) — structurally can never succeed. Confirmed live on both sides.
- FILES: `apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx` (`toDeductionRows`); `apps/backend/src/driver-finance/deductions.routes.ts`.
- FIX STEPS:
  1. Either (a) have `toDeductionRows` carry the settlement line's linked `deduction_schedule_id` (join it into the line-items query the page already fetches) and PATCH with that id, or (b) change the hold/resume routes to accept a `settlement_line_id` and resolve the `deduction_schedule` row server-side via its FK to the line.
  2. Add an integration test: hold a real deduction from the SettlementDetailPage flow end-to-end, assert 200 not 404.
- GUARD: new `scripts/verify-hold-deduction-id-space.mjs` — asserts the frontend hold/resume call sites pass a `deduction_schedule`-sourced id, not a `settlement_lines`-sourced id (grep for the query that supplies `toDeductionRows`'s source `lines` array; fail if it lacks a deduction_schedule join).

---

### 0441-mod10-payment-status-panel-404  [settlements]  GATED: yes (moves settlement payments — real money)
- STATE: STILL-OPEN
- ROOT CAUSE: `registerSettlementPaymentRoutes` (`apps/backend/src/driver-finance/settlement-payment.routes.ts:68`) is defined but `apps/backend/src/index.ts` never imports or calls it — confirmed by repo-wide grep (only the definition itself matches; `docs/trackers/backlog-verify/settlements.md` and `scripts/verify-no-orphan-routes.mjs:43` both already flag this as a known HELD-financial orphan route). All six `/api/v1/driver-pay/settlements/:id/*` endpoints 404; the Payment Status panel in `SettlementDetailPage.tsx` is dead.
- FILES: `apps/backend/src/index.ts`; `apps/backend/src/driver-finance/settlement-payment.routes.ts`.
- FIX STEPS:
  1. **Do not mount this in isolation** — `scripts/verify-no-orphan-routes.mjs:43` and the tracker both note the underlying `settlement-payment.service.ts` still has the unfixed double-pay race (`0243-g9-h1` above). Land that CAS fix FIRST.
  2. Then add `import { registerSettlementPaymentRoutes } from "./driver-finance/settlement-payment.routes.js";` and `await registerSettlementPaymentRoutes(app);` in `index.ts`, mirroring the adjacent driver-finance route registrations (~line 842-849).
  3. Confirm `verify-no-orphan-routes.mjs` no longer lists it, and its entry there gets removed/updated.
- GUARD: `scripts/verify-no-orphan-routes.mjs` (already exists — flip its status once mounted; do not delete the entry, update it).

---

### 0441-mod10-settlement-line-ui-nonexistent-colu  [settlements]  GATED: no (pure frontend display gap)
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx:30` still has the self-documenting comment `"Loads" has no real per-row field yet (renders a static "—" below)` — confirmed present verbatim on main. The settlement-lines API response has no per-row load count/reference field to bind to.
- FILES: `apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx`; the backend settlement-summary/line-items endpoint (`apps/backend/src/settlements/approval.service.ts` or the settlements list service feeding this table).
- FIX STEPS:
  1. Identify the settlement-summary query and add a `load_count` (or `load_numbers`) aggregate per settlement (COUNT DISTINCT `mdata.loads.id` via `driver_finance.driver_bills.load_id` joined through `settlement_lines`).
  2. Bind `SettlementsTable.tsx`'s "Loads" column to the new field; remove the static `"—"` placeholder and the comment once wired.
- GUARD: new `scripts/verify-settlements-table-no-phantom-columns.mjs` — fails if `SettlementsTable.tsx` still contains a column rendering a hardcoded placeholder string for a documented "no real field yet" column.

---

### 0441-mod10-three-settlement-dispute-backends  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: Three separate, independently-mounted route files all create/read settlement disputes: `settlements/disputes/disputes.routes.ts` (`registerSettlementsDisputesRoutes`, mounted `index.ts:854`), `driver-finance/settlement-dispute.routes.ts` (`registerSettlementDisputeRoutes`, mounted `index.ts:855`), and `driver/settlement-disputes-p6.routes.ts` (`registerDriverSettlementDisputesP6Routes`, mounted transitively via `driver/index.ts:20` → `index.ts:839`). Confirmed all three ARE live/mounted (not one orphaned as might be assumed) — genuine triple-backend fragmentation for one business concept.
- FILES: `apps/backend/src/settlements/disputes/disputes.routes.ts`; `apps/backend/src/driver-finance/settlement-dispute.routes.ts`; `apps/backend/src/driver-finance/settlement-disputes-p6.service.ts` + `apps/backend/src/driver/settlement-disputes-p6.routes.ts`; `apps/backend/src/accounting/disputes.routes.ts` (also imports the P6 service).
- FIX STEPS:
  1. Design doc first (financial + UX consolidation, not a solo build): map which of the three is the office-side canonical path, which is driver-app-facing, and whether P6 is meant to be the driver-facing layer that should call INTO the office canonical service rather than maintain its own table/logic.
  2. Consolidate to one underlying dispute-write service; keep separate ROUTE surfaces only where driver-app vs office auth genuinely differs, but never separate business logic/tables.
  3. Archive (never delete) whichever route file becomes a thin pass-through.
- GUARD: new `scripts/verify-single-settlement-dispute-writer.mjs` — asserts only ONE service module contains `INSERT INTO ... settlement_disputes` (or equivalent); route files may call it, none may duplicate it.

---

### 0441-mod11-deduction-trail-period-close-zero-r  [settlements]  GATED: yes
- STATE: STILL-OPEN — root cause confirmed, more precise than the original evidence
- ROOT CAUSE: `GET /api/v1/audit/reports/deduction-trail` (`apps/backend/src/audit/audit-reports.routes.ts:148`) reads ONLY `events.event_log` (`event_type ILIKE ANY('%deduction%','%fine%','%accident_cost%','%chargeback%')`). But deduction creation/application (`deductions.service.ts::createSettlementDeduction`, `settlement-deduction-cap.service.ts::applyPendingDeductionsToSettlementWithNetFloor`) write ONLY to `audit.audit_events` via `appendCrudAudit` — confirmed, neither file calls `events.log_event`/inserts into `events.event_log`. The report therefore structurally returns zero rows regardless of real deduction activity. This is the exact same single-sink bug the `void-reversal` report in the same file already had and FIXED by UNIONing `events.event_log` with `audit.audit_events` (see the comment at that endpoint) — the same fix was never applied to `deduction-trail`.
- FILES: `apps/backend/src/audit/audit-reports.routes.ts` (deduction-trail endpoint, ~line 148-176); reference the already-fixed `void-reversal` endpoint in the same file as the pattern to copy.
- FIX STEPS:
  1. Mirror the `void-reversal` UNION: also read `audit.audit_events` where `resource_type = 'driver_finance.driver_settlement_deductions'` (or action LIKE `driver_pay.settlement.deduction%`), scoping by `payload->>'operating_company_id'` when present.
  2. UNION both sinks in the SQL, keep output shape unchanged (add a provenance `audit_source` column as `void-reversal` does).
  3. Re-verify `AuditDeductionTrailPage.tsx` renders non-zero rows against a settlement that has real deductions applied.
- GUARD: `scripts/verify-deduction-applier-wired-into-close.mjs` already exists but checks a distinct bug (applier not called at close) — add a NEW `scripts/verify-audit-reports-dual-sink.mjs` asserting both `deduction-trail` and `financial-change-log` UNION `audit.audit_events`, same as `void-reversal`.

---

### 0441-mod11-financial-change-log-starved  [settlements]  GATED: yes
- STATE: STILL-OPEN — root cause confirmed
- ROOT CAUSE: Same single-sink bug as `0441-mod11-deduction-trail-period-close-zero-r`. `GET /api/v1/audit/reports/financial-change-log` (`audit-reports.routes.ts:90`) reads ONLY `events.event_log` filtered on `%invoice%|%bill%|%payment%|%journal%|%void%|%post%|%revers%`. Confirmed `apps/backend/src/accounting/bills.routes.ts`, `invoices.routes.ts`, `payments.routes.ts` have ZERO calls to `events.log_event`/`events.event_log` inserts (grep confirms) — invoice/bill/payment CREATE events never land in the sink this report reads, so it is structurally starved for exactly the record types it claims to log.
- FILES: `apps/backend/src/audit/audit-reports.routes.ts` (financial-change-log endpoint, ~line 90-115); `apps/backend/src/accounting/bills.routes.ts`, `invoices.routes.ts`, `payments.routes.ts`.
- FIX STEPS:
  1. Apply the same `void-reversal`-style UNION with `audit.audit_events` (which invoice/bill/payment CRUD DOES write to via `appendCrudAudit`, confirmed elsewhere in the accounting module).
  2. Confirm the UNION's `event_type ILIKE` filter list matches the `action` strings `appendCrudAudit` actually uses for invoice/bill/payment (e.g. `accounting.invoice.created`, not `%invoice%` loosely — verify actual action strings before shipping the filter).
- GUARD: same new guard as above (`scripts/verify-audit-reports-dual-sink.mjs`) covers both endpoints in one script.

---

### 0441-mod5-deductions-tab-wrong-content  [settlements]  GATED: no (pure frontend display)
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/frontend/src/pages/Drivers.tsx:633` — `subnavTab === "cash_advances" || subnavTab === "deductions"` renders the identical "Debt Alert" panel (cash-advance/repair/damage/late-arrival debt) for BOTH subnav tabs. Confirmed live on main. There is no deductions-specific content (e.g., a per-driver deduction schedule breakdown or a link to `AutoDeductionPoliciesPanel`).
- FILES: `apps/frontend/src/pages/Drivers.tsx` (line ~633-650).
- FIX STEPS:
  1. Split the condition: keep the Debt Alert panel under `cash_advances` only.
  2. Build a distinct panel for `deductions` — e.g., a per-driver `driver_finance.driver_settlement_deductions` list (amount, reason, hold status, remaining balance) or embed `AutoDeductionPoliciesPanel`.
- GUARD: new `scripts/verify-drivers-deductions-tab-distinct.mjs` — fails if the `deductions` and `cash_advances` subnav branches render the same component/condition.

---

### 0441-mod5-settlements-card-deprecated-table  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/mdata/driver-aggregate.service.ts` (lines 369, 377, 387) queries `payroll.driver_settlements` — the retired table per the settlement-engine-collapse decision — to feed `SettlementsSection.tsx`'s driver card. Confirmed live on main.
- FILES: `apps/backend/src/mdata/driver-aggregate.service.ts`; `apps/frontend/src/pages/drivers/**/SettlementsSection.tsx`.
- FIX STEPS: repoint all three queries to `driver_finance.driver_settlements` (same fix batch as `0243-c1-1`/`0243-e1-4`).
- GUARD: same guard as `0243-c1-1` (`scripts/verify-no-payroll-schema-reads.mjs`) covers this file too.

---

### 0490-critical-g11-1-deduction-consent-template  [settlements]  GATED: no — no code change needed
- STATE: ALREADY-FIXED
- PROOF: `apps/backend/src/legal/template-library-provision.service.ts::backfillLegalTemplateLibraries()` is imported AND invoked at server boot (`apps/backend/src/index.ts:367` import, `index.ts:1563` `void backfillLegalTemplateLibraries({...})`). It calls `ensureLegalTemplateLibrary` (`template-library.service.ts`), which idempotently `INSERT ... ON CONFLICT DO NOTHING`s every row of `LEGAL_TEMPLATE_LIBRARY` (`legal-template-library.generated.ts`) into `legal.contract_templates` with `status = 'active'` for every active entity, on every boot. That generated library includes `template_code: "driver_hire_agreement"` (line 259) and `"driver_hire_agreement_v2"` (line 293) — exactly the codes `hasSignedDeductionAuthorization()`'s `HIRE_CONTRACT_TEMPLATE_CODES`/`driver_hire*` prefix match checks for. The original finding's claim ("no seed migration creates a matching row") is technically true (it's a boot-time TS seed, not a SQL migration) but substantively wrong — the row IS created, automatically, on every deploy.
- REMAINING RISK (not this ticket): whether the boot-time seed has actually run against the live prod DB is a live-data question — UNVERIFIABLE without a gated prod check (§1.5). Recommend a one-time prod verify of `SELECT 1 FROM legal.contract_templates WHERE template_code LIKE 'driver_hire%' AND status='active'` before closing this out as fully proven live.

---

### 0490-structural-fix-liability-deduction-fk-spi  [settlements]  GATED: yes (schema/migration)
- STATE: STILL-OPEN
- ROOT CAUSE: `driver_finance.driver_settlement_deductions` has a `source_expense_id` FK (added by `db/migrations/202606290012_deduction_bucket_links_and_recover_flag.sql`) but no `liability_id` or `incident_id` FK columns — confirmed by grepping all of `db/migrations/` for those column names against this table (zero hits beyond `source_expense_id`). A deduction created from an accident/incident or a liability claim has no structural link back to the originating `safety.*`/incident record — fault linkage is still severed.
- FILES: new migration under `db/migrations/`; `apps/backend/src/driver-finance/deductions.service.ts` (`createSettlementDeduction` input type + INSERT).
- FIX STEPS:
  1. New migration (number above current main max — main's highest is `202607600000`-style; pick a fresh timestamp above that): `ALTER TABLE driver_finance.driver_settlement_deductions ADD COLUMN IF NOT EXISTS liability_id uuid REFERENCES <liability table>(id), ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES safety.incidents(id)` (verify exact incident/liability table name against `db/migrations/` before writing — do not guess).
  2. Extend `CreateSettlementDeductionInput` (deductions.service.ts) with optional `liabilityId`/`incidentId` and thread them into the INSERT's column/values arrays (lockstep pattern).
  3. Update the accident/safety callers (`safety/fines.routes.ts`, `safety/safety-v5.routes.ts`, and the new `bf9a` fix below) to pass the incident id through.
- GUARD: new `scripts/verify-deduction-liability-fk-present.mjs` — asserts the migration ledger includes a `driver_settlement_deductions` column addition for `liability_id`/`incident_id` before allowing `bf9a-accident-claim-liability-deduction` to be marked closed.
- **THIS IS A DB MIGRATION — never self-merge; show Jorge the full SQL and wait for explicit OK per CLAUDE.md §1.3/§1.4.**

---

### audit10-payroll-automation-tax-withhol_DISPATCH  [settlements]  GATED: no
- STATE: ALREADY-FIXED / not applicable — no ticket needed
- PROOF: Grepped `withholding|tax_withhold|payroll_tax` across backend `src`. Every hit is either (a) unrelated escrow terminology ("Driver-Escrow LIABILITY sub-account for escrow withholding", "PAY-FIRST-THEN-ESCROW... before withholding" — a comment about recovery order, not tax withholding), or (b) the 1099 `Form 1042-S` withholding-agent tax document renderer (`tax-documents/tax-document-pdf-renderer.ts`), which is the CORRECT artifact for 1099/foreign-contractor income reporting. Per the locked driver model (drivers are Mexican-B1 1099 contractors, not W2 employees — `finance-build-directive-and-driver-model` memory), there is no W2 payroll-tax-withholding requirement to automate. No gap exists.

---

### bf1-driver-fault-liability-deduction  [settlements]  GATED: no — code exists; flag-state is the only open question
- STATE: ALREADY-FIXED
- PROOF: `computeLateDeliveryPassthrough()` (`apps/backend/src/driver-finance/settlement-contract-terms.service.ts:403-459`) queries loads where `l.customer_chargeback_driver_fault = true AND l.customer_chargeback_requested = true AND customer_chargeback_amount_cents > 0`, and for each calls `createSettlementDeduction(...)` (line 446) with an idempotency ledger entry first (`recordContractLine`). It is wired into the real pipeline: called from `computeSettlementContractTerms()` (line ~729), which is itself called from `settlements-load-bookended.service.ts` at settlement close — confirmed via import chain, flag-gated by `SETTLEMENT_CONTRACT_TERMS_ENABLED` (default OFF per CLAUDE.md §1.4 flag policy).
- REMAINING SCOPE NOTE: this only covers the LATE-DELIVERY chargeback flavor of driver-fault liability. General accident/cargo-claim driver-fault liability is a SEPARATE gap — see `bf9a-accident-claim-liability-deduction` below, still open.
- REMAINING RISK: whether `SETTLEMENT_CONTRACT_TERMS_ENABLED` is actually flipped ON for TRANSP in prod is UNVERIFIABLE without a gated prod check.

---

### bf9a-accident-claim-liability-deduction  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/safety/incidents/full-report.service.ts` and `apps/backend/src/safety/incidents/auto-workflow-trigger.ts` have zero references to `escrow`/`deduction`/`createSettlementDeduction` — confirmed by grep across both files. The SAFE-1 guard (`accident-at-fault.routes.test.ts`) only fixed `at_fault`/`preventable` PERSISTENCE on the incident record; nothing downstream turns an at-fault accident into an actual settlement deduction or escrow contribution.
- FILES: `apps/backend/src/safety/incidents/full-report.service.ts`; `apps/backend/src/safety/incidents/auto-workflow-trigger.ts`; `apps/backend/src/driver-finance/deductions.service.ts` (`createSettlementDeduction`).
- FIX STEPS:
  1. In `auto-workflow-trigger.ts` (which already fires on incident-status transitions), add a branch: when `at_fault = true` and a repair/damage cost is known, call `createSettlementDeduction` with `sourceType` reflecting an accident claim, and (once `0490-structural-fix-liability-deduction-fk-spi` lands) populate the new `incident_id` FK.
  2. Route the amount through the escrow-resolver contribution path if the claim should draw from/contribute to escrow rather than being a flat settlement deduction — confirm with the owner (financial policy, don't guess).
- GUARD: new `scripts/verify-accident-triggers-settlement-deduction.mjs` — asserts `auto-workflow-trigger.ts` imports `createSettlementDeduction` (or equivalent) and calls it on an at-fault transition.

---

### biz-flow-1-escrow-not-linked-to-termination  [settlements]  GATED: yes (schema/migration)
- STATE: STILL-OPEN
- ROOT CAUSE: `driver_finance.driver_escrow_separations` (`db/migrations/202607111000_block02_driver_escrow_separation_return.sql:68-101`) has no `load_id` column and no FK to `mdata.loads` — confirmed reading the full CREATE TABLE. `outstanding_damage_claims_cents` is a flat bigint with no structural link to WHICH load(s)/incident(s) generated the claim.
- FILES: new migration; `apps/backend/src/driver-finance/escrow-separation.service.ts` (`recordDriverEscrowSeparation`).
- FIX STEPS:
  1. New migration adding a join table `driver_finance.driver_escrow_separation_claims (separation_id FK, load_id FK mdata.loads, incident_id FK, amount_cents)` — additive, don't collapse the existing flat `outstanding_damage_claims_cents` column (keep as a rollup, add the detail table).
  2. Update `recordDriverEscrowSeparation` to populate the new detail rows from whatever outstanding deductions exist for the driver at separation time.
- GUARD: new `scripts/verify-escrow-separation-claim-detail.mjs`.
- Duplicate/same root cause as `flow1-termination-load-escrow-linkage` below — one PR closes both.

---

### biz-flow-3-no-auto-escrow-deduction-driver-fau  [settlements]  GATED: yes
- STATE: STILL-OPEN — duplicate of `0242-no-auto-escrow-deduction-driver-fault-can`
- ROOT CAUSE / FILES / FIX STEPS / GUARD: identical to `0242-no-auto-escrow-deduction-driver-fault-can` above. `escrow-resolver.service.ts` only resolves the per-driver liability account for routine settlement pay-run contributions (owner-LOCKED I3 math) — it has no caller path from a driver-fault cancellation event.

---

### biz-flow-3-no-cancellation-deduction-linkage  [settlements]  GATED: yes
- STATE: STILL-OPEN — duplicate of `0242-no-auto-escrow-deduction-driver-fault-can`
- ROOT CAUSE: `dispatch/cancel-load.routes.ts` has zero references to `deduction` or `escrow` — same grep result as `0242`. One fix (see `0242`'s FIX STEPS) closes this, `biz-flow-3-no-auto-escrow-deduction-driver-fau`, and `flow3-cancellation-auto-escrow-deduction` together.
- FILES/FIX STEPS/GUARD: see `0242-no-auto-escrow-deduction-driver-fault-can`.

---

### biz-flow-9-no-automatic-escrow-deduction-safet  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/mdata/driver-safety-events.routes.ts` AND `apps/backend/src/safety/events/safety-events.routes.ts` both have zero references to `escrow` or `createSettlementDeduction` — confirmed by grep on both files. No auto-deduction path exists from a logged safety event.
- FILES: `apps/backend/src/mdata/driver-safety-events.routes.ts`; `apps/backend/src/safety/events/safety-events.routes.ts`; `apps/backend/src/driver-finance/deductions.service.ts`.
- FIX STEPS:
  1. Design decision: which safety event types (severity='severe'? specific event_type values?) should trigger an automatic deduction/escrow proposal, and for what amount (policy-driven, not hardcoded) — CPA/owner input needed, this is money-adjacent.
  2. Once decided, add the trigger call (`emitAutoProposedEscrowEvents` or `createSettlementDeduction`) in the safety-event create handler.
- GUARD: new `scripts/verify-safety-event-escrow-trigger.mjs`.
- Duplicate root cause with `flow9-safety-event-auto-escrow-deduction` below — one PR closes both.

---

### d-04-settlements-board-redirect-notice  [settlements]  GATED: no (frontend display / product decision)
- STATE: STILL-OPEN — but flag as likely INTENTIONAL, needs Jorge's product call, not a pure bug
- ROOT CAUSE: `apps/frontend/src/pages/Dispatch.tsx` (~line 494-511, `data-testid="dispatch-settlements-quicklink"`) still renders a "Settlement runs, acknowledgements, and payouts live in Driver Finance" quick-link instead of real inline settlement data on the Dispatch board's Settlements sub-tab. Confirmed live on main. NOTE: an adjacent code comment reads `/* ARCHIVE B21-D12 Sunset 2026-06-04: settlements stub replaced by Driver Finance quick-link (A24-2 pattern) */` — this was a DELIBERATE, dated design decision, not an accidental regression. The original finding ("redirect notice not real data") is factually still true, but may be Working-As-Intended per that 2026-06-04 decision.
- FILES: `apps/frontend/src/pages/Dispatch.tsx`.
- FIX STEPS (only if Jorge overrides the 2026-06-04 decision): rebuild an inline read-only settlements summary panel sourced from `driver_finance.driver_settlements` scoped to loads visible on the current dispatch board.
- GUARD: none — this is a product-decision gate, not a code-correctness gap. Surface to Jorge before building anything.

---

### dispatch-sweep-gap-22  [settlements]  GATED: no (net-new feature, no schema exists yet to gate)
- STATE: STILL-OPEN
- ROOT CAUSE: Zero files matching `mileage_reimbursement_log`, `ReceiptOcrPanel`, or `MileageReimbursementForm` exist anywhere in the repo — confirmed by full-repo filename grep. GAP-22's spec target files are entirely unbuilt (not a regression — a feature that was never started).
- FILES: none exist yet — would need a new migration (`mileage_reimbursement_log`), a new backend route module, and the two named frontend components.
- FIX STEPS: this is a net-new feature build, not a bug fix — needs a design/spec pass (check `docs/specs/` for a GAP-22 spec first, per `never-build-from-defect-list-read-spec-first` memory) before any code.
- GUARD: n/a until built; then add a standard mounted-route + migration-applied guard pair.

---

### expand-escrow-non-bond-deductions  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: `apps/backend/src/driver-finance/escrow-deduction-pending.service.ts` (~line 404) still hardcodes `'escrow_load_abandonment'` as the literal `deduction_type` value in the INSERT — confirmed live: `VALUES ($1, $2, 'escrow_load_abandonment', $3, ...)`. No other escrow deduction class (accident, safety, cancellation) is wired through this path — it is abandonment-only by construction, not policy.
- FILES: `apps/backend/src/driver-finance/escrow-deduction-pending.service.ts`.
- FIX STEPS:
  1. Parameterize `deduction_type` on the function's input (it already threads other per-call values positionally) instead of the literal string.
  2. Update callers (`dispatch/loads.routes.ts:1226`, `mdata/loads.routes.ts:922,1086`) plus the new callers being added for `bf9a`/`biz-flow-9`/`0242` to pass their own type value.
  3. Note the file's own code comment: "escrow's recovery floor policy is NOT yet wired through the capped engine" — flag this as a second, related gap (escrow floor vs the 5%-floor capped-recovery engine) for a follow-up ticket, not silently folded into this one.
- GUARD: new `scripts/verify-escrow-deduction-type-parameterized.mjs` — fails if the literal string `'escrow_load_abandonment'` still appears inside the INSERT's VALUES clause instead of a bound parameter.

---

### fk-cancellation-deductions-0289  [settlements]  GATED: yes (schema/migration)
- STATE: STILL-OPEN
- ROOT CAUSE: `dispatch.load_cancellations` (defined in `db/migrations/0101_p5_f4_cancellation_reasons.sql` and re-touched in `0123_p6_pre_ledger_drift_reconciliation.sql`) has no `deduction_id` column at all — confirmed by grepping every migration touching that table. Migration `0289` on main is `factoring.factor` + assignments (unrelated) — the evidence's citation is accurate.
- FILES: new migration under `db/migrations/` (main's current highest migration number is the `202607600000`-style timestamp scheme — use a fresh timestamp above that, NOT a bare integer like `0289`).
- FIX STEPS:
  1. `ALTER TABLE dispatch.load_cancellations ADD COLUMN IF NOT EXISTS deduction_id uuid REFERENCES driver_finance.driver_settlement_deductions(id)`.
  2. Populate it from the new cancellation→deduction wiring built for `0242-no-auto-escrow-deduction-driver-fault-can`.
- GUARD: `scripts/verify-cancellation-triggers-escrow-deduction.mjs` (proposed under `0242` above) should also assert this FK column exists once both land together.
- **DB migration — never self-merge; owner OK required.**

---

### flow1-termination-load-escrow-linkage  [settlements]  GATED: yes — duplicate of `biz-flow-1-escrow-not-linked-to-termination`
- STATE: STILL-OPEN
- ROOT CAUSE/FILES/FIX STEPS/GUARD: identical to `biz-flow-1-escrow-not-linked-to-termination` above — `db/migrations/202607111000_block02_driver_escrow_separation_return.sql:68-101` creates `driver_finance.driver_escrow_separations` with no `load_id`/`mdata.loads` reference. One PR closes both tickets.

---

### flow2-auto-deduction-trigger-from-customer-exp  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: `createSettlementDeduction()` is called ONLY from `banking/*`, `cash-advances/*`, `settlement-contract-terms.service.ts`, and `safety/*` — confirmed zero calls from anything under `apps/backend/src/accounting/` (customer expense/chargeback module). No automatic trigger fires a settlement deduction from an `accounting.expenses` record; every existing call site is a manual/contract-computed path.
- FILES: `apps/backend/src/accounting/` (wherever customer expense chargebacks are recorded — verify exact file before writing code, don't guess); `apps/backend/src/driver-finance/deductions.service.ts`.
- FIX STEPS:
  1. Identify the specific accounting.expenses write path that should trigger a driver-fault deduction (likely the same `customer_chargeback_driver_fault` flag `computeLateDeliveryPassthrough` already reads, or a distinct expense category).
  2. Design doc: should this be a real-time trigger (on expense create) or a settlement-close-time sweep (like the existing contract-terms pipeline)? The existing pattern favors close-time sweep — prefer consistency over a new real-time hook.
- GUARD: new `scripts/verify-customer-expense-deduction-trigger.mjs` once the design lands.

---

### flow3-cancellation-auto-escrow-deduction  [settlements]  GATED: yes — duplicate of `0242-no-auto-escrow-deduction-driver-fault-can`
- STATE: STILL-OPEN
- ROOT CAUSE/FILES/FIX STEPS/GUARD: identical — `dispatch/cancel-load.routes.ts` never calls `emitAutoProposedEscrowEvents`, unlike `loads.routes.ts`'s abandonment/walkoff handlers (which do, confirmed by grep showing 3 real call sites, none in cancel-load). One PR closes this and `0242`/`biz-flow-3-no-cancellation-deduction-linkage`.

---

### flow5-dual-deduction-systems-consolidate  [settlements]  GATED: yes — evidence partially inaccurate, real gap identified
- STATE: STILL-OPEN, but NOT the pair of files the original evidence named
- ROOT CAUSE (corrected): `settlement-deduction-cap.service.ts` (`applyPendingDeductionsToSettlementWithNetFloor`) and `deductions.service.ts` (`createSettlementDeduction`) are **not** competing systems — confirmed the cap-service reads directly `FROM driver_finance.driver_settlement_deductions` (line 240), the exact table `createSettlementDeduction` writes to. They are one coherent write→apply pipeline (create, then apply-with-cap-at-close). The REAL duplicate/dead system is `settlements/auto-deductions/apply.ts` (policy-based, zero real callers) running alongside this live pipeline — i.e., the same root cause as `0243-g11-2`/`0285-df-gap2`/`0441-mod10-deductions-never-reduce-settlement`.
- FILES/FIX STEPS/GUARD: see `0243-g11-2` — this finding should be merged into that ticket, not built separately.

---

### flow9-safety-event-auto-escrow-deduction  [settlements]  GATED: yes — duplicate of `biz-flow-9-no-automatic-escrow-deduction-safet`
- STATE: STILL-OPEN
- ROOT CAUSE/FILES/FIX STEPS/GUARD: identical — see `biz-flow-9-no-automatic-escrow-deduction-safet` above. `emitAutoProposedEscrowEvents` is called only from `dispatch/loads.routes.ts` and `mdata/loads.routes.ts` (load-status walkoff), never from `safety/events/*` or `mdata/driver-safety-events.routes.ts`.

---

### flow9-safety-event-no-auto-status-escrow-notif  [settlements]  GATED: yes (escrow half); GATED: no (notif half, already done)
- STATE: STILL-OPEN — escrow/status-linkage half only; the notification half is separately already fixed
- ROOT CAUSE: Confirmed `apps/backend/src/safety/events/notification.service.ts` has zero references to `escrow` or `status` — the escrow + driver-status linkage from a safety event genuinely does not exist, consistent with the evidence. (The notification-sending mechanism itself, tracked under the separate `flow9-safety-event-auto-notifications` finding, is out of scope here and not re-verified in this ticket.)
- FILES: `apps/backend/src/safety/events/notification.service.ts`; `apps/backend/src/safety/events/safety-events.routes.ts`; `apps/backend/src/mdata/drivers.routes.ts` (driver status field).
- FIX STEPS: same underlying build as `biz-flow-9-no-automatic-escrow-deduction-safet` — once a safety event triggers an escrow deduction, also flip/flag the driver's status field (e.g. a safety-hold flag) as part of the same handler, and confirm the existing (already-fixed) notification fires off that same event.
- GUARD: same as `biz-flow-9-no-automatic-escrow-deduction-safet`; add a driver-status-flip assertion to the same guard script.

---

### repair-e-escrow-return-and-tieouts-des_DISPATCH  [settlements]  GATED: yes
- STATE: STILL-OPEN
- ROOT CAUSE: `docs/specs/repairs/REPAIR-E-ESCROW-TIEOUTS-DESIGN.md` exists (design is done) but grepping `apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts` for the role-key `escrow_load_abandonment_recovery` returns zero hits — the design was never implemented into the posting engine's role-key map.
- FILES: `apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts`; `docs/specs/repairs/REPAIR-E-ESCROW-TIEOUTS-DESIGN.md` (read fully before coding, per spec-first rule).
- FIX STEPS: implement exactly what REPAIR-E's design doc specifies for the `escrow_load_abandonment_recovery` role-key wiring — do not re-derive; the design doc is the source of truth. Read it, diff against current `settlement-posting.service.ts` role-key map, add the missing entry.
- GUARD: new `scripts/verify-repair-e-role-key-wired.mjs` — asserts `escrow_load_abandonment_recovery` appears in the posting service's role-key map.
- **Touches settlement-posting/GL — never self-merge, owner OK required.**

---

### ruling-3-driver-escrow-current-vs-long_DISPATCH  [settlements]  GATED: yes (catalogs.accounts reclass — financial cluster, needs migration)
- STATE: UNVERIFIABLE (needs prod) for the live classification; CONFIRMED no fix code exists either way
- ROOT CAUSE: The "Damage Claim Escrow" parent account (`id d7d485bf-ad1a-4573-9ad6-badbd565e9a3`, QBO-1150040187) is referenced in `db/migrations/202606130146_expense_category_map_cash_advance_and_seed.sql` and `202607111000_...return.sql` but its `account_subtype` value is DB data (cloned from the QBO import), not set by any migration's SQL literal — grepping for that account id across all backend src + migrations for `UPDATE`/`reclass`/`account_subtype` returns zero hits. Whether it is currently `OtherLongTermLiabilities` (per the `driver-escrow-is-liability` memory's claim) can only be confirmed by a live query against `catalogs.accounts` — gated per §1.5, not run in this session. What IS confirmed: no reclassification code/migration exists on main either way.
- FILES: new migration (if reclass is confirmed needed) targeting `catalogs.accounts` by id `d7d485bf-ad1a-4573-9ad6-badbd565e9a3`.
- FIX STEPS: 1. Get a gated, owner-approved prod read of `SELECT account_subtype FROM catalogs.accounts WHERE id = 'd7d485bf-ad1a-4573-9ad6-badbd565e9a3'`. 2. If it is `OtherLongTermLiabilities` (long-term) rather than a current-liability subtype, write a migration `UPDATE catalogs.accounts SET account_subtype = <correct current-liability subtype> WHERE id = ...` — reuse existing subtype enum values, verify against `0010_catalogs_init.sql`'s CHECK constraint, never invent a new one.
- GUARD: new `scripts/verify-escrow-account-subtype.mjs` (schema-only check against `information_schema`/a documented expected value, RLS-immune) once the correct subtype is confirmed.
- **catalogs.accounts touch = financial cluster; never self-merge, full SQL + owner OK required (§1.4).**

---

### settlement-posting-design-doc-missing_DISPATCH  [settlements]  GATED: no (docs-only)
- STATE: STILL-OPEN
- ROOT CAUSE: `docs/specs/SETTLEMENT-POSTING-DESIGN.md` does not exist in the repo — confirmed via `git ls-tree -r origin/main`. Only a `.block-ready/settlement-posting-design-doc-missing_DISPATCH.json` dispatch marker exists, no actual design doc.
- FILES: `docs/specs/SETTLEMENT-POSTING-DESIGN.md` (to be authored).
- FIX STEPS: author the design doc covering the settlement-posting engine's role-key map, GL account resolution (escrow, deductions, net-floor, bill/bill-payment creation) — reverse-engineer from the actual current `apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts` implementation so the doc matches reality, not aspiration.
- GUARD: n/a (docs-only; no CI guard needed, though a doc-existence check could be added to the same category as other required-spec guards if the repo has one).

---

### sweep-g11-1-deduction-consent-template_DISPATCH  [settlements]  GATED: no — no code change needed
- STATE: ALREADY-FIXED — same proof as `0490-critical-g11-1-deduction-consent-template`
- PROOF: identical to `0490-critical-g11-1` above — the boot-time `backfillLegalTemplateLibraries()` seed (`index.ts:1563`) provisions `legal.contract_templates` rows for `driver_hire_agreement`/`driver_hire_agreement_v2` with `status='active'`, and `hasSignedDeductionAuthorization()`'s hire-contract-code matcher recognizes them. This finding's own evidence text was already correct — the signed hire contract does satisfy the consent gate. No action needed beyond the same prod-verification note as `0490-critical-g11-1`.

---

### phase8-audit161-api-audit  [users-docs-help]  GATED: no
- STATE: STILL-OPEN
- ROOT CAUSE: No OpenAPI/Swagger spec or API-contract-testing workflow exists — confirmed zero hits for `swagger`/`openapi` (case-insensitive) across `apps/backend/src` and `apps/backend/package.json`. Per-route Zod validation exists throughout the backend, but there is no machine-readable API contract or contract test suite.
- FILES: `apps/backend/package.json`; `apps/backend/src/index.ts` (Fastify app instance).
- FIX STEPS:
  1. Add `@fastify/swagger` + `@fastify/swagger-ui` (or a Zod-to-OpenAPI generator compatible with the existing `zod` route schemas) as a runtime dependency — NOTE: this is a runtime dependency bump, requires owner OK per CLAUDE.md §1.3 even though it's not "financial."
  2. Register the plugin in `index.ts`, generate the spec from existing Zod route schemas incrementally (start with one module, expand).
  3. Add a CI check that the generated spec builds without errors on every PR.
- GUARD: new `scripts/verify-openapi-spec-builds.mjs`.

---

### users-invited-status-distinct-from-active  [users-docs-help]  GATED: no
- STATE: ALREADY-FIXED
- PROOF: `apps/frontend/src/pages/Users.tsx` has full "Invited" status logic distinct from "Active": `isInvitePending(user)` (checks `auth_method === "Invite pending"`, lines ~93-95), `userStatus()` (returns `"Invited"` when `isInvitePending`, else `"Active"`/`"Inactive"`, lines 104-107), and `userRowCategory()` (buckets into `"pending"` using the same check plus a `PENDING_INVITE_DAYS` grace window). The original evidence's claim ("No 'invited' status string found anywhere") does not hold against current main — this was either fixed since that evidence was gathered, or the original grep used different search terms. No backend-side "invited" status column check was verified in this pass (frontend derives it from `auth_method`, not a separate stored `status` enum value) — if a stored `identity.users.status` enum is expected to also carry an `'invited'` member, that would be a narrower, separate check; flag to Jorge if that distinction matters.

---

## Summary

- **STILL-OPEN:** 33
- **ALREADY-FIXED:** 6 (`0490-critical-g11-1-deduction-consent-template`, `sweep-g11-1-deduction-consent-template_DISPATCH`, `bf1-driver-fault-liability-deduction`, `audit10-payroll-automation-tax-withhol_DISPATCH`, `users-invited-status-distinct-from-active`, plus `flow5-dual-deduction-systems-consolidate`'s *original file pairing* — though its underlying real gap folds into an open ticket)
- **UNVERIFIABLE (needs prod):** 3 (`0280-19-attention-items-driver-settlement-link` — likely not a defect, `ruling-3-driver-escrow-current-vs-long_DISPATCH`, plus the residual prod-verify note on both consent-template ALREADY-FIXED tickets)
- **GATED (financial/schema/migration/posting/GL/flags — needs owner OK):** 36 of 45
- **NON-GATED (pure frontend display / docs, self-mergeable on green CI once built):** 9 (`0280-19`, `0441-mod10-cashflow-driverpay-hardcoded-empty`, `0441-mod10-settlement-line-ui-nonexistent-colu`, `0441-mod5-deductions-tab-wrong-content`, `d-04-settlements-board-redirect-notice`, `dispatch-sweep-gap-22`, `settlement-posting-design-doc-missing_DISPATCH`, `phase8-audit161-api-audit`, `users-invited-status-distinct-from-active`)

Note: several duplicate IDs share one root cause and are explicitly cross-referenced to consolidate into a single PR each: {`0242`, `biz-flow-3-no-auto-escrow-deduction-driver-fau`, `biz-flow-3-no-cancellation-deduction-linkage`, `flow3-cancellation-auto-escrow-deduction`}; {`0243-g11-2`, `0285-df-gap2`, `0441-mod10-autodeductionpolicies-fully-dead`, `0441-mod10-deductions-never-reduce-settlement`, `flow5-dual-deduction-systems-consolidate`}; {`biz-flow-9-no-automatic-escrow-deduction-safet`, `flow9-safety-event-auto-escrow-deduction`, `flow9-safety-event-no-auto-status-escrow-notif`}; {`biz-flow-1-escrow-not-linked-to-termination`, `flow1-termination-load-escrow-linkage`}; {`0243-c1-1`, `0243-e1-4`, `0441-mod5-settlements-card-deprecated-table`}; {`0490-critical-g11-1`, `sweep-g11-1`}.
