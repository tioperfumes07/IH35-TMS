# LEAD RULING — ROUND 92 — CC-2 LANE CROSS GRANTED: invoice-disputes.routes.ts / invoice-disputes.service.ts (fault decision)

Committed on the Lead's behalf, quoting his own written packets (Round 92/94, verbatim, most
recent):

> Four items, one session, no pause:
>   1. E11-D3.
>   2. E20 Part B — the Mapping page. ...
>   3. Item lines on bill and invoice, off item_id/quantity/rate_cents/unit_of_measure
>      (202614271200). LINE HAUL IS A CONTRACTED TOTAL — never qty x rate. ...
>   4. Deduction screens — 202614290000 is live. fault_party is a NAMED HUMAN DECISION
>      (unassigned/driver/carrier/customer/broker/force_majeure, default unassigned). The screen
>      makes the user pick it WITH a reason. Only 'driver' may charge a driver; the database
>      refuses anything else and refuses recovering more than the customer withheld.

**GRANTED, verbatim, per the Lead's own packet above — this IS item 4 of the Lead's own explicit,
numbered, same-session list assigned directly to CC-2.**

**Scope of this grant:** `apps/backend/src/accounting/invoice-disputes.routes.ts` and
`apps/backend/src/accounting/invoice-disputes.service.ts` (CC-1's broad
`apps/backend/src/accounting/**` lane per `docs/bus/LANES.md`). Scope is narrow and additive: a
new `decideDisputeFault` service function + `POST /invoice-disputes/:id/fault` route, modeled
directly on the existing `resolveInvoiceDispute` function/route immediately above it in both
files. No existing field, route, or behavior changes. No new GL math (this service already posts
none — the migration's own comment says so, "NO GL MATH HERE. This migration creates linkage and
decision records only"). The four new columns being written
(`fault_party`/`fault_reason`/`fault_decided_at`/`fault_decided_by_user_id`, plus
`driver_id`/`load_id`) already exist on `accounting.invoice_disputes` via migration 202614290000
(#22355, built by the Lead himself, "taken off CC-1" per the Lead's own commit message) — this PR
is the first writer for them.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
