# Software Map — what the complete inventory found

**Git path:** `docs/lockdown/IH35-SOFTWARE-MAP/` · open [`INDEX.html`](./INDEX.html) then [`map/IH35-SOFTWARE-MAP-COMPLETE.html`](./map/IH35-SOFTWARE-MAP-COMPLETE.html).

Built September 2, 2026 from commit 5ee312cf0. Every count was read out of the source and then checked against the live production database. The interactive map is `IH35-SOFTWARE-MAP-COMPLETE.html`.

## What the software contains

| | Count |
|---|---|
| Screens (routes) | 584 |
| Modals and drawers | 150 |
| Interface endpoints | 2136 |
| Backend files that touch the database | 1046 |
| Tables and views the backend references | 634 |
| Schemas in production | 76 |

## Two corrections to what I previously reported

**The earlier map was mostly blank and I did not say so.** Of the 575 routes it listed, 546 had no source file, 509 had no screen name, and 454 had no component. The extractor was reading the outermost wrapper element instead of the screen inside it. Fixed: all 584 routes now resolve to a named screen and a real source file, none blank.

**My first severity ranking of the database gaps was wrong.** I listed 16 objects as High — code asking for tables that do not exist. I then opened each one. Every single one is either guarded at runtime, sitting in a file that is never mounted, or a name my extractor truncated. **Nothing is currently crashing.** I had the list right and the severity wrong, and I would have shipped it that way if I had not gone back and read each call site.

## The gaps, as verified

### Nothing is High

There is no live failure in this list. That is a finding, not an absence of one.

### Medium — 13 features are half built

For each of these the screen exists, the endpoint exists, the code runs, and the table was never created. The code checks whether the table is there and skips it. Nothing crashes. **The operator sees an empty screen and is told nothing.** That is the problem: the software looks like it is working and is silently returning nothing.

- `banking.plaid_items` — 1 backend file(s)
- `banking.reconciliation_drift_alerts` — 1 backend file(s)
- `dispatch.late_arrival_aggregates` — 1 backend file(s)
- `fuel.recommended_stops` — 1 backend file(s)
- `fuel.route_recommendations` — 3 backend file(s)
- `inventory.parts` — 1 backend file(s)
- `maintenance.labor_rates` — 1 backend file(s)
- `maintenance.predictive_alerts` — 1 backend file(s)
- `mdata.customer_health_scores` — 1 backend file(s)
- `qbo.connections` — 1 backend file(s)
- `safety.accident_liabilities` — 1 backend file(s)
- `safety.workers_comp_claims` — 1 backend file(s)
- `telematics.cargo_sensor_incidents` — 1 backend file(s)

### Medium — a health check that can never pass

`/api/v1/health/deep` runs four checks. Two of them query `qbo.connections` and `banking.plaid_items`, which do not exist and are in no migration. The file says so in its own comment. A health check that cannot pass trains everyone to ignore it.

### Medium — 437 screens cannot be linked to

437 of the 521 real screens are not in the deep link manifest. They can be reached by clicking, but a saved or shared link to them is not reliable. Full list is in the map under Gaps.

### Low — dead code still shipping

- `accounting.journal_entry_lines` — referenced only from an unmounted file
- `accounting.qbo_payroll_links` — referenced only from an unmounted file
- `WorkOrderCreateModal` — a modal no screen opens.

### Low — 25 schemas hold objects nothing touches

Listed per schema in the map under Schema coverage.

## Extractor noise that was removed

48 entries the first pass counted as database tables are not database tables: SQL aliases such as `qc.display_name` and JavaScript identifiers such as `process.env`. Each was checked against production and dropped. They are counted nowhere.

## How to use the map

Seven searchable sections: Screens, Modals and drawers, Endpoints, Backend files, Database tables, Schema coverage, Gaps. The chain runs downward — a screen opens a modal, the modal calls an endpoint, the endpoint lives in a backend file, the file touches tables. To answer *if I change this table, what breaks*, search the table name under Database tables.

## What this map does not do

It is a static read of one commit. It does not prove any screen works, does not prove any endpoint returns correct numbers, and does not replace clicking through the software. It tells you what exists and what connects to what.
