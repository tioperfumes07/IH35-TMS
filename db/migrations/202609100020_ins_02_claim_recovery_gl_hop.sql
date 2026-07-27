-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] INS-02 — insurance claim recovery GL hop.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
-- *** DO NOT flip INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED without owner designation of insurance_recovery. ***
-- CANONICAL-CHECK: insurance_claim_recovery_posting. accounting.insurance_claim_recovery_postings is a
-- LINKAGE ledger (claim → JE), not a money ledger. Money lives in journal_entries via createJournalEntry.
-- Mirrors accounting.warranty_reimburse_postings / civil_fine_postings. No duplicate money subledger.
-- Root cause: amount_paid_cents updates with no JE — insurer recovery cash is untraceable to the claim.
-- Fix: linkage ledger + createJournalEntry (Dr cash_clearing / Cr insurance_recovery). Flag DEFAULT OFF.
-- Cursor band. Idempotent. No new GL math.

BEGIN;

DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
    VALUES (
      'INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED',
      'INS-02: insurer claim recovery (amount_paid) posts balanced JE '
        || '(Dr cash_clearing / Cr insurance_recovery) via createJournalEntry. '
        || 'Per-entity override only. Default OFF until owner designates insurance_recovery and cutover.',
      false
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('accounting.journal_entries') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'accounting')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'identity' AND p.proname = 'is_lucia_bypass') THEN
    RAISE NOTICE 'INS-02: prerequisites absent — skip claim_recovery_postings';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS accounting.insurance_claim_recovery_postings (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
    claim_id              uuid NOT NULL REFERENCES insurance.claim(id),
    journal_entry_id      uuid REFERENCES accounting.journal_entries(id) ON DELETE RESTRICT,
    amount_cents          bigint NOT NULL CHECK (amount_cents > 0),
    entry_date            date NOT NULL,
    memo                  text,
    status                text NOT NULL DEFAULT 'posted'
                            CHECK (status IN ('posted','voided')),
    is_active             boolean NOT NULL DEFAULT true,
    voided_at             timestamptz,
    voided_by_user_id     uuid REFERENCES identity.users(id),
    void_reason           text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by_user_id    uuid REFERENCES identity.users(id)
  );

  -- Belt-and-suspenders for DBs where CREATE TABLE IF NOT EXISTS skipped an older shape without inline FKs.
  IF to_regclass('org.companies') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ins_claim_recovery_postings_company') THEN
    ALTER TABLE accounting.insurance_claim_recovery_postings
      ADD CONSTRAINT fk_ins_claim_recovery_postings_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  IF to_regclass('insurance.claim') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ins_claim_recovery_postings_claim') THEN
    ALTER TABLE accounting.insurance_claim_recovery_postings
      ADD CONSTRAINT fk_ins_claim_recovery_postings_claim
      FOREIGN KEY (claim_id) REFERENCES insurance.claim(id);
  END IF;

  IF to_regclass('accounting.journal_entries') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ins_claim_recovery_postings_je') THEN
    ALTER TABLE accounting.insurance_claim_recovery_postings
      ADD CONSTRAINT fk_ins_claim_recovery_postings_je
      FOREIGN KEY (journal_entry_id) REFERENCES accounting.journal_entries(id)
      ON DELETE RESTRICT;
  END IF;

  -- Multiple recoveries allowed (partial payments); no single-claim unique.
  CREATE INDEX IF NOT EXISTS ix_ins_claim_recovery_postings_claim
    ON accounting.insurance_claim_recovery_postings (operating_company_id, claim_id)
    WHERE is_active;
  CREATE INDEX IF NOT EXISTS ix_ins_claim_recovery_postings_je
    ON accounting.insurance_claim_recovery_postings (journal_entry_id)
    WHERE journal_entry_id IS NOT NULL;

  ALTER TABLE accounting.insurance_claim_recovery_postings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounting.insurance_claim_recovery_postings FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS ins_claim_recovery_postings_select ON accounting.insurance_claim_recovery_postings;
  DROP POLICY IF EXISTS ins_claim_recovery_postings_write  ON accounting.insurance_claim_recovery_postings;
  CREATE POLICY ins_claim_recovery_postings_select ON accounting.insurance_claim_recovery_postings FOR SELECT
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));
  CREATE POLICY ins_claim_recovery_postings_write ON accounting.insurance_claim_recovery_postings FOR ALL
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));

  GRANT SELECT, INSERT, UPDATE ON accounting.insurance_claim_recovery_postings TO ih35_app;
  REVOKE DELETE ON accounting.insurance_claim_recovery_postings FROM ih35_app;
END
$$;

COMMIT;
