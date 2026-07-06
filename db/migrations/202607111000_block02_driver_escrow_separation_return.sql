-- [HOLD-FOR-JORGE — TIER 1] BLOCK-02 (of 29, Tier 1.5) — Driver Escrow: >=90-day post-separation
-- RETURN PATH + separation tracking. FINANCIAL / §1.4 cluster.
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. DO NOT flip DRIVER_ESCROW_SEPARATION_RETURN_ENABLED. Posting
--     flag DEFAULT OFF. Run ONLY on a Neon branch by Jorge's hand after CPA sign-off, then
--     ledger-backfill so prod db:migrate skips it. ***
--
-- CONTEXT (verified vs db/migrations/ + apps/backend/src, read-only recon before writing this):
-- The escrow LEDGER + ACCRUAL already exist and are LIVE (not gated by this migration):
--   * accounting.escrow_accounts / accounting.escrow_postings — Block-23 (migration 0234, already
--     applied). Holder-agnostic (driver/vendor/factor/other), balance-conserving (trigger sums
--     postings -> balance_cents), JE-backed via accounting.createJournalEntry (NO new GL math here).
--   * Per-driver LIABILITY sub-account already auto-provisioned under the top-level "Damage Claim
--     Escrow" (QBO-1150040187) -> year-agnostic "Driver Escrow" sub-parent -> per-driver leaf
--     (apps/backend/src/accounting/driver-subaccount-provision.service.ts, STOP-DECISION #1).
--   * The ACCRUAL (Dr settlement net-pay / Cr escrow-liability) already fires unconditionally at
--     driver-settlement post time whenever a `driver_bond_deduction` line exists
--     (apps/backend/src/payroll/driver-settlement.service.ts:482-514 — openEscrow()+depositEscrow()).
--   * The PER-DRIVER BALANCE already exists as one row per (operating_company_id, holder_id='<driver>',
--     purpose='driver_bond') in accounting.escrow_accounts.balance_cents (UNIQUE constraint from 0234).
--
-- WHAT THIS MIGRATION ADDS (the genuinely missing piece — the >=90-day post-separation RETURN path):
--   §1 register DRIVER_ESCROW_SEPARATION_RETURN_ENABLED (lib.feature_flags, DEFAULT OFF).
--   §2 driver_finance.driver_escrow_separations — tracks each driver's separation (resign/fire/
--      termination) date, the 90-day eligibility gate, and the eventual release, linking
--      driver <-> escrow_account <-> escrow_posting <-> journal_entry (forward AND reverse).
--
-- ACCOUNTING (design doc docs/accounting/BLOCK-02-DRIVER-ESCROW-DESIGN.md; CPA to confirm the ONE
-- deferred item flagged there — see below):
--   RETURN (net-to-driver)  Dr Driver Escrow (liability) / Cr Cash (cash_clearing)  [[amount = current
--     escrow balance MINUS any outstanding damage-claim deductions still unrecovered from pay
--     (driver_finance.driver_settlement_deductions, deduction_type='escrow_load_abandonment',
--     remaining_balance_cents > 0) — the CPA-locked "PAY-FIRST then escrow" fallback (memory
--     audit-fix-decisions-2026-07-04). This reuses the EXISTING releaseEscrow() (Block-23) UNCHANGED —
--     ZERO new GL math, zero changes to accounting.escrow_postings' schema/CHECKs/trigger in this
--     migration.]]
--   DEFERRED (NOT built here, flagged not guessed): if outstanding damage claims exceed 0, the RETAINED
--     portion is recorded on driver_escrow_separations.retained_for_damages_cents for visibility, but this
--     migration/build does NOT auto-post a forfeiture/write-off JE for it — which existing recovery
--     account should be credited (e.g. the schema-reserved-but-unconsumed 'damage_recovery' role_key in
--     catalogs.account_role_bindings, per the FIN-18 settlement-posting engine's bucketRecoveryRoleKey
--     convention) is a CPA/Jorge policy call, not decided solo here. The accountant resolves it manually
--     via existing tooling once confirmed; a follow-up block can automate it once that account is named.
--
-- ENTITY-SCOPED: operating_company_id uuid + FK org.companies, FORCE RLS (identity.is_lucia_bypass()
-- pattern, matching the current canonical style e.g. 202607080310_property_tax_accrual_posting.sql).
-- void-not-delete (is_active + voided_at/voided_by_user_id/void_reason; NO DELETE grant).
-- Idempotent (CREATE ... IF NOT EXISTS / DROP+CREATE POLICY/TRIGGER / ON CONFLICT DO NOTHING).
-- Fresh-DB safe: every table/index/policy guarded; never RAISEs on absent runtime data.

BEGIN;

