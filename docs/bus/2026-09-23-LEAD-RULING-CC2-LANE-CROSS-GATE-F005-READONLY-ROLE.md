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
