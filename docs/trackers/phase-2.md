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
| 2026-05-05 | BT-2-DOCS-UI-HOTFIX (P2-T2.1): Critical hot-fix for P2-T2 regression. React Error #310 (hooks order violation) caused Customer Detail and Driver Detail pages to render blank when DocumentsTab loaded. Fixed hooks ordering across all documents components — all hooks now declared before any conditional return. Fixed 400 errors on GET /api/v1/docs/files: frontend now skips undefined query params; backend Zod schema made entity_type/entity_id optional for standalone library use. Added ErrorBoundary wrapper around DocumentsTab in Driver/Customer Detail pages to prevent future regressions from blanking entire pages. Audit count unchanged at 92. | Jorge | Resolved | Critical regression caught in smoke test |
| 2026-05-05 | BT-2-DOCS-PWA (P2-T3): Driver PWA upload UI + IndexedDB offline queue + image compression + camera capture. Mobile-first design optimized for poor cell signal (border crossings, warehouses, rural Texas). IndexedDB queue persists across app refresh. Exponential backoff retry (5s/30s/2min/10min/30min, max 5 attempts). Image compression to max 1920x1920 JPEG quality 0.8 (typically 5-10MB -> 500KB-1MB). 6 quick-pick categories for driver-applicable docs (CDL, Medical Card, DOT Inspection, DVIR, Damage Photo, Other). Reuses backend P2-T1 endpoints + RLS - no backend changes. NO Service Worker yet (Phase 4). NO push notifications (Phase 4). NO multi-file (queue handles multiple sequential uploads). | Jorge | Resolved | Phase 2 task 3 of 5 |
| 2026-05-05 | BT-2-PWA-UPLOAD-HOTFIX (P2-T3.1): PWA upload returned HTTP 403 from iPhone Safari. Root cause: PWA driver-self flow was not guaranteed to resolve the current user's linked mdata.drivers.id before queuing upload, so entity linking could be invalid at upload time. Added explicit getCurrentDriver() lookup via GET /api/v1/mdata/drivers/me and hard guards so UploadModal waits for linked driver profile before submit. Kept PWA docs API sanitization and ErrorBoundary wrappers on UploadDocumentModal/MyDocuments. Verified test driver linkage: identity.users 01c8d9d2 ↔ mdata.drivers 3bcf472e. | Jorge | Resolved | Hot-fix from PWA smoke test |
| 2026-05-05 | BT-2-OUTBOX-PROCESSOR (P2-T3.2): Discovered Phase 1 gap — P1-T9 created outbox queue schema but no in-process draining processor was built in backend service. db:verify:outbox-drain has been failing on main since pre-Phase-2. Built poll-based outbox processor running in-process inside backend Node service. Polls every 5s with FOR UPDATE SKIP LOCKED safety claim. Handler registry pattern added: twilio.sms.send, twilio.whatsapp.send, audit.event.persist, test.noop. Exponential backoff retry (30s/2m/10m/1h/6h/24h, max 6). Graceful shutdown on SIGTERM/SIGINT. NO new Render service — runs in main backend process. Added outbox.event.delivered, outbox.event.retried, outbox.event.failed audit classes. | Jorge | Resolved | Phase 1 gap caught during P2-T3 smoke testing |
