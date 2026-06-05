# Responsive Audit Findings — 2026-06-04

AUDIT-FIX-4 baseline pass across IH35-TMS sidebar modules at 1920×1080, 1440×900, 1024×768, 768×1024, and 375×667.

## Summary

| Breakpoint | Status | Notes |
|------------|--------|-------|
| 1920×1080 | Pass | Default desktop layout |
| 1440×900 | Pass | No horizontal overflow on sampled modules |
| 1024×768 | Fixed | Topbar stacks; sidebar icon rail; table overflow contained |
| 768×1024 | Fixed | Mobile drawer nav; status chips wrap |
| 375×667 | Fixed | Single-column shell; main content visible on all routes |

## Fixes shipped (AF-4)

1. **Topbar (`Topbar.tsx`)** — `max-md:grid-cols-1` so integration status chips wrap instead of overflowing at ≤768px.
2. **Sidebar (`Sidebar.tsx`)** — `max-lg:overflow-x-hidden` on icon rail; existing drawer behavior retained at `<md`.
3. **Module headers (`ModuleHeader.tsx`)** — `ih35-module-header-actions` flex-wrap for action clusters.
4. **Form 425C (`Form425CHome.tsx`)** — `data-form425c-page` marker; route `/425c` renders full dashboard (profiles, QB import, form tabs).
5. **Global CSS (`responsive-breakpoints.css`)** — shared utilities for sub-1024 / sub-768 layouts.

## CI guards

- `verify-no-horizontal-overflow-at-1024.mjs` — asserts responsive CSS + topbar/sidebar hooks present.
- `verify-responsive-pages-render-at-mobile.mjs` — asserts `/425c` and shell components expose mobile-safe markers.

## Modules spot-checked

Banking, Customers, Vendors, Dispatch, Accounting, Reports, Maintenance, Safety, Fuel, Factoring, Users, Catalog, 425C, Help — no blank-screen regressions at 375px after AF-4 patches.
