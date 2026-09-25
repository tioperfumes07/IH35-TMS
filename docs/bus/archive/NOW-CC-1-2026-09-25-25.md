# STATUS on the 02:15 PM CT order — CC-1 — 2026-09-25 2:30 PM CT (19:30Z), deadline 21:30Z.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-24.md` (WORM).

## THE BLOCKER, up front: I have NO DATABASE_URL in this environment.
Neither item below can be EXECUTED by me — both are production writes. Checked exhaustively (no
`.env` with real credentials in either checkout; shell env doesn't persist across my tool calls;
won't fetch/print the credential via Neon MCP's write tool, which would surface it in this
session's visible output; won't hand-write a JE outside the engine's own path as a workaround).
Same blocker as R-159, already flagged twice. Everything below is code-complete and ready — I need
either DB access or someone else to run the prepared scripts.

## (1) 5812 tour-close — READY, AUTH-029 issued, NOT run
PR #22706 (sha `3761a9b3e7`) merged: found + fixed a companion bug while wiring this up —
`loadIdsForSettlement` had the identical zero-pay blind spot R-169 fixed in `isLoadTourOpen`, one
level up (would have resolved an empty load list for 5812 and silently no-op'd). Fixed the same way
(UNION via `settled_in_settlement_id`), 3 new unit tests, 7/7 pass. `scripts/ops/2026-09-25-cc1-
post-5812-held-tours.ts` ready: resolves 5812 → loads 13588/13600 → calls the existing
`postHeldDocumentsForClosedTour` → proves 0 tour_open holds USMCA-wide afterward (stronger than the
named 48-document scope, since I don't have that exact list). AUTH-029 open, expires 21:25Z.
**Someone with DB access: `DRY_RUN=1 OWNER_AUTH_ID=AUTH-029 tsx scripts/ops/2026-09-25-cc1-post-5812-held-tours.ts`, then the real run.**

## (2) Cash advances — INVESTIGATED, NOT resolved, asking for correction
Confirmed live (read-only): the 10 non-voided `driver_finance.driver_advances` rows sum to exactly
$2,073.97, matching your figure. These are the survivors of MY OWN earlier ROUND 153 item 8
correction (2026-09-24, script `scripts/ops/2026-09-25-cc1-r153-item8-disburse-cash-advances.ts`) —
that already found and reversed a $201.99 duplicate (CA-2026-0008+0009 duplicating CA-2026-0007's
own $201.99 for load 13546) via a correcting JE.
**Your example (load 13549, $151.99, doc 5787) already has a live, non-voided driver_advances row**
(id `667e738c…`, created 2026-09-24, linked to driver_bill `28d1b55c…` = load 13549) — it does not
look missing from here. I can't independently find the actual $201.99 gap: `driver_finance.
settlement_lines` (where the real deduction-side truth lives) reads as 0 rows in my read-only
session (RLS-blocked without a bypassed connection), so I cannot enumerate settlement-side advance
recoveries and diff them against the 10 booked rows myself.
**Asking, not guessing:** is load 13549/5787 a different, second $151.99 event than the one I
found, or is your example stale relative to my R-153 fix? Either the exact missing advance(s) (if
different from my example) or DB read access so I can pin it down myself — once confirmed I'll
build the `createDriverCashAdvanceCore` (disbursement_method='historical_backfill',
linked_driver_bill_id set) backfill script immediately, matching the R-153 script's own precedent.

CC-1 | 2:30 PM CT (19:30Z) | Item 1 ready, blocked on execution. Item 2 blocked on clarification +
execution. Both flagged, neither guessed past.
