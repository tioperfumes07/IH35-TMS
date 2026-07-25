-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DO NOT RUN ON PROD — run ONLY on a Neon branch by
-- Jorge's hand, then ledger-backfill so prod db:migrate skips it. Registered in
-- db/migrations/.held-migrations.json (verify-hold-migrations-registered enforces this).
--
-- ACCT-LINK-05 — catalogs.posting_templates inbound FK from consumers (WF-053 / MUST 3.18.5).
--
-- ROOT CAUSE (verified on Neon br-fancy-credit-akjnd07a, 2026-07-24, SET app.bypass_rls='lucia'):
--   catalogs.posting_templates has an admin CRUD UI (PR #3242, Templates subnav tab) and 0 inbound FKs.
--   The real GL posting engine (apps/backend/src/accounting/posting-engine.service.ts) never reads or
--   writes it — every source type (invoice/bill/expense/bill_payment/cash_advance/driver_advance/
--   bank_categorization/driver_reimbursement/transfer/customer_payment) is a hardcoded PostingSourceType
--   string constant. catalogs.posting_templates is a pure island catalog: no consumer write path.
--   catalogs.posting_templates itself is ALSO truly empty (0 rows, re-verified WITH the lucia bypass —
--   not an RLS-masked false-empty). Per MUST 3.18.5.2 its debit_account_id/credit_account_id are NOT NULL
--   FKs into catalogs.accounts (real CoA account picks) — seeding rows is an owner/CPA decision, NOT a
--   builder one (Rule 13). This migration does not seed template rows.
--
-- FIX (additive, reuses the existing posting engine — NO new GL math):
--   accounting.posting_batches is the ONE row every source type already writes exactly once per posting
--   event (it already carries source_transaction_type; 6 live rows on prod). Add:
--     1. posting_template_id uuid NULL REFERENCES catalogs.posting_templates(id) ON DELETE SET NULL
--        — the actual inbound FK that closes ACCT-LINK-05. NULL on every existing + new row until the
--        owner seeds catalogs.posting_templates AND designates its accounts (this migration seeds
--        nothing — honest, not silently deferred: see PR body "density needs template rows + Neon-apply").
--     2. source_template_code text NULL — the code-constant stamp (mirrors MUST 3.18.5.4's "code is
--        source of truth" — the PostingSourceType literal the engine used to build this batch), populated
--        by apps/backend/src/accounting/posting-engine.service.ts on every future batch insert regardless
--        of template-row density, so the linkage is provable the instant templates are seeded (a simple
--        UPDATE ... SET posting_template_id = pt.id JOIN ON template_code = source_template_code backfill,
--        run by the owner after seeding — no code change needed then).
--   Partial index on posting_template_id (WHERE NOT NULL) gives the REVERSE drill (template -> every
--   batch/JE that used it) once rows exist, per Law of the Land §9 forward+reverse.
--
-- SAFETY: additive/idempotent (ADD COLUMN IF NOT EXISTS). No backfill (nothing resolvable yet — an
-- inline FK against an empty table holds trivially, all-NULL). No RLS/grant change — both columns
-- inherit accounting.posting_batches' existing FORCED RLS + 0065-pattern grants. Apply-twice safe.

BEGIN;

ALTER TABLE accounting.posting_batches
  ADD COLUMN IF NOT EXISTS posting_template_id uuid REFERENCES catalogs.posting_templates(id) ON DELETE SET NULL;

ALTER TABLE accounting.posting_batches
  ADD COLUMN IF NOT EXISTS source_template_code text;

CREATE INDEX IF NOT EXISTS idx_posting_batches_posting_template_id
  ON accounting.posting_batches (posting_template_id)
  WHERE posting_template_id IS NOT NULL;

COMMIT;

-- ===========================================================================
-- POST-APPLY VERIFY (run by hand on the Neon branch; not part of the migration)
-- ===========================================================================
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema='accounting' AND table_name='posting_batches'
--     AND column_name IN ('posting_template_id','source_template_code');
--
--   SELECT tc.constraint_name, kcu.column_name, ccu.table_schema||'.'||ccu.table_name AS references_table
--   FROM information_schema.table_constraints tc
--   JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
--   JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
--   WHERE tc.table_schema='accounting' AND tc.table_name='posting_batches' AND tc.constraint_type='FOREIGN KEY'
--     AND kcu.column_name = 'posting_template_id';
--   -- expect exactly 1 row: references_table = catalogs.posting_templates (the ACCT-LINK-05 inbound FK)
--
-- FOLLOW-UP (owner/CPA territory, named — not silently deferred):
--   1. Owner seeds catalogs.posting_templates rows (template_code matching the PostingSourceType
--      literals: invoice, bill, expense, bill_payment, cash_advance, driver_advance, customer_payment,
--      bank_categorization, driver_reimbursement, transfer) with real debit_account_id/credit_account_id
--      CoA picks.
--   2. One-time owner-run backfill: UPDATE accounting.posting_batches pb SET posting_template_id = pt.id
--      FROM catalogs.posting_templates pt WHERE pt.template_code = pb.source_template_code
--      AND pb.posting_template_id IS NULL AND pt.is_active = true;
--   New batches self-resolve automatically once seeded (posting-engine.service.ts's stamp is live from
--   this PR's code change, independent of migration-apply timing).
--
-- Numbering: authored as 202607940000, renumbered -> 202607950000 after a same-run collision with
-- 202607940000_load_cancellations_drop_legacy_reason_fk.sql (already on main, PR #3436). 202607950000
-- is strictly above every migration on main at author time (re-check at push time per Rule 17/financial-
-- migrations skill §1).
