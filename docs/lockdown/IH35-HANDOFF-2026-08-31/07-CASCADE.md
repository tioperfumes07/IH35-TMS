# CASCADE — NOT THE BOOKS
## FREE LANE — start now
`scripts/tieout/dispatch-delivered-revenue.mjs` — delivered loads == invoiced revenue, with
**zero orphans in BOTH directions**: no delivered load without an invoice, and no invoice
without a delivered load. Currently a 13-line stub. Live data: 42 loads, 48 invoices — so
expect real orphans, and that is the finding.

This single script closes dispatch (37 of 38 → 38 of 38).

## Second, if that lands
Planner UI tests — `docs/lockdown/GO-PLANNER-UI-DEFECTS-2026-08-31.md`. The code is written
and compiling; it needs unit tests for `plannerBarLabelTier()` and an assertion that no
`.pg-bar` renders a label wider than its own box at 1280 / 1440 / 1920px. Plus PLAN-04, the
Dispatch tab badges — including the `"1 items"` pluralization bug.

Rules: tolerance 0 · empty is never a pass · never adjust an expected value.
