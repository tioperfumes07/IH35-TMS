# ROUND 441.22 — DEVIN BOX / ALIGNMENT / TOKEN AUDIT DEFECT REGISTER

Scope: app-wide UI surfaces owned by the Devin seat. USMCA-only; TRANSP/TRK frozen.
Register is numbered by defect class. Every row gives file:line and a screenshot-free description.
Counts are measured from the current `origin/main` working tree unless otherwise noted.

## D1 — Hand-rolled currency formatting

Standard: all money renders through `MoneyText.tsx` or `lib/money.ts` (`formatUsdCents` / `formatUsd`).
Guard: `scripts/verify-money-text-component-adoption-ratchet.mjs`.
Current: **59 occurrences** across files (baseline 58; count went UP by 1). Failing guard.

Representative file:line samples:
- `apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx:21` — inline `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })` helper.
- `apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx:246` — `toLocaleString("en-US", { style: "currency", currency: "USD" })` in reconcile delta label.
- `apps/frontend/src/pages/accounting/loans/LoansAdvancesPage.tsx:54` — `toLocaleString("en-US", { style: "currency", currency: "USD" })` in loan list formatter.
- `apps/frontend/src/pages/accounting/checks/CheckPrintPage.tsx:31` — same pattern in check print formatter.
- `apps/frontend/src/pages/accounting/checks/CheckDetailPage.tsx:21` — same pattern in check detail formatter.

Remaining occurrences are distributed across modules: vendor, customer, driver-finance, dispatch, factoring, fuel, reports, safety, home, vehicle-profile, portal, etc. Full list available via `grep -R 'style:\s*["\047]currency["\047]' apps/frontend/src`.

## D2 — Native / hand-rolled date inputs

Standard: date entry uses the shared `DatePicker` (QBO calendar) everywhere.
Literal `<input type="date">` scan: **0 live UI call sites** in `.tsx` pages. Comments/test utilities mention the old native input but do not render it.
- `apps/frontend/src/pages/accounting/loans/LoanApplicationWizard.tsx:357` — comment only; actual control is `<DatePicker>`.
- `apps/frontend/src/pages/finance/AmortizationPage.tsx:153` — comment only; raw date helper was already removed.
- `apps/frontend/src/components/forms/DateTimePicker.tsx` — wraps a native `datetime-local` input inside the shared component; this is the canonical DateTimePicker, not a hand-rolled page control.

Status: no page-level defect. Keep at baseline.

## D3 — Raw hex colour literals in TSX surfaces

Standard: colours use tokens only (`var(--border-subtle,#E5E7EB)`, `var(--surface-input,#FFFFFF)`, `var(--text-strong,#0F1219)`, `var(--text-muted,#4B5563)`).
Scan: **523 `.tsx` / `.ts` files** contain `#RRGGBB` or `#RGB` literals.
This is app-wide debt; examples:
- `apps/frontend/src/pages/reports/runners/RunnerFilters.tsx:30,92,112,136,150,197,222` — raw `#1f2a44`, `#E5E7EB`, etc.
- `apps/frontend/src/pages/reports/ReportsHome.tsx:192,194,198,202,...` — report tile grid raw hex.
- `apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx:381,...` — many raw border/text colours.
- `apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx:274,...` — extensive raw hex.
- `apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx:560,...` — raw hex.

Note: `apps/frontend/src/design/tokens.ts` and `apps/frontend/src/index.css` are the token definitions and are exempt.

## D4 — Raw arbitrary font sizes (`text-[Npx]`)

Standard: locked font sizes per `docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md` (body 12px, headers 11px/700/uppercase, H1 22px/600).
Guard: `scripts/verify-ui-design-system-ratchet.mjs`.
Baseline: **138 raw `text-[Npx]` occurrences** across **391 files**; guard passes as ratchet but debt is owed.
Representative files:
- `apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx:1891,1984,2013,...` — 27 raw text sizes.
- `apps/frontend/src/pages/drivers/DriverEditForm.tsx:20,23,58,61,...` — 20 raw text sizes.
- `apps/frontend/src/components/parity/ParityTable.tsx:1494,1515,1569,...` — 8 raw text sizes.
- `apps/frontend/src/components/forms/DateTimePicker.tsx:140,343,355,409` — 4 raw text sizes.
- `apps/frontend/src/pages/program/ProgramTrackerPage.tsx:57,66,109,...` — 15 raw text sizes.

## D5 — Dropdowns not type-to-filter

Standard: every dropdown is type-to-filter; no plain `<select>` that forces arrow-click.
Current known non-conforming call site introduced this session:
- `apps/frontend/src/pages/reports/runners/RunnerFilters.tsx:197` — company filter was changed to a native `<select>` in GLB-15 to satisfy the entity-picker guard; it does not type-to-filter. Needs replacement with a type-to-filter `Combobox`/`ReferenceSelect` that still carries entity scoping.

Other plain `<select>` call sites exist app-wide and should be audited module by module; this register notes the one in the Devin-owned drain batch.

## D6 — MoneyInput single-frame vertical guard selftest is inert

Guard: `scripts/verify-moneyinput-single-frame-vertical.mjs`.
Status: production code passes; selftest plants a mutation that no longer matches current source shape, so it reports "planted defect survived". This is a guard-maintenance defect, not a UI defect. Fix the selftest plant in a guard-only batch.

## D7 — verify-unselected-boxes-are-not-pure-white

Guard: `scripts/verify-unselected-boxes-are-not-pure-white.mjs`.
Status: PASS — 0 pure-white unselected boxes across 1518 `.tsx` files. No defect.

## D8 — verify-money-table-cells-aligned

Guard: `scripts/verify-money-table-cells-aligned.mjs`.
Status: PASS — every money table cell is right-aligned with tabular figures. No defect.

## Summary counts

| Class | Count | Guard status |
|-------|-------|--------------|
| D1 hand-rolled currency | 59 occurrences | FAIL (regressed +1) |
| D2 native date inputs | 0 page call sites | PASS |
| D3 raw hex colours | 523 files | Not yet ratcheted |
| D4 raw text sizes | 138 occurrences / 391 files | Ratchet green, debt owed |
| D5 non-type-to-filter dropdowns | ≥1 known (RunnerFilters) | Not yet ratcheted |
| D6 MoneyInput selftest | inert selftest | selftest FAIL |
| D7 unselected white boxes | 0 | PASS |
| D8 money cell alignment | 0 | PASS |

Next action: ship the accounting module batch converting D1 occurrences in accounting pages to `formatUsdCents` / `formatUsd`, then continue with the RunnerFilters type-to-filter dropdown and module-by-module colour / size debt.
