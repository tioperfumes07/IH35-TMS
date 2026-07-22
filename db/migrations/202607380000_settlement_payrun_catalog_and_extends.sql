-- [HOLD-FOR-JORGE — TIER 1] Settlement Pay-Run — payment-method CATALOG + reuse-and-extend of the
-- canonical driver_finance advance / settlement infra. Financial cluster, PROTECTED, gated.
-- NEVER self-merge; owner merges the HOLD PR.
-- DO NOT RUN ON PROD — runs ONLY on a Neon branch by Jorge's hand, then ledger-backfilled (held-migration
-- firewall + .held-migrations.json enforce this at execution time). Ordered AFTER 202607370000.
--
-- FIXED 2026-07-21 — line_type CHECK rewritten as true live-superset + multi-constraint drop; do not apply pre-fix versions.
--
-- CANONICAL-CHECK: payment_method_catalog. catalogs.payment_methods is the OWNER-EDITABLE payment-method
--   CATALOG (QBO pattern) — the list of methods a company can pay by (ACH/Wire/Check/Cash/…), each pinned to
--   the cash/bank GL account it draws from. This is DISTINCT from driver_finance.driver_payment_methods (the
--   per-driver method row): driver_payment_methods.payment_method_id will FK INTO this catalog. It is a
--   catalog, NOT a second per-driver ledger — no duplicate of driver_payment_methods, driver_advances, or any
--   money ledger. (Reconciliation with the existing driver_finance ledgers verified 2026-07-13.)
--
-- SCOPE (reuse-and-extend; owner GO 2026-07-13 — no new ledgers, ONLY the catalog is new):
--   1. NEW  catalogs.payment_methods (owner-editable catalog; FORCE RLS + 0065 grants, no-DELETE; seed 8).
--   2. FK   driver_finance.driver_payment_methods.payment_method_id -> catalogs.payment_methods (expand; the
--           column was added nullable in 202607370000 — the FK lands here now the catalog exists).
--   3. EXTEND driver_finance.driver_advances (the ADVANCE LEDGER): payment_method_id (how it was disbursed)
--           + recovered_in_settlement_id (idempotent recovery linkage to driver_settlements).
--   4. EXTEND driver_finance.cash_advance_requests (the REQUEST/APPROVAL workflow): submitted_by_user_id
--           (the office "maker") + maker<>checker CHECK vs reviewed_by_user_id (I4). Owner/Admin auto-approve
--           leaves reviewed_by NULL (role IS the authority); other roles need a DISTINCT approver.
--   5. EXTEND driver_finance.settlement_lines line_type CHECK as a TRUE LIVE SUPERSET: keep all 11 live
--           values + ADD only 'escrow_contribution' (never narrow; drop ALL prior line_type CHECKs first).
--  5b. NO-OP — role_key CHECK widening for settlement/abandonment is owned by 202607670000 (primary +
--           legacy supersets). Do not seed catalogs.account_role_bindings; do not re-narrow role_key here.
--   6. NEW  driver_finance.payrun_gl_runs — a one-row-per-settlement GL-run IDEMPOTENCY ANCHOR (NOT a ledger;
--           UNIQUE (operating_company_id, settlement_id) so a repeated pay-run close cannot double-post the JE;
--           FORCE RLS + 0065 grants, no-DELETE). See its CANONICAL-CHECK block below.
-- Additive/idempotent (ADD COLUMN IF NOT EXISTS, guarded constraint swaps, seed EXISTS-guarded + ON CONFLICT).
-- No GL/posting math here (that reuses the existing settlement poster behind SETTLEMENT_GL_POSTING_ENABLED).

BEGIN;

-- ── 1. REUSE-AND-EXTEND the canonical catalogs.payment_methods (migration 0152) ───────────────────
-- CANONICAL: catalogs.payment_methods ALREADY EXISTS (0152 lists-hub catalog): columns
-- (id, operating_company_id, code, display_name, description, metadata, is_active, sort_order,
-- created_at, updated_at), UNIQUE(operating_company_id, code), ENABLE RLS policy `company_scope`,
-- grants SELECT/INSERT/UPDATE/DELETE (Lists-Hub uses DELETE). We EXTEND it — never re-create it, never
-- add a parallel key. A CREATE TABLE IF NOT EXISTS here NO-OP'd on the existing code-based table and the
-- name-based seed then failed with `column "name" does not exist` (the split-brain this resolves).
-- Additive columns only; the existing `code` stays the canonical key; the DELETE grant is left intact.
ALTER TABLE catalogs.payment_methods
  -- the cash/bank GL account this method draws from (owner assigns; nullable until set — the posting path
  -- refuses to disburse via a method whose gl_account_id is unset).
  ADD COLUMN IF NOT EXISTS gl_account_id      uuid NULL REFERENCES catalogs.accounts(id),
  -- void-not-delete columns (the service voids; the existing DELETE grant is left for Lists-Hub).
  ADD COLUMN IF NOT EXISTS voided_at          timestamptz NULL,
  ADD COLUMN IF NOT EXISTS voided_by_user_id  uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS void_reason        text NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid NULL REFERENCES identity.users(id);

