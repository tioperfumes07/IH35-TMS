# Module completion — Documents (DOCS)

**PROGRESS: 2 of 5** · complete: `false` · as_of: 2026-08-03 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 2 |
| HOLD | 0 |
| OPEN | 3 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `DOCS-S01` | **PASS** | /docs home renders document index with honest KPIs | 2026-08-03 Cursor: DocsHomePage KPIs (Total/Expiring/Missing/Recent) + list + Upload. Neon lucia docs.files=24. Entity column EntityLink when links exist; honest — when unlinked. Guard verify-docs-entity-column-entitylink + step 2250. | — |
| `DOCS-ECON-01` | **OPEN** | Entity-linked classified documents (not generic test PDFs only) | scaffold — OPEN: 3 uncategorized test PDFs; real driver/unit docs may live elsewhere | — |
| `DOCS-LINK-01` | **OPEN** | Document rows link to entity (driver/unit/customer) forward+reverse | 2026-08-03 PARTIAL: EntityLink wired on DocsHome (no UUID slice). Neon lucia docs.file_links=0 — density still blocks PASS until classified entity links exist (DOCS-ECON-01 sibling). | — |
| `DOCS-S02` | **PASS** | Required document types catalog populated per opco | 2026-08-03 Neon lucia: compliance.required_document_types=54 (18/opco). Docs KPIs: Incomplete Uploads (honest rename of missing_required predicate) + Required Types count from required_document_types. Guard verify-docs-s02-required-types-kpi step 2262. DOC-REQ-2b entity-gap chip still deferred. | #pending |
| `DOCS-VERIFY-01` | **OPEN** | Docs module VERIFY-1..8 TRANSP + USMCA | scaffold — functionally empty of classified data; follow-up vs attachment tables | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/reports-docs-maintenance-2026-08-01.md
