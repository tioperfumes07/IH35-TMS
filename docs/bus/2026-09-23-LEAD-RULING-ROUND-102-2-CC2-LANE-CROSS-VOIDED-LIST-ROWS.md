# LEAD RULING — ROUND 102.2 — CC-2 LANE CROSS GRANTED: R-102-B item 2 "EVERY LIST ROW" (fuel_purchases)

Committed on the Lead's behalf, quoting his own written packet (Round 102.2, verbatim — the same
packet already cited in full in `docs/bus/2026-09-23-LEAD-RULING-ROUND-102-2-CC2-LANE-CROSS-
VOIDED-STAMP.md`):

> 2. EVERY LIST ROW. Loads, invoices, expenses, settlements, driver bills, factoring advances,
>    fuel purchases, the JE register. A voided row is visibly voided IN THE LIST, not only after
>    you open it. Struck or badged — pick ONE treatment and use it in all of them.
>
> YOU ARE NOT BLOCKED ON CC-1 FOR THIS. Build now against the families that already carry
> voided_at / void_reason / voided_by_user_id ... The three CC-1 is adding (loads, factoring
> advances, fuel purchases) render through the SAME component the day his migration lands.

**GRANTED, verbatim — `fuel_purchases` is named explicitly in the packet's own item-2 family
list, and the packet's own words are "the day his migration lands"; R-102.1-A (CC-1, #22410/
#22411/#22412) landed the void-stamp columns on `fuel.fuel_transactions` mid-session, so this
grant is the packet's own stated trigger firing, not a fresh request.**

**Scope of this grant:** `apps/backend/src/fuel/fuel-transactions.routes.ts` (CC-3 lane per
`docs/bus/LANES.md`). Scope is narrow and read-only-additive: the `GET /api/v1/fuel/transactions`
list SELECT and its row mapping gain `voided_at`/`void_reason` alongside the columns it already
returns — no new WHERE clause, no exclusion filter, no write path, no change to any existing
column, route, or business rule. (Loads and factoring_advances needed no backend change — both
already carry a `cancelled`/`voided` status badge and value in their existing list rows.)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
