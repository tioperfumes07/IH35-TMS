# PASS-7 Smoke Verification Results

**Date:** 2026-06-05
**Base SHA:** 453458c0f05fea6e84cc79ed70d8ff8b1ac81af3
**Summary:** 17/17 PASS · 0 FAIL

| # | AUDIT-FIX | Title | Result | Duration |
|---|-----------|-------|--------|----------|
| 1 | AUDIT-FIX-1 | Bulk select on list pages | PASS | 140ms |
| 2 | AUDIT-FIX-2 | Banking column resize persists | PASS | 145ms |
| 3 | AUDIT-FIX-3 | Customers/vendors list view toggle | PASS | 142ms |
| 4 | AUDIT-FIX-4 | No horizontal overflow at 1024px | PASS | 139ms |
| 5 | AUDIT-FIX-5 | No nested card boxes on detail pages | PASS | 140ms |
| 6 | AUDIT-FIX-6 | Routes do not silently redirect | PASS | 139ms |
| 7 | AUDIT-FIX-7 | 425c/help/docs have content | PASS | 139ms |
| 8 | AUDIT-FIX-8 | WO/Bill category fetch wired | PASS | 138ms |
| 9 | AUDIT-FIX-9 | Page-load endpoints no 500 | PASS | 146ms |
| 10 | AUDIT-FIX-10 | Mobile status bar collapsed | PASS | 137ms |
| 11 | AUDIT-FIX-11 | QBO sync status loads | PASS | 138ms |
| 12 | AUDIT-FIX-12 | Bills subnav + create controls | PASS | 137ms |
| 13 | AUDIT-FIX-13 | Customers pagination + card links | PASS | 245ms |
| 14 | AUDIT-FIX-14 | Subtabs deep-linkable | PASS | 136ms |
| 15 | AUDIT-FIX-15 | Status bar icon-only at 1366 | PASS | 136ms |
| 16 | AUDIT-FIX-16 | Invoice create stays in accounting | PASS | 139ms |
| 17 | AUDIT-FIX-17 | Factoring power-user UX | PASS | 138ms |

## Notes
- CI guards delegate to existing `verify:*` scripts (static + optional runtime when env vars set).
- Browser breakpoint smoke (1440/1024/375) runs when `FRONTEND_BASE_URL` + session cookie are configured.
- Any FAIL here should spawn AUDIT-FIX-18+ blocks — do not patch production from this verify-only block.
