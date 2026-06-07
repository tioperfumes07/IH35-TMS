═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-11 — Universal Upload-Document Widget Everywhere
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-E  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-12 (Lane B) — same wave G-E

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-12 owned):
  apps/backend/src/accounting/invoices/non-load-invoice/**
  apps/frontend/src/pages/accounting/invoices/CreateInvoice.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/frontend/src/components/shared/DocumentUploadWidget.tsx              (NEW)
  apps/frontend/src/components/shared/DocumentUploadWidget.test.tsx         (NEW)
  apps/frontend/src/lib/document-upload-client.ts                           (NEW)
  apps/backend/src/documents/upload.routes.ts                               (EDIT — confirm pattern)
  apps/backend/src/documents/__tests__/upload-widget-integration.test.ts    (NEW)
  apps/frontend/src/pages/accounting/expenses/ExpenseCreate.tsx             (EDIT — embed widget)
  apps/frontend/src/pages/accounting/bills/BillCreate.tsx                   (EDIT — embed widget)
  apps/frontend/src/pages/accounting/estimates/EstimateCreate.tsx           (EDIT — embed widget)
  apps/frontend/src/pages/maintenance/work-orders/WorkOrderCreate.tsx       (EDIT — embed widget)
  apps/frontend/src/pages/dispatch/book-load/BookLoad.tsx                   (EDIT — additive to OCR)
  scripts/verify-upload-widget-presence.mjs                                 (NEW CI guard)
  docs/specs/gap-11-universal-upload-widget.md                              (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Jorge 2026-05-07 chat verbatim: "ANYWHERE WE CREATE AN EXPENSE OR A 
        BILL, WE SHOULD BE ABLE TO UPLOAD A DOCUMENT, CONFIRMATION, RECEIPT 
        ETC. IT SHOULD BE BY CLICKING BUTTON WITHIN BOX OR BY DRAGGING DOC. 
        ESTIMATES AS WELL, IN BOOK LOADS FOR THE OCR I SHOULD ALSO BE ABLE 
        TO UPLOAD CONFIRMATION ETC."

PROBLEM: Only Book Load wizard supports drag-drop OCR upload. Every other 
form (Expense, Bill, Estimate, WO) lacks upload widget. Operators must 
upload through separate Documents module after creating, breaking workflow.

SCOPE — ADDITIVE ONLY:

PIECE A — Reusable component
  DocumentUploadWidget.tsx:
    Props: {context: 'expense'|'bill'|'estimate'|'wo'|'invoice'|'book-load',
            parent_uuid?: UUID, accepts: ['pdf','image'], maxSizeMB: 10,
            onUploaded: (evidence_uuid) => void}
    Behavior:
      - Drag-drop zone OR click-to-browse
      - Thumbnail preview (PDF first page, image as-is)
      - Upload via documents.evidence_create() pattern (Part 3.17)
      - Returns evidence_uuid on success
      - Multi-file support (up to 5 per upload session)
      - Progress bar per file

PIECE B — Client library
  document-upload-client.ts:
    - Wraps fetch to /api/documents/upload
    - Handles multipart/form-data
    - Returns evidence_uuid + metadata

PIECE C — Backend confirm pattern
  upload.routes.ts EDIT:
    - Ensure /api/documents/upload accepts context + parent_uuid
    - Returns {evidence_uuid, chain_of_custody_id, r2_url}
    - Audit event emitted
    - RLS-scoped per operating_company_id

PIECE D — Wire into 5 forms
  ExpenseCreate.tsx: embed widget below line items (context='expense', 
    onUploaded → attach evidence_uuid to expense.attachments[])
  BillCreate.tsx: same (context='bill')
  EstimateCreate.tsx: same (context='estimate')
  WorkOrderCreate.tsx: same (context='wo')
  BookLoad.tsx: ADDITIVE to existing rate-con OCR — adds second widget 
    "Upload additional confirmations" (context='book-load')

PIECE E — CI guard
  verify-upload-widget-presence.mjs:
    - Scans ExpenseCreate/BillCreate/EstimateCreate/WorkOrderCreate/BookLoad 
      for <DocumentUploadWidget> usage
    - Fails CI if any form lacks the widget
    - Wired into verify:arch-design

PIECE F — Tests
  DocumentUploadWidget.test.tsx: drag-drop, click, multi-file, oversize 
    rejection, error states.
  upload-widget-integration.test.ts: round-trip from each context.

PIECE G — Docs
  docs/specs/gap-11-universal-upload-widget.md

ACCEPTANCE:
[ ] Widget renders in all 5 forms
[ ] Drag-drop works in each context
[ ] Click-to-browse works
[ ] Files land in R2 via evidence_create()
[ ] evidence_uuid attached to parent record
[ ] verify-upload-widget-presence.mjs in CI chain
[ ] No regression on Book Load OCR

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest + Vitest UI tests pass · block-ready.mjs EXIT=0

PAUSE: if R2 upload fails in any test, STOP — verify R2 credentials in CI 
       env match prod pattern.

POST-MERGE NEXT STEPS: GAP-21 (Bill OCR) and GAP-22 (Expense OCR) consume 
this widget for OCR workflows.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
