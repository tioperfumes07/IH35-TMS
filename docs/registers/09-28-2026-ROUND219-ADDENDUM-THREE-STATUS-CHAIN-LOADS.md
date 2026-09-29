# ROUND 219 ADDENDUM — the three status-chain loads (CC-1, 2026-09-28)

Scope: exactly loads 13624, 13622, 13623 (ROUND 219 DATA FREEZE authorized write #3). No other
`mdata.loads` / `driver_settlements` / `settlement_lines` / `driver_bills` / `accounting.invoices`
row touched.

## 13623 — cancelled load still holding a presettlement: MECHANISM FOUND, FIXED, REPAIRED

**Question asked:** does cancellation fail to release the link, or was it linked after cancellation?

**Answer, confirmed on the live audit trail (`audit.audit_events`, `audit.row_changes`):** linked
first. `driver_finance.presettlement_link.confirmed` fired at booking, 2026-09-28T08:57:46.222Z
(action `create_new`, settlement P-0012 `855834c2-…`). `dispatch.load.cancellation_requested` fired
at 2026-09-28T10:09:49.010Z. The link was never touched between those two events.

**Root cause:** `mdata.loads.presettlement_link_id` is a *forward* pointer, written at
booking/dispatch time by `presettlement-link.service.ts`, before the load has ever been pulled into
a tour close and before any `driver_finance.settlement_lines` row exists for it.
`cancelLoadInClientTx`'s existing `VOID-CASCADE-SETTLEMENTS` step only looks for settlements that
**already have** `settlement_lines` rows for the load being cancelled — i.e. it only ever cleans up
*after* a tour has closed. Load 13623 was cancelled before its tour ever closed (zero
`settlement_lines` existed for it, confirmed live), so that cascade found nothing to do, and the
load's own forward pointer was left dangling, pointing at an open presettlement (P-0012) forever.

**Fix (code):** `apps/backend/src/dispatch/cancellation.service.ts` — added
`VOID-CASCADE-PRESETTLEMENT-LINK-RELEASE`, a new cascade step that clears a cancelled load's
`presettlement_link_id` when (and only when) it has **zero** `settlement_lines` rows — i.e. exactly
the case the existing cascade cannot reach. Audited
(`dispatch.load.presettlement_link_released_by_cancel`). Guarded by
`scripts/verify-cancel-releases-presettlement-link.mjs` (4/4 selftest mutations caught).

No amount, GL account, or settlement total can ever move from this: the scope requires zero
settlement_lines, so nothing about any settlement's numbers is touched.

**Repair (live data, load 13623 only):** re-ran the exact same guarded UPDATE the new code path
runs, live on Neon `br-fancy-credit-akjnd07a`, 2026-09-28. `presettlement_link_id` cleared (was
`855834c2-…`, now NULL); audited. Re-verified after: presettlement P-0012 unchanged (`status=open`,
`gross_pay=net_pay=$606.24`, bookend loads still 13631/13631) — the release touched nothing but the
dangling pointer on 13623 itself.

## 13624 — dispatched, invoice + driver bill exist, presettlement missing: NOT A DEFECT

**Question asked:** find the mechanism — a transition ran and its side effect did not.

**Investigated:** the driver bill (created 2026-09-28T14:54:13Z, `dispatch.load.driver_bill_created`)
became possible only once `miles_shortest` was captured (1929.2, confirmed live) — a separate,
later, unaudited system write filled that field in. The presettlement link is gated on a
**completely different** input: `trip_type` (NB/TR/SB/LOCAL), which `linkLoadToPresettlementAfterAssignmentInClientTx`
correctly refuses to guess (`if (!input.trip_type) { defer; return null; }` —
`presettlement-link.service.ts:686-703`). `trip_type` is still NULL on this load today (confirmed
live). These are two independent completeness gates on two different artifacts; one became eligible
before the other. This is not the "hook never wired" pattern — I checked: the only endpoint that can
set `trip_type` post-booking is the full Edit Load PATCH (`update-load.service.ts`), which has
called `linkLoadToPresettlementAfterAssignmentInClientTx` unconditionally since ROUND 20.1's own fix
(confirmed by reading the route's `transitionBodySchema` at `dispatch/loads.routes.ts:167-181`, which
has no `trip_type` field at all — the status-transition endpoint that minted the driver bill could
never have supplied it). The moment a dispatcher enters `trip_type` via Edit Load, the existing,
already-fixed retry fires automatically. **No code change, no data write, on this load.**

## 13622 — invoiced, driver bill and presettlement both missing: NOT A DEFECT, REAL DATA GAP

Same shape as 13624's presettlement half, plus the driver bill is *also* correctly withheld:
`miles_shortest`, `miles_practical`, `driver_pay_rate_per_mile`, and `trip_type` are **all still
NULL** on this load (confirmed live). `driver_finance.driver_bill.refused_no_shortest_miles` fired
at booking and was never superseded — no later write ever supplied the missing pay inputs, unlike
13624. The invoice exists because the customer-facing rate (`rate_total_cents`) was set at booking
and is a wholly separate precondition from driver pay. **Not fixable without inventing mileage,
pay rate, or trip type — none of which exist anywhere for this load.** Left exactly as-is; will
self-resolve the moment real values are entered (same already-wired Edit Load hook).

## For the record — a real but out-of-scope finding

The historical/current settlement "feed" scripts (`scripts/feed/*.mts`, e.g.
`feed-settlement-day.mts`) write `mdata.loads.status` directly via raw SQL and drive invoice
creation through the real HTTP routes, but **never** call
`linkLoadToPresettlementAfterAssignmentInClientTx` anywhere (zero matches, full-file grep) — matching
why 13622/13624/13623 all show artifacts from a process that never touches the presettlement side.
This is consistent with the DATA FREEZE's own framing ("feeding the last of the data") and is a
one-off historical/seeding tool, not live dispatcher-facing app code — out of scope for this PR.
Flagging it so it isn't mistaken for the same class of live-route bug as 13623's.

## Summary
| Load | Artifact reached | Artifact missing | Cause | Action |
|---|---|---|---|---|
| 13623 | (cancelled) | — | Cancellation cascade never released the pre-close forward pointer | **Fixed + guarded + repaired live** |
| 13624 | Invoice, driver bill | Presettlement link | `trip_type` genuinely unknown; unrelated gate already correctly deferring | Reported, no change needed |
| 13622 | Invoice | Driver bill, presettlement link | `miles_shortest`/`trip_type` genuinely unknown | Reported, no change needed |
