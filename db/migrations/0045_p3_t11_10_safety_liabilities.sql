BEGIN;

CREATE SCHEMA IF NOT EXISTS views;

DO $$
BEGIN
  IF to_regclass('safety.safety_events') IS NOT NULL
     AND to_regclass('mdata.drivers') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.safety_events_with_driver
      WITH (security_invoker = true) AS
      SELECT
        se.id,
        se.operating_company_id,
        se.driver_id,
        se.unit_id,
        se.event_type,
        se.severity,
        se.event_at,
        se.description,
        se.source,
        se.status,
        se.spawned_liability_id,
        se.spawned_wo_id,
        CONCAT_WS(' ', d.first_name, d.last_name) AS driver_full_name,
        d.id::text AS driver_display_id,
        COALESCE(u.unit_number, u.id::text) AS unit_display_id
      FROM safety.safety_events se
      JOIN mdata.drivers d ON d.id = se.driver_id
      LEFT JOIN mdata.units u ON u.id = se.unit_id
      ORDER BY se.event_at DESC
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.safety_events_with_driver
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS id,
        NULL::uuid AS operating_company_id,
        NULL::uuid AS driver_id,
        NULL::uuid AS unit_id,
        NULL::text AS event_type,
        NULL::text AS severity,
        NULL::timestamptz AS event_at,
        NULL::text AS description,
        NULL::text AS source,
        NULL::text AS status,
        NULL::uuid AS spawned_liability_id,
        NULL::uuid AS spawned_wo_id,
        NULL::text AS driver_full_name,
        NULL::text AS driver_display_id,
        NULL::text AS unit_display_id
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_liabilities') IS NOT NULL
     AND to_regclass('mdata.drivers') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.liabilities_active_with_context
      WITH (security_invoker = true) AS
      SELECT
        l.id,
        l.operating_company_id,
        l.driver_id,
        l.type,
        l.source_description,
        l.original_amount,
        l.paid_to_date,
        l.current_balance,
        l.requires_acknowledgment,
        l.acknowledgment_uuid,
        l.forfeiture_clause_active,
        l.forfeiture_clause_signed_at,
        l.created_at,
        l.created_by_user_id,
        l.spawned_from_event_id,
        CONCAT_WS(' ', d.first_name, d.last_name) AS driver_full_name,
        d.id::text AS driver_display_id,
        ds.amount_per_period AS scheduled_deduction,
        (ds.held_until_period IS NOT NULL) AS is_held,
        CASE
          WHEN l.requires_acknowledgment = true AND l.acknowledgment_uuid IS NULL THEN 'pending_ack'
          WHEN ds.held_until_period IS NOT NULL THEN 'held'
          WHEN l.current_balance > 0 THEN 'active'
          ELSE 'paid_off'
        END AS display_status
      FROM driver_finance.driver_liabilities l
      JOIN mdata.drivers d ON d.id = l.driver_id
      LEFT JOIN driver_finance.deduction_schedule ds ON ds.liability_id = l.id
      WHERE l.current_balance > 0
      ORDER BY l.created_at DESC
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.liabilities_active_with_context
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS id,
        NULL::uuid AS operating_company_id,
        NULL::uuid AS driver_id,
        NULL::text AS type,
        NULL::text AS source_description,
        NULL::numeric AS original_amount,
        NULL::numeric AS paid_to_date,
        NULL::numeric AS current_balance,
        false AS requires_acknowledgment,
        NULL::uuid AS acknowledgment_uuid,
        false AS forfeiture_clause_active,
        NULL::timestamptz AS forfeiture_clause_signed_at,
        NULL::timestamptz AS created_at,
        NULL::uuid AS created_by_user_id,
        NULL::uuid AS spawned_from_event_id,
        NULL::text AS driver_full_name,
        NULL::text AS driver_display_id,
        NULL::numeric AS scheduled_deduction,
        false AS is_held,
        NULL::text AS display_status
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('safety.safety_events') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.safety_dashboard_kpis
      WITH (security_invoker = true) AS
      SELECT
        operating_company_id,
        COUNT(*) FILTER (WHERE status = 'open') AS open_events,
        COUNT(*) FILTER (WHERE event_at >= date_trunc('month', now())) AS mtd_violations,
        COUNT(*) FILTER (
          WHERE event_type = 'training_due'
            AND event_at <= now() + INTERVAL '30 days'
        ) AS training_due_30d
      FROM safety.safety_events
      GROUP BY operating_company_id
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.safety_dashboard_kpis
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS operating_company_id,
        0::bigint AS open_events,
        0::bigint AS mtd_violations,
        0::bigint AS training_due_30d
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_liabilities') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.liabilities_dashboard_kpis
      WITH (security_invoker = true) AS
      SELECT
        operating_company_id,
        SUM(current_balance) AS total_active_debt,
        COUNT(DISTINCT driver_id) FILTER (WHERE current_balance > 0) AS drivers_with_debt,
        COUNT(*) FILTER (
          WHERE requires_acknowledgment = true
            AND acknowledgment_uuid IS NULL
        ) AS pending_acks,
        SUM(original_amount) FILTER (
          WHERE type = 'equipment_loss'
            AND created_at >= date_trunc('year', now())
        ) AS equipment_loss_ytd,
        SUM(original_amount) FILTER (
          WHERE type = 'civil_fine'
            AND created_at >= date_trunc('year', now())
        ) AS civil_fines_ytd
      FROM driver_finance.driver_liabilities
      GROUP BY operating_company_id
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.liabilities_dashboard_kpis
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS operating_company_id,
        0::numeric AS total_active_debt,
        0::bigint AS drivers_with_debt,
        0::bigint AS pending_acks,
        0::numeric AS equipment_loss_ytd,
        0::numeric AS civil_fines_ytd
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

COMMIT;
