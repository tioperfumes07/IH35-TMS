# LEAD AUDIT — 2026-10-02 — FILTERS MEASURED ACROSS THE WHOLE APP — 50 SURFACES WRONG, 27 RIGHT

OWNER: "keep working and coding the kpis and the filters search the db most tabs don't have correct
filter formats etc." **He is right, and here is the count instead of an adjective.**

MEASURED on `origin/main` across `apps/frontend/src/pages`, every file that renders a table, a
`ListView` or a `DataTable`:

```
WITH the house toolbar (UniversalListToolbar / MoneyListToolbar / CollapsedListFilters /
                        useStagedListFilters)                     27 surfaces
WITHOUT it — hand-rolled or no filter at all                      50 surfaces
```

**The house contract is already built and nobody has to invent it.**
`apps/frontend/src/components/table/UniversalListToolbar.tsx` gives: `search` + `onSearchChange`,
`columns` (`UniversalToolbarColumn{key,label}`), a typed `range`
(`UniversalRange{key, kind: "date"|"amount"|"number", from, to}`) with `onRangeApply`,
`inferUniversalRangeColumns()` to derive range-capable columns, `applyUniversalDatePreset()` for the
presets, `applyUniversalListFilters()` for the actual filtering, and **`resultCount` / `totalCount`**
so every list states how many of how many it is showing. `MoneyListToolbar` adds the one-select and
multiselect rules for money lists. **A surface that hand-rolls a search box is not just inconsistent —
it has no range filter, no column chooser and no result count.**

Every converted surface obeys `docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md`: lines for
rows never columns, 34px controls / 40px edited / 44px actions, **132px dates, 120px money**, em dash
for missing, the **gear column chooser**, KPI tiles across at 78px and never stacked at 216px, Save
and Close on anything that opens. Filter text and control sizes come from the rendered boards in
`docs/design/boards`, not from whatever the page has today.

---

## ASSIGNED BY LANE — EVERY SURFACE NAMED, NOTHING LEFT TO INTERPRETATION

### CC-3 — 18 of 18 — THE CATALOG AND NAME LISTS (your lane, you already own lists/**)
```
lists/accounting/ChartOfAccountsListPage.tsx        lists/safety/CargoClaimReasonsListPage.tsx
lists/accounting/VoidCancelReasonsListPage.tsx     lists/safety/CivilFineTypesListPage.tsx
lists/dispatch/LoadCancellationReasonsListPage.tsx lists/safety/CompanyViolationTypesListPage.tsx
lists/dispatch/LoadExceptionReasonsListPage.tsx    lists/safety/ComplaintTypesListPage.tsx
lists/drivers/TerminationReasonsListPage.tsx       lists/safety/DotViolationTypesListPage.tsx
lists/fleet/FleetCatalogListPage.tsx               lists/safety/InternalFineReasonsListPage.tsx
lists/fuel/FuelCatalogListPage.tsx                 lists/names/BrokersListPage.tsx
lists/maintenance/MaintenanceCatalogListPage.tsx   Documents.tsx
Drivers.tsx                                        samsara-driver-mapping/SamsaraDriverMappingPage.tsx
```
`ChartOfAccountsListPage` is the one to get exactly right first — it is the chart of accounts and the
account-number column stays hidden by default per `verify-account-number-hidden-by-default`.
`catalogs.load_cancellation_reasons` is the canonical table; **never** `catalogs.cancellation_reasons`.

### CC-2 — 9 of 9 — ACCOUNTING AND BANKING SURFACES (your lane)
```
accounting/AccountRegisterPage.tsx          banking/DepositDetailPage.tsx
accounting/ExpenseDetailPage.tsx            banking/MakeDepositPage.tsx
accounting/ReclassifyTransactionsPage.tsx   banking/ReconciliationWorkspace.tsx
accounting/batch/BatchExpensesPage.tsx      banking/components/NeedsCategorizingQueue.tsx
banking/components/DriverEscrowBoardSection.tsx
```
These are money lists: **`MoneyListToolbar`**, not the universal one — one-select and multiselect
rules apply and `verify-money-list-toolbar-one-and-multiselect` is in the gate. Money columns 120px,
dates 132px, `tabular-nums` wherever digits line up. `DriverEscrowBoardSection` is **driver escrow —
a 2100-series current liability, nothing to do with Faro**; do not let a factoring filter or a reserve
column near it.

