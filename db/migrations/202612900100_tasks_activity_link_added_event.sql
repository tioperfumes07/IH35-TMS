-- TASKS-LIVE-LINK-ACTIVITY-CONSTRAINT
-- The canonical task create/link routes append `link_added`, but the original
-- activity constraint predates task links and rejected that event. Keep the
-- activity ledger typed while admitting the shipped connectivity event.
ALTER TABLE tasks.task_activity
  DROP CONSTRAINT IF EXISTS task_activity_event_type_check;

ALTER TABLE tasks.task_activity
  ADD CONSTRAINT task_activity_event_type_check
  CHECK (event_type IN ('comment', 'status_change', 'assignment', 'link_added'));
