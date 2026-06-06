# ADDENDUM-01 — GAP-OBSERV-FOUNDATION (Block 1) Scope Correction

**Created:** 2026-06-06
**Parent spec:** `docs/dispatch/GAP-BLOCKS-TIER1-TRUST-2026-06-06.md` (Block 1)
**Block id (rescoped):** `GAP-OBSERV-FOUNDATION-RESCOPED`
**Author:** Cursor (Opus, Wave A lane 1)
**Approved by:** Jorge (2026-06-06, answers to Q1/Q2/Q3)

---

## Why this addendum exists

The original Block 1 spec was written against an **inaccurate model of the codebase**. Mandatory
read-only reconnaissance before any code (new standing rule, 2026-06-06) surfaced two material
mismatches:

1. **Assumed runtime shape was wrong.** The spec describes a Node/Express server
   (`server.js`, `routes/*.mjs`) that uses `console.log`. The actual canonical repo
   (`github.com/tioperfumes07/IH35-TMS`) is a **TypeScript Fastify monorepo**:
   - `apps/backend` (Fastify 5, TypeScript, ESM)
   - `apps/frontend` (React + Vite)
   - `apps/driver-pwa` (React + Vite PWA)
   There is no `server.js` and no `routes/*.mjs`. The entrypoint is
   `apps/backend/src/index.ts`.

2. **Most of Block 1 already shipped** — under a prior block (CLOSURE-21 lineage). The
   observability foundation is largely in place and DSN-gated (safe no-op when no DSN).

Per the standing rule (recon → mismatch → STOP → surface), Block 1 was paused and the questions
were surfaced to Jorge. Jorge confirmed the rescope (Q3) and answered Q1/Q2. This addendum records
the corrected scope so future blocks clone from reality, not from the original (incorrect)
assumption.

---

## What CLOSURE-21 already delivered (verified present on `origin/main`)

| Capability | Location | Status |
|---|---|---|
| `@sentry/node` + `@sentry/profiling-node` SDK | `apps/backend/src/lib/sentry.ts` | ✅ present |
| Environment-aware DSN init (`NODE_ENV`), profiling, server name | `apps/backend/src/lib/sentry.ts` → `initBackendSentry()` | ✅ present |
| Fastify error handler wired | `apps/backend/src/index.ts` → `registerSentryFastifyErrorHandler(app)` | ✅ present |
| Per-request Sentry scope (route, user_id, operating_company_id tags) | `apps/backend/src/lib/sentry.ts` → `attachSentryRequestScope()` (preHandler hook in `index.ts`) | ✅ present |
| Observability helpers (slow-query capture, isSentryConfigured) | `apps/backend/src/observability/sentry.ts` | ✅ present |
| Structured **JSON** logger w/ required fields (timestamp, level, message, request_id, user_id, company_id, route, latency_ms) | `apps/backend/src/observability/structured-logger.ts` | ✅ present (custom; Q3: KEEP, do not migrate to pino) |
| `@sentry/react` SDK (frontend + driver PWA) | `apps/frontend/src/observability/sentry-client.ts`, `apps/driver-pwa/src/observability/sentry-pwa.ts` | ✅ present |
| Deep health route | `apps/backend/src/observability/health-deep.routes.ts` | ✅ present |
| CI Sentry probe script | `scripts/verify-sentry-receives-test-error.mjs` | ✅ present |
| Monitoring + incident runbooks | `docs/runbooks/MONITORING-PLAYBOOK.md`, `docs/runbooks/INCIDENT-RESPONSE.md` | ✅ present |
| `SENTRY_DSN` already treated as a required env key | `apps/backend/src/lib/env-validation.ts` → `baseRequiredKeys()` | ✅ present |

**Conclusion:** The "install Sentry SDK + structured logging" portions of Block 1 are DONE.
Re-implementing them would be churn and risk. Q3 directive: keep the existing custom JSON logger
and keep the CLOSURE-21 SDK integration as-is.

---

## The 4 actual remaining gaps (this block)

| # | Gap | What was missing | Where |
|---|---|---|---|
| 1 | **PII scrub on Sentry breadcrumbs/events** | `initBackendSentry()` had no `beforeSend`/`beforeBreadcrumb`; PII (driver SSN, customer email, `ssn`/`social_security`/`medical_card_number`) could reach Sentry. | `apps/backend/src/lib/sentry-scrub.ts` (new) wired into `apps/backend/src/lib/sentry.ts` |
| 2 | **request_id middleware (UUID per request)** | Fastify generated only an internal sequential `req.id`; no UUID, no response header, no propagation of incoming `x-request-id`. | `apps/backend/src/middleware/request-id.ts` (new) wired into `apps/backend/src/index.ts` |
| 3 | **`/admin/observability` route** | No backend status endpoint and no admin-only frontend page. | `apps/backend/src/admin/observability.routes.ts` (new) + `apps/frontend/src/pages/admin/ObservabilityPage.tsx` (new) + route in `apps/frontend/src/routes/manifest.tsx` |
| 4 | **Sentry projects + 3 baseline alerts + env wiring** | No Sentry org/projects exist; no DSN in repo/Render/CI; no alert rules. | `scripts/provision-sentry-projects.mjs` (new) + `docs/runbooks/SENTRY-PROVISIONING.md` (new) |

### Q1 answer (Sentry account/DSN)
- Create a **new** Sentry organization (free tier). **Three environments** → **separate projects**
  (`ih35-tms-prod`, `ih35-tms-staging`, `ih35-tms-dev`).
- Wire `SENTRY_DSN` (backend) + `VITE_SENTRY_DSN` (frontend) into Render env vars + CI secrets.
- Upload source maps on each deploy.
- Provide the Sentry org URL to Jorge when done.

### Q2 answer (alert destination)
- **Email** alerts to `jorge@ih35trucking.net`.
- Three baseline alerts:
  1. 5xx error rate > 1% over 5 min
  2. p95 latency > 2s on any route
  3. DB connection pool exhausted

### Q3 answer (rescope)
- Implement **only** the 4 remaining gaps above.
- Keep the existing custom JSON logger.
- Keep the existing CLOSURE-21 Sentry SDK integration.

---

## Hard constraints honored

- Additive only — no changes to existing page designs (new `/admin/observability` route only).
- No `--no-verify`.
- PII scrub verified by test before merge.
- 4-gate done (squash-merge SHA + branch deleted + Render deploy + healthz 200).

---

## Note for future block authors

Future GAP block specs MUST be validated against the real repo shape (TypeScript Fastify monorepo,
`apps/backend|frontend|driver-pwa`, ESM `.js` import specifiers, `register*Routes(app)` pattern,
`requireAuth` + role guards) before dispatch. Run the mandatory recon pass first.
