-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DO NOT RUN ON PROD — run ONLY on a Neon branch by
-- Jorge's hand, then ledger-backfill so prod db:migrate skips it. Registered in
-- db/migrations/.held-migrations.json (verify-hold-migrations-registered enforces this).
--
-- SAF-ORPH-01/02 + ACCT-R-01 trigger half (stacks on merged #3533 write-path sync).
--
-- ROOT CAUSE (GUARD-verified on Neon br-fancy-credit-akjnd07a 2026-07-25):
--   accounting.apply_escrow_posting_delta (migration 0234) treats deposit as +, release as −, and
--   EVERY OTHER posting_type (including the forfeit path's 'adjustment') as +amount_cents. A forfeit
--   therefore INCREMENTS accounting.escrow_accounts.balance_cents — the opposite of liability
--   recognition. Also: lib.feature_flags has 0 rows for DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED, so
--   there is no enable path (unknown key resolves false forever).
--
-- THIS MIGRATION (additive / idempotent):
--   1. Expand posting_type CHECK to include 'forfeiture' (keeps 'adjustment' for legacy rows).
--   2. CREATE OR REPLACE apply_escrow_posting_delta: deposit +, release −, forfeiture −,
--      ELSE RAISE EXCEPTION on unknown types (fail-loud — no silent +).
--   3. Seed DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED with default_enabled=false, rollout_pct=0.
--      Do NOT insert per-entity overrides — flag stays OFF until owner flips.
--
-- LATENT / NO LIVE-MONEY RISK WHILE UNAPPLIED OR FLAG-OFF:
--   Neon 2026-07-25: forfeit flag row count = 0; signed driver contract_instances = 0 → clause gate
--   blocks UI forfeit. Triple-gated (flag + clause + this schema) until owner Neon-applies + drivers
--   sign + flag ON.
--
-- Numbering: 202608070000 — strictly above main max 202608050000 and open-PR claims of 202608060000
-- (#3526 CoA merge, #3530 demo purge).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. posting_type CHECK — add 'forfeiture'
-- ---------------------------------------------------------------------------
ALTER TABLE accounting.escrow_postings
  DROP CONSTRAINT IF EXISTS escrow_postings_posting_type_check;

ALTER TABLE accounting.escrow_postings
  ADD CONSTRAINT escrow_postings_posting_type_check
  CHECK (posting_type = ANY (ARRAY[
    'deposit'::text,
    'release'::text,
    'adjustment'::text,
    'forfeiture'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2. Trigger function — signed deltas; unknown types fail loud
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accounting.apply_escrow_posting_delta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_delta bigint;
BEGIN
  IF NEW.posting_type = 'deposit' THEN
    v_delta := NEW.amount_cents;
  ELSIF NEW.posting_type = 'release' THEN
    v_delta := -NEW.amount_cents;
  ELSIF NEW.posting_type = 'forfeiture' THEN
    v_delta := -NEW.amount_cents;
  ELSE
    RAISE EXCEPTION
      'accounting.apply_escrow_posting_delta: unknown posting_type=% (expected deposit|release|forfeiture)',
      NEW.posting_type
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE accounting.escrow_accounts
  SET balance_cents = balance_cents + v_delta,
      updated_at = now()
  WHERE id = NEW.escrow_account_id
    AND operating_company_id = NEW.operating_company_id;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Feature flag seed — DEFAULT OFF, no per-entity override
-- ---------------------------------------------------------------------------
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED',
  'SAF-F01 / SAF-ORPH: gates the balanced JE + accounting.escrow_postings(forfeiture) write on driver escrow forfeit. DEFAULT OFF — owner flips per entity only after Neon apply of 202608070000 + signed driver contracts + damage_recovery designation live.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ===========================================================================
-- POST-APPLY VERIFY (owner / GUARD — not part of the migration body)
-- ===========================================================================
-- SELECT set_config('app.bypass_rls','lucia',true);
-- SELECT pg_get_functiondef('accounting.apply_escrow_posting_delta'::regproc);
-- SELECT flag_key, default_enabled FROM lib.feature_flags
--   WHERE flag_key = 'DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED';
-- -- Delta proof (throwaway): deposit → balance UP; forfeiture → balance DOWN by same cents.