CREATE INDEX IF NOT EXISTS ix_payment_methods_company_active
  ON catalogs.payment_methods (operating_company_id) WHERE is_active AND voided_at IS NULL;

-- touch updated_at on UPDATE (0152's generic table has no such trigger; additive/idempotent).
CREATE OR REPLACE FUNCTION catalogs.touch_payment_methods_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_touch_payment_methods_updated_at ON catalogs.payment_methods;
CREATE TRIGGER trg_touch_payment_methods_updated_at
  BEFORE UPDATE ON catalogs.payment_methods
  FOR EACH ROW EXECUTE FUNCTION catalogs.touch_payment_methods_updated_at();

-- lock #3: a method's GL account must belong to the SAME entity — no cross-entity account pointer.
CREATE OR REPLACE FUNCTION catalogs.assert_payment_method_gl_same_entity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.gl_account_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM catalogs.accounts a
                     WHERE a.id = NEW.gl_account_id
                       AND a.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'payment_method gl_account_id % is not in operating_company %',
      NEW.gl_account_id, NEW.operating_company_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payment_method_gl_same_entity ON catalogs.payment_methods;
CREATE TRIGGER trg_payment_method_gl_same_entity
  BEFORE INSERT OR UPDATE ON catalogs.payment_methods
  FOR EACH ROW EXECUTE FUNCTION catalogs.assert_payment_method_gl_same_entity();

-- NO RLS/grant change: 0152's ENABLE RLS `company_scope` policy + SELECT/INSERT/UPDATE/DELETE grant stand
-- (lock #4 — the DELETE grant Lists-Hub uses is left in place; void-not-delete is enforced in the service).

-- lock #1: EXTEND the seed on the EXISTING key (code). 0152 already seeded ACH/WIRE/CARD, so ON CONFLICT
-- (operating_company_id, code) skips them — no collision, no duplicate. Fresh CI DB (0 companies) seeds 0.
INSERT INTO catalogs.payment_methods (operating_company_id, code, display_name, sort_order)
SELECT c.id, m.code, m.display_name, m.ord
FROM org.companies c
CROSS JOIN (VALUES
  ('CHECK', 'Check', 40), ('CASH', 'Cash', 50), ('PETTY_CASH', 'Petty Cash', 60),
  ('COMCHEK', 'Comchek', 70), ('ZELLE', 'Zelle', 80), ('CASH_APP', 'Cash App', 90)
) AS m(code, display_name, ord)
ON CONFLICT (operating_company_id, code) DO NOTHING;

-- ── 2. FK: per-driver method -> the catalog (expand; column added nullable in 202607370000) ─────────
DO $$
BEGIN
  IF to_regclass('driver_finance.driver_payment_methods') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'fk_driver_payment_methods_payment_method_id'
     ) THEN
    ALTER TABLE driver_finance.driver_payment_methods
      ADD CONSTRAINT fk_driver_payment_methods_payment_method_id
      FOREIGN KEY (payment_method_id) REFERENCES catalogs.payment_methods(id);
  END IF;
END $$;

-- ── 3. EXTEND the advance LEDGER (driver_finance.driver_advances) ────────────────────────────────
ALTER TABLE driver_finance.driver_advances
  ADD COLUMN IF NOT EXISTS payment_method_id uuid NULL REFERENCES catalogs.payment_methods(id),
  -- idempotent recovery linkage: the settlement close that recovered this advance (set once, never twice).
  ADD COLUMN IF NOT EXISTS recovered_in_settlement_id uuid NULL REFERENCES driver_finance.driver_settlements(id);
CREATE INDEX IF NOT EXISTS ix_driver_advances_recovered_in_settlement
  ON driver_finance.driver_advances (recovered_in_settlement_id) WHERE recovered_in_settlement_id IS NOT NULL;

-- ── 4. EXTEND the request/approval workflow with maker<>checker (I4) ───────────────────────────────
ALTER TABLE driver_finance.cash_advance_requests
  -- the office "maker" (who created the request office-side; NULL for driver-PWA self-submits).
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid NULL REFERENCES identity.users(id);
-- maker <> checker: a request's reviewer can never be the office user who created it (enforced when both
-- are known). Owner/Admin auto-approve leaves reviewed_by NULL (role IS the authority — no checker needed).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_advance_requests_maker_ne_checker') THEN
    ALTER TABLE driver_finance.cash_advance_requests
      ADD CONSTRAINT cash_advance_requests_maker_ne_checker
      CHECK (
        submitted_by_user_id IS NULL
        OR reviewed_by_user_id IS NULL
        OR submitted_by_user_id <> reviewed_by_user_id
      );
  END IF;
