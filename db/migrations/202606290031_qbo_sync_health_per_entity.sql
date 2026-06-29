-- ============================================================================
-- TIER-1 entity-independence hardening (Migration B of 2; depends on A): scope
-- views.qbo_sync_health to the SELECTED entity. BUILD-AND-HOLD — do NOT self-merge.
-- ----------------------------------------------------------------------------
-- WHY: the view is security_invoker=true but did global count(*) over mdata.qbo_*
--   and outbox.queue with NO app.operating_company_id filter. mdata.qbo_* SELECT
--   policies scope by USER MEMBERSHIP (org.user_company_access), not the selected
--   app.operating_company_id, so a user with access to >1 entity sees BLENDED counts.
--   This adds an explicit `operating_company_id = app.operating_company_id` predicate to
--   every mdata.qbo_* count AND to the outbox.queue pending count (now possible after
--   Migration A added outbox.queue.operating_company_id + RLS).
--
-- The accounting.qbo_remote_counts-derived entities (bank_accounts, qbo_categories,
--   names_master, and the qbo_count column) are ALREADY per-entity: that table has an
--   operating_company_id RLS policy and the view runs security_invoker under the caller's
--   app.operating_company_id, so its rows are scoped automatically; left unchanged.
--
-- CREATE OR REPLACE VIEW: output columns are UNCHANGED in name AND order
--   (entity, local_count, qbo_count, pending_count, drift) — only predicates change, so the
--   replace is legal. security_invoker=true preserved. NULLIF-wraps every current_setting()
--   ::uuid cast (verify-rls-uuid-cast-nullif). Idempotent (CREATE OR REPLACE).
-- ============================================================================

BEGIN;

CREATE OR REPLACE VIEW views.qbo_sync_health
WITH (security_invoker = true) AS
WITH latest_counts AS (
  SELECT DISTINCT ON (rc.entity_type)
    rc.entity_type AS entity_key,
    rc.remote_count AS count_value,
    rc.collected_at AS last_polled_at
  FROM accounting.qbo_remote_counts rc
  ORDER BY rc.entity_type, rc.collected_at DESC
),
entities(entity) AS (
  VALUES
    ('vendors'::text),
    ('customers'),
    ('classes'),
    ('items'),
    ('bank_accounts'),
    ('chart_of_accounts'),
    ('qbo_categories'),
    ('names_master')
)
SELECT
  e.entity,
  CASE
    WHEN e.entity = 'vendors' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_vendors WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
    WHEN e.entity = 'customers' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_customers WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
    WHEN e.entity = 'classes' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_classes WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
    WHEN e.entity = 'items' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_items WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
    WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_accounts WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
    WHEN e.entity = 'names_master' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'local.names_master'), 0)
    ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'local.' || e.entity), 0)
  END::int AS local_count,
  CASE
    WHEN e.entity = 'vendors' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_vendors'), 0)
    WHEN e.entity = 'customers' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_customers'), 0)
    WHEN e.entity = 'classes' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_classes'), 0)
    WHEN e.entity = 'items' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_items'), 0)
    WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_accounts'), 0)
    WHEN e.entity = 'names_master' THEN NULL::int
    ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo.' || e.entity), 0)
  END::int AS qbo_count,
  COALESCE((
    SELECT COUNT(*)::int
    FROM outbox.queue q
    WHERE q.target_system = 'qbo'
      AND q.entity_type = e.entity
      AND q.status IN ('pending', 'failed', 'in_flight')
      AND q.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  ), 0)::int AS pending_count,
  CASE
    WHEN e.entity = 'names_master' THEN 'local-only'
    WHEN (
      CASE
        WHEN e.entity = 'vendors' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_vendors WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
        WHEN e.entity = 'customers' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_customers WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
        WHEN e.entity = 'classes' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_classes WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
        WHEN e.entity = 'items' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_items WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
        WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_accounts WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
        ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'local.' || e.entity), 0)
      END
    ) = (
      CASE
        WHEN e.entity = 'vendors' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_vendors'), 0)
        WHEN e.entity = 'customers' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_customers'), 0)
        WHEN e.entity = 'classes' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_classes'), 0)
        WHEN e.entity = 'items' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_items'), 0)
        WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_accounts'), 0)
        ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo.' || e.entity), 0)
      END
    )
    AND COALESCE((
      SELECT COUNT(*)::int
      FROM outbox.queue q
      WHERE q.target_system = 'qbo'
        AND q.entity_type = e.entity
        AND q.status IN ('pending', 'failed', 'in_flight')
      AND q.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    ), 0) = 0 THEN '0'
    WHEN COALESCE((
      SELECT COUNT(*)::int
      FROM outbox.queue q
      WHERE q.target_system = 'qbo'
        AND q.entity_type = e.entity
        AND q.status IN ('pending', 'failed', 'in_flight')
      AND q.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    ), 0) > 0 THEN COALESCE((
      SELECT COUNT(*)::int
      FROM outbox.queue q
      WHERE q.target_system = 'qbo'
        AND q.entity_type = e.entity
        AND q.status IN ('pending', 'failed', 'in_flight')
      AND q.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    ), 0)::text || ' pend'
    ELSE abs(
      (
        CASE
          WHEN e.entity = 'vendors' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_vendors WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
          WHEN e.entity = 'customers' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_customers WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
          WHEN e.entity = 'classes' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_classes WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
          WHEN e.entity = 'items' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_items WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
          WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT COUNT(*)::int FROM mdata.qbo_accounts WHERE operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid), 0)
          ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'local.' || e.entity), 0)
        END
      ) - (
        CASE
          WHEN e.entity = 'vendors' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_vendors'), 0)
          WHEN e.entity = 'customers' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_customers'), 0)
          WHEN e.entity = 'classes' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_classes'), 0)
          WHEN e.entity = 'items' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_items'), 0)
          WHEN e.entity = 'chart_of_accounts' THEN COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo_accounts'), 0)
          ELSE COALESCE((SELECT count_value FROM latest_counts WHERE entity_key = 'qbo.' || e.entity), 0)
        END
      )
    )::text || ' drift'
  END AS drift
FROM entities e
ORDER BY e.entity;

COMMIT;