-- ===========================================================================================
-- §1 — Feature flag (kill switch), DEFAULT OFF. Read at runtime via
--      isEnabled(client, 'DRIVER_ESCROW_SEPARATION_RETURN_ENABLED', {operating_company_id}).
-- ===========================================================================================
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'DRIVER_ESCROW_SEPARATION_RETURN_ENABLED',
  'BLOCK-02 driver escrow: >=90-day post-separation return path (releases the driver''s escrow balance, net of outstanding damage-claim deductions, via the existing Block-23 escrow release JE). Default OFF (kill switch) until CPA sign-off + Neon verification.',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

-- ===========================================================================================
-- §2 — driver_finance.driver_escrow_separations
-- ===========================================================================================
CREATE TABLE IF NOT EXISTS driver_finance.driver_escrow_separations (
  id                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id               uuid NOT NULL REFERENCES org.companies(id),
  driver_id                          uuid NOT NULL REFERENCES mdata.drivers(id),
  escrow_account_id                  uuid NOT NULL REFERENCES accounting.escrow_accounts(id),

  -- The driver's resign/fire/termination date (captured from mdata.drivers.deactivated_at at the
  -- moment status='Terminated' is recorded — see 202606161300's status/deactivated_at consistency lock).
  separation_date                    date NOT NULL,
  -- Generated (date + integer days = date in Postgres) so the 90-day gate can never drift from the
  -- separation_date it was computed from.
  eligible_release_date              date GENERATED ALWAYS AS (separation_date + 90) STORED,

  escrow_balance_at_separation_cents bigint NOT NULL DEFAULT 0 CHECK (escrow_balance_at_separation_cents >= 0),
  outstanding_damage_claims_cents    bigint CHECK (outstanding_damage_claims_cents IS NULL OR outstanding_damage_claims_cents >= 0),
  released_amount_cents              bigint CHECK (released_amount_cents IS NULL OR released_amount_cents >= 0),
  retained_for_damages_cents         bigint CHECK (retained_for_damages_cents IS NULL OR retained_for_damages_cents >= 0),

  status                             text NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending','eligible','released','waived')),

  -- Reverse link: this separation -> the escrow_postings row (release) -> its linked_journal_entry_id.
  released_posting_id                uuid REFERENCES accounting.escrow_postings(id),
  released_at                        timestamptz,

  notes                              text,

  is_active                          boolean NOT NULL DEFAULT true,
  voided_at                          timestamptz,
  voided_by_user_id                  uuid,
  void_reason                        text,

  created_by_user_id                 uuid REFERENCES identity.users(id),
  created_at                         timestamptz NOT NULL DEFAULT now(),
  updated_at                         timestamptz NOT NULL DEFAULT now()
);

-- One OPEN (pending/eligible) separation record per driver at a time — re-hire cycles start a new one
-- only after the prior record leaves pending/eligible (released/waived), so history is never overwritten.
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_escrow_separations_open_per_driver
  ON driver_finance.driver_escrow_separations (operating_company_id, driver_id)
  WHERE status IN ('pending','eligible') AND is_active;

CREATE INDEX IF NOT EXISTS ix_driver_escrow_separations_eligible_queue
  ON driver_finance.driver_escrow_separations (operating_company_id, status, eligible_release_date)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS ix_driver_escrow_separations_driver
  ON driver_finance.driver_escrow_separations (driver_id, created_at DESC);

CREATE OR REPLACE FUNCTION driver_finance.touch_driver_escrow_separations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_driver_escrow_separations_updated_at ON driver_finance.driver_escrow_separations;
CREATE TRIGGER trg_touch_driver_escrow_separations_updated_at
  BEFORE UPDATE ON driver_finance.driver_escrow_separations
  FOR EACH ROW EXECUTE FUNCTION driver_finance.touch_driver_escrow_separations_updated_at();

ALTER TABLE driver_finance.driver_escrow_separations ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.driver_escrow_separations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_escrow_separations_select ON driver_finance.driver_escrow_separations;
DROP POLICY IF EXISTS driver_escrow_separations_write ON driver_finance.driver_escrow_separations;
CREATE POLICY driver_escrow_separations_select ON driver_finance.driver_escrow_separations FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY driver_escrow_separations_write ON driver_finance.driver_escrow_separations FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_escrow_separations TO ih35_app;
REVOKE DELETE ON driver_finance.driver_escrow_separations FROM ih35_app;

COMMIT;

-- POST-DEPLOY VERIFICATION (run on the Neon branch after apply):
--   SELECT flag_key, default_enabled FROM lib.feature_flags
--     WHERE flag_key = 'DRIVER_ESCROW_SEPARATION_RETURN_ENABLED'; -- expect default_enabled = false
--   SELECT has_table_privilege('ih35_app','driver_finance.driver_escrow_separations','DELETE'); -- expect false
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   BEGIN;
--     DROP TABLE IF EXISTS driver_finance.driver_escrow_separations;
--     DELETE FROM lib.feature_flags WHERE flag_key='DRIVER_ESCROW_SEPARATION_RETURN_ENABLED';
--   COMMIT;
