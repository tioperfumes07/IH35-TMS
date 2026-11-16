-- E-29 (Lead, owner 2026-11-16 10:52 CT "get them done now finish all").
-- MEASURED (prod USMCA 11-16): integrations.auto_status_switch_events has 5 rows ever, last 2026-10-22; the worker ticks
-- every 5 min (_system.background_jobs run_count_today 203) with loads_scanned 0 — it read only at_pickup / in_transit, and no
-- USMCA load sat in either status in 30 days (44 invoiced, 5 delivered_pending_docs, 1 dispatched). Case D reads dispatched
-- loads whose truck is parked in the pickup fence (proposes at_pickup). The CHECK must admit 'D'.
-- Idempotent: replaced only when the constraint lacks 'D'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'integrations.auto_status_switch_events'::regclass AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%case_id%' AND pg_get_constraintdef(c.oid) LIKE '%''D''%'
  ) THEN
    EXECUTE (
      SELECT string_agg(format('ALTER TABLE integrations.auto_status_switch_events DROP CONSTRAINT %I', c.conname), '; ')
        FROM pg_constraint c
       WHERE c.conrelid = 'integrations.auto_status_switch_events'::regclass AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) LIKE '%case_id%'
    );
    ALTER TABLE integrations.auto_status_switch_events
      ADD CONSTRAINT auto_status_switch_events_case_id_check CHECK (case_id IN ('A', 'B', 'C', 'D'));
  END IF;
END $$;
