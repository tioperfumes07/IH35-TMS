## Phase 0 Status Updates (2026-05-03)

- BT-0-INFRA-01: ✓ Done
  - Render Standard + Neon PG16 Oregon (7-day PITR) + Upstash Redis Free Oregon.
  - Healthcheck stable at 200.

- BT-0-REPO-01: ⏸ Partial
  - `db/` + `scripts/` exist.
  - `apps/`, `packages/`, `tests/`, `.github/workflows/` not yet created.
  - `src/ -> apps/backend/src/` deferred (see Section E).

- BT-0-AUDIT-01: ✓ Done
  - `audit.audit_events` created.
  - `audit.append_event()` created.
  - Append-only enforced; verification passes.
  - RLS-vs-trigger note logged in Section E.

- BT-0-OUTBOX-01: ✓ Done
  - `outbox.outbox_queue` migrated (`0003_outbox_init.sql`).
  - Worker drain implemented (`scripts/outbox-worker.mjs`).
  - Verify script passed: row drained in <5 minutes.

- BT-0-CI-01: ✓ Done
  - GitHub Actions workflow added at `.github/workflows/ci.yml`.
  - Node 22 pinned for CI (`.nvmrc`).
  - `npm ci`, `npm run typecheck`, and `npm run build` configured on `main`.

## Section E — Deviations / Decisions

| Date | Note | Owner | Status | Reference |
|---|---|---|---|---|
| 2026-05-03 | BT-0-REPO-01 §4.1 full restructure deferred. Repo currently has `src/`, `db/`, `scripts/` at root. `apps/`, `packages/`, `tests/`, `.github/workflows/` not yet created. Move `src/ -> apps/backend/src/` deferred. To be backfilled before Phase 1 entry. | Jorge | Pending — schedule before Phase 1 | Build Spec §4.1 |
| 2026-05-03 | BT-0-AUDIT-01 append-only enforcement uses triggers (`BEFORE UPDATE/DELETE -> RAISE EXCEPTION`) instead of RLS as specified in MUST 4.9.3.1. Functionally equivalent for mutation blocking. Decision pending: keep triggers (v3.X amendment) or add RLS policies in follow-up migration. | Jorge | Pending — decide before Phase 1 | Build Spec MUST 4.9.3.1 |
