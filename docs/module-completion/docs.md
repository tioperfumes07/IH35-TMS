# Module completion — Documents (DOCS)

**PROGRESS: 4 of 7** · complete: `false` · as_of: 2026-08-10 · live_sha: `1b3a44d`

| Status | Count |
|---|---:|
| PASS | 4 |
| HOLD | 0 |
| OPEN | 3 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `DOCS-S01` | **PASS** | /docs home renders document index with honest KPIs | DocsHomePage KPIs (Total/Expiring/Missing/Recent) + ParityTable list + Upload scoped to selectedCompanyId; Entity column EntityLink when links exist, em-dash when unlinked. Guards verify-docs-routes-bootstrapped + verify-docs-entity-column-entitylink + verify-docs-home-page-uses-paritytable exit 0. / PROD-VERIFIED 2026-08-10 entity=USMCA opco=5c854333-6ea5-4faa-af31-67cb272fef80 Neon lucia: docs.files n=54; healthz=1b3a44d. | #5380 |
| `DOCS-S02` | **PASS** | Required document types catalog populated per opco | compliance.required_document_types seeded per opco; Missing Required KPI uses server predicate lockstep with /docs/kpis. / PROD-VERIFIED 2026-08-10 entity=USMCA: required_document_types n=18; healthz=1b3a44d. | #5380 |
| `DOCS-S03` | **PASS** | Standalone upload uses category catalog + optional EntityPicker entity link | UploadModal: listFileCategories Combobox + optional EntityPicker (driver/unit/vendor) + ReferenceSelect createKind=customer on standalone path; DocsHomePage passes operatingCompanyId + defaultLinkEntityType from active tab; upload disabled without company. Guard: verify-docs-upload-attachments-pack.mjs + verify-docs-upload-viewed-entity.mjs exit 0. / PROD-VERIFIED 2026-08-10 entity=USMCA: docs.files=54 file_links=3; upload path wired; healthz=1b3a44d. | — |
| `DOCS-UPLOAD-01` | **PASS** | Upload files under viewed operating_company_id (not uploader default) | UploadModal forwards operatingCompanyId as operating_company_id; DocsHomePage + DocumentsTab + profile mount sites threaded. Guards verify-docs-upload-viewed-entity.mjs + verify-docs-upload-company-scope.mjs exit 0. / PROD-VERIFIED 2026-08-10 entity=USMCA opco=5c854333-6ea5-4faa-af31-67cb272fef80; healthz=1b3a44d. | — |
| `DOCS-ECON-01` | **OPEN** | Entity-linked classified documents (not generic test PDFs only) | OPEN 2026-08-10 USMCA: Neon lucia docs.file_links n=3 on 54 files — majority uncategorized/unlinked uploads remain test PDFs; S03 upload picker now enables entity link at create time; density PASS blocked until USMCA wire-test creates linked driver/unit docs. | — |
| `DOCS-LINK-01` | **OPEN** | Document rows link to entity (driver/unit/customer) forward+reverse | PARTIAL 2026-08-10: EntityLink wired on DocsHome; standalone upload now offers EntityPicker/ReferenceSelect entity link (S03). Neon lucia USMCA docs.file_links=3 — forward+reverse drill blocked until density exists (DOCS-ECON-01 sibling). Guards verify-docs-entity-column-entitylink + verify-docs-upload-attachments-pack exit 0. | — |
| `DOCS-VERIFY-01` | **OPEN** | Docs module VERIFY-1..8 USMCA | OPEN 2026-08-10 — S01-S03+UPLOAD-01 prod_verified; V4 deep linkage + V6 economics blocked by docs.file_links=3; Cascade live click-through UNVERIFIED. | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/reports-docs-maintenance-2026-08-01.md
