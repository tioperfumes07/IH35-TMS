# LEAD-RULING-2026-09-22-CC3-TOUR-OPEN-LOCKED-CROSS-LANE

## Lane-cross authorization for CC-3 touching `apps/backend/src/accounting/tour-open-gate.service.ts`,
## `apps/backend/src/accounting/posted-while-tour-open-report.service.ts`, and
## `scripts/verify-open-tour-posts-nothing.mjs` (CC-1's `scripts/verify-*.mjs` lane)

**Authorization, quoted verbatim from the Lead's own session instructions** (the assignment that
opened this investigation, and its follow-up naming it explicitly):

> "THEN, unchanged: 68/397 bank txns... 152/625 fuel rows... 26 expenses... Relay intercompany
> 8000... 5815's $308.00... 7 expense lines/$137.51... reconcile live fuel net 271,499.26 against
> control 172,952.79"

> "THEN IFTA-GALLONS-03, your biggest item... Then: 152 fuel_card_id NULLs (your 'unattributable,
> not stamped' verdict ACCEPTED — record as a disclosed residual), then 26 unposted expenses / who
> closes the 7 open settlements."

## What was found and why it required touching these three files

Investigating "26 unposted expenses / who closes the 7 open settlements" (both CC-3 lane facts —
`driver_finance.driver_settlements` and their expenses are explicitly CC-3 TABLES per
`docs/bus/LANES.md`) surfaced a real root cause: 4 of the 26 `accounting.expenses` rows are
permanently stuck `posting_status='unposted', posting_hold_reason='tour_open'` because (a)
`tour-open-gate.service.ts`'s `CLOSED_TOUR_STATUSES` set never included `'locked'` (only
`'approved'/'paid'/'cancelled'/'closed'/'final'`), and (b) the settlement **finalize** route
(`apps/backend/src/driver-finance/settlements.routes.ts` — already CC-3's own lane) never called
`postHeldDocumentsForClosedTour`, unlike the MVP approve route. Both halves are required for the
fix; the gate-service file is `apps/backend/src/accounting/*`, not `driver-finance/*`.

`posted-while-tour-open-report.service.ts` carries the SAME status set (by explicit design —
"mirrors ... exactly, never a second competing definition," per its own header comment) and serves
a live Accounting → Reports page; leaving it un-widened would make that page falsely flag a
legitimately-posted `'locked'`-settlement expense as a violation the moment the gate fix ships.

`scripts/verify-open-tour-posts-nothing.mjs` (CC-1's `verify-*.mjs` lane) embeds a FIFTH copy of
the same status list in its own live-check SQL, with a comment that explicitly says it "Mirrors
tour-open-gate.service.ts CLOSED_TOUR_STATUSES" — leaving it stale would make this exact guard
start reporting the fix's own future output as a false violation.

## Scope of the cross

Additive only: every edit adds `'locked'` to an existing five-way-duplicated status list, each
citing the same root cause and the same prior owner-approved precedent (EXP-CLOSED-TOUR-VOCAB,
2026-09-07, which added `'closed'`/`'final'` to the same list for the identical reason). No new
posting logic, no new GL math — `postHeldDocumentsForClosedTour` already exists and already calls
the real posting engine (`postSourceTransaction`); this only widens WHEN it is allowed to run,
exactly like the 2026-09-07 precedent it extends.

Also touched (SHARED, no ruling needed): `scripts/report-posted-expenses-while-tour-open.mjs`,
`scripts/report-open-tour-posted-reversal-plan.mjs` — one-shot historical report scripts under
`scripts/` that are not `verify-*.mjs`, updated for the same consistency reason.
