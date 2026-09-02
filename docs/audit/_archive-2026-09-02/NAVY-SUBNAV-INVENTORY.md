# NAVY SUBNAV INVENTORY — 381 routes (Cascade mechanical)

**Law:** every commit that converts must say `navy subnav: X of 381` and X must rise.
**Denominator:** 381 is the audited real count across 23 modules (see `scripts/verify-navy-subnav-x-of-178.mjs`). The old "178" was never enumerated by anyone.
**Target:** `<NavyPageSubNav>` — not bespoke tab rows / CSS-only edits (#18569 closed with 0 converts = rejected class).

## Status
- Ticked: 315 of 381 (82.7%) — see guard script for per-module breakdown
- OPEN inventory work: enumerate remaining routes below, then one PR per module

## Ticked (do not re-count as new)
1. SettlementsPage — `apps/frontend/src/pages/driver-finance/SettlementsPage.tsx`
2. SettlementCloseArrivalPage — `apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx`
3. DriverInbox — `apps/frontend/src/components/driver-inbox/DriverInbox.tsx`
4. BankingHome — `apps/frontend/src/pages/banking/BankingHome.tsx` (inline NavLink tabs → NavyPageSubNav)

## Remaining (fill as you inventory)
- [x] Fuel — FuelPlannerHome NavyPageSubNav (LST-F10156 / Cursor rescue)
- [x] Finance — FinanceModuleTabs NavyPageSubNav (LST-F10158 / Cursor rescue)
- [x] Legal — LegalModuleTabs NavyPageSubNav (LST-F10157 / Cursor rescue)
- [x] Factoring — FactoringHome inline tabs (route-manifest)
- [x] Maintenance — MaintenanceHome (route-manifest)
- [x] Reports — ReportsSubNav NavyPageSubNav dropdown (LST-F10182, PR #18922)
- [x] Lists — ListsSubNav NavyPageSubNav dropdown (LST-F10183, PR #18924)
- [ ] Safety — SafetyLayout HoverDropdown (79 tabs — needs different approach, not HoverDropdownNav)
- [x] Drivers — DriversPage NavyPageSubNav (LST-F10162)
- [x] Accounting — AccountingSubNavWrapper NavyPageSubNav dropdown (LST-F10182, PR #18916)
- [x] Dispatch — DispatchSubnav (route-manifest)
- [x] Cash Flow — inline (3)
- [x] Docs — inline (6)
- [ ] WorkOrders — local-state tabs (5 — not route-based, needs different approach)

## Guard
`scripts/verify-navy-subnav-x-of-178.mjs` — selftest + named in `locked-guards.yml`. Run: `npm run verify:navy-subnav-x-of-178`
