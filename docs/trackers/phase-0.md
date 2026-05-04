# IH35 Phase 0 Tracker

## Phase 0 Final Status — 2026-05-04

All 7 BT-0-* tasks complete.

- BT-0-INFRA-01: ✓ Done — Render Standard + Neon PG 16 Oregon (7-day PITR) + Upstash Redis Free Oregon. Healthcheck stable at 200.
- BT-0-REPO-01: ✓ Done — Build Spec §4.1 layout (apps/backend + scaffolding). Backfilled before Phase 1 entry.
- BT-0-AUDIT-01: ✓ Done — audit.audit_events + audit.append_event() + append-only triggers. Verification PASS.
- BT-0-OUTBOX-01: ✓ Done — outbox.outbox_queue + worker drain + verification PASS.
- BT-0-CI-01: ✓ Done — .github/workflows/ci.yml with Node 22, npm ci, typecheck, build on main.
- BT-0-AUTH-01: ✓ Done — Lucia v3 + Arctic Google OAuth + identity schema. Cookie ih35_session persisting in browser. User row verified in identity.users.
- BT-0-R2-01: ✓ Done — Cloudflare R2 bucket ih35-tms-evidence (WNAM). r2-verify upload + download + delete + sha256 PASS.

## Phase 0 Exit Gate: PASS

Verified:
- npm run typecheck PASS
- npm run build PASS
- npm run db:migrate PASS (0001-0005)
- npm run db:verify:audit-append-only PASS
- npm run db:verify:outbox-drain PASS
- npm run r2:verify PASS
- Render healthcheck /api/v1/_healthcheck returns 200 OK
- Production OAuth flow end-to-end: Google sign-in → callback → user row created → session cookie set

Ready for Phase 0 → Phase 1 transition (signoff_type=phase_gate_0).

## Section E — Deviations / Decisions

| Date | Note | Owner | Status | Reference |
|---|---|---|---|---|
| 2026-05-03 | BT-0-REPO-01 §4.1 restructure was initially deferred, then backfilled and verified before Phase 1 entry. Canonical layout and backend path are in place. | Jorge | Resolved — backfilled before Phase 1 | Build Spec §4.1 |
| 2026-05-03 | BT-0-AUDIT-01 append-only enforcement uses triggers (BEFORE UPDATE/DELETE -> RAISE EXCEPTION) instead of RLS as specified in MUST 4.9.3.1. Functionally equivalent for mutation blocking. Decision pending: keep triggers (v3.X amendment) or add RLS policies in follow-up migration. | Jorge | Pending — decide before Phase 1 | Build Spec MUST 4.9.3.1 |
| 2026-05-03 | BT-0-AUTH-01 identity.users.uuid renamed to id (migration 0005) for Lucia v3 PostgreSQL adapter contract. Other tables retain uuid per Master Blueprint Part 7 column convention. | Jorge | Resolved | Master Blueprint Part 7 §7.1 |
| 2026-05-03 | BT-0-AUTH-01 added @fastify/cookie plugin (not in original Build Spec §3.2 deps) for Set-Cookie reliability across redirects. Switched routes and middleware to reply.setCookie / req.cookies. | Jorge | Resolved | Build Spec §3.2 |
| 2026-05-04 | BT-0-R2-01 R2_PUBLIC_URL_BASE set to S3 API endpoint for Phase 0. Public-serving URL strategy (R2.dev URL or custom domain) deferred to Phase 2 entry when Documents module begins writing user-facing evidence. | Jorge | Deferred — decide at Phase 2 entry | Build Spec §3.7 |