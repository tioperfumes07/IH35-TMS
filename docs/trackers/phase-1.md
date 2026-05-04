## Phase 1 Status Updates (2026-05-04)

- BT-1-IDENT-01: In Progress
  - Implement full identity RLS policies and Lucia bypass scope.
  - Add verification script `db:verify:identity-rls`.

## Section E — Deviations / Decisions

| Date | Note | Owner | Status | Reference |
|---|---|---|---|---|
| 2026-05-04 | BT-1-IDENT-01 introduces `app.bypass_rls = 'lucia'` session flag. `luciaPool` always sets this on connect; non-Lucia pool never sets it. Trade-off: any code path with `luciaPool` access can read/write identity tables freely. Acceptable because `luciaPool` is scoped to `apps/backend/src/auth/`. | Jorge | Resolved | Build Spec MUST 6.6.1 |
| 2026-05-04 | BT-1-IDENT-01 introduced `ih35_app` Postgres role for RLS scoping. Required because Neon's `neondb_owner` has `rolbypassrls=true` which would defeat RLS. Both `pool` and `luciaPool` `SET ROLE ih35_app` on connect. `GRANT ih35_app TO CURRENT_USER` lets Neon owner switch into role; not used at runtime. | Jorge | Resolved | Master Blueprint Part 7 §7.1 + Build Spec MUST 6.6.1 |
| 2026-05-04 | BT-1-IDENT-01 used `SECURITY DEFINER` on `identity.current_user_role()` to avoid RLS recursion when role-check function reads `identity.users`. `search_path` is locked to `identity, public`. | Jorge | Resolved | Build Spec MUST 6.6.1 |
| 2026-05-04 | BT-1-IDENT-01 deferred per-request `SET LOCAL app.current_user_id` wiring to BT-1-IDENT-02 (full endpoints). With pool reuse, `current_user_id` must be set inside request-scoped transactions; BT-1-IDENT-02+ endpoints must wrap DB calls with `BEGIN / SET LOCAL / COMMIT`. | Jorge | Pending — must implement in BT-1-IDENT-02 | Build Spec MUST 6.6.2 |
| 2026-05-04 | BT-1-IDENT-01 hot fix: `pool.on('connect')` handlers were using fire-and-forget `void` chain, causing race conditions where Lucia adapter received connections before `SET ROLE`/`SET app.bypass_rls` completed. OAuth callback then failed on `identity.sessions` INSERT RLS. Fixed by converting both handlers to `async` + `await`. | Jorge | Resolved | Build Spec MUST 6.6.1 |
