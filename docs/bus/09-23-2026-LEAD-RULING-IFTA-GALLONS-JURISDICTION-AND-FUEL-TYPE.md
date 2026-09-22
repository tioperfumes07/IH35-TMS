# LEAD RULING — IFTA-GALLONS-01: the quarterly return was understating taxable gallons by 16.5%

**Issued:** 2026-09-23 01:15 CT (06:15 UTC) · Lead
**Authorises:** a lane cross into `scripts/verify-*.mjs` (CC-1) for one NEW file, and Lead execution
in `apps/backend/src/ifta/**`, which is currently declared in NO lane.

## What was wrong — two defects in one query, measured live

`apps/backend/src/ifta/ifta-state-gallons-aggregator.ts` is the single source of per-jurisdiction
gallons for the IFTA quarterly preparer (`ifta-quarterly-preparer.routes.ts:171`) and for
`reports/ifta/fuel-aggregator.service.ts`.

**Defect 1 — gallons silently dropped.** It built three CTEs (`relay`, `loves`, `dispatch`)
partitioned by `source`, UNIONed them, then applied
`DISTINCT ON (state) ... ORDER BY state, priority`. That keeps ONE source per jurisdiction and
discards the other two. Those three populations are **disjoint real purchases**, not competing views
of the same purchase, so any state that bought fuel on more than one rail lost gallons. `relay` and
`loves` also overlapped (both could match `source='import'`), so a single row could be counted under
either label depending on priority.

**Defect 2 — DEF taxed as motor fuel.** The file never referenced `fuel_type` at all. DEF (urea) is
an emissions consumable, not a motor fuel, and is not reportable as taxable fuel.

## Measured, live, USMCA (`tiny-field-89581227` / `br-fancy-credit-akjnd07a`, `app.bypass_rls='lucia'`)

```
fuel.fuel_transactions, archived_at IS NULL
  diesel          442 rows   $264,165.76    46,994.85 gal
  def             178 rows     $5,635.24     1,105.75 gal
  reefer_diesel     5 rows     $1,698.26       315.14 gal
  TOTAL           625 rows   $271,499.26
```

```
IFTA reported (old query)      39,258.24 gal
Correct taxable (diesel)       46,994.85 gal
UNDERSTATED BY                  7,736.61 gal   (16.5%)
```

The understatement from Defect 1 is **seven times larger** than the 1,105.75-gallon overstatement
from Defect 2. They were partially masking each other.

**Five phantom jurisdictions.** KY, PA, CO, IA and OH appeared on the return carrying **DEF gallons
only and no taxable fuel at all** — KY 19.70, PA 8.01, CO 6.08, IA 4.40, OH 1.00. The return named
jurisdictions where no taxable fuel was purchased.

## The fix

One scan, each row counted exactly once, grouped by jurisdiction; the source label is derived per
row for reporting only and never partitions the sum. `fuel_type` filtered to `('diesel','gas')`.

**Verified:** the new query returns **46,994.85 gallons** — the correct taxable diesel total, to the
cent — across 17 jurisdictions (was 23, the six dropped being the five DEF-only phantoms plus IN).
All 25 existing IFTA tests pass unchanged.

`reefer_diesel` (315.14 gal) is **excluded pending a documented per-row determination**, tracked as
IFTA-GALLONS-02. Fuel burned in a separate refrigeration unit is not taxable highway fuel; reefer
diesel drawn from the tractor's own tank is. Excluding it understates rather than overstates the tax
base, which is the safe direction to hold while the receipts are read. It is not to be silently
folded in.

## STILL OPEN — IFTA-GALLONS-03, and it is larger than either defect above

**28,635.54 gallons (61% of all diesel gallons) carry no jurisdiction** — 169 `import` rows and 84
`manual` rows with a null `location_state`. A return cannot be correct with 61% of its gallons
unallocated.

The owner states the address is in the source files, and the data confirms it: `location_city` is
not a city at all, it holds the **street address**, and many carry the state inside the string —
`135HWY44ENCINAL,TX, TX`, `11700I-30LITTLE ROCK AR,`, `182CLAIBORNE ROAD, MS`, `20HWY607PICAYUNE,MS,`.
251 of the 253 rows carry that address, and all 253 carry a `vendor_id`.

Measured recoverability from the address string already in the database:

```
recoverable by embedded state code     63 rows    7,098.52 gal
still needs the source documents      190 rows   21,537.02 gal
```

The source documents exist and carry explicit jurisdiction columns:
- `~/Downloads/IH35-MASTER-RECONCILIATION/04-FUEL/09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv`
  — header: `Transaction Date, Driver Name, Unit Number, Card Number, Location, City, State, Quantity, Unit Price, Gross, Discount, Amount, Fees`. It has a real **`State`** column.
- `~/Downloads/IH35-MASTER-RECONCILIATION/04-FUEL/09-05-2026-LOVES-604-STORES-SEED.csv`
  — `store_no, city, state, lat, lng, …` for 604 Love's stores, so a store number resolves a jurisdiction directly.

**Assigned to CC-3** (`fuel.*` is his lane). This is a tax-base assignment, so: match on
date + unit + quantity + amount against the statement's own `State` column, never on a regex guess
alone; where the statement does not cover a row, resolve the Love's store number against the seed;
where neither resolves it, leave `location_state` NULL and report the residual rather than guessing a
jurisdiction. A wrong state is worse than a missing one — it moves tax between jurisdictions.

## Lane

`apps/backend/src/ifta/**` is in **no lane** in `docs/bus/LANES.md` — the same gap
`.github/workflows/**` had. It is fuel/tax and belongs with CC-3, but this ruling does **not** move
it; it authorises this single Lead-executed fix and names the gap for a follow-up declaration so the
lane table is not edited under time pressure while three seats are mid-branch.

`scripts/verify-ifta-excludes-non-highway-fuel-types.mjs` is a NEW file in CC-1's
`scripts/verify-*.mjs` lane. It conflicts with nothing he has in flight. If it collides with his
branch, his resolution wins provided the guard survives; if it does not survive, this ruling is void
and re-issued.

## Guard

`scripts/verify-ifta-excludes-non-highway-fuel-types.mjs` — static, no `DATABASE_URL`, never skips.
It asserts the query **shape** that made the totals wrong (fuel_type consulted; no `DISTINCT ON
(state)`; no source-priority partition) and deliberately asserts **no dollar or gallon total**, since
those move with real business daily while the broken shape does not. Selftest 5/5, including a case
proving a comment naming the old shape cannot trip it.

— Lead
