# PASS-7 Smoke Verification Results

**Date:** 2026-06-05
**Base SHA:** 618ac1eae6a44a6336f75811779f98cfe3b74bdc
**Summary:** 17/17 PASS · 0 FAIL

| # | AUDIT-FIX | Title | Result | Duration |
|---|-----------|-------|--------|----------|
| 1 | AUDIT-FIX-1 | Bulk select on list pages | PASS | 164ms |
| 2 | AUDIT-FIX-2 | Banking column resize persists | PASS | 151ms |
| 3 | AUDIT-FIX-3 | Customers/vendors list view toggle | PASS | 150ms |
| 4 | AUDIT-FIX-4 | No horizontal overflow at 1024px | PASS | 145ms |
| 5 | AUDIT-FIX-5 | No nested card boxes on detail pages | PASS | 276ms |
| 6 | AUDIT-FIX-6 | Routes do not silently redirect | PASS | 168ms |
| 7 | AUDIT-FIX-7 | 425c/help/docs have content | PASS | 151ms |
| 8 | AUDIT-FIX-8 | WO/Bill category fetch wired | PASS | 156ms |
| 9 | AUDIT-FIX-9 | Page-load endpoints no 500 | PASS | 166ms |
| 10 | AUDIT-FIX-10 | Mobile status bar collapsed | PASS | 148ms |
| 11 | AUDIT-FIX-11 | QBO sync status loads | PASS | 143ms |
| 12 | AUDIT-FIX-12 | Bills subnav + create controls | PASS | 144ms |
| 13 | AUDIT-FIX-13 | Customers pagination + card links | PASS | 264ms |
| 14 | AUDIT-FIX-14 | Subtabs deep-linkable | PASS | 150ms |
| 15 | AUDIT-FIX-15 | Status bar icon-only at 1366 | PASS | 146ms |
| 16 | AUDIT-FIX-16 | Invoice create stays in accounting | PASS | 152ms |
| 17 | AUDIT-FIX-17 | Factoring power-user UX | PASS | 152ms |

## Notes
- CI guards delegate to existing `verify:*` scripts (static + optional runtime when env vars set).
- Browser breakpoint smoke (1440/1024/375) runs when `FRONTEND_BASE_URL` + session cookie are configured.
- Any FAIL here should spawn AUDIT-FIX-18+ blocks — do not patch production from this verify-only block.
