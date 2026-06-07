═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-22 — Expense Receipt OCR + Mileage Reimbursement
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-J  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-23 (Lane B) — same wave G-J

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-23 owned):
  apps/backend/src/integrations/samsara/cache/**
  apps/backend/src/lib/cache-tiers.ts

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/accounting/expenses/receipt-ocr/extractor.service.ts      (NEW)
  apps/backend/src/accounting/expenses/receipt-ocr/routes.ts                 (NEW)
  apps/backend/src/accounting/expenses/mileage/calculator.service.ts         (NEW)
  apps/backend/src/accounting/expenses/mileage/routes.ts                     (NEW)
  apps/backend/src/accounting/expenses/__tests__/                            (NEW dir)
  apps/frontend/src/components/expenses/ReceiptOcrPanel.tsx                  (NEW)
  apps/frontend/src/components/expenses/MileageReimbursementForm.tsx         (NEW)
  apps/frontend/src/pages/accounting/expenses/ExpenseCreate.tsx              (EDIT — embed both)
  migrations/0308_mileage_reimbursement_log.sql                              (NEW)
  scripts/verify-expense-ocr-mileage.mjs                                     (NEW CI guard)
  docs/specs/gap-22-expense-receipt-ocr-mileage.md                           (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Receipt OCR for personal expense 
        reimbursement · IRS standard mileage rate auto-compute · Owner 
        + driver use case

PROBLEM: Receipts come as photos on phones. Mileage reimbursement requires
manual calc (miles × IRS rate). No automation today. Operators avoid 
submitting small expenses due to friction → missed cost tracking.

SCOPE — ADDITIVE ONLY (consumes GAP-11 upload widget + GAP-21 OCR pattern):

PIECE A — Migration 0308
  CREATE TABLE IF NOT EXISTS accounting.mileage_reimbursement_log (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    submitted_by_user_uuid UUID NOT NULL,
    trip_date DATE NOT NULL,
    miles NUMERIC(8,2) NOT NULL,
    rate_per_mile NUMERIC(6,3) NOT NULL,
    total_reimbursement NUMERIC(10,2) GENERATED ALWAYS AS (miles * rate_per_mile) STORED,
    purpose TEXT NOT NULL,
    origin_address TEXT,
    destination_address TEXT,
    expense_uuid UUID,  -- linked once approved
    status TEXT CHECK (status IN ('draft','submitted','approved','rejected','reimbursed')) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  GRANT SELECT, INSERT, UPDATE ON accounting.mileage_reimbursement_log TO app_user;

PIECE B — Receipt OCR extractor
  extractor.service.ts:
    extractReceiptFromImage(evidence_uuid) →
      Reuses Tesseract/Textract module from GAP-21
      Extracts: merchant_name, transaction_date, total, payment_method, 
        category hints (gas station / restaurant / hotel / parts / other)
      Returns extraction with per-field confidence

PIECE C — Mileage calculator
  calculator.service.ts:
    calculateMileageReimbursement({miles, trip_date}) →
      Looks up IRS standard rate for trip_date 
      (2026 rate baked in: $0.67/mile; updated annually via constants file)
      Returns {miles, rate, total}
    Validates miles > 0 AND miles < 2000 (sanity)

PIECE D — Routes
  POST /api/accounting/expenses/receipt-ocr/extract body: {evidence_uuid}
  POST /api/accounting/expenses/mileage/calculate body: {miles, trip_date}
  POST /api/accounting/expenses/mileage/submit body: {miles, trip_date, 
       purpose, origin, destination, evidence_uuid?}

PIECE E — Frontend
  ReceiptOcrPanel.tsx: same pattern as BillOcrPanel from GAP-21 but for 
    expense receipts; auto-fills ExpenseCreate form.
  MileageReimbursementForm.tsx: 
    Trip date + origin + destination + miles + purpose
    Live calc preview
    Submit → creates draft expense + mileage log entry
  ExpenseCreate.tsx EDIT:
    Top: tab/toggle "Receipt-based" vs "Mileage-based"
    Receipt mode: shows ReceiptOcrPanel
    Mileage mode: shows MileageReimbursementForm

PIECE F — CI guard
  verify-expense-ocr-mileage.mjs: migration applied, routes registered, 
    UI components rendered, IRS rate constant valid.

PIECE G — Tests
  extractor.test.ts: receipt extraction accuracy
  calculator.test.ts: per-year IRS rate lookup, sanity bounds, RLS

PIECE H — Docs
  docs/specs/gap-22-expense-receipt-ocr-mileage.md (cite IRS rate source)

ACCEPTANCE:
[ ] Migration 0308 applied
[ ] Receipt OCR auto-fills expense form
[ ] Mileage form computes IRS rate correctly
[ ] Submit creates draft expense + log entry
[ ] verify-expense-ocr-mileage.mjs in CI chain
[ ] No regression on existing expense creation

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if IRS rate constants table missing 2025+ rates, STOP — must have 
       all active years.

POST-MERGE NEXT STEPS: Owner can review mileage queue and bulk-approve 
       monthly reimbursements.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
