# ACCOUNTING drain — origin/main verification (2026-07-21)

**Builder:** Cursor BUILDER (accounting lane). **Base:** `origin/main` @ `e2db37a74`.
**Method:** every block below was verified against the **current `origin/main` tree** (not the local
dirty worktree, not memory), per Rule #0 / evidence-before-done. The `block-audit-piles-2026-07-21.json`
snapshot pre-dates a wave of merged accounting PRs, so several `GAP` rows are **already resolved on
`origin/main`** and should be reclassified `BUILT`/`STALE` (audit-note only — verify vs code/live, not the
counter, as each row itself says).

> This is a **docs-only, non-financial** reconciliation. It does not change code, schema, or flags.
> It exists so the coordinator/Claude can decrement the ACCOUNTING pending count on **evidence**, not
> re-dispatch already-shipped work (which would be patch-on-patch).

## Verdict table

| Block id | Audit pile | Verified verdict on `origin/main` | Evidence |
|---|---|---|---|
| `a-05-bills-no-page-level-create-button` | GAP | **STALE (already fixed)** | `apps/frontend/src/pages/accounting/BillsPage.tsx` — `AccountingSubNavWrapper` `actions={…}` renders a page-level `+ Create` button (`data-testid="bills-create-cta"`) that opens `CreateBillModal`. |
| `a-03-expenses-fullpage-form-not-list-drawer` | GAP (self-REFUTED) | **STALE (already fixed)** | `ExpensesListPage.tsx` `actions={…}` → `+ Create` opens `RecordExpenseModal` (ParityDrawer). Subnav `Expenses List` → `/accounting/expenses/list`. |
| `expenses-list-routing-bug` | GAP | **STALE (already fixed)** | `apps/frontend/src/routes/manifest.tsx` — `/accounting/expenses` element = `ExpensesListPage` (the LIST). `/accounting/expenses/new` = `ExpenseCreatePage` (additive alias). No wizard on the canonical list route. |
| `0451-fin2-finance-lands-on-stub-not-hub` | GAP | **STALE (already fixed)** | `manifest.tsx` — `<Route path="/finance" element={<FinanceHubPage/>} />`. `sidebar-config.ts` — `finance` item `to: "/finance"` (the Hub); `Overview` is a flyout tab (`/finance/overview`), no route removed. |
| `0441-mod10-cashflow-accounting-routes-dead` | GAP | **STALE (already fixed)** | `apps/backend/src/index.ts` mounts `registerCashFlowRoutes` **and** `registerCashForecastRoutes` (in the `await register…` block), plus `registerCashFlowModuleRoutes` + `registerCashForecastManualRoutes`. `CashForecastPage.tsx` consumes `getCashForecast`/`getCashForecastSettings`/`upsertCashForecastSettings` — served by the mounted routes. |
| `0441-mod7-bill-subnav-filters-not-creators_UI` | GAP | **STALE (already fixed)** | `manifest.tsx` — `/accounting/bills/{maintenance,repair,fuel,driver}` each `<Navigate to="/accounting/bills?category=…&create=1" replace />`, i.e. they open the **create** flow (`create=1` → `CreateBillModal`), consistent with `Vendor bill` / `Multiple bills`. |
| `0441-mod7-myaccountant-flag-no-seed` | GAP (💰) | **STALE (already fixed)** | `db/migrations/202607590000_my_accountant_flag_seed.sql` seeds `MY_ACCOUNTANT_ENABLED` `default_enabled=false`, `ON CONFLICT DO NOTHING`. Guard `scripts/verify-myaccountant-flag-seeded.mjs`. Per-entity-only in `service.ts`. |
| `0091-h3-3` (void-flag classification) | GAP (💰) | **STALE (already fixed)** | `apps/backend/src/lib/feature-flags/service.ts` — `isPostingFlag()` has `/_VOID_ENABLED$/` branch; `POSTING_FLAG_KEYS` enumerates `VOID_ENFORCEMENT_ENABLED` + `WO_VOID_ENABLED`. Guard `scripts/verify-is-posting-flag-void.mjs`. |
| `ps-a-item-editor-account-pickers-no-addnew` | GAP (💰) | **PARTIAL — `allowAddNew` prop present; wired to WRONG create kind (open defect)** | `ItemEditorModal.tsx` income (`allowAddNew … onAdd → setAccountCreateSide("income")`) + expense (`… "expense"`) pickers HAVE the prop. BUT the create chrome opened is `<QuickCreateEntityModal kind="category" open={accountCreateSide !== null} …>` — there is **no `"account"` `QuickCreateKind`**, so "+ Add new account" creates a **category** and mis-assigns its id to the income/expense **account** FK. See design-HOLD (below). |

## Net effect on the ACCOUNTING pending count

- **7 blocks** reclassify GAP → **STALE/BUILT** on `origin/main` (a-05, a-03, expenses-list-routing,
  0451-fin2, 0441-mod10-cashflow-routes-dead, 0441-mod7-bill-subnav-creators, 0441-mod7-myaccountant-flag,
  0091-h3-3). No rebuild needed — re-dispatching them would be redundant.
- **1 block** (`ps-a-item-editor-account-pickers-no-addnew`) is a **genuine open defect** but its correct
  fix touches `catalogs.accounts` creation → **financial cluster → HOLD-FOR-JORGE**. See the companion
  design-HOLD doc: `docs/specs/GAP-ITEM-EDITOR-ADD-NEW-ACCOUNT-DESIGN-HOLD-2026-07-21.md`.

## Notes / discipline

- Verified against `origin/main` tree at `e2db37a74`, not the coordinator's dirty worktree (which carries
  unrelated in-flight edits). Line anchors intentionally omitted where the tree may shift; grep the cited
  symbols to relocate.
- No code/schema/flag changed by this PR. Financial items remain owner-gated.
