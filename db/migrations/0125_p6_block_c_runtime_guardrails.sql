-- P6 Block C runtime guardrails:
-- 1) Ensure ih35_app can use accounting/outbox schemas required by book_dispatch flow.
-- 2) Keep dispatch.auto_propose_escrow_on_abandonment enum-safe by comparing status via text,
--    avoiding hard enum casts to values that may be absent in some environments.

GRANT USAGE ON SCHEMA accounting TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA accounting TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA accounting TO ih35_app;

GRANT USAGE ON SCHEMA outbox TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA outbox TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA outbox TO ih35_app;

CREATE OR REPLACE FUNCTION dispatch.auto_propose_escrow_on_abandonment()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_abandonment_id uuid;
  v_estimated_cost_cents bigint;
  v_load_value_cents bigint;
  v_abandonment_type text;
  v_breakdown jsonb;
BEGIN
  IF NEW.status::text NOT IN ('abandoned', 'driver_walkoff', 'driver_no_show') THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text IN ('abandoned', 'driver_walkoff', 'driver_no_show') THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_primary_driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_load_value_cents := GREATEST(COALESCE(NEW.rate_total_cents, 0), 0);
  v_estimated_cost_cents := GREATEST((v_load_value_cents * 15) / 100, 50000);
  v_abandonment_type := CASE NEW.status::text
    WHEN 'driver_walkoff' THEN 'walkoff'
    WHEN 'driver_no_show' THEN 'no_show'
    ELSE 'other'
  END;

  INSERT INTO dispatch.load_abandonments (
    operating_company_id,
    load_id,
    driver_id,
    unit_id,
    abandoned_at,
    abandonment_type,
    estimated_cost_cents
  ) VALUES (
    NEW.operating_company_id,
    NEW.id,
    NEW.assigned_primary_driver_id,
    NEW.assigned_unit_id,
    now(),
    v_abandonment_type,
    v_estimated_cost_cents
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
    operating_company_id,
    driver_id,
    source_type,
    source_id,
    load_id,
    proposed_amount_cents,
    proposed_reason,
    proposed_breakdown_json,
    proposed_by_system
  ) VALUES (
    NEW.operating_company_id,
    NEW.assigned_primary_driver_id,
    'load_abandonment',
    v_abandonment_id,
    NEW.id,
    v_estimated_cost_cents,
    'Auto-proposed: load ' || COALESCE(NEW.load_number, NEW.id::text) || ' abandoned (' || NEW.status::text || ')',
    v_breakdown,
    true
  )
  ON CONFLICT (operating_company_id, source_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
