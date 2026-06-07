═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-20 — Recurring Bills (QBO Parity)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-I  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-21 (Lane B) — same wave G-I

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-21 owned):
  apps/backend/src/accounting/bills/ocr/**
  apps/frontend/src/components/bills/BillOcrPanel.tsx

ALLOWED FILES (disjoint from Lane B):
  migrations/0307_recurring_bills.sql                                        (NEW)
  apps/backend/src/accounting/bills/recurring/template.service.ts            (NEW)
  apps/backend/src/accounting/bills/recurring/generator.service.ts           (NEW)
  apps/backend/src/accounting/bills/recurring/routes.ts                      (NEW)
  apps/backend/src/accounting/bills/recurring/__tests__/                     (NEW dir)
  apps/backend/src/jobs/recurring-bill-generator-worker.ts                   (NEW)
  apps/frontend/src/pages/accounting/bills/RecurringBillList.tsx             (NEW)
  apps/frontend/src/pages/accounting/bills/RecurringBillCreate.tsx           (NEW)
  apps/frontend/src/pages/accounting/bills/BillList.tsx                      (EDIT — add Recurring tab)
  scripts/verify-recurring-bills.mjs                                         (NEW CI guard)
  docs/specs/gap-20-recurring-bills.md                                       (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: P6-Recurring from Phase 6 EDI+Optimization · QBO parity item · 
        Insurance, rent, software subscriptions = recurring expenses

PROBLEM: Operators must manually create the SAME bill every month for:
  - Insurance premium (Wells Fargo escrow)
  - Office rent
  - Software subscriptions (QBO, Samsara, Relay)
  - Loan payments
  - Recurring vendor retainers
QBO supports recurring bills natively; TMS does not. Manual re-entry = 
human error + missed bills.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0307
  CREATE TABLE IF NOT EXISTS accounting.recurring_bill_templates (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    vendor_uuid UUID NOT NULL,
    template_name TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    memo TEXT,
    frequency TEXT CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','annually')) NOT NULL,
    day_of_month INTEGER,
    day_of_week INTEGER,
    next_generation_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    auto_post BOOLEAN NOT NULL DEFAULT false,
    line_items JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS accounting.recurring_bill_generation_log (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    template_uuid UUID NOT NULL REFERENCES accounting.recurring_bill_templates(uuid),
    generated_bill_uuid UUID,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT CHECK (status IN ('success','failed')) NOT NULL,
    error_message TEXT
  );
  CREATE INDEX idx_rb_active ON accounting.recurring_bill_templates(is_active, next_generation_date);
  GRANT SELECT, INSERT, UPDATE ON accounting.recurring_bill_templates TO app_user;
  GRANT SELECT, INSERT ON accounting.recurring_bill_generation_log TO app_user;

PIECE B — Template service
  template.service.ts:
    createTemplate(data) → template_uuid
    updateTemplate(uuid, data) → template_uuid
    deactivateTemplate(uuid) → audit + is_active=false (NEVER DELETE)
    listActive() → templates due for generation in next 7 days

PIECE C — Generator service + worker
  generator.service.ts:
    generateFromTemplate(template_uuid, target_date) →
      Creates accounting.bills row from template
      Computes next_generation_date based on frequency
      Updates template + writes to generation_log
      If auto_post=true: also posts via Block-7 posting engine
  recurring-bill-generator-worker.ts: runs daily at 06:00 CT, processes all 
    templates with next_generation_date <= today.

PIECE D — Routes
  POST   /api/accounting/recurring-bills/templates
  GET    /api/accounting/recurring-bills/templates
  GET    /api/accounting/recurring-bills/templates/:uuid
  PATCH  /api/accounting/recurring-bills/templates/:uuid
  PATCH  /api/accounting/recurring-bills/templates/:uuid/deactivate
  POST   /api/accounting/recurring-bills/templates/:uuid/generate-now (manual trigger)
  GET    /api/accounting/recurring-bills/generation-log

PIECE E — Frontend
  RecurringBillList.tsx (tab on /accounting/bills page):
    Table: Vendor | Template name | Frequency | Next date | Amount | Active/Inactive | Actions
    "+ Create Recurring Bill" button
  RecurringBillCreate.tsx: form with vendor picker, frequency, schedule, 
    line items (matches BillCreate.tsx structure)
  BillList.tsx EDIT: add "Recurring" tab alongside "Active" / "Paid" / "Drafts"

PIECE F — CI guard
  verify-recurring-bills.mjs: migration applied, worker registered, routes 
    registered, deactivation flow (no delete).

PIECE G — Tests
  template.test.ts: CRUD, deactivation audit, no-delete enforcement
  generator.test.ts: per-frequency generation, next_date calc, auto-post

PIECE H — Docs
  docs/specs/gap-20-recurring-bills.md

ACCEPTANCE:
[ ] Migration 0307 applied
[ ] Templates CRUD works
[ ] Worker generates bills daily at 06:00 CT
[ ] auto_post=true triggers posting
[ ] Deactivation flow doesn't delete (additive-only enforced)
[ ] verify-recurring-bills.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if generator produces duplicate bills (next_date calc bug), STOP — 
       financial integrity issue.

POST-MERGE NEXT STEPS: integrates with QBO mirror so recurring bills sync 
       to QBO recurring-template feature for parity.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