### CC-1 — 4 of 4 — DRIVER PAY, CASH ADVANCES AND THE DISPATCH TABLES (your lane)
```
driver-finance/BatchSettlementsPage.tsx     dispatch/RoundTrips.tsx
cash-advances/components/AdvanceDetailDrawer.tsx  dispatch/components/UnitsWithoutLoadTable.tsx
```
`BatchSettlementsPage` is where deadhead is already wrong (ROUND 288.3 item 2 of 5) — fix the filter
and the mileage definition in the same pass, not two passes. Write to `driver_finance.*`, never
`payroll.*` or `settlement.*`.

### CURSOR — 4 of 4 — LEGAL, SAFETY TABLES AND THE FEED GATE (your lane)
```
legal/alerts/LegalDeadlineAlertsPage.tsx    safety/components/DrugAlcoholTable.tsx
feed-gate/FeedGatePage.tsx                  safety/components/TrainingTable.tsx
```
`LegalDeadlineAlertsPage` renders severity, kind, due and days — it needs the date range on `due_at`
and the 132px date column; it currently has neither.

### NOT LIST SURFACES — LEAVE THEM ALONE, NOBODY TOUCHES THESE FOR FILTERS
`home/OwnerHome.tsx`, `home/roles/AccountingHome.tsx`, `home/roles/DefaultHome.tsx`,
`program/*` (6 files), `admin/ObservabilityPage.tsx`, `dispatch/PlannerCalendarPage.tsx`,
`dispatch/TripPairingBoardPage.tsx`, `dispatch/components/BookLoadModalV4.tsx`,
`safety/driver-scheduler/DriverSchedulerGridPage.tsx`, `tasks/TaskPlannerGrid.tsx`.
They are dashboards, boards, grids and a modal — a list toolbar on a calendar is noise. **If a seat
converts one of these it is reverted.**

---

## WHAT "DONE" MEANS ON A FILTER SURFACE — ALL FOUR, NO PARTIAL

1. The house toolbar, with `columns` declared for real and range columns derived from
   `inferUniversalRangeColumns()` — **not a hand-rolled input**.
2. **`resultCount` of `totalCount` shown.** A list that cannot say how many of how many it is showing
   is not done.
3. The filter is **server-side wherever the list is paged or capped** — a client-side filter over a
   capped page silently lies about the result count. Where the list is capped, `CappedListNotice`
   says so.
4. **Every filter column backed by a real indexed column.** Search the DB before you declare a filter:
   a filter on a column that does not exist, or on a derived value computed in the browser, is theatre.
   `verify-no-money-theater` and `verify-declared-is-rendered` are both in the gate.

## KPIs ON THE SAME SURFACES

Tiles across at 78px, never stacked at 216px. Every tile drills (`DrillKpiCard` with a real `to`) and
the drill target applies the **same** filter the tile counted — a tile that counts one set and drills
to another is the defect. A tile's number and its list's `resultCount` for the same filter must agree,
derived from one query. **No tile shows a number the list cannot reproduce.**

## STANDING

Nobody posts transactions, seeds, feeds, matches or categorizes. Build only. Each seat completes 100%
of its own list — **no handoffs.** The owner verifies in Chrome when every build is complete; nobody
else verifies. No `--no-verify`, no baseline additions, no `ALLOW_OFFLINE_SKIP` on a money guard.
Designs identical to the rendered boards, not to what the app looks like now.

REPORT per seat: PR numbers, gate exit 0, the deploy SHA, and for each surface the one line
`<file> — toolbar: <which> · range: <column+kind> · count: <result/total> · server-side: yes/no`.
