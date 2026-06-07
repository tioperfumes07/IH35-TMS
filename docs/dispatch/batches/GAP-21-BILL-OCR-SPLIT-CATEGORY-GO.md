═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-21 — Bill OCR + Split-Category Line Items
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-I  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-20 (Lane A) — same wave G-I

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-20 owned):
  apps/backend/src/accounting/bills/recurring/**
  apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx
  apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx
  migrations/0307_recurring_bills.sql

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/accounting/bills/ocr/ocr-extractor.service.ts             (NEW)
  apps/backend/src/accounting/bills/ocr/category-classifier.service.ts       (NEW)
  apps/backend/src/accounting/bills/ocr/ocr.routes.ts                        (NEW)
  apps/backend/src/accounting/bills/ocr/__tests__/ocr.test.ts                (NEW)
  apps/frontend/src/components/bills/BillOcrPanel.tsx                        (NEW)
  apps/frontend/src/components/bills/OcrLineItemEditor.tsx                   (NEW)
  apps/frontend/src/pages/accounting/bills/BillCreate.tsx                    (EDIT — embed OCR)
  scripts/verify-bill-ocr-flow.mjs                                           (NEW CI guard)
  docs/specs/gap-21-bill-ocr.md                                              (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Maintenance invoice OCR (existing for WO) 
        extended to ALL bills · Vendor invoices come as PDF/photo and 
        require manual transcription

PROBLEM: Vendor bills arrive as PDF emails or photos. Operator manually
re-types: vendor name, invoice #, amount, line items, categories. Error-
prone + slow + categorization inconsistent.

SCOPE — ADDITIVE ONLY (depends on GAP-11 universal upload widget already 
deployed in BillCreate.tsx):

PIECE A — OCR extractor service
  ocr-extractor.service.ts:
    extractBillFromImage(evidence_uuid) →
      Pulls R2 file via existing evidence pattern
      Calls Tesseract or AWS Textract (already used for rate-con OCR in 
      Book Load wizard — reuse same module)
      Extracts: vendor_name (fuzzy match to catalog), invoice_number, 
        total_amount, due_date, line_items[]
      Returns extraction with confidence score per field.

PIECE B — Category classifier
  category-classifier.service.ts:
    classifyLineItem(description, amount, vendor_uuid) →
      Uses vendor's historical category distribution + heuristics
      Returns suggested category_id + confidence
      Operator can override.

PIECE C — Routes
  POST /api/accounting/bills/ocr/extract body: {evidence_uuid}
  POST /api/accounting/bills/ocr/classify-lines body: {lines, vendor_uuid}

PIECE D — Frontend BillOcrPanel
  BillOcrPanel.tsx:
    Renders below DocumentUploadWidget (GAP-11) in BillCreate.tsx
    On upload → auto-triggers OCR
    Shows extracted fields with confidence badges
    Operator can accept / override each field
    Auto-populates BillCreate form

PIECE E — OcrLineItemEditor
  OcrLineItemEditor.tsx: 
    Per extracted line: description (editable), amount, suggested category
    Confidence pill (green/amber/red)
    "+ Split this line into multiple categories" button

PIECE F — BillCreate wiring
  BillCreate.tsx EDIT: 
    Add BillOcrPanel between DocumentUploadWidget and line-items section.
    On user "Apply OCR results" → fills form fields.

PIECE G — CI guard
  verify-bill-ocr-flow.mjs: routes registered, panel rendered in BillCreate, 
    classifier integrated.

PIECE H — Tests
  ocr.test.ts: extraction accuracy on test PDFs (>=80%), classification 
    accuracy (>=70%), confidence reporting, override flow.

PIECE I — Docs
  docs/specs/gap-21-bill-ocr.md

ACCEPTANCE:
[ ] OCR extracts fields with confidence
[ ] Classifier suggests categories
[ ] BillCreate auto-populates from OCR
[ ] Operator can override every field
[ ] verify-bill-ocr-flow.mjs in CI chain
[ ] No regression on existing rate-con OCR (Book Load)

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if Tesseract/Textract dependency fails to install in CI, STOP and 
       resolve env config before continuing.

POST-MERGE NEXT STEPS: same pattern reused by GAP-22 (Expense receipt OCR).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
