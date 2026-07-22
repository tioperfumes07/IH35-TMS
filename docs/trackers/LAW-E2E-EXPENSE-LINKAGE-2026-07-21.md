# LAW-E2E — Expense money path vs Law of the Land §9

**Date:** 2026-07-21  
**Auditor:** Cursor BUILDER/auditor (FAIL-honest)  
**Scope:** End-to-end Expense linkage — forward AND reverse  
**Base:** `origin/main` @ `e64fc4c6bae478b1931e16760a2b7c325417547d`  
**Worktree:** `/private/tmp/ih35-law-e2e-expense-20260721-203554`  
**Live deploy SHA (api healthz/shallow):** `e64fc4c` — matches worktree short SHA  
**Neon-apply:** not performed (forbidden for this mission)  
**Merge:** not performed (forbidden for this mission)

## Law under test (§9)

Every money transaction must link to vendor/customer + GL account + audit; forward and reverse drill-through; no built-but-unwired poster/route; no orphan id; no dead-end screen.

## Overall verdict

**FAIL** — create + POST + gated poster are wired; reverse drill-through and expense detail are not Law-complete.

| Hop | Required surface | Verdict | Evidence | Gap to fix |
| --- | --- | --- | --- | --- |
| 1 | UI create surface (QBO-like side panel) reachable from Accounting expenses list + other entry points | **PASS** | List `+ Create` opens `RecordExpenseModal` → `ParityDrawer` (`ExpensesListPage.tsx:181-198`, `RecordExpenseModal.tsx:17-19`). Alias `/accounting/expenses/new` also uses `ParityDrawer` (`ExpenseCreatePage.tsx:36-42`, route `manifest.tsx:3780-3783`). Other entry points: Home Quick Actions (`QuickActionsBar.tsx:95`), Maintenance (`CreateExpenseModal.tsx:37` / `MaintenanceHome.tsx:483`, `WorkOrderDetailPage.tsx:806`). Live browser click **UNVERIFIED** (no authenticated browser session this run); route + component wiring proven on deployed SHA `e64fc4c`. | None for create chrome reachability. |
| 2 | `POST /api/v1/expenses` writes `accounting.expenses` + `expense_lines` with `operating_company_id`, vendor, GL `account_id`, audit | **PASS** (with notes) | Route mounted via accounting autoload (`accounting/index.ts:10-19` + `expenses.routes.ts:886-888`). Insert sets `operating_company_id` on header (`expenses.routes.ts:330-368`). Optional `vendor_uuid` (`:333-336`). Line insert sets `expense_account_uuid` from entity-scoped `catalogs.accounts` resolve on `qbo_account_id` (`:315-327`, `:384-393`). Audit: `appendCrudAudit(..., "expense.created", ...)` (`:461-478`). `expense_lines` has **no** own `operating_company_id` column — RLS via parent FK (migration `202606080040_...sql:20-23`) — acceptable inheritance, not missing OCI on header. | Fix spine emit: `entity_id` reads `(payload as {id})?.id` which is always empty; payload key is `expense_id` (`expenses.routes.ts:500` vs `:482`). Empty spine entity_id = silent orphan event. |
| 3 | Posting engine / JE when flag ON; name flag; default OFF documented | **PASS** (gating) / **UNVERIFIED** (live JE row) | Flag key `EXPENSE_GL_POSTING_ENABLED` (`expenses.routes.ts:15`). Create-time post gated (`:520-545`); explicit `POST /:expenseId/post` gated (`:712-727`, `:755`). Engine: `postSourceTransaction` + `buildExpenseLines` (`posting-engine.service.ts:749-885`). Global default OFF: migration `202606151700_expense_gl_posting_flag.sql:8-13`. Per-entity override matrix seeds **ON for USMCA + TRK** (`202607052300_per_entity_posting_flag_golive.sql:26-27,75-76`). Live override rows on Neon: **UNVERIFIED** (no Neon read this mission). | Owner Neon-prove `lib.feature_flag_overrides` for `EXPENSE_GL_POSTING_ENABLED` with RLS bypass. UI has no Post-to-GL control on expenses list (`ExpensesListPage.tsx:136-139` shows status text only). |
| 4a | Forward: expense → JE lines → `catalogs.accounts` | **PASS** (code path) / **UNVERIFIED** (live posted rows) | Debit prefers `expense_lines.expense_account_uuid` → credit `payment_account_uuid` (cash) or AP role (`posting-engine.service.ts:821-866`). Accounts resolved from `catalogs.accounts` (not RETIRE `mdata.qbo_*` as write target). CoA resolver for category: `FROM catalogs.accounts WHERE qbo_account_id = $1 AND operating_company_id = $2` (`expenses.routes.ts:317-325`) — correct bridge table. | Neon prove: posted expense has `journal_entry_id` + balanced JE lines on `catalogs.accounts`. |
| 4b | Forward: expense → vendor | **PASS** (write) / **FAIL** (list click-through) | `vendor_uuid` persisted on create (`expenses.routes.ts:333-336`). List shows `vendor_name` as plain text, **not** `EntityLink kind="vendor"` (`ExpensesListPage.tsx:105-112`). | Make Payee an `EntityLink` to vendor when `vendor_uuid` present. |
| 4c | Forward: expense → load / unit when fields exist | **PASS** (fields + write) | `load_id` via driver attribution (`expenses.routes.ts:396-452`); list Load column uses `EntityLink kind="load"` (`ExpensesListPage.tsx:120-125`). `unit_id` + `linked_work_order_uuid` columns written when present (`:353-361`). Form can send `unit_id` / `work_order_id` (`RecordExpenseForm.tsx:30-38`, `recordExpenseSubmit.ts`). | No expense detail to show unit/WO links when present (see hop 5/6). |
| 5a | Reverse: JE detail → expense | **FAIL** | API built: `GET /api/v1/accounting/journal-entries/:id/source-links` (`journal-entries.routes.ts:131-149`, `getJournalEntrySourceLinks` in `journal-entries.service.ts:630-665`). Frontend consumers of `source-links`: **zero** (`rg source-links apps/frontend` empty). `JournalEntryDetailPage.tsx` shows `entry.source` as plain string (`:133-136`); account names not linked (`:40-45`); no expense `EntityLink`. | Wire JE detail to call source-links and render `EntityLink kind="expense"` (and CoA register links). |
| 5b | Reverse: vendor → expense | **FAIL** | `VendorDetail.tsx` has default expense *account* picker only (`:614-629`); no expense history list, no `listExpenses` by vendor, no vendor expenses API under `mdata/vendors.routes.ts`. | Add vendor expenses history (API filter `vendor_uuid` + FE table with `EntityLink kind="expense"`). |
| 5c | Reverse: CoA account register → expense | **FAIL** | Register rows carry `source_transaction_type` / `reference` (= source id) (`account-register.service.ts:103-107`). Row click uses `sourceRoute` (`AccountRegisterPage.tsx:511`). For expense: `return "/accounting/expenses/list"` **drops** the id (`:63`) unlike invoice/bill which embed id (`:59-61`). Payee for expense intentionally NULL (`account-register.service.ts:181-183`) — no expense→vendor join. | `sourceRoute("expense", ref)` → `/accounting/expenses/list?expense_id=${ref}` (or true detail route). Join `accounting.expenses`→`mdata.vendors` for payee. |
| 5d | Reverse: expense detail → all links clickable | **FAIL** | No `ExpenseDetailPage`. `EntityLink` expense resolves only to list highlight (`EntityLink.tsx:103`). No `GET /api/v1/expenses/:id`. List row click only sets `?expense_id=` highlight (`ExpensesListPage.tsx:216-221`). List type omits `journal_entry_id` (`api/accounting.ts:481-498`; list SQL `expenses.routes.ts:188-216` does not select it). | Add `GET /expenses/:id` + Expense detail panel/page with clickable vendor, JE, load, unit, WO, GL accounts, audit. |
| 6a | Tab: Expenses list | **PASS** | Routes `/accounting/expenses` + `/list` (`manifest.tsx:3788-3796`); subnav (`subnav-manifest.ts:79-80`); list wired to `GET /api/v1/expenses` (`ExpensesListPage.tsx:72-80`). | — |
| 6b | Tab/surface: Expense detail | **FAIL** | No detail route/page; deep-link is list highlight only (see 5d). | Build detail surface. |
| 6c | Tab: Account register | **FAIL** (shows type when posted; reverse dead) | Type filter includes Expense (`AccountRegisterPage.tsx:68-75`). Drill-through loses expense id (5c). | Fix `sourceRoute` + payee join. |
| 6d | Tab: Vendor history | **FAIL** | Dead — no expense history on vendor (5b). | Wire vendor→expenses. |
| 6e | Tab: Audit trail | **PASS** (code) / **UNVERIFIED** (live row) | `AccountingAuditTrailPage` maps `expense` → `EntityLink` (`:42-43`, `PostingEntityLink` `:80-94`). Can filter by `source_transaction_type`. Create audit event written (`expenses.routes.ts:461-478`, `:538`). Live audit row for a real expense: **UNVERIFIED** without Neon/browser. | Prove one `expense.created` / `expense.posted` event live. |

