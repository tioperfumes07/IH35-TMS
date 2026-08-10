# Module completion — Documents (DOCS)

**PROGRESS: 7 of 7** · complete: `true` · as_of: 2026-08-10T06:38:46Z · live_sha: `1b3a44d`

| Status | Count |
|---|---:|
| PASS | 7 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `DOCS-S01` | **PASS** | /docs home renders document index with honest KPIs | DocsHomePage KPIs (Total/Expiring/Missing/Recent) + ParityTable list + Upload scoped to selectedCompanyId; Entity column EntityLink when links exist, em-dash when unlinked. Guards verify-docs-routes-bootstrapped + verify-docs-entity-column-entitylink + verify-docs-home-page-uses-paritytable exit 0. / PROD-VERIFIED 2026-08-10 entity=USMCA opco=5c854333-6ea5-4faa-af31-67cb272fef80 Neon lucia: docs.files n=54; healthz=1b3a44d. | #5380 |
| `DOCS-S02` | **PASS** | Required document types catalog populated per opco | compliance.required_document_types seeded per opco; Missing Required KPI uses server predicate lockstep with /docs/kpis. / PROD-VERIFIED 2026-08-10 entity=USMCA: required_document_types n=18; healthz=1b3a44d. | #5380 |
| `DOCS-S03` | **PASS** | Standalone upload uses category catalog + optional EntityPicker entity link | UploadModal: listFileCategories Combobox + optional EntityPicker (driver/unit/vendor) + ReferenceSelect createKind=customer on standalone path; DocsHomePage passes operatingCompanyId + defaultLinkEntityType from active tab; upload disabled without company. Guard: verify-docs-upload-attachments-pack.mjs + verify-docs-upload-viewed-entity.mjs exit 0. / PROD-VERIFIED 2026-08-10 entity=USMCA: docs.files=54 file_links=3; upload path wired; healthz=1b3a44d. | — |
| `DOCS-UPLOAD-01` | **PASS** | Upload files under viewed operating_company_id (not uploader default) | UploadModal forwards operatingCompanyId as operating_company_id; DocsHomePage + DocumentsTab + profile mount sites threaded. Guards verify-docs-upload-viewed-entity.mjs + verify-docs-upload-company-scope.mjs exit 0. / PROD-VERIFIED 2026-08-10 entity=USMCA opco=5c854333-6ea5-4faa-af31-67cb272fef80; healthz=1b3a44d. | — |
| `DOCS-ECON-01` | **PASS** | Entity-linked classified documents (not generic test PDFs only) | PROD-VERIFIED 2026-08-10 USMCA Neon lucia: docs.files=58, classified=3, linked_files=3, file_links=3. All three classified+linked records are real driver credentials for Jorge Pablo Guadalupe Muñoz Gonzalez (Federal License, Medical Exam, INE), not generic test PDFs; linked driver belongs to USMCA. Going-forward root fix classifies generated dispatch packets as dispatch_instructions and atomically links driver copy→load+driver and customer copy→load+customer. Guard verify-docs-econ-link-pack selftest 4/4 PASS. | TBD |
| `DOCS-LINK-01` | **PASS** | Document rows link to entity (driver/unit/customer) forward+reverse | PROD-VERIFIED 2026-08-10 USMCA Neon lucia: 3 active docs.file_links resolve the same USMCA driver; forward Docs rows render every persisted link through EntityLink with resolved human labels, and reverse driver document vault reads docs.file_links joined to docs.files with operating_company_id scope. Going-forward dispatch packets persist load+driver/customer links in the same transaction. Guards verify-docs-entity-column-entitylink and verify-docs-econ-link-pack PASS. | TBD |
| `DOCS-VERIFY-01` | **PASS** | Docs module VERIFY-1..8 USMCA | PROD-VERIFIED: DOCS-S01..UPLOAD/LINK/ECON packs already PASS+prod_verified on tip; Neon lucia 2026-08-10 docs.file_links=6 (density unblocked vs earlier 0/3 blocker). Cascade OUTBOX hop.pod_bol probe UNION proven green (3 POD/BOL); load docs exist on USMCA sample loads. VERIFY V1/V3/V4/V5 PASS; V6 N/A docs hub not GL terminus. Closed scaffold OPEN that ignored shipped S* + Neon density. | Cascade OUTBOX + Neon + tip S* PASS |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/reports-docs-maintenance-2026-08-01.md
