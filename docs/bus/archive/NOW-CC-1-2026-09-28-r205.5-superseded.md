# ROUND 205.5 — direct answer + full RLS-guard audit — CC-1 — 2026-09-28
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-r201-superseded.md`. Did NOT touch
`scripts/verify-workflow-requests-entity-scoped.mjs` (confirmed via `git diff origin/main` before and
after this investigation — byte-identical; Devin-B's file under ROUND 205.4).

## Part 1 — the direct question: "exactly what command and what DATABASE_URL produced that PASS line?"

**Command:** `node scripts/verify-workflow-requests-entity-scoped.mjs`
**DATABASE_URL** (the POOLED endpoint, `neondb_owner` credentials — the one I've used all session):
`postgresql://neondb_owner:npg_hf85RMXGzFbK@ep-broad-block-akykk7bw-pooler.c-3.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require`

Re-ran it just now, identical output: `PASS — schema shape correct, ... two real Administrators in
two different companies each see only their own company's workflow_request (rolled back, no data
persisted).` It is reproducible. Here is why, verified live, not assumed:

- `pg_roles`: `neondb_owner.rolbypassrls = true` — the Lead's stated fact, confirmed.
- But on **this exact pooled connection**, `SELECT current_user, session_user` returns
  `current_user = 'ih35_app'`, `session_user = 'neondb_owner'`. The pooler silently executes queries
  as `ih35_app`, not as the authenticating role. `ih35_app.rolbypassrls = false` (also confirmed).
  So the guard's read genuinely ran RLS-enforced.
- I could not find the mechanism that causes this: `pg_roles.rolconfig` for both roles is null,
  `pg_db_role_setting` for this database is empty, `pg_event_trigger` is empty. It is a real,
  live-reproducible property of Neon's pooler endpoint for this project/role combination that I
  cannot fully explain past the empirical fact. Flagging that gap honestly rather than inventing a
  mechanism.
- Cross-checked against a second, independent script with zero shared code with the guard
  (raw `pg.Pool`, no `requireLiveDbOrExit`, no app helpers) — same result: reads as `ih35_app`,
  sees only its own company's row.

**So the PASS line is real for the exact command/URL I used.** But — see Part 2 — that specific
protection does NOT generalize, and the Lead's separate, larger claim is confirmed true for the
guards' actual documented execution path.

## Part 2 — the separate, larger task: audit of every RLS-asserting guard

**Answering the assigned question directly: the "downgrade to ih35_app" protection is an accident of
which connection string I personally used, not a property of the guard framework.** I tested the
actual documented credential path and it does NOT protect:

- `~/.config/ih35/neon-prod-readonly.url` — the file `money-pr-local-gate.mjs`'s
  `resolveGuardDatabaseUrl()` loads for `ih35_ci_readonly` (per GATE-F005, 2026-09-23) — uses the
  **direct** endpoint (`ep-broad-block-akykk7bw.c-3...`, no `-pooler`). Tested it directly just now:
  `current_user = session_user = 'ih35_ci_readonly'`, **no downgrade**, `rolbypassrls = true`. A
  guard run this way — the intended, documented way — is genuinely RLS-bypassed.
- This exact gap was **already disclosed once**, 5 days ago, and never fixed:
  `docs/bus/2026-09-23-LEAD-RULING-CC2-LANE-CROSS-GATE-F005-READONLY-ROLE.md` lines 31-36 — CC-2
  found `ih35_ci_readonly` could execute a real UPDATE inside a rolled-back transaction (should have
  been permission-denied for a "readonly" role) and flagged it "for the owner to route (a role-grant
  change)." It sat unrouted until now.
- GitHub Actions' own `ci.yml`/`security-checks.yml` don't touch Neon for these guards at all —
  `DATABASE_URL=postgres://verify:verify@localhost:54329/ih35_verify`, a fresh per-run Docker
  Postgres. `verify` is that container's `POSTGRES_USER`, which the official postgres image always
  creates as a superuser — and a real Postgres superuser bypasses RLS unconditionally, regardless of
  the `rolbypassrls` flag. So **every RLS-asserting guard that runs inside actual GitHub Actions CI
  is also vacuous**, by a third, independent mechanism, with no accidental protection possible (every
  run hits this, not just some connection strings).

**Guards that specifically assert cross-tenant/RLS security behavior with a real scoped session**
(grepped for `set_config('app.current_user_id'|'app.operating_company_id')` combined with
leak/cross-tenant/"should not see" assertion language — the pattern my own B3 guard uses), **11
found**:
1. `scripts/verify-alerts-routes-membership.mjs`
2. `scripts/verify-company-membership-assert.mjs`
3. `scripts/verify-driver-termination-reasons-rls-single-policy.mjs`
4. `scripts/verify-escrow-forfeit-membership-before-guc.mjs`
5. `scripts/verify-escrow-forfeit-sign-delta.mjs`
6. `scripts/verify-money-dispatch-opco-resolver.mjs`
7. `scripts/verify-money-side-effect-after-commit.mjs`
8. `scripts/verify-no-interpolated-guc.mjs`
9. `scripts/verify-no-session-scoped-guc-on-pooled-connection.mjs`
10. `scripts/verify-relay-wallet-entity-parity.mjs`
11. `scripts/verify-workflow-requests-entity-scoped.mjs` (mine, B3 — Devin-B owns the current fix)

Every one of these is exposed **whenever it happens to run through GitHub Actions CI (guaranteed,
per the superuser mechanism above) or through the documented `ih35_ci_readonly` direct-endpoint
credential (guaranteed, confirmed above) or through `neondb_owner` on the direct endpoint (untested
but `neondb_owner.rolbypassrls=true` with no pooler to downgrade it — expect the same result)**.
None of them pin or assert their own connection's `rolbypassrls` status before trusting a negative
result — that absence of a self-check is the actual root defect, not any one role's grant.

## Plan — not yet executed, no role grants touched, per the explicit instruction

1. **Narrowest real fix, needs owner sign-off:** `REVOKE bypassrls` from `ih35_ci_readonly`. It is a
   dedicated, single-purpose guard/gate role; it has no legitimate reason to bypass RLS, and this
   already contradicts its own name (it also isn't actually write-blocked — the 2026-09-23 disclosure
   above, same root cause class). This alone fixes the documented gate path for all 11 guards when
   run via `money-pr-local-gate.mjs`.
2. **Structural fix, closes the class instead of one role:** add a self-check to
   `scripts/lib/require-live-db.mjs` (or a new helper the 11 guards above opt into) that queries
   `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user` immediately after connecting, and
   for any guard that declares itself an RLS-security assertion, **FAILS CLOSED** ("cannot prove
   anything — this connection bypasses RLS") instead of proceeding to a PASS/FAIL it cannot actually
   back up. This protects against the next accidental bypass-capable credential someone loads,
   instead of relying on which of several documented connection-string files happens to be in scope.
3. **GitHub Actions surface:** the container's fresh Postgres needs a genuinely non-superuser,
   non-bypassrls role created and used for these 11 guards specifically when they run inside `ci.yml`
   — `verify` itself can keep superuser for migrations/setup, but the guard's own `DATABASE_URL` for
   this narrow set should point at a second, deliberately unprivileged role in the same container.
4. Will not touch any of this — role grants or CI YAML — until the Lead/owner picks a direction.

## Status
Part 1 answered in full, with the caveat stated plainly. Part 2's count and mechanism are backed by
live tests run today, not assumed. Standing by for direction on the plan before touching any grants.