END $$;

-- ── 5. EXTEND settlement_lines line_type as TRUE LIVE SUPERSET (+ escrow_contribution only) ───────
-- Live prod (br-fancy-credit-akjnd07a, verified 2026-07-21) has TWO line_type CHECKs and an 11-value
-- set. Pre-fix drafts DROPPED only one constraint and ADDED a NARROWED set (omitted escrow,
-- auto_deduction, dispute_adjustment). Forbidden. Drop ALL line_type CHECKs, then ADD one superset.
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('driver_finance.settlement_lines') IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'driver_finance.settlement_lines'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%line_type%'
  LOOP
    EXECUTE format('ALTER TABLE driver_finance.settlement_lines DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE driver_finance.settlement_lines
    ADD CONSTRAINT settlement_lines_line_type_chk_payrun CHECK (
      line_type IN (
        'earnings',
        'extra_pay',
        'reimbursement',
        'deduction',
        'advance_recovery',
        'escrow',
        'abandonment_chargeback',
        'team_split_primary',
        'team_split_secondary',
        'auto_deduction',
        'dispute_adjustment',
        'escrow_contribution'
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already present on a re-run
END $$;

-- ── 5b. NO-OP — catalogs.account_role_bindings.role_key CHECK widening ────────────────────────────
-- role_key CHECK widening for settlement/abandonment (including abandonment_chargeback_recovery) is
-- owned by 202607670000_settlement_coa_roles_widen_check.sql (primary chart_of_accounts_roles + legacy
-- account_role_bindings supersets). Apply order: 370000 → 380000 → 400000 → 670000. Do NOT seed
-- catalogs.account_role_bindings rows here; do NOT drop or re-assert a subset of role_key values.
-- (Previous §5b body removed 2026-07-21 — competing CHECK wideners risked narrowing live keys.)

-- ── 6. NEW pay-run GL-RUN idempotency anchor (driver_finance.payrun_gl_runs) ───────────────────────
-- CANONICAL-CHECK: payrun_gl_run_idempotency_anchor. driver_finance.payrun_gl_runs is NOT a money ledger and
--   NOT a duplicate of any canonical ledger — it is a one-row-per-settlement IDEMPOTENCY ANCHOR for the
--   settlement pay-run GL close. It records THAT a balanced pay-run journal entry was posted for a settlement
--   (UNIQUE (operating_company_id, settlement_id) => a repeated close can never double-post the JE), pointing
--   at the SINGLE canonical journal_entry_id in accounting.journal_entries (the real ledger). It holds no
--   amounts and no per-driver balances. It does NOT duplicate:
--     • driver_finance.driver_settlements (the settlement itself — this only anchors its GL run),
--     • driver_finance.driver_advances / driver_finance.escrow_ledger (the money ledgers — untouched here),
--     • accounting.journal_entries (the canonical GL — this REFERENCES it, one run -> one JE).
--   It mirrors the existing driver_finance.driver_settlement_gl_runs anchor for the Bill+BillPayment poster;
--   this one anchors the pay-run single-JE close path. (Reconciled 2026-07-13.)
CREATE TABLE IF NOT EXISTS driver_finance.payrun_gl_runs (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  settlement_id        uuid NOT NULL REFERENCES driver_finance.driver_settlements(id),
  -- the ONE balanced pay-run JE this run posted (nullable: a row can be claimed before the JE id is known,
  -- though the service inserts it with the JE id in the same tx). Points at the canonical GL, no amount here.
  journal_entry_id     uuid NULL REFERENCES accounting.journal_entries(id),
  status               text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'void')),
  created_by_user_id   uuid NULL REFERENCES identity.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  -- IDEMPOTENCY: at most ONE pay-run GL run per settlement per entity — a repeated pay-run close for the
  -- same settlement cannot double-post the balanced JE (the service inserts ON CONFLICT DO NOTHING and skips
  -- posting when a run row already exists).
  CONSTRAINT uq_payrun_gl_runs_company_settlement UNIQUE (operating_company_id, settlement_id)
);

-- FORCED entity-RLS (0065 pattern) + runtime grants (no DELETE — an idempotency anchor is append-only).
ALTER TABLE driver_finance.payrun_gl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.payrun_gl_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payrun_gl_runs_tenant_scope ON driver_finance.payrun_gl_runs;
CREATE POLICY payrun_gl_runs_tenant_scope ON driver_finance.payrun_gl_runs
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);
GRANT SELECT, INSERT, UPDATE ON driver_finance.payrun_gl_runs TO ih35_app;

COMMIT;
