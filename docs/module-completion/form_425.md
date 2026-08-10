# Module completion — Form 425C

**PROGRESS: 2 of 5** · complete: `false` · as_of: 2026-08-10 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 2 |
| HOLD | 0 |
| OPEN | 3 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `425-S01` | **PASS** | /425c home renders entity-scoped 425C workspace | Form425CHome.tsx reads selectedCompanyId and passes operating_company_id to 425C report APIs. /425c route mounts Form425CHome; /form-425c redirects to /425c. Tabs profile/qb/form/merge/history render. Guard: scripts/verify-425-s01-s02-surfaces.mjs. | #TBD |
| `425-S02` | **PASS** | /425c/exhibits exhibit tabs mounted (no 404) | /425c/exhibits route mounts Form425CExhibitsViewer, which reads selectedCompanyId and passes operating_company_id to /api/v1/reports/form-425c/exhibits/build. Backend route validates operating_company_id and applies withCompanyScope + retrieval entity check. Exhibits A–F tabs rendered. Guard: scripts/verify-425-s01-s02-surfaces.mjs. | #TBD |
| `425-ECON-01` | **OPEN** | Exhibit C opening balances tie to legal/statements chain | scaffold — mod13 finding tracked; VLEG wave STMT-3-1099-425c-consolidation | — |
| `425-LINK-01` | **OPEN** | 425C consolidation links to accounting + legal statements | scaffold — not proven | — |
| `425-VERIFY-01` | **OPEN** | 425C module VERIFY-1..8 TRANSP + USMCA | scaffold — July-31 click-through noted; no deep cascade this pass | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/form-425c.md
