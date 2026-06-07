═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-CRITICAL / TASK GAP-53 — Bank Account Multi-Company Drift Fix
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-B  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-54 (Lane B) — same wave P2-B

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-54 owned):
  apps/backend/src/integrations/samsara/geofences/wf-051-radius.ts
  apps/driver-pwa/src/lib/arrival-prompt-trigger.ts

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/banking/integrity/account-company-audit.service.ts       (NEW)
  apps/backend/src/banking/integrity/account-company-audit.routes.ts        (NEW)
  apps/backend/src/banking/integrity/__tests__/account-company-audit.test.ts (NEW)
  apps/backend/scripts/backfill-bank-account-company-tagging.mjs            (NEW one-shot)
  apps/backend/scripts/report-bank-account-historical-txn-drift.mjs         (NEW report)
  scripts/verify-bank-account-company-assignment.mjs                        (NEW CI guard)
  docs/runbooks/BANK-ACCOUNT-COMPANY-AUDIT.md                               (NEW)
  docs/specs/gap-53-bank-multi-company-drift.md                             (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Jorge 2026-05-10 chat verbatim: "Transportation's three Wells Fargo 
        accounts appearing incorrectly under Trucking" · Never root-fixed · 
        Pass-2 CRITICAL finding · Financial entity integrity hole

PROBLEM: accounting.bank_accounts has rows where operating_company_id may 
not match actual carrier ownership. Specifically:
  - Wells Fargo Operating ••6103 (TRANSP) may appear under TRK
  - Wells Fargo Payroll ••6129 (TRANSP) may appear under TRK  
  - Wells Fargo DIP Reserve ••6137 (TRANSP) may appear under TRK
This causes: wrong-entity P&L, wrong-entity bank balance display, wrong-
entity 425C filings.

SCOPE — ADDITIVE ONLY (NO destructive migration — audit + flag + manual fix path):

PIECE A — Audit service
  account-company-audit.service.ts:
    auditBankAccountCompanyAssignment() →
      For each accounting.bank_accounts row:
        - Read account number last 4 + bank name
        - Cross-reference: which carrier per Jorge's locked mapping
        - Flag if operating_company_id mismatches expected
      Returns [{account_uuid, current_oci, expected_oci, evidence, severity}]
  applyCompanyReassignment(account_uuid, new_oci, user_uuid) →
    Updates row, emits high-risk audit event WF-064.
    Backfills any orphaned transactions tagged to old OCI.

PIECE B — Routes
  GET  /api/banking/integrity/account-company-audit
  POST /api/banking/integrity/account-company-audit/reassign 
       body: {account_uuid, new_operating_company_id} (Owner role only)

PIECE C — Backfill scripts
  backfill-bank-account-company-tagging.mjs: dry-run mode first, prints diff
  report-bank-account-historical-txn-drift.mjs: lists transactions whose 
    bank_account_uuid would be re-tagged

PIECE D — CI guard
  verify-bank-account-company-assignment.mjs:
    - Locked truth table: which 4-digit suffix belongs to which OCI
    - Fails CI if any account's operating_company_id mismatches truth table
    - Wired into verify:arch-design

PIECE E — Tests
  account-company-audit.test.ts: detection, reassignment flow, audit event, 
    Owner-only RBAC enforcement, idempotency.

PIECE F — Runbook + docs
  docs/runbooks/BANK-ACCOUNT-COMPANY-AUDIT.md: ops procedure
  docs/specs/gap-53-bank-multi-company-drift.md: history + design

ACCEPTANCE:
[ ] Audit identifies all current mismatches (expected: ≥3 Wells Fargo TRANSP rows)
[ ] Operator can reassign via Owner-only flow
[ ] Reassignment emits WF-064 audit event
[ ] Historical txn report produced for backfill
[ ] verify-bank-account-company-assignment.mjs in CI chain — fails if drift returns
[ ] No accidental destructive changes (audit-first, manual-apply pattern)

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if audit detects MORE than 3 Wells Fargo mismatches OR detects 
       any Amex/other mismatches, STOP and report to Jorge — broader 
       drift than known.

POST-MERGE NEXT STEPS: Run runbook to actually re-tag the 3 known accounts. 
This block delivers the INFRASTRUCTURE; ops runs the operation.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
