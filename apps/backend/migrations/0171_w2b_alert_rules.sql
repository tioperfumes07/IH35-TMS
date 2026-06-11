-- Migration 0171: W2B-ALERT-RULES-PROFILES
-- Three QBO-format profile pages: App (office), Driver (impact), Broker (auto/hold).
-- Config surface only — engines that ACT on these rules ship in Waves 3/4.
-- Depends on W1-EVENT-LOG-SPINE (writes config changes to event log).

create schema if not exists alerts;

-- Alert profile types
create type alerts.profile_type as enum ('app', 'driver', 'broker');

-- Core profile table (one per type per company)
create table alerts.profile (
  profile_id            uuid primary key default gen_random_uuid(),
  operating_company_id  uuid not null,
  profile_type          alerts.profile_type not null,
  name                  text not null,  -- e.g., "IH35 Office Profile"
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  
  unique(operating_company_id, profile_type, name)
);

-- Alert rules (the configuration for triggers and actions)
create table alerts.rule (
  rule_id               uuid primary key default gen_random_uuid(),
  operating_company_id  uuid not null,
  profile_id            uuid not null references alerts.profile(profile_id),
  
  -- What triggers this rule (references event-log event_type)
  trigger_event         text not null,  -- e.g., 'geofence.entered', 'load.status_changed', 'task.cold'
  
  -- Who receives the alert
  audience              text not null check (audience in ('office_user', 'driver', 'broker')),
  channel               text not null check (channel in ('app', 'push', 'sms', 'email', 'alarm')),
  
  -- Timing / cadence (App profile)
  ping_count            int default 1,              -- 2-3 for office
  reping_cadence      text check (reping_cadence in ('none', 'daily')),  -- daily re-ping
  cutoff_time           time,                       -- "respond by 5pm or re-ping next day"
  
  -- Driver impact settings (Driver profile)
  force_ack             boolean default false,      -- must acknowledge
  force_alarm           boolean default false,     -- loud repeating alarm
  
  -- Broker settings (Broker profile)
  auto_send             boolean default false,      -- send automatically
  hold_for_review       boolean default true,       -- queue for approval
  
  -- Escalation (App profile)
  escalate_to_user_id   uuid,                       -- e.g., escalate to Jorge
  escalate_after_missed int default 2,              -- after N missed check-ins
  
  -- Conditions (flexible JSON for thresholds)
  conditions            jsonb default '{}',          -- e.g., {"delay_minutes": 120}
  
  -- State
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by_user_id    uuid
);

-- Broker approval queue (hold-for-review items)
create table alerts.broker_queue (
  queue_id              uuid primary key default gen_random_uuid(),
  operating_company_id  uuid not null,
  load_id               uuid,                       -- the load that triggered it
  broker_id             uuid,                       -- the broker/customer
  proposed_message      text not null,              -- the email/message that would be sent
  trigger_event         text not null,              -- what fired
  status                text not null check (status in ('pending', 'approved', 'rejected', 'sent')) default 'pending',
  
  -- Approval workflow
  decided_by_user_id    uuid,
  decided_at            timestamptz,
  edited_message        text,                       -- if edited before approve
  
  created_at            timestamptz not null default now(),
  is_active             boolean not null default true
);

-- Indexes for performance
create index idx_profile_type on alerts.profile (operating_company_id, profile_type, is_active);
create index idx_rule_profile on alerts.rule (profile_id, is_active);
create index idx_rule_trigger on alerts.rule (trigger_event, is_active);
create index idx_broker_queue_status on alerts.broker_queue (operating_company_id, status, created_at desc);
create index idx_broker_queue_load on alerts.broker_queue (load_id, is_active);

-- RLS on all tables
alter table alerts.profile enable row level security;
alter table alerts.rule enable row level security;
alter table alerts.broker_queue enable row level security;

create policy profile_tenant on alerts.profile
  using (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);
create policy rule_tenant on alerts.rule
  using (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);
create policy broker_queue_tenant on alerts.broker_queue
  using (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);

-- Trigger: log profile/rule changes to event spine
create or replace function alerts.log_config_change()
returns trigger
language plpgsql
as $$
declare
  v_event_id uuid;
  v_event_type text;
  v_payload jsonb;
begin
  if tg_table_name = 'profile' then
    v_event_type := 'alerts.profile_' || lower(tg_op);
    v_payload := jsonb_build_object('profile_id', new.profile_id, 'profile_type', new.profile_type, 'name', new.name);
  elsif tg_table_name = 'rule' then
    v_event_type := 'alerts.rule_' || lower(tg_op);
    v_payload := jsonb_build_object('rule_id', new.rule_id, 'trigger_event', new.trigger_event, 'audience', new.audience);
  else
    return new;
  end if;
  
  begin
    select events.log_event(
      p_operating_company_id := new.operating_company_id,
      p_event_type := v_event_type,
      p_actor_type := 'user',
      p_actor_id := coalesce(new.created_by_user_id, new.operating_company_id),
      p_subject_type := 'alert',
      p_subject_id := coalesce(new.profile_id, new.rule_id),
      p_payload := v_payload,
      p_occurred_at := now(),
      p_source := 'alerts'
    ) into v_event_id;
  exception when others then
    null;  -- Graceful if event spine not ready
  end;
  
  return new;
end;
$$;

create trigger tr_profile_change
  after insert or update on alerts.profile
  for each row execute function alerts.log_config_change();

create trigger tr_rule_change
  after insert or update on alerts.rule
  for each row execute function alerts.log_config_change();

-- Comments
comment on table alerts.profile is 'Alert profile config — one per type (app/driver/broker) per company. QBO-format settings page.';
comment on table alerts.rule is 'Individual alert rules with timing, escalation, and broker auto/hold settings.';
comment on table alerts.broker_queue is 'Hold-for-review queue for broker alerts that need dispatch/Jorge approval.';

-- Block metadata
-- Block: W2B-ALERT-RULES-PROFILES
-- Phase: Notifications / Config
-- Classification: NON-FINANCIAL (config only, no financial writes)
-- Depends: W1-EVENT-LOG-SPINE (for config audit logging)
