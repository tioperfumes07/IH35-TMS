# API — Settlement close routes, and what `weekly-close` actually is

Owner asked, 2026-09-30: **"What is the weekly close route? Our tours are not weekly."**

Answered from live production (`br-fancy-credit-akjnd07a`, USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`,
read under `SET LOCAL ROLE neondb_owner` + `SET LOCAL app.bypass_rls = 'lucia'`) and from the current
code on `main` — not from memory.

---

## 1. How USMCA actually settles: load-bookended (the tour)

A settlement opens on a driver's first load of a tour and closes on his last. It is not a calendar
period. `driver_finance.driver_settlements` carries `first_load_id` / `first_load_number` /
`last_load_id` / `last_load_number`, and the engine is
`apps/backend/src/driver-finance/settlements-load-bookended.service.ts`
(`openLoadBookendedSettlement`, `pingSettlementOnLoadEvent`, `closeSettlementForFinalLoad`).

**Measured live:**

| | |
|---|---|
| settlements | 67 |
| **load-bookended** (`first_load_id` present) | **65** |
| not bookended | 2 |
| period range on file | 2026-07-03 → 2026-09-25 |

Nine of the ten most recent settlements have `period_end = period_start` — a **0-day span**. One
has a 7-day span. The periods follow the tour, exactly as the owner says.

## 2. `POST /api/v1/settlements/weekly-close`

**File:** `apps/backend/src/driver-finance/weekly-close.routes.ts`
**Registered:** yes — `apps/backend/src/index.ts` registers `registerWeeklyCloseRoutes`. The route is
live in production.

**Body:** `{ weekStart: "YYYY-MM-DD", operating_company_id: <uuid> }`
**Window:** `weekStart` … `weekStart + 6 days`. Fixed 7 days. Not configurable.
**Auth:** session required, plus an office role — `Owner, Administrator, Manager, Accountant, Payroll`
(`WEEKLY_CLOSE_WRITE_ROLES`). Rate limited to 10/min.

**What it does:** for **every** authorized active driver in the company, it builds a draft settlement
(`driver_finance.driver_settlements`, `status = 'presettle'`) for that 7-day window. It reuses the
canonical helpers in the canonical order — contract terms → auto-deductions → net-floor deductions →
`aggregateSettlementTotals` — so the money math is the same math the load-bookended close uses. It is
the *period shape* that differs, not the arithmetic.

**Who calls it:** **nothing.** Grep across `apps/frontend/src` returns zero references to
`weekly-close` or `weeklyClose`. The only callers on disk are its own test file and the
`verify-weekly-close-role-gated.mjs` guard fixture.

## 3. The honest read

This is a live, role-gated endpoint that **bulk-creates real draft financial documents for every
driver** on a 7-day cadence the company does not use, and no screen in the app invokes it. It is not
firing on its own — there is no cron behind it — so nothing is being created today. But it is one
authenticated POST away from writing a set of settlements on the wrong period shape, and the office
roles that can reach it are the same roles that do the real settlement work.

**Recommendation (owner decides):** flag-gate it OFF for USMCA, or remove the registration, and keep
the load-bookended close as the single settlement path. I have not done either — deleting or disabling
a route is the owner's call, not mine. Say the word and it is done in the same session.

## 4. Related: what the driver sees on his settlement

Owner ruling, same day: **"The driver just needs to know the miles he is being paid, not short,
driven or practical. That is for us."**

Implemented in `driverBillRowsToSettlementLoads`
(`apps/backend/src/driver-finance/settlements.service.ts`): the driver document prints the mileage he
is paid on and the rate, plain — no basis suffix, no effective-rate marker. The basis
(`miles_basis_type`) and the effective-rate flag (`rate_is_effective`) are still resolved by the query
and still ride on the row, for the company settlement, the audit trail, and any internal report that
must state which mileage it counted. Guarded by
`scripts/verify-settlement-legs-carry-lane-and-source.mjs` (verify-step 11841), which now fails in
*both* directions: if the source stops being resolved, and if either label leaks onto the driver's
document.
