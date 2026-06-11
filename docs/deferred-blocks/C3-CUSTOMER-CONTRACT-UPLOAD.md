═══════════════════════════════════════════════════════════════
BLOCK C3 — CUSTOMER-CONTRACT-UPLOAD
Phase C.
═══════════════════════════════════════════════════════════════

GOAL
Upload + store customer contracts against a customer record, with an immutable record
of what was uploaded, by whom, when (audit-linked).

SCOPE
  - MIGRATION db/migrations/<ts>_c3_customer_contract.sql:
      schema customer (or extend); table customer_contract (customer_id, file ref/url,
      uploaded_by, uploaded_at, contract_type, effective dates, is_active, audit cols).
      The upload record is APPEND-style: supersede by new version, never silently edit
      the stored file metadata. RLS + NULLIF. Spine writes via log_event() on upload.
  - Routes (customer-contract.routes.ts): upload (store file ref), list, view, supersede.
    File storage: use the existing docs/file storage mechanism — do NOT invent a new one;
    confirm where the app already stores uploaded files and reuse it.
  - Customer detail page gets a "Contracts" section → EXISTING page → visual preview first.

PRE-PUSH Postgres validate (EXIT:0). verify-customer-contract-upload.mjs: schema +
RLS + spine emit + reuse-of-existing-storage check.
Push BLOCK_ID=C3-CUSTOMER-CONTRACT-UPLOAD, ls-remote, PR. Report PR# + SHA.
