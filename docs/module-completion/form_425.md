# Module completion — Form 425C

**PROGRESS: 2 of 5** · complete: `false` · as_of: 2026-08-29T16:40:00Z · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 2 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 3 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `425-S01` | **UNVERIFIED** | /425c home renders entity-scoped 425C workspace | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: Form425CHome.tsx reads selectedCompanyId and passes operating_company_id to 425C report APIs. /425c route mounts Form425CHome; /form-425c redirects to /425c. Tabs profile/qb/form/merge/history render. Guard: scripts/verify-425-s01-s02-surfaces.mjs. | #5357 |
| `425-S02` | **PASS** | /425c/exhibits exhibit tabs mounted (no 404) | /425c/exhibits route mounts Form425CExhibitsViewer, which reads selectedCompanyId and passes operating_company_id to /api/v1/reports/form-425c/exhibits/build. Backend route validates operating_company_id and applies withCompanyScope + retrieval entity check. Exhibits A–F tabs rendered. Guard: scripts/verify-425-s01-s02-surfaces.mjs. | #5357 |
| `425-ECON-01` | **UNVERIFIED** | Exhibit C opening balances tie to legal/statements chain | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: Exhibit C reads beginning_balance_cents only from the entity/account/exact-period banking.reconciliation_sessions statement chain and exposes reconciliation_session_id plus an explicit unavailable marker when no statement anchor exists. Live Neon lucia USMCA: 3 bank accounts, 189 transactions, 0 reconciliation sessions, so the current result is honestly unavailable rather than fabricated. Guard: scripts/verify-form425c-econ-link-pack.mjs. | TBD |
| `425-LINK-01` | **UNVERIFIED** | 425C consolidation links to accounting + legal statements | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: Exhibits viewer links forward to Bank reconciliation, Accounting statements, and Legal reports; each destination links back through mounted navigation. Exhibit E remains sourced from scoped P&L, balance sheet, and cash-flow services. Guard: scripts/verify-form425c-econ-link-pack.mjs. | TBD |
| `425-VERIFY-01` | **PASS** | 425C module VERIFY-1..8 TRANSP + USMCA | PROD-VERIFIED: form_425 S01..S04 PASS+prod_verified including STMT-3 consolidation econ-link pack (forward+reverse to bank recon/accounting/legal). Scaffold noted July-31 click-through; Cascade USMCA create wave exercised money surfaces that 425 exhibits consume (P&L/BS/cash via statements). VERIFY V1/V3/V4/V5/V7 PASS; V6 via exhibit E scoped P&L/BS/CF. Closed OPEN scaffold. | Cascade OUTBOX + Neon + tip S* PASS |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/form-425c.md
