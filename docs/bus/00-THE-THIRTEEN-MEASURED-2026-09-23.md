# THE THIRTEEN — MEASURED AGAINST MERGED PRs ON MAIN, 2026-09-23

Measured at `origin/main` = `fc5b2d901b`. Every line below is a merged PR number or an explicit
"not started". Nothing here is read off a status doc.

## COMPLETE — 3 of 13

| # | engine | seat | proof |
|---|---|---|---|
| 9 | the 20 item categories | CC-3 | #22344 — 19 categories, 143 active items, `category_id` backfilled on all 137 pre-existing rows, on `catalogs.qbo_categories` |
| 11 | E15 / E16 extract | CC-3 | #22345 — complete, with one honest unmapped gap named (`vehicle_parts_accessories`), not guessed |
| 12 | E19 test-data sweep | CC-3 | #22345 — re-verified live: every test unit, test driver and `is_sample_data` row already deactivated |

## OPEN — 10 of 13

| # | engine | seat | where it actually stands |
|---|---|---|---|
| 1 | E20 Part A — Samsara mapping backend | CC-1 | migration claim-reserved #22335, CI guard wired #22349. **The resolver, the backfill and the endpoint are not built.** 663 of 758 drivers unmapped. |
| 2 | `loads.routes.ts` — Book Load fully built | CC-1 | not started. Must include driver bills and every real side effect, validate-never-coerce. |
| 3 | `csv-seed-import.ts` extended to USMCA | CC-1 | only the exclusion was reversed (#22332). The extension itself is not built. |
| 4 | deduction chain schema | CC-1 | not started. |
| 5 | E20 Part B — the Mapping page | CC-2 | not started. Blocked on #1, which is why #1 is CC-1's first item. |
| 6 | item lines on screen | CC-2 | **substantially landed** — #22341 plus the Driver Settlement Detail fuel section, live-proved on real rows (load 13609 diesel 115.0 gal @ $6.68 = $684.94; load 13613 DEF 4.7 gal @ $4.89 = $22.98). Remaining: bill and invoice lines rendered off Cursor's new `item_id/quantity/rate_cents/unit_of_measure` columns (migration 202614271200, #22337). |
| 7 | E11 boards D2 → D4 → D3 | CC-2 | **D2 landed** #22350. D4 and D3 not started. |
| 8 | deduction screens | CC-2 | not started. Waits on #4. |
| 10 | **E10 — the void paths / void runner** | CC-3 | **in flight, and it is now the critical path** — see `09-23-2026-LEAD-FINDING-THE-PURGE-CANNOT-DELETE-THE-DATABASE-IS-WORM.md`. The database refuses DELETE on financial rows by design, so the purge IS a mass void. |
| 13 | Cursor's four | Cursor | **13a E7 batch 2** — batch 2a landed #22327 (48 skip-list guards fail closed, db-skip 154 → 102), remainder open. **13b I-DEDUCT** not started. **13c E9 `display_id`** not started. **13d reconciler backend half** not started (I2 and I8 landed earlier, #22313). |

## THE HONEST HEADLINE

**3 complete. 10 open.** Two of the ten are more than half done (#6, #7). One of the ten —
**#10, the void runner** — is no longer one item among thirteen. It is the operation the feed
is actually waiting on, because the purge cannot delete.

## WHAT IS NOT ON THIS LIST AND IS ALSO OWED

- The `historical_backfill` write path for `driver_bill` and `escrow_ledger`. CC-3 found the
  gap honestly: loads and invoices have one, driver finance does not. **The feed cannot run
  without it** and it is on nobody's four.
- `cash_rsv`, `dispatch`, `sch_fee` — three real Faro deductions the export carries and nothing
  in this codebase captures. The funding identity holds 82 of 82, so all three are proven real.
- The `docs.files` purge predicate — 475 rows, 263 regenerable load artifacts, the rest
  compliance evidence that survives.
