-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DO NOT RUN ON PROD — run ONLY on a Neon branch by
-- Jorge's hand, then ledger-backfill so prod db:migrate skips it. Registered in
-- db/migrations/.held-migrations.json.
--
-- Accounting audit ranked-PR queue item 12/22 — "Claim→WO→Bill/Expense FKs" (accounting-RANKED-PRS-6-12.md).
-- Companion tracker: docs/trackers/DESIGN-HOLD-ACCT-CLAIM-WO-BILL-FK-2026-07-22.md.
--
-- CONTEXT (read before applying): apps/backend/src/insurance/claim.routes.ts's own claim-graph
-- endpoint (GET /api/v1/insurance/claims/:id/graph) documents this exact gap in its response payload
-- (`gaps.expense = "no accounting.expenses.claim_id (or equivalent) on prod"`,
-- `gaps.work_order = "no maintenance.work_orders.claim_id on prod"`), and
-- docs/trackers/LAW-E2E-CLAIM-LEGAL-EXPENSE-LINKAGE-2026-07-21.md hop 3 independently confirms it via
-- Neon `information_schema` (RLS-bypass) introspection: accounting.expenses carries driver_uuid /
-- unit_id / load_id / linked_work_order_uuid / payment_account_uuid / journal_entry_id — no claim_id.
-- accounting.bills carries source / source_system / the WO link — no claim_id. maintenance.work_orders
-- (0049) carries unit_id / vendor_id — no claim_id. So a claim that causes a repair (WO) or a direct
-- cost (bill/expense — e.g. a deductible payment or a third-party invoice) cannot be walked forward
-- from insurance.claim to the money/ops record, or reverse from the WO/bill/expense back to the claim.
--
-- NAMING: uses `insurance_claim_id` (NOT bare `claim_id`) to match the established convention for every
-- existing FK that points INTO insurance.claim — legal.matters.insurance_claim_id (P4-02),
-- safety.accident_reports.insurance_claim_id (P4-01), safety.incidents.auto_created_claim_id (P4-05).
-- A bare `claim_id` here would be needless naming drift against that precedent (Rule 05/00 consistency).
--
-- WHAT THIS DOES (pure additive linkage — NO money amounts, NO posting math, NO GL/JE write, NO flag
-- flips, NO RLS/grant/security_invoker changes — new nullable columns inherit each table's existing
-- FORCED RLS policy + grants, same reasoning as 202607050810's unit_id add):
--   1. maintenance.work_orders : + insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL
--   2. accounting.bills        : + insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL
--   3. accounting.expenses     : + insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL
-- Each new column is all-NULL on add, so the inline FK holds trivially — no NOT VALID, no backfill.
-- ON DELETE SET NULL: claims are void-not-delete (status transitions, never DELETE), so this only ever
-- engages defensively. Additive-only, idempotent (ADD COLUMN IF NOT EXISTS).
--
-- OUT OF SCOPE (design-only, per the 12/22 block's exact ask — Claim→WO→Bill/Expense only):
--   * legal.matters money linkage (already has insurance_claim_id/insurance_lawsuit_id — separate gap)
--   * driver_finance.driver_settlement_deductions claim-source FK (graph API's third documented gap —
--     a distinct settlement-recovery design, not this block's scope)
--   * any UI/route wiring to READ or WRITE these columns, or a "+ Create bill/expense from claim" CTA —
--     code wiring is a follow-up CODE PR after Jorge Neon-applies this migration (audit-first discipline,
--     matching LAW-E2E-CLAIM-LEGAL-EXPENSE-LINKAGE-2026-07-21.md's "no code fixes in this PR")
--   * GL posting of claim-linked money (out of scope for every claim-economics slice to date)
--
-- Tier-1 — build-and-hold. Never self-merge. Owner JORGE-APPROVED + Neon-apply required.

BEGIN;

-- 1. maintenance.work_orders --------------------------------------------------------------
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_insurance_claim
  ON maintenance.work_orders (insurance_claim_id)
  WHERE insurance_claim_id IS NOT NULL;

-- 2. accounting.bills ----------------------------------------------------------------------
ALTER TABLE accounting.bills
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bills_insurance_claim
  ON accounting.bills (insurance_claim_id)
  WHERE insurance_claim_id IS NOT NULL;

-- 3. accounting.expenses -------------------------------------------------------------------
ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_insurance_claim
  ON accounting.expenses (insurance_claim_id)
  WHERE insurance_claim_id IS NOT NULL;

COMMIT;
