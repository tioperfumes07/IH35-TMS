# Module completion — Documents (DOCS)

**PROGRESS: 2 of 5** · complete: `false` · as_of: 2026-08-10 · live_sha: `a1a7b50`

| Status | Count |
|---|---:|
| PASS | 2 |
| HOLD | 0 |
| OPEN | 3 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `DOCS-S01` | **PASS** | /docs home renders document index with honest KPIs | DocsHomePage KPIs (Total/Expiring/Missing/Recent) + ParityTable list + Upload scoped to selectedCompanyId; Entity column EntityLink when links exist, em-dash when unlinked. Guards verify-docs-routes-bootstrapped + verify-docs-entity-column-entitylink + verify-docs-home-page-uses-paritytable exit 0. / PROD-VERIFIED 2026-08-10 entity=USMCA opco=5c854333-6ea5-4faa-af31-67cb272fef80 Neon lucia br-fancy-credit-akjnd07a: docs.files n=54 (deleted_at IS NULL); app.ih35dispatch.com/docs HTTP 200; healthz=a1a7b50. | #TBD |
| `DOCS-ECON-01` | **OPEN** | Entity-linked classified documents (not generic test PDFs only) | OPEN 2026-08-10 USMCA: Neon lucia docs.file_links n=3 on 54 files — majority uncategorized/unlinked uploads remain test PDFs; classified entity-linked density blocks economics PASS until USMCA wire-test creates linked driver/unit docs. | — |
| `DOCS-LINK-01` | **OPEN** | Document rows link to entity (driver/unit/customer) forward+reverse | PARTIAL 2026-08-10: EntityLink wired on DocsHome (no UUID slice; em-dash when unlinked). Neon lucia USMCA docs.file_links=3 — forward+reverse drill blocked until density exists (DOCS-ECON-01 sibling). Guards verify-docs-entity-column-entitylink exit 0. | — |
| `DOCS-S02` | **PASS** | Required document types catalog populated per opco | compliance.required_document_types seeded per opco; Missing Required KPI uses server predicate lockstep with /docs/kpis. / PROD-VERIFIED 2026-08-10 entity=USMCA: Neon lucia compliance.required_document_types n=18 for opco 5c854333-6ea5-4faa-af31-67cb272fef80; KPI missing_required reflects honest gap vs catalog (not fabricated zero); healthz=a1a7b50. | #TBD |
| `DOCS-VERIFY-01` | **OPEN** | Docs module VERIFY-1..8 USMCA | OPEN 2026-08-10 — S01+S02 prod_verified; V4 deep linkage + V6 economics blocked by docs.file_links=3 / uncategorized cohort; Cascade live click-through UNVERIFIED. | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/reports-docs-maintenance-2026-08-01.md
