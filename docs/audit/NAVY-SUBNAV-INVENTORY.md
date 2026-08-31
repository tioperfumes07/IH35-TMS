# NAVY SUBNAV INVENTORY — 178 routes (Cascade mechanical)

**Law:** every commit that converts must say `navy subnav: X of 178` and X must rise.
**Target:** `<NavyPageSubNav>` — not bespoke tab rows / CSS-only edits (#18569 closed with 0 converts = rejected class).

## Status
- Ticked: 3 of 178 (pre-existing; Cascade: inventory + convert)
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
- [ ] Factoring — FactoringHome inline tabs (~13 routes)
- [ ] Maintenance — MaintenanceHome HoverDropdownNav (~37 routes)
- [ ] Reports — ReportsSubNav HoverDropdownNav (~46 routes)
- [ ] Lists — ListsSubNav HoverDropdownNav (~89 routes)
- [ ] Safety — SafetyLayout inline tabs (~40 tabs)
- [ ] Drivers — DriversPage inline tabs (~16 routes)
- [ ] Accounting — AccountingSubNavWrapper HoverDropdownNav (~68 routes)
- [ ] Dispatch — DispatchSubnav custom (~39 routes)
- [ ] Cash Flow — inline (1)
- [ ] Docs — inline (1)
- [ ] Program — inline (~8 routes)

## Guard
Claim EVEN step before authoring verify-navy-subnav-x-of-178.mjs.
