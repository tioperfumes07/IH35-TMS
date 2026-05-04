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
| 2026-05-04 | BT-1-IDENT-01 second hot fix: OAuth callback `findOrCreateUser` was using regular `pool`, which RLS rejected for brand-new users (no Owner/Administrator role yet, no bypass). Migrated OAuth callback DB operations to `luciaPool`, which has `app.bypass_rls='lucia'` set. Identity bootstrap remains within auth flow scope. | Jorge | Resolved | Build Spec MUST 6.6.1 |
| 2026-05-04 | BT-1-IDENT-01 third hot fix: pg pool checkout reset behavior could clear session-level `app.bypass_rls`, so Lucia adapter and `findOrCreateUser` sometimes ran without active bypass at query time. Fixed by setting lucia bypass as a startup connection option (`options=-c app.bypass_rls=lucia`) on `luciaPool` and wrapping `findOrCreateUser` in `withLuciaBypass` (`BEGIN` + `SET LOCAL` + `COMMIT`). | Jorge | Resolved | Build Spec MUST 6.6.1 |
| 2026-05-04 | BT-1-IDENT-01 fourth hot fix: Neon's pooler (PgBouncer) rejects custom startup parameters. Switched `luciaPool` to `DATABASE_DIRECT_URL` (unpooled) so `options=-c app.bypass_rls=lucia` works. Regular `pool` remains on `DATABASE_URL` (pooled). `luciaPool` is auth-only low-volume traffic. | Jorge | Resolved | Build Spec MUST 6.6.1; Neon docs https://neon.tech/docs/connect/connection-errors#unsupported-startup-parameter |
| 2026-05-04 | BT-1-IDENT-02 implements per-request DB helper `withCurrentUser(userUuid, fn)` that wraps queries in `BEGIN / SET LOCAL app.current_user_id / COMMIT`. This is the deferred wiring from BT-1-IDENT-01 and is now used for identity endpoints to enforce RLS correctly. | Jorge | Resolved | Build Spec MUST 6.6.2 |
| 2026-05-04 | BT-1-IDENT-03 introduces `identity.workflow_requests` for WF-064 identity actions. RLS allows requester + target + admin visibility and workflow decision transitions emit audit events inside the same transaction for atomicity. | Jorge | Resolved | Master Blueprint Part 4 §4.7 + MUST 4.9 |
| 2026-05-04 | BT-1-IDENT-03 enforces `cannot decide own request` in app code (403) rather than RLS. This keeps policies simple while preserving explicit business-rule guardrails for approve/reject actions. | Jorge | Resolved | Build Spec MUST 6.6.1 |

## TODO

- Add end-to-end HTTP integration harness for identity/workflow endpoints in Phase 1 (currently relying on DB verification scripts + production smoke checks).
