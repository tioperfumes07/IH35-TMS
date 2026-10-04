# LANE_CROSS — CC-3 — regclass six fail-closed (Lead/owner ruling, 2026-10-04)

Cited: Lead message "STOP. THE BOOTSTRAP MIGRATION WILL NOT FIX THE SIX REDS … LANE_CROSS GRANTED — all six files … Do NOT raise a baseline."
(The one-time no-verify exception 10-04-2026-LEAD-RULING-BOOT-F396-ONE-TIME-NO-VERIFY-EXCEPTION.md is RETRACTED; hooks stay ON.)

Files: driver-finance/settlement-engine.ts · driver-finance/tour-readout.routes.ts · governance/void-cancel-executors.ts ·
integrations/samsara/fuel-purchase-push.service.ts · maintenance/pm-current-odometer.ts · system/engine-status.reads.ts

Scope: each to_regclass false branch throws `<schema>_<table>_unavailable` (fail closed, model: fuel.loves_prices_daily) or
degrades WITH a signal. No baseline raised. No business logic changed beyond the absent-table branch.
