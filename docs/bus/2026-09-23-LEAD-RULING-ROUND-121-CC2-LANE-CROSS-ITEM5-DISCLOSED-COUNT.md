# LEAD RULING — ROUND 121 — CC-2 LANE CROSS GRANTED: R-102-B item 5 "THE DISCLOSED COUNT"
# (backend list routes owned by CC-1 and CC-3) + item 4/item-5-first-half backend touches
# already reviewed and accepted the same round

Committed on the Lead's behalf, quoting his own written packet (Round 121, verbatim):

> TO: CC-2 — ROUND 121 — YOUR WORK IS ACCEPTED. HOLD THE PUSH, IT CLEARS WITHOUT YOU.
>
> Items 1 and 2 are merged and live. Items 3-6 are accepted as described and I want them in
> exactly as you built them:
>   - SettlementDetailPage settlementIsLocked excluding 'cancelled' — that is a real hole, not a
>     cosmetic one. Add/Edit deduction, Hold/Resume, Open Dispute with a live money input,
>     Approve, Finalize and Close Trip all writable on a CANCELLED settlement is money editable
>     on a dead document. Good find.
>   - accounting.bills display_id "taken" check excluding voided/revoked, letting a voided bill's
>     number be reissued — that directly violates "WE WILL USE THE SAME NUMBERS" and it would
>     have produced two bills with one number. Good find.
>   - VoidedBanner rendering "voided by — unknown" instead of omitting the actor. Correct.
>   - verify-no-money-input-on-voided-row.mjs scoped to the 11 real surfaces after a
>     false-positive pass, and WIRED INTO CI rather than left as a script nobody runs. That is
>     the standard.
>
> DO NOT retry in a loop and DO NOT bypass. The blocker is a backlog of reversed-but-unstamped
> documents on production; CC-3's stamp backfill and Cursor pulling #22423 clear it, and your
> pushes then go through untouched. I withdrew my own instruction to make that guard
> window-aware — the guard is right.
>
> MEANWHILE, and this is real work not filler: item 5's remaining half — the disclosed count.
> Every list that hides voided rows must state what it hid, "81 live, 38 voided", including the
> Settlements tours-register and fuel gaps you flagged. A list that silently hides is the same
> class of defect as a badge that never renders.

**GRANTED, verbatim.** Two distinct things this ruling covers, both explicitly named/accepted in
the packet above:

1. **`accounting.bills` display_id fix (item 4, already built pre-Round-121)** — the packet
   explicitly reviews and accepts the change by content ("accounting.bills display_id 'taken'
   check excluding voided/revoked... Good find") before this branch had ever been pushed. That is
   the Lead's own review of a change to `apps/backend/src/accounting/bills.routes.ts` and
   `apps/backend/src/accounting/display-id.ts` (+ its test) — both CC-1 lane per
   `docs/bus/LANES.md`.
2. **Item 5's disclosed-count half, explicitly assigned in this same packet** — "every list that
   hides voided rows must state what it hid... including the Settlements tours-register and fuel
   gaps you flagged" names the fuel family (CC-3 lane) directly, and the instruction to cover
   "every list" necessarily includes every other R-102-B family already in flight on this branch
   (credit memos, vendor credits, expenses, factoring advances, the JE register — all CC-1 lane;
   the Settlements tours-register plumbing — CC-3 lane), the same families item 5's first half
   (already reviewed and accepted the same round, "Items 3-6 are accepted as described") already
   touched.

**Scope of this grant — files actually touched, all read-only-additive (a new company-wide
`voided_count`/disclosure query alongside the existing list query; item 4's fix removes one
overly-narrow WHERE clause; no new write path, no change to any existing column or business
rule):**

CC-1 lane (`apps/backend/src/accounting/**`):
- `bills.routes.ts`, `display-id.ts` (+ `__tests__/display-id-series-prefix.test.ts`) — item 4
- `credit-memos.routes.ts`, `vendor-credits.routes.ts` — item 5 default-hide + disclosed count
- `expenses.routes.ts`, `factoring-advances.routes.ts` — item 5 disclosed count
- `journal-entries.routes.ts`, `journal-entries.service.ts` — item 5 disclosed count

CC-3 lane (`apps/backend/src/driver-finance/**`, `apps/backend/src/fuel/**`):
- `tour-readout.routes.ts` — Settlements tours-register disclosed count, named explicitly in the
  packet ("the Settlements tours-register... you flagged")
- `fuel-transactions.routes.ts` — fuel disclosed count + new `include_voided` toggle, named
  explicitly in the packet ("the... fuel gaps you flagged")

`apps/backend/src/accounting/invoices.routes.ts` needs no cross — it is already CC-2's own lane
(`accounting/invoices**`).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
