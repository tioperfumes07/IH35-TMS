-- FLEET-... no, this is LISTS: LISTS-F-RECENT-ACTIVITY-ALWAYS-UNKNOWN (2026-08-21, CC-3)
--
-- views.catalogs_recent_activity (migration 0055) derived catalog_key/action ONLY from
-- a.payload->>'catalog'|'catalog_key'|'action', falling back to the literal strings 'unknown' and
-- 'updated' when absent. Live-observed on /lists: ALL 10 real "Recent Catalog Activity" rows showed
-- "unknown · updated · -" with status "pending" — every one of them hit the fallback, because none
-- of the ~20 independent catalogs/*.routes.ts files that call appendCrudAudit() populate those
-- payload keys (each uses its own ad-hoc field name instead: terms_name, account_name, reason_code,
-- code, ...). What EVERY one of those call sites DOES pass consistently is a `catalogs.<name>.<action>`
-- event_class (catalogs.payment_terms.created, catalogs.accounts.updated, catalogs.classes.deactivated,
-- etc. -- confirmed by grepping every appendCrudAudit call site under apps/backend/src). catalog_key
-- and action are therefore reliably derivable from event_class itself via split_part, with no changes
-- needed to any of those ~20 route files.
--
-- entity_name and qbo_sync_status are NOT touched here -- fixing those would need a payload-shape
-- standardization decision across those same ~20 files (each names its "human readable label" field
-- differently), which is a broader design call, not a mechanical view fix. Left as an open board item
-- (LISTS-F-RECENT-ACTIVITY-ENTITY-NAME-NOT-STANDARDIZED, GUARD-WORKORDERS.md).
DO $$
BEGIN
  IF to_regclass('audit.audit_events') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.catalogs_recent_activity
      WITH (security_invoker = true) AS
      SELECT
        a.created_at,
        a.event_class AS event_type,
        COALESCE(
          NULLIF(split_part(a.event_class, '.', 2), ''),
          a.payload->>'catalog', a.payload->>'catalog_key', 'unknown'
        ) AS catalog_key,
        COALESCE(
          NULLIF(split_part(a.event_class, '.', 3), ''),
          a.payload->>'action', 'updated'
        ) AS action,
        COALESCE(a.payload->>'entity_name', a.payload->>'name', a.payload->>'code', '-') AS entity_name,
        COALESCE(u.email, 'system') AS user_display_name,
        COALESCE(a.payload->>'qbo_sync_status', 'pending') AS qbo_sync_status
      FROM audit.audit_events a
      LEFT JOIN identity.users u ON u.id = a.actor_user_uuid
      WHERE a.event_class LIKE 'catalog.%'
         OR a.event_class LIKE 'catalogs.%'
      ORDER BY a.created_at DESC
      LIMIT 50
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.catalogs_recent_activity
      WITH (security_invoker = true) AS
      SELECT
        NULL::timestamptz AS created_at,
        NULL::text AS event_type,
        NULL::text AS catalog_key,
        NULL::text AS action,
        NULL::text AS entity_name,
        NULL::text AS user_display_name,
        NULL::text AS qbo_sync_status
      WHERE false
    $EMPTY$;
  END IF;
END
$$;
