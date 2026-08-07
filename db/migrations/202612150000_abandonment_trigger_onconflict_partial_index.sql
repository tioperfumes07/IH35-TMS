-- DISP-01 / ACCT-F121 — the abandonment trigger cannot infer its own partial unique index.
--
-- ROOT CAUSE. dispatch.auto_propose_escrow_on_abandonment() ends with
--     ON CONFLICT (operating_company_id, source_type, source_id) DO NOTHING
-- but the only matching index on driver_finance.escrow_deductions_pending is PARTIAL:
--     CREATE UNIQUE INDEX idx_escrow_pending_source
--       ON driver_finance.escrow_deductions_pending (operating_company_id, source_type, source_id)
--       WHERE (source_id IS NOT NULL);
-- PostgreSQL will not use a partial unique index as an ON CONFLICT arbiter unless the statement
-- RESTATES the index predicate. Without it the planner finds no arbiter and raises
--     42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
-- every single time the trigger fires — it is not a race or an edge case, it is unconditional.
--
-- WHY IT WAS INVISIBLE UNTIL NOW. The trigger only fires on a transition INTO
-- 'abandoned'/'driver_walkoff'/'driver_no_show', and until ACCT-F117 (202612140000) those labels did
-- not exist on mdata.load_status_enum, so the status write raised 22P02 and rolled back BEFORE the
-- trigger could run. Restoring the labels moved the failure one layer down rather than clearing the
-- path: the abandonment→chargeback flow still aborts in full, now at the trigger instead of the cast.
-- Found by running the chain end-to-end on a fork of prod, not by reading the code.
--
-- FIX. Restate the predicate so the arbiter resolves. v_abandonment_id is assigned by
-- `INSERT ... RETURNING id INTO`, so source_id is never NULL here and the row always qualifies for
-- the partial index — the predicate is satisfiable, not merely syntactic.
--
-- The function body below is the LIVE prod definition (pg_get_functiondef, 2026-08-05) reproduced
-- verbatim with exactly one line changed: the ON CONFLICT clause. Nothing else is touched — the
-- ::text comparisons stay (202610291200 added them and they remain correct now that the labels
-- exist), the 15%/50000-cent floor stays, the breakdown jsonb stays. Idempotent: CREATE OR REPLACE.

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
    -- ACCT-F121 — the ONLY changed line. `WHERE source_id IS NOT NULL` restates the predicate of
    -- idx_escrow_pending_source so PostgreSQL can use that partial unique index as the arbiter.
    ON CONFLICT (operating_company_id, source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;

    RETURN NEW;
  END;
  $function$;
