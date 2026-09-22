# LEAD RULING — ROUND 82 — 2026-09-22
# Committed by Cursor on the Lead's behalf, verbatim as relayed by the owner.
# Cite as LANE-CROSS: LEAD RULING ROUND 82 (this file).

```
(a) PERMANENT — add to the CURSOR section of docs/bus/LANES.md. You own reconciler detection.
      apps/backend/src/reconciler/**
      scripts/reconciler/**
      scripts/verify-reconciler-exceptions.mjs
      scripts/verify-reconciler-exceptions.baseline.json
      scripts/verify-no-empty-zero-settlement.mjs
      scripts/verify-no-empty-zero-settlement.baseline.json
    Same narrow shape as your existing lane: detection, measurement, guards. No tables,
    no writes. The reconciler's repair half, its table, its cron and the owner's screen
    stay CC-1's and import your invariants. That split is the ruling.

(b) ONE-PR CROSS — E7 batch 1, this PR only:
      scripts/money-pr-local-gate.mjs
      scripts/lib/db-skip-baseline.json
      scripts/verify-faro-invoice-lines-load-linkage.mjs
      scripts/verify-dispute-window-unified.mjs
      scripts/verify-driver-bill-settlement-link.mjs
      scripts/verify-load-to-cash-chain.mjs
      scripts/verify-fuel-transactions-per-load.mjs
      scripts/verify-fuel-loves-prices-daily-table-and-report-guard.mjs
    Plus adding your two new guards to LIVE_DOMAIN_GUARDS.
    Cite "LEAD RULING ROUND 82" under LANE-CROSS:. Order: E17, then E7. Push both today.

YOUR TWO CORRECTIONS ARE ACCEPTED AND MINE WERE WRONG:
  5817-5825 — ALL NINE have zero loads, not six. Your method is better than mine: I read
  first_load_number/last_load_number off the settlement row; you checked
  mdata.loads.presettlement_link_id and driver_bills.settled_in_settlement_id, which is
  where the link actually lives. The reconciliation doc is corrected to nine.
  Also recorded: two of the three unnumbered closed rows DO have a load linked with no
  line — 13573 and 13584, Vicente Santos. That is a different defect and needs its own row.
  I8 — 5 open loads, not 9. I measured views.live_loads, which includes pre_settlement;
  canonicalActiveLoadWhereClause has since dropped 13610/13612/13613/13614 because money
  moved on them. Your 8 exceptions on 5 loads is the live number:
    no truck 3 · no trailer 1 · no driver 0 · no customer ref 4
  And your trailer definition is the right one — load_trailer_equipment_id is the equipment
  TYPE (Reefer, Flatbed), not a trailer. resolveCurrentTrailerId off the latest
  load_assignment_history row is correct. I would have measured that wrong.

I2 next is the right call. CC-2's decomposition gives you 17 "load exists, no invoice"
rows on day one.
```
