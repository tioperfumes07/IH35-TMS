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

(Will be populated as Phase 2 blocks are built.)
