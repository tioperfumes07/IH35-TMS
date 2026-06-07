═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-12 — Invoice from Non-Load Source (Driver Damage + Custom)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-E  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-11 (Lane A) — same wave G-E

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-11 owned):
  apps/frontend/src/components/shared/DocumentUploadWidget.tsx
  apps/frontend/src/lib/document-upload-client.ts
  apps/backend/src/documents/**
  apps/frontend/src/pages/accounting/expenses/ExpenseCreate.tsx
  apps/frontend/src/pages/accounting/bills/BillCreate.tsx
  apps/frontend/src/pages/accounting/estimates/EstimateCreate.tsx
  apps/frontend/src/pages/maintenance/work-orders/WorkOrderCreate.tsx
  apps/frontend/src/pages/dispatch/book-load/BookLoad.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/accounting/invoices/non-load-invoice/create.service.ts   (NEW)
  apps/backend/src/accounting/invoices/non-load-invoice/create.routes.ts    (NEW)
  apps/backend/src/accounting/invoices/non-load-invoice/__tests__/          (NEW dir)
  apps/frontend/src/pages/accounting/invoices/CreateInvoice.tsx             (NEW)
  apps/frontend/src/components/invoices/InvoiceRecipientPicker.tsx          (NEW)
  apps/frontend/src/components/invoices/InvoiceLineItemEditor.tsx           (NEW)
  apps/frontend/src/components/invoices/DamageInvoiceAutoPopulate.tsx       (NEW)
  apps/frontend/src/pages/accounting/invoices/InvoiceList.tsx               (EDIT — add + Create button)
  scripts/verify-non-load-invoice-flow.mjs                                  (NEW CI guard)
  docs/specs/gap-12-non-load-invoice.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Jorge 2026-05-07 chat verbatim: "WHAT ABOUT AN INVOICE IF I INVOICE A 
        DRIVER FOR DAMAGE?" · Existing invoice flow only supports 
        invoice-from-load (auto-generated from dispatch.loads). Driver-billed 
        invoices + ad-hoc customer invoices not supported.

PROBLEM: + Create Invoice button does not exist on /accounting/invoices. 
Driver damage cannot be invoiced (must use Bill module, wrong semantic). 
Custom one-off customer invoices unsupported.

SCOPE — ADDITIVE ONLY:

PIECE A — Backend service
  create.service.ts:
    createNonLoadInvoice({
      recipient_type: 'customer'|'driver'|'vendor',
      recipient_uuid: UUID,
      line_items: [{description, qty, unit_price, tax_code_id?}],
      memo, due_date, terms_uuid?,
      source_type?: 'damage'|'custom'|'admin-fee'|'other',
      source_uuid?: UUID  // e.g. damage_report_uuid
    }) → invoice_uuid
    Validates RLS, computes totals, creates invoice + lines, 
    emits audit_event, queues QBO outbox sync.
    If recipient_type='driver' AND source_type='damage':
      - Auto-creates driver_finance.driver_liabilities row linked to invoice
      - Adds to driver deduction queue for next settlement

PIECE B — Routes
  POST /api/accounting/invoices/non-load body: {...}
  GET  /api/accounting/invoices/from-damage/:damage_report_uuid (helper for auto-populate)

PIECE C — Frontend CreateInvoice page
  CreateInvoice.tsx (new route /accounting/invoices/create):
    - Step 1: Recipient picker (Customer/Driver/Vendor radio)
    - Step 2: Source picker (Damage report / Custom / Admin fee / Other)
    - Step 3: Line items editor (typeahead products + qty + price + tax)
    - Step 4: Memo, due date, terms
    - Step 5: Review + submit
    If recipient=Driver + source=Damage: 
      DamageInvoiceAutoPopulate component auto-fills lines from 
      damage_reports table (selected via picker).

PIECE D — InvoiceList button
  InvoiceList.tsx EDIT: add "+ Create Invoice" button (top-right, primary 
  color). Links to /accounting/invoices/create.

PIECE E — CI guard
  verify-non-load-invoice-flow.mjs:
    - Routes registered
    - "+ Create Invoice" button in InvoiceList
    - DamageInvoiceAutoPopulate component renders when triggered
    - Wired into verify:arch-design

PIECE F — Tests
  create.test.ts: customer invoice, driver damage invoice (with auto-liability), 
  vendor invoice, tax computation, QBO outbox queued, RLS isolation.

PIECE G — Docs
  docs/specs/gap-12-non-load-invoice.md

ACCEPTANCE:
[ ] + Create Invoice button visible on InvoiceList
[ ] Customer/Driver/Vendor invoice flows all work
[ ] Driver damage flow auto-creates liability row
[ ] QBO outbox queued for all
[ ] verify-non-load-invoice-flow.mjs in CI chain
[ ] No regression on load-generated invoice flow

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if driver damage flow creates orphan liability without invoice link, 
       STOP — financial integrity gap.

POST-MERGE NEXT STEPS: Pattern enables future custom invoice flows 
(admin fees, restocking, etc.) — same component reused.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
