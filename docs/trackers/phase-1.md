## Phase 1 Status Updates (2026-05-04)

- BT-1-IDENT-01: In Progress
  - Implement full identity RLS policies and Lucia bypass scope.
  - Add verification script `db:verify:identity-rls`.

## Section E — Deviations / Decisions

| Date | Note | Owner | Status | Reference |
|---|---|---|---|---|
| 2026-05-04 | BT-1-IDENT-01 introduces `app.bypass_rls = 'lucia'` session flag. `luciaPool` always sets this on connect; non-Lucia pool never sets it. Trade-off: any code path with `luciaPool` access can read/write identity tables freely. Acceptable because `luciaPool` is scoped to `apps/backend/src/auth/`. | Jorge | Resolved | Build Spec MUST 6.6.1 |