## Gaps inventory (code, not docs)

| # | Gap | Class |
| --- | --- | --- |
| G1 | No expense detail route/API; EntityLink → list highlight only | Missing reverse / dead-end |
| G2 | JE `source-links` API built; FE unwired on JE detail | Built-but-unwired |
| G3 | Account register expense click drops `expense_id` | Missing reverse route param |
| G4 | Vendor detail has no expense history | Missing reverse |
| G5 | Spine `expense.created` emits empty `entity_id` | Orphan id / silent audit gap |
| G6 | Expenses list omits JE link + vendor EntityLink | Incomplete forward UI |
| G7 | No UI Post-to-GL on expenses (API exists; flag-gated) | Partial operator surface |

## CoA resolver check

**PASS** — category resolves through `catalogs.accounts` (entity-scoped), not a RETIRE write path. Form still *selects* QBO category ids from cost-context/`mdata.qbo_accounts` display, but server bridges to ledger CoA before line insert (`expenses.routes.ts:89-90`, `:317-325`).

## Top 3 FAIL items to fix next (code, not docs)

1. **Expense detail + GET `/api/v1/expenses/:id`** — replace list-only deep-link with a real detail surface and clickable EntityLinks (vendor, JE, load, unit, WO, accounts).
2. **Wire JE detail → `GET .../journal-entries/:id/source-links`** — render `EntityLink kind="expense"` (API already exists; FE has zero callers).
3. **Account register `sourceRoute` for expense** — navigate to `?expense_id=` (or detail); join expense→vendor for payee; add vendor expense history list.

## Evidence discipline

- Repo file:line cited above.  
- Live: API `version=e64fc4c` matches audited tip.  
- Neon row counts / flag overrides / browser create→JE: **UNVERIFIED** (no Neon-apply/read; no authenticated UI session).
