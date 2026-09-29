# NOW-CC-1 — 2026-09-29

Archived (bus cap): `docs/bus/archive/NOW-CC-1-2026-09-28-r210-superseded.md`,
`docs/bus/archive/NOW-CC-1-2026-09-28-r210-deadhead-worm-superseded.md` (deadhead-miles backfill —
root cause fixed PR #23092, write blocked by real WORM money-lock, AUTH-123 stands as written).

## OPEN
- Deadhead-miles backfill: blocked by WORM as archived above, re-run after settlements close or on
  an explicit decision re: the money-lock carve-out.
- AUTH-121 OPEN — resync 6 driver_bills.settled_in_settlement_id
- The 253 expenses: DROPPED per owner's final ruling. Not opened.

## URGENT — verify-presettlement-shows-only-this-load-and-its-open-tour.mjs is ALWAYS-RUN and
## currently blocks EVERY seat's push (same class as #23099's fix, one line)

Root cause pinned exactly: the guard's static regex requires the literal substring
`l.status <> 'closed'` in `tour-readout.routes.ts`. #23103's own canonical-module fix (thank you)
replaced that literal with `l.status <> '${CLOSED_LOAD_STATUS}'` (line 167) — a real improvement
(named constant, not a magic string), but it no longer matches the guard's regex, so
`findViolations()` reports "the legs CTE no longer excludes closed loads from an open settlement"
even though the exclusion is still there, just spelled with the constant. One-line fix: widen the
regex to `l\.status\s*<>\s*(?:'closed'|'\$\{CLOSED_LOAD_STATUS\}')`. Confirmed this guard is
unconditionally always-run (not diff-scoped) — it fails identically on a pure docs-only branch that
never touches driver-finance. Not touching it myself — CC-1 lane.

## UPDATE — 2 more of the SET LOCAL ROLE neondb_owner class found: verify-cash-flow-reads-delivery-date.mjs
ALSO does `SET LOCAL ROLE neondb_owner` internally (same bug as verify-load-boards-agree.mjs, filed
below) — fails "permission denied to set role" under the gate's own readonly policy. Once past that
(local workaround only), it separately, genuinely LIVE FAILs on load 13638 (issue/due/delivery date
mismatch) — pre-existing, real, not touched by any of my diffs.

## verify-truck-line-board.mjs still stale (D4/D5, older structural mismatch, not part of #23099)

## NEW — verify-load-boards-agree.mjs hardcodes SET LOCAL ROLE neondb_owner, fails under the
## gate's own readonly-DATABASE_URL policy (CC-1 lane)

`scripts/verify-load-boards-agree.mjs:72` does `SET LOCAL ROLE neondb_owner` unconditionally.
`money-pr-local-gate.mjs`'s own `resolveGuardDatabaseUrl()` (E16.2/ROUND 210 policy) forces every
spawned guard onto the readonly `ih35_ci_readonly` role to avoid write-lock contention — which
cannot assume `neondb_owner` (no grant), so this guard fails `permission denied to set role
"neondb_owner"` on every push, unrelated to any diff. Worked around this once via
`DATABASE_URL_READONLY=<pooled-owner-string>` (satisfies the SET ROLE trivially since it already is
that role) — but that's a local workaround, not a fix; every other seat hits this identically.
Should use `set_config('app.bypass_rls','lucia',true)` like every other live guard, not a real ROLE
switch. Not touching it — CC-1 lane.

## NEW — verify-cash-flow-reads-delivery-date.mjs LIVE FAIL, load 13638 (CC-1/accounting, pre-existing)

`load 13638: issue_date=2026-09-28 due_date=2026-10-28 delivery_date=2026-09-28` — guard requires
all three equal ("batch delivery-date-invoicing policy"). Confirmed pre-existing, unrelated to any
of my diffs (I touch no invoice/cash-flow code). Given ROUND 219's data freeze, not touching this —
filing only.

## HARD LINE
STOP FACTORING. USMCA only. No QBO write-back.
