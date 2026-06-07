═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-44 — Form 425C Exhibits A-F Auto-Build
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-U  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-45 (Lane B) — same wave G-U

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-45 owned):
  apps/backend/src/reports/cash-flow/route-fix.ts
  apps/frontend/src/pages/reports/CashFlowReport.tsx
  apps/frontend/src/pages/reports/PerTruckCpmReport.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/reports/form-425c/exhibits/exhibit-a-cash-receipts.ts     (NEW)
  apps/backend/src/reports/form-425c/exhibits/exhibit-b-disbursements.ts     (NEW)
  apps/backend/src/reports/form-425c/exhibits/exhibit-c-bank-reconciliation.ts (NEW)
  apps/backend/src/reports/form-425c/exhibits/exhibit-d-quarterly-fees.ts    (NEW)
  apps/backend/src/reports/form-425c/exhibits/exhibit-e-statements-summary.ts (NEW)
  apps/backend/src/reports/form-425c/exhibits/exhibit-f-supporting-docs.ts   (NEW)
  apps/backend/src/reports/form-425c/exhibits/exhibits-builder.service.ts    (NEW)
  apps/backend/src/reports/form-425c/exhibits/routes.ts                      (NEW)
  apps/backend/src/reports/form-425c/exhibits/__tests__/                     (NEW dir)
  apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx               (NEW)
  apps/frontend/src/components/form-425c/ExhibitCard.tsx                     (NEW)
  scripts/verify-form-425c-exhibits.mjs                                      (NEW CI guard)
  docs/specs/gap-44-form-425c-exhibits.md                                    (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Form 425C Monthly Operating Report shipped (Phase 3) · Exhibits A-F 
        currently manual attachment · TRANSP Chapter 11 DIP filing requires 
        these every month · bankruptcy court audit-ready

PROBLEM: Form 425C requires 6 supporting exhibits with specific data:
  Exhibit A: Cash receipts detail (per category, per source)
  Exhibit B: Cash disbursements detail (per vendor, per category)  
  Exhibit C: Bank reconciliation summary (per account)
  Exhibit D: U.S. Trustee quarterly fee calculation
  Exhibit E: Statements summary (P&L, BS, CF snapshots)
  Exhibit F: Supporting documentation list (invoices, bills, statements)

Today: dispatcher prints, manual-attaches. Error-prone. Format inconsistent.

SCOPE — ADDITIVE ONLY:

PIECE A — Per-exhibit services
  exhibit-a-cash-receipts.ts:
    buildExhibitA(operating_company_id, period_start, period_end) →
      Query accounting.payments WHERE deposited_at in period
      Group by source_type (customer / factor / refund / other)
      Returns structured data for PDF rendering

  exhibit-b-disbursements.ts:
    buildExhibitB(...) →
      Query accounting.payments WHERE direction='outgoing' in period
      Group by vendor + category
      
  exhibit-c-bank-reconciliation.ts:
    buildExhibitC(...) →
      Per accounting.bank_accounts: opening balance + activity + closing
      
  exhibit-d-quarterly-fees.ts:
    buildExhibitD(...) →
      U.S. Trustee fee tier per quarterly disbursements
      Formula per 28 U.S.C. § 1930(a)(6)
      
  exhibit-e-statements-summary.ts:
    buildExhibitE(...) →
      Pulls existing P&L (Block-12), BS (Block-13), CF (Block-14) for period
      Renders summary snapshots
      
  exhibit-f-supporting-docs.ts:
    buildExhibitF(...) →
      List of all supporting docs (invoices/bills/statements) with 
      evidence_uuid references for audit chain

PIECE B — Builder service
  exhibits-builder.service.ts:
    buildAllExhibits(operating_company_id, period_start, period_end) →
      Sequentially builds A-F, returns combined PDF + xlsx export.

PIECE C — Routes
  POST /api/reports/form-425c/exhibits/build body: {operating_company_id, period_start, period_end}
  GET  /api/reports/form-425c/exhibits/:filing_uuid (latest built)
  GET  /api/reports/form-425c/exhibits/:filing_uuid/exhibit/:letter (single exhibit)

PIECE D — Frontend
  ExhibitsViewer.tsx: tabbed UI showing each exhibit, export button per exhibit
  ExhibitCard.tsx: card per exhibit on Form 425C page

PIECE E — CI guard
  verify-form-425c-exhibits.mjs: all 6 exhibits build for sample period, 
    routes registered, UI panels render.

PIECE F — Tests
  Per-exhibit unit tests: builder accuracy, RLS isolation, edge cases 
    (period with no activity, period with > threshold disbursements).
  Quarterly fee calc test against 28 U.S.C. § 1930 tier table.

PIECE G — Docs
  docs/specs/gap-44-form-425c-exhibits.md (cite Form 425C spec, bankruptcy 
  trustee requirements, fee statute)

ACCEPTANCE:
[ ] All 6 exhibits build for any period
[ ] PDF export combines all 6 in court-ready format
[ ] Xlsx export available per exhibit
[ ] Quarterly fee calc matches statute tiers exactly
[ ] verify-form-425c-exhibits.mjs in CI chain
[ ] No regression on Form 425C main page

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if quarterly fee calc off by >$1 vs hand-computed control, STOP — 
       trustee will reject filing.

POST-MERGE NEXT STEPS: TRANSP monthly filings switch from manual to TMS 
       auto-build flow.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
