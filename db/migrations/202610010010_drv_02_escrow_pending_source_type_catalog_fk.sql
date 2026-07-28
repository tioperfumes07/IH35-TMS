-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DRV-02 — pending escrow recovery source type catalog FK.
-- *** DO NOT RUN ON PROD via db:migrate. Owner Neon-applies then ledger-backfills. POSTS NOTHING. ***
-- Root cause: driver_finance.escrow_deductions_pending.source_type is restricted by a private CHECK
-- vocabulary, so an owner cannot add a governed recovery source (including SAFETY-FINE) through Lists.
-- Canonical target: catalogs.driver_deduction_types (not catalogs.escrow_types, which defines funding buckets).
-- Link: pending escrow deduction (driver + load + company) → company-scoped deduction/recovery reason code.
-- The legacy lower-snake values are backfilled to canonical editable codes before the composite same-company FK.
-- Cursor band 20261001xxxx. Additive/idempotent; owner applies only after verifying live schema and row counts.

BEGIN;

DO $$
DECLARE
  v_dangling bigint;
  v_check_name text;
BEGIN
  IF to_regclass('driver_finance.escrow_deductions_pending') IS NULL THEN
    RAISE NOTICE 'DRV-02: escrow_deductions_pending absent — skip';
    RETURN;
  END IF;
  IF to_regclass('catalogs.driver_deduction_types') IS NULL THEN
    RAISE EXCEPTION 'DRV-02 ABORT: canonical catalogs.driver_deduction_types is absent';
  END IF;

  -- Catalog codes are the public, editable vocabulary. `may_draw_escrow` belongs to ND-ESC-01 and is
  -- deliberately not recreated here: this migration establishes source provenance, not draw authority.
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  INSERT INTO catalogs.driver_deduction_types (
    operating_company_id,
    code,
    display_name,
    description,
    metadata,
    is_active,
    sort_order
  )
  SELECT
    c.id,
    v.code,
    v.display_name,
    v.description,
    jsonb_build_object('recovery_source_type', true),
    true,
    v.sort_order
  FROM org.companies c
  CROSS JOIN (
    VALUES
      ('LOAD-ABANDONMENT', 'Load abandonment', 'Escrow recovery proposed from an abandoned load.', 710),
      ('DAMAGE-CLAIM', 'Damage claim', 'Escrow recovery proposed from a driver-responsible damage claim.', 720),
      ('MANUAL-PROPOSAL', 'Manual proposal', 'Owner-reviewed manual escrow recovery proposal.', 730),
      ('SAFETY-FINE', 'Safety fine', 'Escrow recovery proposed from a driver-responsible safety fine.', 740)
  ) AS v(code, display_name, description, sort_order)
  ON CONFLICT (operating_company_id, code) DO NOTHING;

  -- Remove only the obsolete source_type CHECK before normalizing its legacy values. Preserve
  -- amount/status checks and every other invariant.
  SELECT c.conname INTO v_check_name
  FROM pg_constraint c
  WHERE c.conrelid = 'driver_finance.escrow_deductions_pending'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%source_type%'
  LIMIT 1;
  IF v_check_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE driver_finance.escrow_deductions_pending DROP CONSTRAINT %I',
      v_check_name
    );
  END IF;

  -- Normalize only the legacy CHECK members; no unknown value is silently remapped.
  UPDATE driver_finance.escrow_deductions_pending
  SET source_type = CASE source_type
    WHEN 'load_abandonment' THEN 'LOAD-ABANDONMENT'
    WHEN 'damage_claim' THEN 'DAMAGE-CLAIM'
    WHEN 'manual_proposal' THEN 'MANUAL-PROPOSAL'
    WHEN 'safety_fine' THEN 'SAFETY-FINE'
    ELSE source_type
  END
  WHERE source_type IN ('load_abandonment', 'damage_claim', 'manual_proposal', 'safety_fine');

  SELECT COUNT(*) INTO v_dangling
  FROM driver_finance.escrow_deductions_pending p
  WHERE NOT EXISTS (
    SELECT 1
    FROM catalogs.driver_deduction_types t
    WHERE t.operating_company_id = p.operating_company_id
      AND t.code = p.source_type
  );
  IF v_dangling > 0 THEN
    RAISE EXCEPTION 'DRV-02 ABORT: % pending escrow deduction source_type value(s) lack a same-company catalog row', v_dangling;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'driver_finance.escrow_deductions_pending'::regclass
      AND conname = 'escrow_deductions_pending_source_type_catalog_fkey'
  ) THEN
    ALTER TABLE driver_finance.escrow_deductions_pending
      ADD CONSTRAINT escrow_deductions_pending_source_type_catalog_fkey
      FOREIGN KEY (operating_company_id, source_type)
      REFERENCES catalogs.driver_deduction_types (operating_company_id, code)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- The trigger is the only automatic writer. Its source type must use the catalog code that the FK permits.
CREATE OR REPLACE FUNCTION dispatch.auto_propose_escrow_on_abandonment()
RETURNS trigger AS $$
DECLARE
  v_abandonment_id uuid;
  v_estimated_cost_cents bigint;
  v_load_value_cents bigint;
  v_abandonment_type text;
  v_breakdown jsonb;
BEGIN
  IF NEW.status NOT IN ('abandoned', 'driver_walkoff', 'driver_no_show') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('abandoned', 'driver_walkoff', 'driver_no_show') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_primary_driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_load_value_cents := GREATEST(COALESCE(NEW.rate_total_cents, 0), 0);
  v_estimated_cost_cents := GREATEST((v_load_value_cents * 15) / 100, 50000);
  v_abandonment_type := CASE NEW.status
    WHEN 'driver_walkoff' THEN 'walkoff'
    WHEN 'driver_no_show' THEN 'no_show'
    ELSE 'other'
  END;

  INSERT INTO dispatch.load_abandonments (
    operating_company_id, load_id, driver_id, unit_id, abandoned_at, abandonment_type, estimated_cost_cents
  ) VALUES (
    NEW.operating_company_id, NEW.id, NEW.assigned_primary_driver_id, NEW.assigned_unit_id,
    now(), v_abandonment_type, v_estimated_cost_cents
  ) RETURNING id INTO v_abandonment_id;

  v_breakdown := jsonb_build_object(
    'load_value_cents', v_load_value_cents,
    'percent_factor', 15,
    'minimum_floor_cents', 50000,
    'calculated_cents', v_estimated_cost_cents,
    'load_number', NEW.load_number,
    'abandonment_type', v_abandonment_type
  );

  INSERT INTO driver_finance.escrow_deductions_pending (
    operating_company_id, driver_id, source_type, source_id, load_id,
    proposed_amount_cents, proposed_reason, proposed_breakdown_json, proposed_by_system
  ) VALUES (
    NEW.operating_company_id, NEW.assigned_primary_driver_id, 'LOAD-ABANDONMENT', v_abandonment_id, NEW.id,
    v_estimated_cost_cents,
    'Auto-proposed: load ' || COALESCE(NEW.load_number, NEW.id::text) || ' abandoned (' || NEW.status::text || ')',
    v_breakdown,
    true
  )
  ON CONFLICT (operating_company_id, source_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
