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
