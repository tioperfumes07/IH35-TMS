-- 202613311200_insurance_driver_schedule_and_confirmations.sql
-- Owner ruling 2026-08-31: booking/assigning a driver not yet on the insurance schedule raises an
-- on-screen WARNING the dispatcher MUST EXPLICITLY CONFIRM (not a passive toast, not a hard block).
-- Every confirm is logged: who, when, driver, load, truck. Owner override beyond that.
-- Build on policy-schedule MEMBERSHIP, NOT assigned_driver_id (that field is a TMS assignment,
-- not schedule membership — building on it produces the wrong guard and misses the real case).
--
-- Context: the uploaded driver list was a SETUP-TIME SNAPSHOT, every driver is sent to the insurer,
-- and setup is unfinished. "Not on the schedule" usually means "not submitted yet" — a workflow
-- state, not a violation. That is why it is a WARNING, not a hard block.
--
-- Two new tables:
--   insurance.driver_schedule — which drivers are listed on the insurance policy schedule (membership).
--   insurance.schedule_confirmations — append-only audit log of dispatcher confirmations
--     (who confirmed, when, which driver, load, truck, policy_id, reason).
--
-- Idempotent, CREATE-only, FORCED RLS, self-contained grants. No money, no GL, no backfill.

CREATE TABLE IF NOT EXISTS insurance.driver_schedule (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  policy_id             uuid,
  driver_id             uuid NOT NULL,
  submitted_at          date,
  confirmed_by_insurer_at date,
  notes                 text,
  is_active             boolean NOT NULL DEFAULT true,
  voided_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DO $fks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_schedule_policy_id_fkey') THEN
    ALTER TABLE insurance.driver_schedule
      ADD CONSTRAINT driver_schedule_policy_id_fkey
      FOREIGN KEY (policy_id) REFERENCES insurance.policy(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_schedule_driver_id_fkey') THEN
    ALTER TABLE insurance.driver_schedule
      ADD CONSTRAINT driver_schedule_driver_id_fkey
      FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_schedule_operating_company_id_fkey') THEN
    ALTER TABLE insurance.driver_schedule
      ADD CONSTRAINT driver_schedule_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id) ON DELETE CASCADE;
  END IF;
END $fks$;

CREATE UNIQUE INDEX IF NOT EXISTS driver_schedule_driver_opco_active_uniq
  ON insurance.driver_schedule (driver_id, operating_company_id)
  WHERE is_active AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS driver_schedule_opco_idx
  ON insurance.driver_schedule (operating_company_id)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS insurance.schedule_confirmations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  driver_id             uuid NOT NULL,
  load_id               uuid,
  unit_id               uuid,
  policy_id             uuid,
  confirmed_by_user_id  uuid NOT NULL,
  confirmed_at          timestamptz NOT NULL DEFAULT now(),
  reason                text,
  confirmation_type     text NOT NULL DEFAULT 'warning',
  rule_id               text NOT NULL DEFAULT 'INS-SCHEDULE-NOT-ON-POLICY',
  created_at            timestamptz NOT NULL DEFAULT now()
);

DO $fks2$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_confirmations_driver_id_fkey') THEN
    ALTER TABLE insurance.schedule_confirmations
      ADD CONSTRAINT schedule_confirmations_driver_id_fkey
      FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_confirmations_operating_company_id_fkey') THEN
    ALTER TABLE insurance.schedule_confirmations
      ADD CONSTRAINT schedule_confirmations_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_confirmations_confirmed_by_user_id_fkey') THEN
    ALTER TABLE insurance.schedule_confirmations
      ADD CONSTRAINT schedule_confirmations_confirmed_by_user_id_fkey
      FOREIGN KEY (confirmed_by_user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
  END IF;
END $fks2$;

CREATE INDEX IF NOT EXISTS schedule_confirmations_opco_idx
  ON insurance.schedule_confirmations (operating_company_id);

CREATE INDEX IF NOT EXISTS schedule_confirmations_driver_idx
  ON insurance.schedule_confirmations (driver_id, confirmed_at DESC);

ALTER TABLE insurance.driver_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.driver_schedule FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_schedule_entity_select ON insurance.driver_schedule;
DROP POLICY IF EXISTS driver_schedule_entity_write  ON insurance.driver_schedule;
CREATE POLICY driver_schedule_entity_select ON insurance.driver_schedule FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY driver_schedule_entity_write ON insurance.driver_schedule FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Dispatcher'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Dispatcher'::identity.role_enum])));

ALTER TABLE insurance.schedule_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.schedule_confirmations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_confirmations_entity_select ON insurance.schedule_confirmations;
DROP POLICY IF EXISTS schedule_confirmations_entity_insert ON insurance.schedule_confirmations;
CREATE POLICY schedule_confirmations_entity_select ON insurance.schedule_confirmations FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY schedule_confirmations_entity_insert ON insurance.schedule_confirmations FOR INSERT
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum,'Manager'::identity.role_enum,'Dispatcher'::identity.role_enum])));

GRANT SELECT, INSERT, UPDATE ON insurance.driver_schedule TO ih35_app;
GRANT SELECT, INSERT ON insurance.schedule_confirmations TO ih35_app;

DO $flag$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
  VALUES (
    'INSURANCE_SCHEDULE_WARNING_ENABLED',
    'Pre-dispatch warning when driver is not on the insurance policy schedule. DEFAULT OFF — owner-gated. When ON, dispatchers must explicitly confirm before booking.',
    false,
    0
  )
  ON CONFLICT (flag_key) DO NOTHING;
END $flag$;
