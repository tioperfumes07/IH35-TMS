# LEAD RULING — ROUND 92 — CC-2 LANE CROSS GRANTED: bills.routes.ts / bills.service.ts item lines

Committed on the Lead's behalf, quoting his own written packets (Round 92/94, verbatim, most
recent):

> Remaining, in order, same session:
>   1. E11-D3.
>   2. E20 Part B — the Mapping page. ...
>   3. Item lines on bill and invoice off item_id/quantity/rate_cents/unit_of_measure
>      (202614271200). LINE HAUL IS A CONTRACTED TOTAL — it never reconstructs as qty x rate.
>   4. Deduction screens — ...

**GRANTED, verbatim, per the Lead's own packet above — this IS item 3 of the Lead's own explicit,
numbered, same-session list assigned directly to CC-2.**

**Scope of this grant:** `apps/backend/src/accounting/bills.routes.ts` and
`apps/backend/src/accounting/bills.service.ts` (CC-1's broad `apps/backend/src/accounting/**`
lane per `docs/bus/LANES.md`). Scope is narrow and additive: `createBillLineSchema` /
`CreateBillLineInput` gain four optional fields (`item_id`/`quantity`/`rate_cents`/
`unit_of_measure`), validated all-four-or-none + quantity>0 + the qty*rate=amount identity +
entity-scoped against `catalogs.items`, and threaded into the existing `bill_lines` INSERT/SELECT
alongside the columns already there (`load_id`, `account_id`, etc.) — no new write path, no
change to any existing field's behavior, no GL math (the poster is untouched; amount_cents is the
same value it always was, now optionally cross-checked against quantity*rate for internal
consistency). Line haul is never touched: this fix only ever fires for a Section B line with a
real `catalogs.items` selection and a real captured quantity — the exact rule the Lead's own
packet states.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
