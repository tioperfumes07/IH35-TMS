# LEAD RULING — ROUND 86C — CC-2 LANE CROSS GRANTED: company-settlement-report.service.ts (item lines)

Committed on the Lead's behalf, quoting his own written packet
(`~/Downloads/09-23-2026-ALL-SEATS-FINISH-ALL-13-BEFORE-THE-FEED.md`, 2026-09-23) which assigned
item #6 ("item lines on screen") to CC-2 by name, as one of CC-2's four items required before the
feed.

**GRANTED, verbatim, per the Lead's own Round 86/"FINISH ALL 13" packet:**

> CC-2   5. E20 Part B — the Mapping page             (before the merge)
>        6. item lines on screen — item | qty | rate | amount, amount read-only, dash never zero
>        7. E11 boards D2 -> D4 -> D3
>        8. deduction screens — reason + fault picker, dispute toggle, recovery register
>
> ITEM LINES ON SCREEN — and this is now a FEED DEPENDENCY, not cosmetics. The owner's law is
> "if I cannot open it in Chrome and click it, it is not done." If the feed writes gallons x
> price-per-gallon and the screen shows a flat amount, he cannot verify day 1 — he would be
> trusting a gate's exit code instead of his own data. item | description | QTY | RATE |
> AMOUNT, amount computed and read-only. Diesel shows gallons and cost per gallon. DEF its own
> gallons. Loaded/empty miles show miles and CPM. Blank is a dash, never a zero.

**Scope of this grant:** CC-2 may author the additive-only column change (fuel_type,
price_per_gallon) in `apps/backend/src/accounting/company-settlement-report.service.ts` — CC-1's
lane per `docs/bus/LANES.md` (`apps/backend/src/accounting/**` is broadly CC-1's; this file is
outside CC-2's `accounting/invoices**`/`accounting/daily-close**`/
`accounting/factor-reconciliation/**` carve-outs) — and nothing else in CC-1's lane. The frontend
half (`apps/frontend/**`, including `pages/driver-finance/**`) is already SHARED per
`docs/bus/LANES.md`'s own SHARED section and needs no cross; declared here per that section's own
"say so in the PR body" rule — screen: Driver Settlement Detail, new "Fuel purchases" item-line
section.

No new GL math, no schema change: `fuel.fuel_transactions.fuel_type` and
`.price_per_gallon` are pre-existing real columns, never before selected by this read model.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
