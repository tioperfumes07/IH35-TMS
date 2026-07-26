-- 202609020010_c2_banking_reconciliation_matches_canonical.sql
--
-- HELD — DO NOT RUN ON PROD until owner Neon-applies.
--
-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER / SCHEMA-BACKFILL] SWEEP-C2 (class-sweep 2026-07-26)
-- repoint 2 of 2 (also BANK-DOM-01): bank.reconciliation_matches is a RETIRE-class table
-- (LINKAGE-LAW rule 14 KNOWN_LEGACY tier, canonical = banking.*) with TWO confirmed LIVE WRITERS —
-- apps/backend/src/accounting/bank-recon/match.service.ts:464 (INSERT ... ON CONFLICT ... DO UPDATE)
-- and apps/backend/src/accounting/bank-recon/recon-worklist.service.ts:182 (UPDATE ... SET match_state) —
-- per the SWEEP-C2 write-inventory guard baseline
-- (scripts/verify-sweep-c2-no-retire-writes.baseline.json).
--
-- ROOT CAUSE: bank.reconciliation_matches was created in schema `bank` (migration
-- 0219_block_29_bank_reconciliation_matches.sql) instead of the canonical `banking` schema every
-- other bank-domain table already uses (banking.bank_accounts, banking.bank_transactions,
-- banking.reconciliation_sessions, ...) — a schema-naming miss at the table's creation, not a
-- deliberate design decision.
--
-- SPLIT-BRAIN AVOIDANCE (Rule 21 DUAL_PATH_OLD_ACTIVE): bank.reconciliation_matches has ~9 live
-- non-test backend consumers beyond the 2 flagged writers (match.service.ts, recon-worklist.service.ts,
-- bills.service.ts, expenses.routes.ts, month-close.service.ts, banking/p7-wave2.routes.ts,
-- cron/bank-recon-auto-match.cron.ts). Repointing only the 2 guard-flagged writes while leaving every
-- read/other-write on the old table would create two live copies of the SAME reconciliation-match
-- ledger — new matches invisible to the read paths, and vice versa. This migration creates the FULL
-- canonical table (identical shape) and copies every existing row across; the SAME PR repoints ALL
-- ~11 backend files to banking.reconciliation_matches in one atomic move, not just the 2 flagged sites.
--
-- FIX (this migration, schema half): create banking.reconciliation_matches — identical columns,
-- constraints (including the widened ledger_entry_kind CHECK from 202607011600), indexes, RLS, and
-- grants to bank.reconciliation_matches — and copy every existing row across (idempotent
-- ON CONFLICT DO NOTHING copy on the primary key; safe on zero rows AND on a full prod table; safe to
-- re-run). Never DROPS bank.reconciliation_matches (Rule 07 archive-only) — COMMENT-marked DEPRECATED,
-- rows kept in place and readable via the KNOWN_LEGACY tier.
--
-- banking.bank_transactions.matched_expense_id (added by 202607011600) is UNCHANGED — it FKs to
-- accounting.expenses, not to reconciliation_matches, so it needs no migration of its own.
--
-- POSTS NOTHING NEW — this is a pure schema relocation of an existing linkage/match ledger, not a GL
-- posting change (Rule 13: reuse the poster, invent no new GL math; this migration has none). No
-- amount column is added, no journal entry is created, no feature flag is touched. QBO is never
-- written. Idempotent (CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE, ON CONFLICT
-- DO NOTHING copy). No hardcoded UUID literal; no org.companies seed needed.
--
-- SUPERSEDES: bank.reconciliation_matches (JORGE-APPROVED 2026-09-02) — owner-gated schema-relocation
-- of the bank-transaction-to-ledger-entry MATCH LINKAGE ledger (not a new money concept: no amount,
-- no GL account, no journal entry). scripts/canonical-ledger-registry.json has no "reconciliation" /
-- "match" concept entry (verified: the concept is a linkage/audit table, not a payment/bill/invoice/
-- settlement/advance/escrow ledger), so this table is flagged only because `banking` is a financial
-- schema, not because of a concept collision. It is the direct 1:1 schema-relocation replacement for
-- bank.reconciliation_matches (identical columns/constraints/RLS shape, full row backfill above) —
-- SUPERSEDES is the correct declaration, not a CANONICAL-CHECK for a distinct concept.

