# LOAD TEST BASELINE — 2026-06-08

## Block
- `BLOCK-08 (TIER2-LOAD-TEST)`

## Scope Delivered
- Added four k6 workloads in `tests/load/`:
  - `dispatch-board-realtime.js` (50 concurrent dispatcher sessions)
  - `driver-pwa-sync.js` (300 concurrent PWA sync sessions)
  - `invoice-creation-burst.js` (100 invoice creates/min for 10m)
  - `qbo-sync-backlog.js` (1000 backlog operations)
- Added nightly workflow `load-test-nightly.yml` with pull-request smoke mode.
- Added migration `db/migrations/202606080205_load_test_runs.sql` for historical run storage in `ops.load_test_runs`.

## Threshold Contract
- GET endpoints: `p95 < 500ms`
- POST endpoints: `p95 < 1000ms`
- QBO sync endpoints: `p95 < 5000ms`

## CI Smoke Baseline (PR / dispatch smoke mode)
Smoke mode runs reduced load to validate script behavior and endpoint reachability in CI where full production credentials may not be available.

| Workload | Mode | Target threshold | Baseline interpretation |
| --- | --- | --- | --- |
| Dispatch board realtime | Smoke profile | GET p95 < 500ms | Gate enforces threshold in k6 options |
| Driver PWA sync | Smoke profile | GET p95 < 500ms | Gate enforces threshold in k6 options |
| Invoice creation burst | Smoke profile | POST p95 < 1000ms | Gate enforces threshold in k6 options |
| QBO sync backlog | Smoke profile | QBO p95 < 5000ms | Gate enforces threshold in k6 options |

## Notes
- Smoke runs are a CI safety check and **not** the final capacity benchmark.
- Nightly schedule executes the same scripts with full profile (`K6_SMOKE=0`) using repo secrets.
- Full nightly outputs should be persisted to `ops.load_test_runs` by follow-up run ingestion tooling.

## Regression Rule
- Any nightly p95 regression greater than 20% versus prior baseline should be treated as a fail condition and investigated before release promotion.
