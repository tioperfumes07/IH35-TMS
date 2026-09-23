# LEAD RULING — GATE-F005 (CC-2 lane cross on `scripts/money-pr-local-gate.mjs`)

Owner-directed, not self-discovered: E16.2 (2026-09-23 22:45 UTC) and E18.4/E19 (23:06/23:12 UTC)
both explicitly instructed CC-2 to make `ih35_ci_readonly` the default connection role for every
live-DB read `money-pr-local-gate.mjs` performs, folded into the same held branch as the
GATE-SCOPE-03 re-fix (GATE-F004) — "You own money-pr-local-gate.mjs, so make it the default for
EVERY live read the gate performs, not just the ones in your diff." `scripts/money-pr-local-gate.mjs`
is CC-1's lane per `docs/bus/LANES.md`; this file is the written ruling that authorizes the cross,
per the same pattern already used for GATE-SCOPE-01/02/03 in this file's own history.

WHY: gate slowness during the six-seat merge window was traced to lock contention — every guard's
live read connected as `neondb_owner` while Cursor's feed was writing; a read-only role does not
contend for the feed's writer locks the same way. CC-1's own docs-only PR stalled on a slow live-DB
check with no code change to explain it, which is what surfaced this.

FIX SCOPE: a single new function (`resolveGuardDatabaseUrl`) plus a two-line change to the existing
`runNode()` choke point — the one function all ten of the gate's live-guard spawns already go
through. No guard's own logic touched; no guard weakened; no baseline regenerated. Precedence:
explicit `DATABASE_URL_READONLY` env var, else `~/.config/ih35/neon-prod-readonly.url` (the
convention already documented in `docs/bus/OUTBOX-CURSOR.md`), else unchanged fallback to whatever
`DATABASE_URL` the caller already set — never blocks a seat that hasn't fetched the readonly
credential yet.

VERIFIED: `node scripts/money-pr-local-gate.mjs --selftest` exit 0; a standalone reproduction of the
override logic proved a fake `neondb_owner` `DATABASE_URL` in the parent process resolves to
`ih35_ci_readonly` for the spawned child while the parent's own env is untouched; the real
`ih35_ci_readonly` credential was live-fetched via `neonctl connection-string` and confirmed to
connect as that role against the real Neon endpoint (`current_user`, `current_database()` both
asserted in the same session) with a working live read.

DISCLOSED SEPARATELY (not fixed by this change, not blocking it): `ih35_ci_readonly` is not actually
write-blocked at the Postgres grant level — live-verified a real 0-row `UPDATE` against
`banking.bank_transactions` succeeded inside a rolled-back transaction rather than raising
permission-denied. Flagged in the commit body as a defect for the owner to route (a role-grant
change, not a gate change); does not change the correctness of this fix, which only addresses lock
contention.

Posted to `docs/bus/OUTBOX-CC-1.md` per the no-handoffs law's cross-declaration requirement (declare
+ notify the owning seat + keep going, never wait).

## Addendum, same push attempt — GATE-F005-B (`scripts/verify-no-silent-db-skip.mjs`)

Also CC-1 lane, hit as a genuine blocker inside this same push (not self-discovered idly, hit trying
to get GATE-F005 green): the gate's own `verify-no-silent-db-skip` (03d) step FAILED, reporting 3
guards (`verify-coa-canonical.mjs`, `verify-draft-load-saves-and-is-visible.mjs`,
`verify-no-capability-regression.mjs`) as "hung" under its 16-way concurrent `mapPool`. Per the
NO-HANDOFFS law ("a blocker inside your own work is YOURS to fix, with a LANE_CROSS declaration"),
fixed rather than held/reported-and-waited.

ROOT-CAUSED, not assumed: ran all 3 files standalone with the identical DATABASE_URL-stripped env,
one at a time, no concurrency — all 3 exit correctly (fast, non-zero, no hang) in 1.1s-4.6s each.
The 8-second-per-file timeout was only blown under 16-way concurrent CPU/IO contention on a shared
dev machine with several seats' agents running work at once — a test-harness flake, not a defect in
any of the 3 guards.

FIX: `scripts/verify-no-silent-db-skip.mjs` — any file that times out under the concurrent pool gets
ONE serial re-run (no contention) before being counted as a genuine hang. Does not loosen the
assertion itself (a real hang still fails; the 8s-per-file bound is unchanged) — only removes false
failures caused by the harness's own concurrency.

RED-BEFORE-GREEN: (a) before the fix, live run reproducibly FAILED naming the 3 files exactly as
above; (b) a fixture file that references DATABASE_URL and never exits (`setInterval(() => {}, 1000)`
forever) was planted and confirmed the guard STILL correctly FAILS on a genuine hang even with the
retry in place, then removed; (c) after the fix, live run PASSES — `224 DATABASE_URL-referencing
guard(s) scanned live, 0 pre-existing baseline debt, 0 new silent-skip regressions`, exit 0.