BEGIN;

CREATE SCHEMA IF NOT EXISTS banking;
GRANT USAGE ON SCHEMA banking TO ih35_app;

CREATE TABLE IF NOT EXISTS banking.reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  bank_transaction_id uuid NOT NULL REFERENCES banking.bank_transactions(id) ON DELETE CASCADE,
  ledger_entry_kind text NOT NULL CHECK (ledger_entry_kind IN ('payment','bill_payment','transfer','je','expense')),
  ledger_entry_id uuid NOT NULL,
  match_score numeric(5,4) NOT NULL DEFAULT 0 CHECK (match_score >= 0 AND match_score <= 1),
  match_state text NOT NULL CHECK (match_state IN ('auto_matched','user_matched','rejected')),
  matched_at timestamptz NOT NULL DEFAULT now(),
  matched_by_user_uuid uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_transaction_id, ledger_entry_kind, ledger_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_banking_reconciliation_matches_company_tx
  ON banking.reconciliation_matches (operating_company_id, bank_transaction_id, matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_banking_reconciliation_matches_company_state
  ON banking.reconciliation_matches (operating_company_id, match_state, matched_at DESC);

-- Entity-scoped FORCED RLS (canonical predicate — matches banking.bank_transactions' own policy shape).
ALTER TABLE banking.reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.reconciliation_matches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reconciliation_matches_entity_scope ON banking.reconciliation_matches;
CREATE POLICY reconciliation_matches_entity_scope
  ON banking.reconciliation_matches
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON banking.reconciliation_matches TO ih35_app;

-- One-time, idempotent copy of every existing row. ON CONFLICT DO NOTHING makes re-runs a no-op; the
-- deterministic id carries over unchanged so this is a pure schema relocation, not a data rewrite.
DO $$
BEGIN
  IF to_regclass('bank.reconciliation_matches') IS NULL OR to_regclass('banking.reconciliation_matches') IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.bypass_rls', 'lucia', true);

  INSERT INTO banking.reconciliation_matches (
    id, operating_company_id, bank_transaction_id, ledger_entry_kind, ledger_entry_id,
    match_score, match_state, matched_at, matched_by_user_uuid, created_at, updated_at
  )
  SELECT
    id, operating_company_id, bank_transaction_id, ledger_entry_kind, ledger_entry_id,
    match_score, match_state, matched_at, matched_by_user_uuid, created_at, updated_at
  FROM bank.reconciliation_matches
  ON CONFLICT (id) DO NOTHING;
END
$$;

-- Archive-not-delete (Rule 07): mark the retired table, keep its data reachable via KNOWN_LEGACY reads.
DO $$
BEGIN
  IF to_regclass('bank.reconciliation_matches') IS NOT NULL THEN
    EXECUTE format(
      'COMMENT ON TABLE bank.reconciliation_matches IS %L',
      'DEPRECATED 2026-09-02 (SWEEP-C2 / BANK-DOM-01): superseded by banking.reconciliation_matches. Kept per ARCHIVE-not-DELETE policy (Rule 07). All rows copied forward; live code no longer reads or writes here.'
    );
  END IF;

  IF to_regclass('banking.reconciliation_matches') IS NOT NULL THEN
    EXECUTE format(
      'COMMENT ON TABLE banking.reconciliation_matches IS %L',
      'CANONICAL bank-reconciliation match ledger (SWEEP-C2 / BANK-DOM-01). Single source of truth linking banking.bank_transactions to payment/bill_payment/transfer/je/expense ledger entries. Superseded bank.reconciliation_matches 2026-09-02.'
    );
  END IF;
END
$$;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  to_regclass('banking.reconciliation_matches') IS NOT NULL AS canonical_table_present,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'banking' AND tablename = 'reconciliation_matches') AS policy_count,
  (CASE WHEN to_regclass('bank.reconciliation_matches') IS NOT NULL AND to_regclass('banking.reconciliation_matches') IS NOT NULL
     THEN (SELECT COUNT(*) FROM bank.reconciliation_matches) - (SELECT COUNT(*) FROM banking.reconciliation_matches)
     ELSE NULL END) AS row_count_delta_legacy_minus_canonical;
