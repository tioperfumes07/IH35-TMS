-- TASKS-PLANNER-V2-CONNECTIVITY
-- Additive, idempotent enrichment of the tasks module for entity/record-linked tasks:
--   1. tasks.task_type  -> PROFILE (category, description, default_link_kinds, alarm_lead_days)
--   2. tasks.task       -> alarm_at + anticipated_category (completion fields already exist:
--                          status enum, completed_at, completion_confirmed_by — REUSED, not duplicated)
--   3. tasks.task_link  -> polymorphic task<->record links (mirrors docs.file_links: no hard FK on
--                          the target). Powers the reverse "Tasks" tab on vendor/customer/etc. and the
--                          transaction-side completion flow (role='result' + status='done').
--
-- NON-FINANCIAL. NO posting / GL. Links are pure pointers (target_id is never an accounting write).
-- Depends on W1B-TASKS-MODULE (tasks schema) + TASKS-PLANNER-REDESIGN-V3 (tasks.task_type).
-- void-not-delete (voided_at + is_active). RLS enable+force. NO DELETE grant.

-- ── 1. tasks.task_type becomes a PROFILE ────────────────────────────────────────────────────────
ALTER TABLE tasks.task_type
  ADD COLUMN IF NOT EXISTS category           text NULL,
  ADD COLUMN IF NOT EXISTS description        text NULL,
  ADD COLUMN IF NOT EXISTS default_link_kinds jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS alarm_lead_days    int  NULL;

COMMENT ON COLUMN tasks.task_type.default_link_kinds IS
  'JSON array of default target_type kinds this profile links to (e.g. ["vendor","policy"]). Advisory only — the creator may link any allowed kind.';
COMMENT ON COLUMN tasks.task_type.alarm_lead_days IS
  'Default alarm lead (days before due) suggested when creating a task from this profile.';

-- ── 2. tasks.task: alarm + anticipated category (reuse existing status/completed_at/completion_confirmed_by) ──
ALTER TABLE tasks.task
  ADD COLUMN IF NOT EXISTS alarm_at            timestamptz NULL,
  ADD COLUMN IF NOT EXISTS anticipated_category text       NULL,
  ADD COLUMN IF NOT EXISTS alarm_notified_at   timestamptz NULL;

COMMENT ON COLUMN tasks.task.alarm_notified_at IS
  'Set by the task-alarm cron once a reminder notification has fired for this task, so it is not re-sent every tick.';

COMMENT ON COLUMN tasks.task.alarm_at IS
  'When a reminder/notification should fire for this task (may be before due_date). Scanned by the task-alarm cron.';
COMMENT ON COLUMN tasks.task.anticipated_category IS
  'Free-text anticipated expense/record category set at request time (e.g. "License plates") before the real record exists; resolved on completion via a role=result task_link.';

-- Alarm scan index: only pending/actionable tasks with a future/current alarm.
CREATE INDEX IF NOT EXISTS idx_task_alarm_due ON tasks.task (operating_company_id, alarm_at)
  WHERE alarm_at IS NOT NULL AND is_active = true;

-- ── 3. tasks.task_link (polymorphic, void-not-delete) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks.task_link (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id              uuid NOT NULL REFERENCES tasks.task(task_id) ON DELETE CASCADE,
  operating_company_id uuid NOT NULL,
  -- 'about'  = what the task concerns (the vendor/customer/unit it is filed under)
  -- 'result' = the record that fulfils/closes the task (the new expense/bill/policy/plate)
  role                 text NOT NULL DEFAULT 'about'
                         CHECK (role IN ('about','result')),
  target_type          text NOT NULL
                         CHECK (target_type IN (
                           'vendor','customer','unit','driver','expense','bill','bill_payment',
                           'purchase','work_order','policy','load','settlement','document'
                         )),
  -- POLYMORPHIC: no hard FK on target_id (mirrors docs.file_links) so a task can point at any record.
  target_id            uuid NOT NULL,
  note                 text NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by_user_id   uuid NULL,
  voided_at            timestamptz NULL,
  is_active            boolean NOT NULL DEFAULT true
);

-- Forward: "what does this task link to?" (active only)
CREATE INDEX IF NOT EXISTS idx_task_link_task
  ON tasks.task_link (task_id) WHERE is_active = true;
-- Reverse: "what tasks reference this record?" — powers the per-entity Tasks tab.
CREATE INDEX IF NOT EXISTS idx_task_link_target
  ON tasks.task_link (target_type, target_id) WHERE is_active = true;
-- Company scoping.
CREATE INDEX IF NOT EXISTS idx_task_link_company
  ON tasks.task_link (operating_company_id) WHERE is_active = true;

COMMENT ON TABLE tasks.task_link IS
  'Polymorphic links from a task to any record (vendor/customer/unit/driver/expense/bill/…). role=about is the subject; role=result is the record that completes the task (drives transaction-side completion). Pure pointer — never an accounting write. void-not-delete.';

-- RLS: company-scoped, matching tasks.task (which gates on app.current_operating_company_id).
-- The tasks routes set BOTH app.operating_company_id and app.current_operating_company_id, so this
-- policy resolves on every tasks.* connection.
ALTER TABLE tasks.task_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks.task_link FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'tasks' AND tablename = 'task_link' AND policyname = 'task_link_tenant_isolation'
  ) THEN
    CREATE POLICY task_link_tenant_isolation ON tasks.task_link
      USING (
        operating_company_id = NULLIF(current_setting('app.current_operating_company_id', true), '')::uuid
      )
      WITH CHECK (
        operating_company_id = NULLIF(current_setting('app.current_operating_company_id', true), '')::uuid
      );
  END IF;
END $$;

-- ── Grants (runtime role ih35_app). NO DELETE — links are voided, never deleted. ────────────────
GRANT SELECT, INSERT, UPDATE ON tasks.task_link TO ih35_app;
