-- 202616141200_fuel_assignment_questions.sql  (Cursor, claimed on main first — LEAD 443.243)
-- OWNER (1:26 PM CT 10-22): "it should always ask when assigning fuel to a load, if there is not 100% certainty
-- ... show the data to back it up ... a pop up window ... when creating the fuel expenses for a load in load costs
-- etc or wherever in the app necessary."
--
-- Fuel Assignment Question table: one open question per fill when resolveFillTruckAndLoad is not 100% certain.
-- Answered through the API (confirm proposed / pick truck+load / keep on card truck + reason); audited; answer runs
-- applyFillTruckAndLoad. Void-not-delete: answered rows stay; status flips.
-- IDEMPOTENT + FRESH-DB SAFE: to_regclass guards; CREATE IF NOT EXISTS; FORCE RLS.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'fuel_assignment_questions: org.companies absent — skipping';
  ELSE
    CREATE TABLE IF NOT EXISTS fuel.fuel_assignment_questions (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operating_company_id     uuid NOT NULL REFERENCES org.companies(id),
      fuel_transaction_id      uuid NOT NULL,
      status                   text NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('open', 'answered', 'cancelled')),
      fill_moment_at           timestamptz,
      fill_moment_ct           text,
      station                  text,
      gallons                  numeric(12, 3),
      amount_cents             bigint,
      card_unit_id             uuid,
      card_unit_number         text,
      card_driver_id           uuid,
      card_driver_name         text,
      evidence                 jsonb NOT NULL DEFAULT '{}'::jsonb,
      proposed_unit_id         uuid,
      proposed_unit_number     text,
      proposed_load_id         uuid,
      proposed_load_number     text,
      proposed_settlement_ref  text,
      proposed_why             text,
      answer_kind              text
                                 CHECK (answer_kind IS NULL OR answer_kind IN ('confirm_proposed', 'pick_other', 'keep_card_truck')),
      answered_unit_id         uuid,
      answered_load_id         uuid,
      answer_reason            text,
      answered_by_user_id      uuid,
      answered_at              timestamptz,
      created_at               timestamptz NOT NULL DEFAULT now(),
      updated_at               timestamptz NOT NULL DEFAULT now()
    );

    IF to_regclass('fuel.fuel_transactions') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fuel_assignment_questions_fuel_txn_fkey'
           AND conrelid = 'fuel.fuel_assignment_questions'::regclass
       ) THEN
      ALTER TABLE fuel.fuel_assignment_questions
        ADD CONSTRAINT fuel_assignment_questions_fuel_txn_fkey
        FOREIGN KEY (fuel_transaction_id) REFERENCES fuel.fuel_transactions(id);
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_assignment_questions_open_fill
      ON fuel.fuel_assignment_questions (operating_company_id, fuel_transaction_id)
      WHERE status = 'open';

    CREATE INDEX IF NOT EXISTS idx_fuel_assignment_questions_open_company
      ON fuel.fuel_assignment_questions (operating_company_id, created_at DESC)
      WHERE status = 'open';

    CREATE INDEX IF NOT EXISTS idx_fuel_assignment_questions_proposed_load
      ON fuel.fuel_assignment_questions (operating_company_id, proposed_load_id)
      WHERE status = 'open' AND proposed_load_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_fuel_assignment_questions_card_unit
      ON fuel.fuel_assignment_questions (operating_company_id, card_unit_id)
      WHERE status = 'open' AND card_unit_id IS NOT NULL;

    ALTER TABLE fuel.fuel_assignment_questions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE fuel.fuel_assignment_questions FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS fuel_assignment_questions_select ON fuel.fuel_assignment_questions;
    DROP POLICY IF EXISTS fuel_assignment_questions_write ON fuel.fuel_assignment_questions;
    CREATE POLICY fuel_assignment_questions_select ON fuel.fuel_assignment_questions FOR SELECT
      USING (identity.is_lucia_bypass()
             OR operating_company_id::text = current_setting('app.operating_company_id', true));
    CREATE POLICY fuel_assignment_questions_write ON fuel.fuel_assignment_questions FOR ALL
      USING (identity.is_lucia_bypass()
             OR operating_company_id::text = current_setting('app.operating_company_id', true))
      WITH CHECK (identity.is_lucia_bypass()
             OR operating_company_id::text = current_setting('app.operating_company_id', true));

    GRANT SELECT, INSERT, UPDATE ON fuel.fuel_assignment_questions TO ih35_app;
    REVOKE DELETE ON fuel.fuel_assignment_questions FROM ih35_app;
  END IF;
END
$$;

COMMIT;
