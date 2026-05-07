BEGIN;

CREATE SCHEMA IF NOT EXISTS views;
CREATE SCHEMA IF NOT EXISTS maintenance;
CREATE SCHEMA IF NOT EXISTS safety;

DO $$
BEGIN
  IF to_regclass('maintenance.work_orders') IS NULL THEN
    CREATE TABLE maintenance.work_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operating_company_id uuid,
      wo_type text,
      status text DEFAULT 'open',
      unit_id uuid,
      driver_id uuid,
      opened_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      repair_location text,
      description text,
      display_id text,
      total_actual_cost numeric(10,2)
    );
  END IF;
  IF to_regclass('safety.accident_reports') IS NULL THEN
    CREATE TABLE safety.accident_reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operating_company_id uuid,
      driver_id uuid,
      accident_at timestamptz,
      description text
    );
  END IF;
END
$$;

DO $$
BEGIN
  ALTER TABLE maintenance.work_orders
    ADD COLUMN IF NOT EXISTS source_type text,
    ADD COLUMN IF NOT EXISTS unit_sequence int,
    ADD COLUMN IF NOT EXISTS legacy_display_id text,
    ADD COLUMN IF NOT EXISTS v5_suffix text,
    ADD COLUMN IF NOT EXISTS external_vendor_id uuid,
    ADD COLUMN IF NOT EXISTS external_vendor_wo_number text,
    ADD COLUMN IF NOT EXISTS external_vendor_invoice_number text,
    ADD COLUMN IF NOT EXISTS external_vendor_invoice_amount numeric(10,2),
    ADD COLUMN IF NOT EXISTS external_vendor_invoice_doc_id uuid,
    ADD COLUMN IF NOT EXISTS labor_only_no_parts boolean NOT NULL DEFAULT false;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_maintenance_wo_source_type'
      AND conrelid = 'maintenance.work_orders'::regclass
  ) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT chk_maintenance_wo_source_type
      CHECK (source_type IN ('IS','ES','AC','ET','RT','IT','RS'));
  END IF;

  IF to_regclass('mdata.vendors') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'fk_maintenance_wo_external_vendor'
         AND conrelid = 'maintenance.work_orders'::regclass
     ) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT fk_maintenance_wo_external_vendor
      FOREIGN KEY (external_vendor_id)
      REFERENCES mdata.vendors(id)
      ON DELETE SET NULL;
  END IF;

  IF to_regclass('docs.files') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'fk_maintenance_wo_vendor_invoice_doc'
         AND conrelid = 'maintenance.work_orders'::regclass
     ) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT fk_maintenance_wo_vendor_invoice_doc
      FOREIGN KEY (external_vendor_invoice_doc_id)
      REFERENCES docs.files(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

UPDATE maintenance.work_orders
SET source_type = 'IS'
WHERE source_type IS NULL;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY unit_id, operating_company_id
      ORDER BY COALESCE(created_at, opened_at, now()), id
    ) AS rn
  FROM maintenance.work_orders
  WHERE unit_id IS NOT NULL
)
UPDATE maintenance.work_orders wo
SET unit_sequence = ranked.rn
FROM ranked
WHERE wo.id = ranked.id
  AND wo.unit_sequence IS NULL;

ALTER TABLE maintenance.work_orders
  ALTER COLUMN source_type SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM maintenance.work_orders WHERE unit_sequence IS NULL) THEN
    RAISE EXCEPTION 'E_WO_UNIT_SEQUENCE_BACKFILL_FAILED';
  END IF;
END
$$;

ALTER TABLE maintenance.work_orders
  ALTER COLUMN unit_sequence SET NOT NULL;

DO $$
BEGIN
  IF to_regclass('mdata.units') IS NOT NULL THEN
    UPDATE maintenance.work_orders wo
    SET
      legacy_display_id = COALESCE(wo.legacy_display_id, wo.display_id),
      v5_suffix = COALESCE(wo.v5_suffix, 'LEGCY'),
      display_id = CONCAT(
        'WO-',
        COALESCE(u.unit_number, u.id::text),
        '-',
        wo.source_type,
        '-',
        TO_CHAR(COALESCE(wo.opened_at, wo.created_at, now())::date, 'MM-DD-YYYY'),
        '-',
        LPAD(wo.unit_sequence::text, 4, '0'),
        '-LEGCY'
      )
    FROM mdata.units u
    WHERE wo.unit_id = u.id
      AND wo.operating_company_id = COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
      AND wo.legacy_display_id IS NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS maintenance.parts_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_description text NOT NULL,
  vendor_id uuid REFERENCES mdata.vendors(id),
  last_purchase_invoice_number text,
  last_purchase_amount numeric(10,2),
  last_purchase_date date,
  on_hand_qty int NOT NULL DEFAULT 0,
  location text,
  operating_company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance.parts_invoice_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES maintenance.work_orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES mdata.vendors(id),
  vendor_invoice_number text NOT NULL,
  vendor_invoice_amount numeric(10,2) NOT NULL,
  qty_used int NOT NULL DEFAULT 1,
  part_description text NOT NULL,
  parts_inventory_id uuid REFERENCES maintenance.parts_inventory(id),
  operating_company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid
);

