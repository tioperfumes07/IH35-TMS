-- 202607011010_bank_feed_gl_posting_flag.sql
-- [HOLD-FOR-JORGE — TIER 1] BLOCK-03 / CHAIN-05 — register BANK_FEED_GL_POSTING_ENABLED in
-- lib.feature_flags, DEFAULT OFF, resolved PER-ENTITY via isEnabled() (lib.feature_flag_overrides keyed
-- on operating_company_id). NEVER self-merge — financial governance control (§1.4). No GL rows here.
--
-- WHY: CHAIN-05 generalizes the built BLOCK-6 special case (bank-driver-advance) to ALL categorized bank
-- transactions. When an operator categorizes a bank-feed line, the row is tagged + mirrored to QBO but the
-- internal double-entry ledger never moves (the CHAIN-05 gap). Behind this OFF-by-default flag,
-- bank-feed-gl-posting.service.ts posts the direction-aware balanced JE by REUSING postSourceTransaction
-- (source_transaction_type='bank_categorization') — no new GL math. With the flag OFF (now) the service is
-- a strict NO-OP: categorize keeps its byte-identical current behavior (tag + QBO outbox only), ZERO JEs.
--
-- isEnabled() already returns false when the flag row is absent, so registering the row is SAFE-OFF either
-- way; it simply makes the flag manageable via per-company overrides WITHOUT turning anything on. The ON
-- branch flips only per entity under GUARD's Neon-branch balanced-JE proof + owner's written Tier-1 OK
-- (same bar as BLOCK-6's BANK_DRIVER_ADVANCE_ENABLED). Purely additive + idempotent. No RLS/schema change:
-- every column CHAIN-05 reads (categorization_gl_account_id, matched_journal_entry_id, matched_bill_id,
-- transfer_kind, destination_bank_account_id, is_credit, amount_cents, review_state, reviewed_at) and the
-- banking.bank_accounts.ledger_account_id bridge already exist in prior migrations.

BEGIN;

DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES (
      'BANK_FEED_GL_POSTING_ENABLED',
      'BLOCK-03 / CHAIN-05: post a direction-aware balanced JE (Dr category / Cr bank on money-out; '
        || 'Dr bank / Cr category on money-in) when a bank transaction is categorized to a GL account. '
        || 'Generalizes BLOCK-6; cedes the driver-advance branch. Resolved per-entity via overrides. '
        || 'OFF until GUARD-verified + owner flip.',
      false,
      0
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $$;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT EXISTS (
  SELECT 1 FROM lib.feature_flags WHERE flag_key = 'BANK_FEED_GL_POSTING_ENABLED'
) AS bank_feed_gl_posting_flag_registered;

-- ROLLBACK:
-- DELETE FROM lib.feature_flags WHERE flag_key = 'BANK_FEED_GL_POSTING_ENABLED';
