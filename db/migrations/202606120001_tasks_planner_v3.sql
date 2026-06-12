-- TASKS-PLANNER-REDESIGN-V3: additive columns + task_type lookup
-- Depends on W1B-TASKS-MODULE (tasks schema already exists)

-- User-extendable task type lookup (NOT a hard-coded enum)
CREATE TABLE IF NOT EXISTS tasks.task_type (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  operating_company_id uuid NOT NULL,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, name)
);

-- Seed global types (operating_company_id = NULL means system-wide defaults)
-- Callers should INSERT with their own operating_company_id for tenant-specific types
CREATE TABLE IF NOT EXISTS tasks.task_type_seed (
  name text PRIMARY KEY
);
INSERT INTO tasks.task_type_seed (name) VALUES
  ('Expense'), ('Income'), ('Compliance'), ('Maintenance')
ON CONFLICT DO NOTHING;

-- Add progress_pct and task_type_id to tasks.task (additive, NULL safe)
ALTER TABLE tasks.task
  ADD COLUMN IF NOT EXISTS progress_pct smallint NOT NULL DEFAULT 0
    CHECK (progress_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS task_type_id uuid NULL
    REFERENCES tasks.task_type(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_time    time NULL,
  ADD COLUMN IF NOT EXISTS location      text NULL,
  ADD COLUMN IF NOT EXISTS checkin_cadence_minutes int NULL,
  ADD COLUMN IF NOT EXISTS escalate_to_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS notes         text NULL;

-- RLS: task_type is company-scoped
ALTER TABLE tasks.task_type ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'task_type' AND policyname = 'task_type_company_rls'
  ) THEN
    CREATE POLICY task_type_company_rls ON tasks.task_type
      USING (
        operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
      );
  END IF;
END $$;

-- Index for task_type lookups
CREATE INDEX IF NOT EXISTS idx_task_type_company ON tasks.task_type (operating_company_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_task_progress ON tasks.task (operating_company_id, scheduled_date, progress_pct);
