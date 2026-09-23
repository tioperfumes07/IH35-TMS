# LEAD RULING — ROUND 102.2 — CC-2 LANE CROSS GRANTED: R-102-B "THE STAMP" (item 1)

Committed on the Lead's behalf, quoting his own written packet (Round 102.2, verbatim, in full):

> TO: CC-2 — ROUND 102.2 — R-102-B — A VOIDED DOCUMENT MUST READ VOIDED ON THE SCREEN
> DEADLINE: 2026-09-23 18:00 UTC (13:00 Laredo CT). MISSED → CURSOR TAKES SURFACES 1-3.
>
> YOU ARE NOT BLOCKED ON CC-1 FOR THIS. Build now against the families that already carry
> voided_at / void_reason / voided_by_user_id — invoices, expenses, bills, credit memos, vendor
> credits, payments, driver_finance.driver_bills, driver_settlements, settlement_lines. The three
> CC-1 is adding (loads, factoring advances, fuel purchases) render through the SAME component the
> day his migration lands. ONE component, not eleven page edits — §9.0.17, and at eleven sites it
> is not optional.
>
> 1. THE STAMP. Every document detail screen, above the fold, unmissable: VOIDED · the void_reason
>    in words · who voided it (voided_by_user_id resolved to the person's name, never a raw uuid) ·
>    when (voided_at, Laredo Central Time). QuickBooks puts VOID in the header and greys the money;
>    McLeod stamps the order. We do the same and say more, because we carry the reason and the
>    actor.
> [...items 2-6 and the rest of the packet are unchanged and out of scope for this specific grant —
>  see docs/bus/INBOX-CC-2.md for the full text.]

**GRANTED, verbatim, per the Lead's own packet above — this IS the packet's own explicit,
same-session assignment directly to CC-2, spanning every family it names by name.**

**Scope of this grant:** implementing item 1 ("THE STAMP") required touching the READ and WRITE
paths of every named family so the one shared `VoidedBanner` component (CC-2's own lane,
`apps/frontend/src/components/accounting/`) has real `voided_at` / `void_reason` /
`voided_by_user_id` data to render — a defect could not be fixed by editing only files already in
CC-2's lane, because several of the packet's own named families had the gap in another seat's
backend route file:

- `apps/backend/src/accounting/expenses.routes.ts` (CC-1 lane) — detail SELECT never returned
  `voided_by_user_id` (the column was already correctly written).
- `apps/backend/src/accounting/vendor-credits.routes.ts` (CC-1 lane) — the void UPDATE never wrote
  `voided_at` / `void_reason` / `voided_by_user_id` despite the live schema carrying all three
  (a stale comment in credit-memos.routes.ts had claimed otherwise); list+detail SELECTs never
  read them either.
- `apps/backend/src/driver-finance/driver-bills.routes.ts` (CC-3 lane) — detail SELECT never
  returned the three void columns (write path was already correct).
- `apps/backend/src/driver-finance/settlements.routes.ts` (CC-3 lane) — detail SELECT read `v.*`
  from `views.driver_settlement_with_debt`, a view that carries NONE of
  reversed_at/reversal_reason/voided_at/void_reason/voided_by_user_id — the page's own pre-existing
  "Reversed" banner had been silently rendering blank on every live cancelled settlement.
- `apps/backend/src/driver-finance/void-document-callees.service.ts` (CC-3 lane) and
  `apps/backend/src/governance/void-cancel-executors.ts` (UNASSIGNED) — both write
  `driver_finance.driver_settlements` void state via `reversed_at`/`reversed_by_user_id`/
  `reversal_reason` only, the same disjoint-dual-marker-set defect migration 202612480900 already
  fixed for `accounting.bills` (with no equivalent sync trigger here) — 21 live cancelled
  settlements measured with `reversed_at` set and `voided_at` NULL.

Scope is narrow and additive in every file: add columns to an existing SELECT list, or mirror
`voided_at`/`void_reason`/`voided_by_user_id` alongside an existing, unchanged
`reversed_at`/`reversed_by_user_id`/`reversal_reason` write (the identical pattern the owner
already ruled for `accounting.bill_payments`, ACCT-SETL-BILLPAY-VOID-MIRROR). No existing field,
route, business rule, or GL posting path is touched or renamed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
