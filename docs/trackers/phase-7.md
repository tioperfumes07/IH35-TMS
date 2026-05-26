# Phase 7 — fix & hardening backlog

Tickets filed from **P6-T11205** (pre-MVP hardening verification, 2026-05-14).  
**Rule:** backend *code* fixes belong here; P6-T11205 intentionally avoided backend changes.

| ID | Title | Source |
| --- | --- | --- |
| **P7-FIX-SEED-001** | CSV / API seed path for **loads** (10+ rows) with FK integrity to customers/drivers/units | `tests/fixtures/seed-test-data.csv` manifest gap |
| **P7-FIX-SEED-002** | CSV or migration-linked seed for **bank accounts** (multi-company) | manifest gap |
| **P7-FIX-SEED-003** | CSV or script seed for **bank transactions** (e.g. Plaid-shaped rows) + idempotency | manifest gap |
| **P7-FIX-RLS-VERIFY-001** | Repair `npm run db:verify:mdata-rls` fixture user — set `preferred_language` (or nullable column policy) so RLS regression suite runs | `tests/results/seed-verification.md` |
| **P7-FIX-OFFICE-SMOKE-001** | Office iPhone Playwright: Google OAuth **storageState** + smoke user (or test-only bypass policy) for authenticated dispatch list | `tests/results/iphone-smoke-2026-05-14.md` |
| **P7-FIX-OFFICE-SMOKE-002** | Add / document **settlement detail** deep-link for office smoke once route exists; extend `iphone-office-smoke.spec.ts` | same |
| **P7-FIX-DRIVER-SMOKE-ENV** | Document & automate env provisioning for `DRIVER_SMOKE_EMAIL` + bypass secret in CI or runbook | optional ops |

_No backend regressions requiring immediate hotfix were identified during P6-T11205 verification._

## Block C — MVP cleanup (2026-05-14)

| ID | Title | Notes |
| --- | --- | --- |
| **P7-PROD-SMOKE-001** | Run Block X production health (`npm run smoke:block-x`) vs `api.ih35dispatch.com` | Artifact: `tests/results/prod-smoke-2026-05-14.md` — authenticated checks **SKIPPED** until `BLOCK_X_PROD_COOKIE` + `BLOCK_X_PROD_OPERATING_COMPANY_ID` are set locally |
| **P7-FIX-STALE-QBO-001** | “Stale IH 35 Transportation” QBO sync pill | Backend health uses **24h** staleness, token-expiry + unresolved token-ish `qbo.sync_alerts` → `needs_reconnect`; Topbar **Reconnect QuickBooks** uses OAuth start URL |
| **P7-FIX-LINT-ROUTES-001** | CI: duplicate literal Fastify route registrations | `npm run lint:fastify-routes` (`scripts/lint-fastify-routes.mjs`), chained in `verify:arch-design` |
| **P7-FIX-LINT-DEPS-001** | CI: missing / stray workspace dependencies | `npm run lint:deps` (`scripts/lint-deps.mjs`), chained in `verify:arch-design` |

**P7-FIX-N (prod smoke, do not fix in Block C PR):** none — no non-2xx endpoints observed (auth-gated checks were not executed).

## Block D — MVP launch readiness (2026-05-14)

| ID | Title | Notes |
| --- | --- | --- |
| **P7-UI-1** | Banking “+ Create Account” dashed tile → inline chip-style link | `apps/frontend/src/pages/banking/components/AccountTilesRow.tsx` |
| **P7-WHATSAPP-TEMPLATES** | Five Meta-ready WhatsApp drafts | `apps/backend/src/whatsapp/templates/*` + `docs/whatsapp-templates.md` |
| **P7-EMAIL-SMOKE-001** | Email queue smoke + admin retry API/UI | `npm run smoke:email-queue`, `POST /api/v1/admin/email-queue/:id/retry`, `/banking/email-queue` |
| **P7-SCHEDULED-REPORT-E2E-001** | Prod-safe scheduled-report e2e (`BLOCK_X_PROD_COOKIE`) | `scripts/smoke-tests/block-x-scheduled-reports-e2e.ts` |

## Phase 7 visual audit cleanup (2026-05-24)

| ID | Title | Notes |
| --- | --- | --- |
| **P7-AUDIT-VISUAL-P1** | 5 prod-walk frontend fixes + 5 guards + 0240 seed purge | DONE on PR merge |

## Phase 7 stabilization hotfix split (2026-05-25)

| ID | Title | Notes |
| --- | --- | --- |
| **P7-AUDIT-P0-2-HOTFIX-1** | Honest fail-closed for QBO webhook + Twilio + REQUIRED_ENV + KNOWN_OFFENDERS_DEBT guard | In flight -> DONE on PR merge |
| **P7-AUDIT-P0-2-HOTFIX-2** | Migrate 15 remaining boot-time env crash offenders to REQUIRED_ENV pattern; empty KNOWN_OFFENDERS_DEBT | PENDING |
| **P7-FIX-MIG-IMMUTABILITY-GUARD** | Static CI guard preventing already-applied migration content modification | DONE on PR merge |
| **P7-FIX-VERIFY-CONTENT-DRIFT** | 13 verifier patches + 14 reconciliation entries (0242) + verify:content-drift-check guard | DONE on PR merge |
| **P7-AUDIT-TRIGGER-STRATEGY** | Decide whether audit.tg_audit_row should be created to activate guarded tg_audit_* triggers or keep guarded-skip as canonical | PENDING |
| **P7-MAINT-FOUNDATION** | Maintenance route bootstrap + per-tab foundation + placeholder purge + 2 CI guards | DONE on PR merge |
| **P7-MAINT-WORK-ORDERS** | WO create + list + edit + status transitions + WO-PDF end-to-end | DONE on PR merge |
| **P7-MAINT-PM-INSPECTIONS** | PM Schedules + Inspections + Vendors + Reports + Compliance 425C linkage | DONE on PR merge |
