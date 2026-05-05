# Phase 2 — Documents Module

**Phase 1 closure commit:** Pending merge commit for BT-1-GATE-01  
**Phase 2 start:** 2026-05-06 (planned)  
**Estimated duration at Jorge's pace:** 1-2 days (~10-12 Cursor build hours)  
**Master Blueprint reference:** Part 11 (Documents)  
**Phase 2 -> Phase 3 gate:** BT-2-GATE-01

## Phase 2 scope

Build the documents module that all subsequent phases depend on:

1. `docs` schema: `docs.files` (R2-backed metadata + chain-of-custody), `docs.file_versions`, `docs.file_categories`.
2. R2 integration: Cloudflare R2 bucket already provisioned (`ih35-tms-evidence`). Backend signs presigned upload URLs; frontend uploads directly to R2; backend records metadata.
3. File categories per blueprint MUST 3.8.2 (20 categories): `bol`, `pod`, `rate_confirmation`, `dispatch_instructions`, `accident_report`, `damage_photo`, `dvir`, `dot_inspection`, `antidoping_result`, `medical_card`, `cdl`, `permit`, `insurance_policy`, `claim`, `signed_acknowledgment`, `vendor_invoice`, `bank_statement`, `tax_form`, `legal_doc`, `other`.
4. Office UI: Documents tab on Driver Detail and Customer Detail. Upload + preview + categorize.
5. Driver PWA: Upload BOL/POD photos from mobile camera. Offline-first with sync when online.
6. RLS: Per-resource access (drivers see their own driver-related docs only; office sees all).
7. Audit: `docs.files.uploaded`, `docs.files.categorized`, `docs.files.viewed`, `docs.files.deleted` (soft-delete, never hard-delete).

## Carryover from Phase 1

- FMCSA broker authority verification on customer creation (small block, fits early Phase 2).
- Rehire chain validation hardening (currently walks immediate prior driver only; should walk full chain).

## Phase 2 -> Phase 3 readiness signals

- File upload + preview working in Office UI.
- File upload working in Driver PWA (camera roll + offline queue).
- All 20 file categories enumerated.
- R2 chain-of-custody verified (uploaded files traceable to user + IP + timestamp).
- 4+ new audit event classes registered.
- Phase 2 verify script passes.
- FMCSA verification working on customer create.

## Phase 2 known dependencies

- Cloudflare R2 credentials: already in Render env.
- Image preview library: TBD (recommend `pdf.js` for PDFs, native `img` for photos).
- Offline sync queue: IndexedDB on Driver PWA.
- Phase 2 does not depend on Phase 3 (loads, dispatch). Phase 3 will add `load_documents` linking table.

## Section E

| Date | Note | Owner | Status | Reference |
|---|---|---|---|---|
| 2026-05-05 | BT-2-DOCS-SCHEMA-AND-R2 (#2): Documents Module foundation. New docs schema with docs.files (master records, soft-delete only, versioning via parent_file_id chain) and docs.file_links (polymorphic entity attachments). New catalogs.file_categories with 20 pre-populated categories from Master Blueprint MUST 3.8.2. Cloudflare R2 client wrapper with presigned upload (15min) + download (5min) URLs. R2 key structure: org/<operating_company_id>/files/<file_uuid>/<version>/<original_filename>. Chain of custody via 8 audit events. RLS rules: standalone files Owner/Admin only; entity-linked files inherit entity visibility per role. NO UI in this block (Block #2.1 follows). | Jorge | Resolved | Phase 2 task 1 of 4 |
| 2026-05-05 | BT-2-DOCS-UI-OFFICE (P2-T2): Office UI Documents tabs on Driver Detail (6th tab), Customer Detail (7th tab), and Vendor Detail (new minimal page). Standalone /documents library page for Owner/Admin company-wide view. Reusable DocumentsTab component with upload modal, preview (inline image + PDF, native browser viewer), version history viewer, edit metadata, soft-delete with reason. R2_PUBLIC_URL_BASE env var present but UNUSED — all downloads via presigned URLs for chain-of-custody (Chapter 11 DIP audit obligations). | Jorge | Resolved | Phase 2 task 2 of 5 |
| 2026-05-05 | ARCHITECTURAL DECISION: Presigned URLs ONLY for all document downloads. R2_PUBLIC_URL_BASE env var preserved but not used for document serving. Reason: sensitive documents (BOLs, PODs, CDLs, contracts, accident reports) + Chapter 11 DIP audit obligations require every access to be auditable via docs.files.viewed event. Public bucket URLs would bypass audit trail. Trade-off: ~100ms extra per download for backend roundtrip; acceptable. | Jorge | Architectural | Permanent |