ALTER TABLE maintenance.parts_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.parts_invoice_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'maintenance'
      AND tablename = 'parts_inventory'
      AND policyname = 'parts_inventory_operating_company_policy'
  ) THEN
    CREATE POLICY parts_inventory_operating_company_policy
    ON maintenance.parts_inventory
    USING (operating_company_id = current_setting('app.operating_company_id', true)::uuid)
    WITH CHECK (operating_company_id = current_setting('app.operating_company_id', true)::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'maintenance'
      AND tablename = 'parts_invoice_links'
      AND policyname = 'parts_invoice_links_operating_company_policy'
  ) THEN
    CREATE POLICY parts_invoice_links_operating_company_policy
    ON maintenance.parts_invoice_links
    USING (operating_company_id = current_setting('app.operating_company_id', true)::uuid)
    WITH CHECK (operating_company_id = current_setting('app.operating_company_id', true)::uuid);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION maintenance.compute_v5_suffix(p_wo_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_wo RECORD;
  v_ref text;
  v_first_link_invoice text;
BEGIN
  SELECT source_type, external_vendor_invoice_number, external_vendor_wo_number, labor_only_no_parts
  INTO v_wo
  FROM maintenance.work_orders
  WHERE id = p_wo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'E_WO_NOT_FOUND: %', p_wo_id;
  END IF;

  IF v_wo.source_type IN ('ES','AC','ET','RT','RS') THEN
    v_ref := COALESCE(v_wo.external_vendor_invoice_number, v_wo.external_vendor_wo_number);
    IF v_ref IS NULL THEN
      RETURN 'PEND0';
    END IF;
    RETURN LPAD(RIGHT(v_ref, 5), 5, '0');
  END IF;

  IF v_wo.source_type IN ('IS','IT') THEN
    IF v_wo.labor_only_no_parts THEN
      RETURN 'LABOR';
    END IF;
    SELECT vendor_invoice_number
    INTO v_first_link_invoice
    FROM maintenance.parts_invoice_links
    WHERE work_order_id = p_wo_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_first_link_invoice IS NULL THEN
      RETURN 'PEND0';
    END IF;
    RETURN LPAD(RIGHT(v_first_link_invoice, 5), 5, '0');
  END IF;

  RETURN 'XXXXX';
END
$$;

CREATE OR REPLACE FUNCTION maintenance.next_wo_display_id(
  p_unit_id uuid,
  p_source_type text,
  p_date date,
  p_op_co_id uuid
) RETURNS TABLE(display_id text, sequence int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_unit_display_id text;
  v_seq int;
BEGIN
  IF p_source_type NOT IN ('IS','ES','AC','ET','RT','IT','RS') THEN
    RAISE EXCEPTION 'E_INVALID_WO_SOURCE_TYPE: %', p_source_type;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_unit_id::text));

  SELECT COALESCE(unit_number, id::text)
  INTO v_unit_display_id
  FROM mdata.units
  WHERE id = p_unit_id
    AND operating_company_id = p_op_co_id
  LIMIT 1;

  IF v_unit_display_id IS NULL THEN
    RAISE EXCEPTION 'E_UNIT_NOT_FOUND: %', p_unit_id;
  END IF;

  SELECT COALESCE(MAX(unit_sequence), 0) + 1
  INTO v_seq
  FROM maintenance.work_orders
  WHERE unit_id = p_unit_id
    AND operating_company_id = p_op_co_id;

  display_id := CONCAT(
    'WO-',
    v_unit_display_id,
    '-',
    p_source_type,
    '-',
    TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'MM-DD-YYYY'),
    '-',
    LPAD(v_seq::text, 4, '0'),
    '-PEND0'
  );
  sequence := v_seq;
  RETURN NEXT;
END
$$;

