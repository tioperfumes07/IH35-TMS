# DEEP-AUDIT-B — Executive Summary

**Block:** CLOSURE-15-DEEP-AUDIT-B (Lane A)  
**Branch:** `closure/deep-audit-b`  
**Date:** 2026-06-05 (CST / Laredo)  
**Auditor:** Agent A (audit-only — no production source edits)

## Coverage

| Area | Doc | CI guard | CRITICAL | HIGH | MEDIUM | LOW |
|------|-----|----------|----------|------|--------|-----|
| Bell icon + SSE | [DEEP-AUDIT-B-BELL-ICON.md](./DEEP-AUDIT-B-BELL-ICON.md) | `verify:deep-audit-b-bell-icon` | 0 | 0 | 2 | 2 |
| Invoices 17-tab subnav | [DEEP-AUDIT-B-INVOICES-SUBNAV.md](./DEEP-AUDIT-B-INVOICES-SUBNAV.md) | `verify:deep-audit-b-invoices-subnav` | 0 | 2 | 2 | 1 |
| Driver PWA @ 375 | [DEEP-AUDIT-B-DRIVER-PWA-MOBILE.md](./DEEP-AUDIT-B-DRIVER-PWA-MOBILE.md) | `verify:deep-audit-b-driver-pwa-375` | 0 | 0 | 2 | 2 |

**Totals:** 0 CRITICAL · 2 HIGH · 6 MEDIUM · 5 LOW

## CRITICAL findings

None. Bell endpoints + SSE stream wiring pass AF-9 static guards; all 17 accounting subnav targets mount real routes; Driver PWA exposes mobile-safe markers for audited flows.

## HIGH findings — paste-ready fix scopes

### B-INV-1 — Expenses tab drops accounting subnav

**Scope block:** `AUDIT-FIX-18-EXPENSES-SUBNAV`  
**Allowed files (suggested):**
- `apps/frontend/src/pages/accounting/ExpenseCreatePage.tsx`
- `apps/frontend/src/pages/accounting/AccountingSubNav.tsx` (import only)

**Fix:** Wrap `ExpenseCreatePage` body with `<AccountingSubNav />` above `PageHeader`, matching `BillPaymentsListPage` pattern. No route changes. Add `verify:expenses-page-has-accounting-subnav.mjs` + CI wire.

---

### B-INV-2 — Faro CSV import drops accounting subnav

**Scope block:** `AUDIT-FIX-19-FARO-IMPORT-SUBNAV`  
**Allowed files (suggested):**
- `apps/frontend/src/pages/factoring/FaroImportPage.tsx`
- `apps/frontend/src/pages/accounting/AccountingSubNav.tsx` (import only)

**Fix:** Render `AccountingSubNav` at top of `FaroImportPage` (or thin wrapper route component). Keep `/factoring/faro-import` path. Guard: extend `deep-audit-b-invoices-subnav` or add `verify:faro-import-has-accounting-subnav.mjs`.

## MEDIUM highlights (no immediate block)

- **B-BELL-1:** Dropdown capped at 20 notifications — add pagination or “load more” in bell panel.
- **B-BELL-2:** SSE no auto-reconnect — add exponential backoff reconnect in `useNotifications`.
- **B-INV-3:** Redirect tabs (Vendors/Customers/Reports/Maintenance) swap nav chrome — consider persistent accounting subnav bar or breadcrumb.
- **B-INV-4:** AR/AP Aging under `/reports/*` without accounting subnav.
- **B-PWA-1:** 7-icon bottom nav dense at 375 — UX review.
- **B-PWA-2:** PWA install prompt requires manual iOS/Android verification.

## Acceptance checklist

- [x] Manifest first (dispatch `cd467c30a`)
- [x] 4 audit docs written
- [x] Summary lists CRITICAL + HIGH with fix-block scopes
- [x] Driver PWA audited at 375 (static markers + DevTools guidance)
- [x] SSE notification stream validated (static + optional runtime probe)
- [x] No production code modified
- [x] CI guards: `scripts/deep-audit-b-*.mjs` + `package.json` scripts

## Forensic 5-point

1. **Worktree:** `/Users/jorgemunoz/Documents/GitHub/IH35-TMS` on `closure/deep-audit-b`
2. **Allowed files only:** docs/audits/*, scripts/deep-audit-b-*, package.json, .block-ready*.json
3. **Guards:** 3 new `deep-audit-b-*.mjs` scripts; `guard_required` satisfied via `extra_gates` (ci.yml not in lane)
4. **block-ready:** `npm run block-ready` before push
5. **PR:** https://github.com/tioperfumes07/IH35-TMS/pull/568
