# LEAD RULING — Cursor lane-cross: purge EMPTY BY PURGE for load-costs + required-CI exit 75

**Date:** 2026-10-08  
**Lead:** Cursor  
**Lane cross:** UNASSIGNED purge-window registry + required-live runner (normally Lead/CC-3 harness)

## Why

Post-merge `required-live-load-guard` is permanently red during the owner seeding freeze:

1. `verify-load-costs-wizard-amounts` throws on `open_dispatch count 0` even though USMCA loads are empty **by order** (same measured-empty class as `verify-draft-load-saves-and-is-visible`).
2. `scripts/lib/run-required-guards.mjs` treats `EMPTY_BY_PURGE_EXIT` (75) as a hard failure, so allowlisted guards that correctly exit 75 (`verify-control-totals`, `verify-alwaystrack-parity`, …) still fail the required CI batch. `money-pr-local-gate` already accepts 75 for `PURGE_WINDOW_GUARDS` when the window is open — the CI runner must match.

## Authorization

Cursor may:

1. Add `verify-load-costs-wizard-amounts` to `PURGE_WINDOW_GUARDS` + `MEASURED_EMPTY_GUARDS` and call `exitIfMeasuredEmptyByPurge` when measured open_dispatch live rows = 0.
2. Teach `runRequiredGuards` to accept exit 75 only for `PURGE_WINDOW_GUARDS` while `purgeWindow().open`, counting them as passed (named EMPTY BY PURGE), matching money-pr-local-gate.

Not an endorsement of fake green: the first live open_dispatch row ends the load-costs exemption; unauthorized exit 75 still fails closed.
