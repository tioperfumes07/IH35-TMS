# ROUND 208.3 — RLS Option 2 blocked, credential-file audit (CC-1, 2026-09-28)

## RLS Option 2 — blocked by the SAME wall, twice. The stated premise was wrong.

Created `ih35_ci_readonly_v2` via `mcp__claude_ai_Neon__create_postgres_role` exactly as directed.
Checked its attributes live before doing anything else with it:

```
rolname: ih35_ci_readonly_v2
rolbypassrls: true
rolcreatedb: true
rolcreaterole: true
rolsuper: false
memberships: [{ member: 'ih35_ci_readonly_v2', granted_role: 'neon_superuser' }]
```

**This directly contradicts the stated premise** ("[Neon's API] cannot set BYPASSRLS, CREATEDB or
CREATEROLE, so the new role is structurally safe by construction"). Every role Neon's platform API
creates gets full `neon_superuser` membership and all three attributes by default — this is not
something specific to the old `ih35_ci_readonly`'s history; it is how Neon provisions every role on
this project, old or new.

Tried the fix anyway on the fresh role, since maybe being its literal creator would grant admin
option this time:

```sql
ALTER ROLE ih35_ci_readonly_v2 NOBYPASSRLS NOCREATEDB NOCREATEROLE;
```
```
error: permission denied to alter role
detail: Only roles with the CREATEROLE attribute and the ADMIN option on role
        "ih35_ci_readonly_v2" may alter this role.
```

Identical wall as the old role. `neondb_owner` has `CREATEROLE=true` but ADMIN OPTION on zero roles
in this project (verified via `pg_auth_members`) — including one it just created five minutes
earlier via Neon's own API. Neon's control plane retains exclusive ADMIN OPTION over every role it
provisions; no customer-facing role in this project, old or new, can ever alter another role's
BYPASSRLS/CREATEDB/CREATEROLE attributes or its `neon_superuser` membership.

**Conclusion: Option 2, as specified, cannot be executed with any tool or role available to me.**
This is not a workaround-able permissions gap — it requires either (a) a genuine Neon support
ticket asking them to run the ALTER ROLE on their side, or (b) accepting that BYPASSRLS cannot be
removed from any role in this Postgres instance under the current plan/access, and building the
mitigation at the application layer instead: every RLS-security-assertion guard queries its own
`current_user`'s `rolbypassrls` immediately after connecting and refuses to report PASS/FAIL if it's
true (fails closed with an explicit "cannot prove anything on this connection" message) — this was
already item 2 of my original ROUND 205.5 plan, independent of which role ends up running it.

`ih35_ci_readonly_v2` is created, has zero grants, and does nothing right now — left in place
(not deleted) since it's harmless and DROP ROLE would likely hit the identical permission wall
anyway. Its password is not recorded anywhere since it doesn't solve the stated problem; happy to
delete it if that's preferred.

Not touched: Step 1's 836 SELECT grants on the OLD `ih35_ci_readonly` stand as applied — still real,
still additive, still safe regardless of how steps 2/3 get resolved.

## Credential file audit: `~/.config/ih35/neon-prod-readonly.url`

**When:** file mtime `2026-09-28 16:28:41 CDT` (`2026-09-28T21:28:41Z`) — content changed then;
original creation (btime) was `2026-09-23 17:50:01 CDT`, matching the GATE-F005 setup.

**Who:** could not determine. No git commit, no `docs/bus/*` post, and — checked directly —
`scripts/money-pr-local-gate.mjs`'s `resolveGuardDatabaseUrl()` (the only code in this repo that
references this path) **only reads it, never writes it** (confirmed by reading the function body).
There is no code path anywhere in this repo that could have produced this overwrite automatically.
It has to have been a manual, out-of-band action in some other session — most likely someone
re-running the original setup command (`neonctl connection-string ... --role-name <X> > ~/.config/
ih35/neon-prod-readonly.url`) with the wrong role name, or hand-pasting the wrong string into that
path. This machine keeps no per-session file-write attribution, so I cannot go further than that
without a seat volunteering when they last touched this file.

**Recommendation:** this local per-machine credential-file convention is exactly the kind of stale/
dead-credential surface the new `~/Desktop/09-28-2026-IH35-MASTER-KEYS-ENVS-SINGLE-SOURCE-OF-TRUTH.
md` was built to replace. Worth deciding whether `resolveGuardDatabaseUrl()` should be pointed at
that file (or a `DATABASE_URL_READONLY` env var sourced from it) instead of a silently-mutable path
with no write-attribution, so this exact failure mode can't recur.

## The 4 guards (ROUND 208.1) — done, merged, verified

PR #23081, merged `c40917410d`. `--selftest` exit 0 on the 3 files that support it; confirmed via
direct regex test against `verify-static.mjs`'s own `REQUIRES_LIVE_DB_RE` that all 4 now match and
are excluded from the no-DB sweep. Second question answered: **not unwired** — all 4 already have
real verify-step wrappers (11651/11655/11659/11663); the actual bug was `verify-static.mjs`'s
separate broader sweep, not missing wiring. CI triggered on the merge commit; will report exit
status once it completes.

## The 253 expenses (ROUND 208) — dropped per the owner's final ruling. Not opened.
