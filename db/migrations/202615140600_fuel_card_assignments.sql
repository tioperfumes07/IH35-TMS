-- 202615140600_fuel_card_assignments.sql
-- E-22 registry addition (CC-2, band HH 06-08, docs/bus/2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md):
-- "card -> unit registry so a card alone can resolve a unit."
-- Measured 2026-10-01: fuel.fuel_transactions.fuel_card_id points at a card TYPE (catalogs.fuel_card_types,
-- e.g. DREAMLINE), not an individual card, and the statement importer only resolves a truck from the
-- unit number typed on the statement. A row whose unit is missing or unmatched has no way back to its
-- truck even though the statement names the card. This table is that card -> truck (+ driver) history.
--
-- Only the card's LAST DIGITS are stored, never a full card number. One active assignment per card at a
-- time (refused by trigger, under an advisory lock -- btree_gist is not installed). Void, never delete.
-- ADDITIVE + IDEMPOTENT. FORCED RLS (canonical predicate), grants to ih35_app, audit.tg_audit_row().

BEGIN;

CREATE TABLE IF NOT EXISTS fuel.fuel_card_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  fuel_card_type_id uuid NULL REFERENCES catalogs.fuel_card_types(id),
  card_last_digits text NOT NULL CHECK (card_last_digits ~ '^[0-9]{4,6}$'),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid NULL REFERENCES mdata.drivers(id),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz NULL,
  notes text NULL,
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz NULL,
  voided_by_user_id uuid NULL REFERENCES identity.users(id),
  void_reason text NULL,
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK ((voided_at IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND btrim(coalesce(void_reason, '')) <> ''))
);

CREATE INDEX IF NOT EXISTS idx_fuel_card_assignments_card
  ON fuel.fuel_card_assignments (operating_company_id, card_last_digits, effective_from) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_card_assignments_unit
  ON fuel.fuel_card_assignments (unit_id, effective_from DESC) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_card_assignments_driver
  ON fuel.fuel_card_assignments (driver_id, effective_from DESC) WHERE voided_at IS NULL AND driver_id IS NOT NULL;

-- Same-company links + no overlapping active assignment for the same card.
CREATE OR REPLACE FUNCTION fuel.tg_fuel_card_assignments_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fuel.fuel_card_assignments: rows are voided, never deleted' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mdata.units u
     WHERE u.id = NEW.unit_id
       AND (u.owner_company_id = NEW.operating_company_id OR u.currently_leased_to_company_id = NEW.operating_company_id)) THEN
    RAISE EXCEPTION 'fuel.fuel_card_assignments: unit % is not in company %''s fleet', NEW.unit_id, NEW.operating_company_id
      USING ERRCODE = '23514';
  END IF;
  IF NEW.driver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM mdata.drivers d WHERE d.id = NEW.driver_id AND d.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'fuel.fuel_card_assignments: driver % does not belong to company %', NEW.driver_id, NEW.operating_company_id
      USING ERRCODE = '23514';
  END IF;
  IF NEW.fuel_card_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM catalogs.fuel_card_types t WHERE t.id = NEW.fuel_card_type_id AND t.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'fuel.fuel_card_assignments: card type % does not belong to company %', NEW.fuel_card_type_id, NEW.operating_company_id
      USING ERRCODE = '23514';
  END IF;
  IF NEW.voided_at IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('fuel_card_assignments:' || NEW.operating_company_id::text || ':' || NEW.card_last_digits));
    IF EXISTS (
      SELECT 1 FROM fuel.fuel_card_assignments a
       WHERE a.operating_company_id = NEW.operating_company_id
         AND a.card_last_digits = NEW.card_last_digits
         AND a.fuel_card_type_id IS NOT DISTINCT FROM NEW.fuel_card_type_id
         AND a.voided_at IS NULL
         AND a.id <> NEW.id
         AND tstzrange(a.effective_from, a.effective_to) && tstzrange(NEW.effective_from, NEW.effective_to)) THEN
      RAISE EXCEPTION 'fuel.fuel_card_assignments: card ...% already has an active assignment overlapping % - %',
        NEW.card_last_digits, NEW.effective_from, coalesce(NEW.effective_to::text, 'open')
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fuel_card_assignments_guard ON fuel.fuel_card_assignments;
CREATE TRIGGER trg_fuel_card_assignments_guard BEFORE INSERT OR UPDATE ON fuel.fuel_card_assignments
  FOR EACH ROW EXECUTE FUNCTION fuel.tg_fuel_card_assignments_guard();
DROP TRIGGER IF EXISTS trg_fuel_card_assignments_no_delete ON fuel.fuel_card_assignments;
CREATE TRIGGER trg_fuel_card_assignments_no_delete BEFORE DELETE ON fuel.fuel_card_assignments
  FOR EACH ROW EXECUTE FUNCTION fuel.tg_fuel_card_assignments_guard();

ALTER TABLE fuel.fuel_card_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel.fuel_card_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fuel_card_assignments_entity_scope ON fuel.fuel_card_assignments;
CREATE POLICY fuel_card_assignments_entity_scope ON fuel.fuel_card_assignments
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT USAGE ON SCHEMA fuel TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON fuel.fuel_card_assignments TO ih35_app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgrelid = 'fuel.fuel_card_assignments'::regclass AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_audit_fuel_card_assignments AFTER INSERT OR UPDATE OR DELETE
      ON fuel.fuel_card_assignments FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
  END IF;
END
$$;

COMMIT;