CREATE OR REPLACE FUNCTION maintenance.refresh_wo_display_id(p_wo_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_wo RECORD;
  v_unit_display_id text;
  v_v5 text;
  v_new_id text;
BEGIN
  SELECT *
  INTO v_wo
  FROM maintenance.work_orders
  WHERE id = p_wo_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'E_WO_NOT_FOUND: %', p_wo_id;
  END IF;

  IF v_wo.status IN ('complete', 'completed') THEN
    RAISE EXCEPTION 'E_WO_DISPLAY_ID_LOCKED';
  END IF;

  SELECT COALESCE(unit_number, id::text)
  INTO v_unit_display_id
  FROM mdata.units
  WHERE id = v_wo.unit_id
  LIMIT 1;

  IF v_unit_display_id IS NULL THEN
    RAISE EXCEPTION 'E_UNIT_NOT_FOUND: %', v_wo.unit_id;
  END IF;

  v_v5 := maintenance.compute_v5_suffix(p_wo_id);
  v_new_id := CONCAT(
    'WO-',
    v_unit_display_id,
    '-',
    v_wo.source_type,
    '-',
    TO_CHAR(COALESCE(v_wo.opened_at, v_wo.created_at, now())::date, 'MM-DD-YYYY'),
    '-',
    LPAD(v_wo.unit_sequence::text, 4, '0'),
    '-',
    v_v5
  );

  UPDATE maintenance.work_orders
  SET display_id = v_new_id, v5_suffix = v_v5, updated_at = now()
  WHERE id = p_wo_id;

  RETURN v_new_id;
END
$$;

CREATE OR REPLACE FUNCTION maintenance.enforce_wo_completion_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parts_count int;
  v_parts_total numeric(10,2);
BEGIN
  IF NEW.status IN ('complete', 'completed')
     AND COALESCE(OLD.status, '') NOT IN ('complete', 'completed') THEN
    IF NEW.source_type IN ('ES','AC','ET','RT','RS') THEN
      IF NEW.external_vendor_id IS NULL
         OR NULLIF(trim(COALESCE(NEW.external_vendor_wo_number, '')), '') IS NULL
         OR NULLIF(trim(COALESCE(NEW.external_vendor_invoice_number, '')), '') IS NULL
         OR NEW.external_vendor_invoice_amount IS NULL THEN
        RAISE EXCEPTION 'E_EXTERNAL_VENDOR_FIELDS_REQUIRED: WO type % requires external vendor details before completion', NEW.source_type;
      END IF;

      IF ABS(COALESCE(NEW.total_actual_cost, 0) - NEW.external_vendor_invoice_amount) > 0.01 THEN
        RAISE EXCEPTION 'E_COST_RECONCILIATION_FAILED: WO cost % does not match vendor invoice %', COALESCE(NEW.total_actual_cost, 0), NEW.external_vendor_invoice_amount;
      END IF;
    END IF;

    IF NEW.source_type IN ('IS','IT') AND NEW.labor_only_no_parts = false THEN
      SELECT COUNT(*), COALESCE(SUM(vendor_invoice_amount * GREATEST(qty_used, 1)), 0)
      INTO v_parts_count, v_parts_total
      FROM maintenance.parts_invoice_links
      WHERE work_order_id = NEW.id;
      IF v_parts_count = 0 THEN
        RAISE EXCEPTION 'E_PARTS_INVOICE_LINK_REQUIRED';
      END IF;
    END IF;

    IF COALESCE(NEW.v5_suffix, 'PEND0') = 'PEND0' THEN
      RAISE EXCEPTION 'E_WO_V5_PENDING';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_enforce_wo_completion_invariants ON maintenance.work_orders;
CREATE TRIGGER trg_enforce_wo_completion_invariants
BEFORE UPDATE ON maintenance.work_orders
FOR EACH ROW
EXECUTE FUNCTION maintenance.enforce_wo_completion_invariants();

CREATE OR REPLACE VIEW views.maintenance_unit_history
WITH (security_invoker = true) AS
SELECT
  u.id AS unit_id,
  COALESCE(u.unit_number, u.id::text) AS unit_display_id,
  COALESCE(u.currently_leased_to_company_id, u.owner_company_id) AS operating_company_id,
  COUNT(wo.id) FILTER (WHERE wo.source_type IN ('ET','RT','IT')) AS tire_change_count_lifetime,
  COUNT(wo.id) FILTER (WHERE wo.source_type IN ('ET','RT','IT') AND wo.created_at >= now() - INTERVAL '60 days') AS tire_changes_60d,
  COUNT(wo.id) FILTER (WHERE wo.source_type = 'AC') AS accident_count_lifetime,
  COUNT(wo.id) FILTER (WHERE wo.source_type = 'AC' AND wo.created_at >= now() - INTERVAL '12 months') AS accidents_12mo,
  COUNT(wo.id) FILTER (WHERE wo.created_at >= now() - INTERVAL '30 days') AS repairs_30d,
  COALESCE(SUM(wo.total_actual_cost), 0)::numeric(12,2) AS lifetime_cost,
  COALESCE(SUM(wo.total_actual_cost) FILTER (WHERE wo.created_at >= now() - INTERVAL '90 days'), 0)::numeric(12,2) AS cost_90d,
  MAX(wo.created_at) AS last_wo_at,
  MAX(wo.created_at) FILTER (WHERE wo.source_type IN ('ET','RT','IT')) AS last_tire_change_at
FROM mdata.units u
LEFT JOIN maintenance.work_orders wo
  ON wo.unit_id = u.id
 AND wo.operating_company_id = COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
GROUP BY u.id, u.unit_number, COALESCE(u.currently_leased_to_company_id, u.owner_company_id);

CREATE OR REPLACE VIEW views.maintenance_driver_history
WITH (security_invoker = true) AS
SELECT
  d.id AS driver_id,
  d.id::text AS driver_display_id,
  CONCAT_WS(' ', d.first_name, d.last_name) AS full_name,
  COALESCE(MIN(wo.operating_company_id::text), MIN(ar.operating_company_id::text))::uuid AS operating_company_id,
  COUNT(DISTINCT wo.id) AS wo_count_across_units_lifetime,
  COUNT(DISTINCT wo.id) FILTER (WHERE wo.created_at >= now() - INTERVAL '90 days') AS wo_count_90d,
  COUNT(DISTINCT ar.id) AS accident_count_lifetime,
  COUNT(DISTINCT ar.id) FILTER (WHERE ar.accident_at >= now() - INTERVAL '90 days') AS accidents_90d,
  COUNT(DISTINCT wo.id) FILTER (WHERE wo.source_type IN ('ET','RT','IT') AND wo.created_at >= now() - INTERVAL '90 days') AS tire_changes_90d
FROM mdata.drivers d
LEFT JOIN maintenance.work_orders wo
  ON wo.driver_id = d.id
LEFT JOIN safety.accident_reports ar
  ON ar.driver_id = d.id
GROUP BY d.id, d.first_name, d.last_name;

CREATE OR REPLACE VIEW views.maintenance_vendor_history
WITH (security_invoker = true) AS
SELECT
  v.id AS vendor_id,
  COALESCE(v.vendor_name, v.id::text) AS display_name,
  v.operating_company_id,
  COUNT(DISTINCT wo.id) AS wo_count_lifetime,
  COUNT(DISTINCT wo.id) FILTER (WHERE wo.created_at >= now() - INTERVAL '90 days') AS wo_count_90d,
  COALESCE(SUM(wo.external_vendor_invoice_amount), 0)::numeric(12,2) AS spend_lifetime,
  COALESCE(SUM(wo.external_vendor_invoice_amount) FILTER (WHERE wo.created_at >= now() - INTERVAL '90 days'), 0)::numeric(12,2) AS spend_90d,
  (
    SELECT AVG((pil.vendor_invoice_amount / GREATEST(pil.qty_used, 1))::numeric)
    FROM maintenance.parts_invoice_links pil
    WHERE pil.vendor_id = v.id
      AND pil.created_at >= now() - INTERVAL '90 days'
  )::numeric(12,2) AS avg_part_cost_90d
FROM mdata.vendors v
LEFT JOIN maintenance.work_orders wo
  ON wo.external_vendor_id = v.id
 AND wo.operating_company_id = v.operating_company_id
GROUP BY v.id, v.vendor_name, v.operating_company_id;

CREATE OR REPLACE VIEW views.maintenance_fleet_baselines
WITH (security_invoker = true) AS
SELECT
  COALESCE(u.currently_leased_to_company_id, u.owner_company_id) AS operating_company_id,
  'unknown'::text AS equipment_class,
  AVG(COALESCE(uh.tire_changes_60d, 0))::numeric(12,2) AS avg_tire_changes_60d,
  AVG(COALESCE(uh.repairs_30d, 0))::numeric(12,2) AS avg_repairs_30d,
  AVG(COALESCE(uh.cost_90d, 0))::numeric(12,2) AS avg_cost_90d,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY COALESCE(uh.cost_90d, 0))::numeric(12,2) AS p95_cost_90d
FROM mdata.units u
LEFT JOIN views.maintenance_unit_history uh ON uh.unit_id = u.id
GROUP BY COALESCE(u.currently_leased_to_company_id, u.owner_company_id);

COMMIT;
