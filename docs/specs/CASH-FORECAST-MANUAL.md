# CASH-FORECAST-MANUAL — "Manual Daily Prediction" tab (firewalled)

**SHOW-FIRST spec. No migration, no code this turn.** For Jorge's review.
Audited live on `main` (`b210767e`), 2026-06-16.

---

## ⚠️ DRIFT / EXISTING-STATE FLAG (read first — §9)

A Cash Flow forecast feature **already exists**, and it is the **opposite** of what Block F asks for:

- **Page:** `/cash-flow` → `CashFlowPage` (`routes/manifest.tsx:765`, import `:158`).
  Renders two tabs via `SecondaryNavTabs` (`pages/cash-flow/CashFlowPage.tsx:11-14`, `:40-51`):
  1. **"Daily prediction"** → `tabs/DailyPredictionTab.tsx` (reads `api/cashFlow`).
  2. **"Actual vs Projected"** → `tabs/ActualVsProjectedTab.tsx`.
- **Backend:** `apps/backend/src/accounting/cash-forecast.routes.ts` — the existing forecast is
  **accounting/QBO-DERIVED**: it reads `accounting.invoices` (`:168`), `accounting.bills` (`:182`),
  `accounting.factoring_advances` (`:197`), `banking.bank_accounts` (`:157`), settings in
  `accounting.cash_forecast_settings` (migration `0235`). It is coupled to accounting **by design**.

**Implication:** Block F's "Manual Daily Prediction" is a **DIFFERENT, third thing** — hand-entered,
firewalled, sharing NO data with the above. The two must not be confused.

**Naming collision — Jorge to decide:** there is already a tab literally labeled *"Daily prediction."*
Block F's tab "Manual Daily Prediction" sits beside it. Recommend keeping the new label explicit
(**"Manual Daily Prediction"**) so operators never confuse the hand-entered projection with the
QBO-derived one. (Option: rename the existing to "Daily prediction (QBO)" — but that touches the
existing tab, so **not** done without your OK.)

---

## 1. Purpose
A **"Manual Daily Prediction"** tab inside the existing Cash Flow page. Hand-entered predicted
income + predicted expenses per day, fully editable. **Zero impact on accounting/finance/QBO/reports,
and vice versa** — the bidirectional firewall is the defining requirement. It shares only the Cash Flow
*page*; it shares **no data** with the real (QBO-derived) cash-flow statement or the existing forecast.

## 2. Placement (additive, no sidebar change)
- Add one entry to the `TABS` array in `pages/cash-flow/CashFlowPage.tsx:11-14`:
  `{ id: "manual_daily_prediction", label: "Manual Daily Prediction" }`, gated by the
  `CASH_FORECAST_ENABLED` flag (tab hidden when off). Existing two tabs **unchanged**.
- New component `pages/cash-flow/tabs/ManualDailyPredictionTab.tsx` calling a **new** `api/forecast.ts`
  (NOT `api/cashFlow.ts`, which is the accounting-derived feed).
- **No** route change (same `/cash-flow`), **no** sidebar change.

## 3. Data isolation (the firewall — prove it)
Own schema **`forecast`**, table **`forecast.cash_entries`**:

| column | type | notes |
|---|---|---|
| `id` | uuid PK (UUIDv7, server-gen) | |
| `operating_company_id` | uuid NOT NULL | RLS scope; **no commingling** across TRK/TRANSP/USMCA |
| `entry_date` | date NOT NULL | |
| `direction` | text CHECK (`income`/`expense`) | |
| `amount_cents` | bigint NOT NULL CHECK (>= 0) | |
| `party_name` | text | **free-text** customer/vendor snapshot — **no FK** |
| `invoice_no` | text | free-text |
| `category` | text | free-text |
| `memo` | text | |
| `created_by_user_id` | uuid | |
| `created_at` / `updated_at` | timestamptz | |
| `deactivated_at` | timestamptz | **void-not-delete** (§2) |

Editable per-entity opening balance: **`forecast.opening_balance`** (`operating_company_id` PK +
`amount_cents` + audit cols), one row per entity.

**Hard firewall rules (all MUST hold):**
- **No FK** from `forecast.*` into `accounting.*` / `mdata.customers` / anything. Party = text snapshot
  (optional typeahead for convenience, **stored as text**, no FK).
- **No GL posting**, no `accounting.*` writes, **no QBO calls** anywhere in the forecast path.
- **Not** included in the real Cash Flow statement, the existing accounting-derived forecast, any
  report, Trial Balance, Balance Sheet, or P&L. Nothing in `accounting/`, `finance/`, or `reports/`
  ever queries `forecast.*`.
- New runtime role grants for `forecast.*` (migration 0065 pattern + DEFAULT PRIVILEGES) or it 500s.

## 4. The real statement is UNTOUCHED
The existing accounting-derived forecast (`accounting/cash-forecast.routes.ts`) and the real cash-flow
statement continue to read **only** from `accounting.*` / `banking.*` / QBO and **never** query
`forecast.*`. This block adds code; it changes **zero** lines of the existing forecast/statement path.

## 5. CI guard (mandatory, permanent)
`scripts/verify-cash-forecast-firewall.mjs`, wired into `.github/workflows/locked-guards.yml`:
- **No** file under `apps/backend/src/forecast/**` or `apps/frontend/src/**/forecast*` imports from
  `accounting/`, `finance/`, or `reports/`.
- **No** file under `accounting/**`, `finance/**`, `reports/**` imports from `forecast/` or references
  the `forecast.` schema.
- Fails the build if either direction is violated. (Static import/grep check — no DB.)

## 6. Entity scope
Strictly per `operating_company_id` with RLS (`SET app.operating_company_id`); TRK / TRANSP / USMCA
are fully independent — **no commingling**.

## 7. View
Per the selected company + date-range filter:
- Grouped **by day** → income lines, expense lines, **day net**, and a **running projected balance**
  starting from the editable opening balance.
- Inline **add / edit / delete** rows: `entry_date`, `invoice_no`, `amount`, `party_name` (free-text,
  optional typeahead), `category`, `memo`, `direction`.
- Delete = soft (`deactivated_at`), never hard.
- Vocabulary: **`+ Create`** for new rows (§7 lock), not "+ New"/"+ Add".

## 8. Tier / gating
- **Additive**, behind an **OFF-by-default** flag `CASH_FORECAST_ENABLED` (tab + routes/queries inert
  when off).
- **Non-posting** → no Tier-1 financial ceremony (no GL, no opening-balance-as-accounting-event).
- BUT it introduces a **migration** (new `forecast` schema + grants) → migration number strictly above
  main's max at push time; runs locally; **holds at "OK to merge"** (§1.4 — any `db/migrations/*.sql`
  makes the PR gated; never self-merge).

## 9. Build sequence (when approved — not this turn)
1. Migration: `forecast` schema, `cash_entries`, `opening_balance`, RLS policies, grants. (gated)
2. Backend `forecast/` module: CRUD routes (no accounting imports). (gated)
3. `verify-cash-forecast-firewall.mjs` + wire into locked-guards. (ships with the code)
4. Frontend `ManualDailyPredictionTab` + `api/forecast.ts` + the flagged TABS entry. (frontend)
5. Flag stays **OFF** until Jorge flips it.

**PAUSED for Jorge's review** — confirm (a) the tab label / naming-collision decision, and
(b) opening balance as a table vs a column. No migration/code until then.
