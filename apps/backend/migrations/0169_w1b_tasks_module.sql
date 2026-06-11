-- Migration 0169: W1B-TASKS-MODULE
-- Fills the live Tasks shell: employee×day planner grid, status workflows, spine writes.
-- Depends on W1-EVENT-LOG-SPINE (uses events.log_event).

create schema if not exists tasks;

-- Task categories (Jorge's 5-tab shell)
create type tasks.category as enum ('load', 'maintenance', 'safety', 'dispatch', 'admin');

-- Task status workflow
create type tasks.status as enum (
  'pending',      -- waiting to start
  'in_progress',  -- actively working
  'blocked',      -- waiting on external (parts, broker, etc)
  'review',       -- done, needs verification
  'completed',    -- done and verified
  'cancelled'     -- won't do
);

-- Core task table — every task assigned to an employee on a day
create table tasks.task (
  task_id             uuid primary key default gen_random_uuid(),
  operating_company_id uuid not null,
  category            tasks.category not null,
  status              tasks.status not null default 'pending',
  
  -- Assignment
  assigned_to_user_id uuid not null,  -- employee who owns this task
  assigned_by_user_id uuid,           -- who assigned it (null = system/auto)
  assigned_at         timestamptz not null default now(),
  
  -- Scheduling
  scheduled_date      date not null,  -- the day this task appears on planner
  due_date            date,           -- deadline (may differ from scheduled)
  
  -- Content
  title               text not null,
  description         text,
  priority            int not null default 0,  -- 0=normal, 1=high, 2=critical
  
  -- Links (every task relates to something)
  subject_type        text,  -- 'load' | 'unit' | 'driver' | 'customer' | 'maintenance_order' | null
  subject_id          uuid,
  
  -- Progress
  started_at          timestamptz,
  completed_at        timestamptz,
  completion_notes    text,
  completion_confirmed_by uuid,  -- who verified completion (for review->completed)
  
  -- Estimated/actual time tracking (for utilization)
  estimated_minutes   int,
  actual_minutes      int,
  
  -- Audit
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  is_active           boolean not null default true,
  
  -- Constraints
  constraint valid_subject check (
    (subject_type is null and subject_id is null) or
    (subject_type is not null and subject_id is not null)
  )
);

-- Indexes for the planner queries
-- 1. Employee day view (the main planner grid query)
create index idx_task_employee_date on tasks.task (assigned_to_user_id, scheduled_date, is_active, status);
-- 2. Category views per company
create index idx_task_category on tasks.task (operating_company_id, category, scheduled_date, status);
-- 3. Subject lookups ("what tasks for this load?")
create index idx_task_subject on tasks.task (subject_type, subject_id, is_active);
-- 4. Pending/high priority for dispatch triage
create index idx_task_priority on tasks.task (operating_company_id, priority desc, status) where status in ('pending', 'in_progress', 'blocked');
-- 5. Timeline for event spine correlation
create index idx_task_timeline on tasks.task (operating_company_id, assigned_to_user_id, assigned_at, completed_at);

-- Task status history (append-only, for audit trail)
create table tasks.status_history (
  history_id          uuid primary key default gen_random_uuid(),
  task_id             uuid not null references tasks.task(task_id),
  changed_at          timestamptz not null default now(),
  changed_by_user_id  uuid,
  from_status         tasks.status,
  to_status           tasks.status not null,
  reason              text,
  source              text not null default 'app'  -- 'app' | 'system' | 'api'
);
create index idx_status_history_task on tasks.status_history (task_id, changed_at desc);

-- Task notes/comments (collaboration)
create table tasks.note (
  note_id             uuid primary key default gen_random_uuid(),
  task_id             uuid not null references tasks.task(task_id),
  author_user_id      uuid not null,
  created_at          timestamptz not null default now(),
  content             text not null,
  is_internal         boolean not null default true,  -- false = visible to driver/broker if linked
  is_active           boolean not null default true
);
create index idx_note_task on tasks.note (task_id, created_at desc);

-- RLS on all tables
alter table tasks.task enable row level security;
alter table tasks.status_history enable row level security;
alter table tasks.note enable row level security;

-- Tenant isolation policies
create policy task_tenant_isolation on tasks.task
  using (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);
create policy task_tenant_insert on tasks.task
  with check (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);

create policy status_history_tenant_isolation on tasks.status_history
  using (task_id in (select task_id from tasks.task where operating_company_id = current_setting('app.current_operating_company_id', true)::uuid));

create policy note_tenant_isolation on tasks.note
  using (task_id in (select task_id from tasks.task where operating_company_id = current_setting('app.current_operating_company_id', true)::uuid));

-- Trigger: update tasks.task.updated_at
create or replace function tasks.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tr_task_updated_at
  before update on tasks.task
  for each row
  execute function tasks.set_updated_at();

-- Trigger: write status changes to history AND to event spine
-- Depends on W1-EVENT-LOG-SPINE (events.log_event)
create or replace function tasks.log_status_change()
returns trigger
language plpgsql
as $$
declare
  v_event_id uuid;
begin
  -- Only log if status actually changed
  if old.status is distinct from new.status then
    -- Append to status history
    insert into tasks.status_history (task_id, changed_by_user_id, from_status, to_status, source)
    values (new.task_id, new.assigned_to_user_id, old.status, new.status, 'system');
    
    -- Log to event spine (requires W1-EVENT-LOG-SPINE)
    -- Uses the assigned_to_user_id as actor (the person whose task this is)
    begin
      select events.log_event(
        p_operating_company_id := new.operating_company_id,
        p_event_type := 'task.status_changed',
        p_actor_type := 'user',
        p_actor_id := new.assigned_to_user_id,
        p_subject_type := 'task',
        p_subject_id := new.task_id,
        p_payload := jsonb_build_object(
          'from_status', old.status,
          'to_status', new.status,
          'category', new.category,
          'title', new.title
        ),
        p_occurred_at := now(),
        p_source := 'tasks'
      ) into v_event_id;
    exception when others then
      -- If events.log_event fails (W1 not deployed yet), we still have status_history
      -- This makes W1B safe to deploy before W1A, though W1A is preferred first
      null;
    end;
  end if;
  
  return new;
end;
$$;

create trigger tr_task_status_change
  after update of status on tasks.task
  for each row
  execute function tasks.log_status_change();

-- Trigger: log task creation to spine
create or replace function tasks.log_task_created()
returns trigger
language plpgsql
as $$
declare
  v_event_id uuid;
begin
  begin
    select events.log_event(
      p_operating_company_id := new.operating_company_id,
      p_event_type := 'task.created',
      p_actor_type := 'user',
      p_actor_id := coalesce(new.assigned_by_user_id, new.assigned_to_user_id),
      p_subject_type := 'task',
      p_subject_id := new.task_id,
      p_payload := jsonb_build_object(
        'category', new.category,
        'title', new.title,
        'assigned_to', new.assigned_to_user_id,
        'scheduled_date', new.scheduled_date
      ),
      p_occurred_at := new.assigned_at,
      p_source := 'tasks'
    ) into v_event_id;
  exception when others then
    null;
  end;
  
  return new;
end;
$$;

create trigger tr_task_created
  after insert on tasks.task
  for each row
  execute function tasks.log_task_created();

-- Trigger: log task completion to spine
create or replace function tasks.log_task_completed()
returns trigger
language plpgsql
as $$
declare
  v_event_id uuid;
begin
  if new.status = 'completed' and old.status != 'completed' then
    begin
      select events.log_event(
        p_operating_company_id := new.operating_company_id,
        p_event_type := 'task.completed',
        p_actor_type := 'user',
        p_actor_id := new.assigned_to_user_id,
        p_subject_type := 'task',
        p_subject_id := new.task_id,
        p_payload := jsonb_build_object(
          'category', new.category,
          'title', new.title,
          'actual_minutes', new.actual_minutes,
          'completed_at', new.completed_at
        ),
        p_occurred_at := new.completed_at,
        p_source := 'tasks'
      ) into v_event_id;
    exception when others then
      null;
    end;
  end if;
  
  return new;
end;
$$;

create trigger tr_task_completed
  after update of status on tasks.task
  for each row
  when (new.status = 'completed')
  execute function tasks.log_task_completed();

-- Comments
comment on table tasks.task is 'Core task table — employee×day planner grid. Every task assigned to a user on a scheduled date. Status workflow + spine logging.';
comment on column tasks.task.scheduled_date is 'The day this task appears on the employee planner grid (may differ from due_date)';
comment on column tasks.task.subject_type is 'What this task is about: load, unit, driver, customer, maintenance_order';
comment on table tasks.status_history is 'Append-only status audit trail for every task';
comment on table tasks.note is 'Task comments/notes — collaboration thread per task';

-- Grants
grant usage on schema tasks to ih35_app;
grant select, insert, update, delete on all tables in schema tasks to ih35_app;
grant usage, select on all sequences in schema tasks to ih35_app;

-- Block metadata
-- Block: W1B-TASKS-MODULE
-- Phase: Foundation
-- Classification: NON-FINANCIAL
-- Depends: W1-EVENT-LOG-SPINE (gracefully degrades if not present)
