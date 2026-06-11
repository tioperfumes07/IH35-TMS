-- Migration 0168: W1-EVENT-LOG-SPINE
-- Immutable timestamped event log — foundation for accountability.
-- All downstream blocks (Waves 2-5) write to this via logEvent().

-- Schema for events
create schema if not exists events;

-- Core event log table: immutable, append-only, RLS-protected
create table events.event_log (
    event_id            uuid primary key default gen_random_uuid(),
    operating_company_id uuid not null,
    event_type          text not null,        -- e.g., 'load.assigned', 'driver.acknowledged', 'geofence.entered'
    actor_type          text not null,        -- 'user' | 'driver' | 'system' | 'broker' | 'unit'
    actor_id            uuid not null,        -- who did it
    subject_type        text not null,        -- 'load' | 'driver' | 'unit' | 'geofence' | 'document'
    subject_id          uuid not null,        -- what it happened to
    occurred_at         timestamptz not null default now(),  -- when (sensor or user timestamp)
    payload             jsonb not null default '{}',         -- event-specific data
    source              text not null default 'app',         -- 'app' | 'samsara' | 'geofence' | 'webhook'
    created_at          timestamptz not null default now(),  -- when logged to spine
    is_active           boolean not null default true,        -- soft delete flag (rarely used)

    -- Index for efficient querying by time, subject, type
    constraint valid_event_type check (event_type ~ '^[a-z]+\.[a-z_]+$'),
    constraint valid_actor_type check (actor_type in ('user', 'driver', 'system', 'broker', 'unit', 'integration')),
    constraint valid_subject_type check (subject_type in ('load', 'driver', 'unit', 'geofence', 'document', 'assignment', 'status', 'broker', 'task', 'alert'))
);

-- Indexes for the query patterns Waves 2-5 will use
-- Timeline queries (per subject)
create index idx_event_log_subject on events.event_log (subject_type, subject_id, occurred_at desc);
-- Event type filtering
create index idx_event_log_type on events.event_log (event_type, occurred_at desc);
-- Actor audit trail
create index idx_event_log_actor on events.event_log (actor_type, actor_id, occurred_at desc);
-- Operating company isolation (RLS enforcement helper)
create index idx_event_log_ocid on events.event_log (operating_company_id, occurred_at desc);
-- Composite: common "recent events for my company" query
create index idx_event_log_ocid_type_time on events.event_log (operating_company_id, event_type, occurred_at desc);

-- RLS: operating company isolation
alter table events.event_log enable row level security;

create policy event_log_tenant_isolation on events.event_log
    using (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);

create policy event_log_tenant_insert on events.event_log
    with check (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);

-- Comments for documentation
comment on table events.event_log is 'Immutable event spine — append only, every event timestamped. All accountability flows through here.';
comment on column events.event_log.event_type is 'Namespaced event type: domain.action (e.g., load.assigned, driver.acknowledged)';
comment on column events.event_log.occurred_at is 'When the event actually happened (sensor or user time)';
comment on column events.event_log.created_at is 'When this record was written to the spine (may differ from occurred_at for backfills)';
comment on column events.event_log.payload is 'Event-specific JSON data — schema varies by event_type';
comment on column events.event_log.source is 'Origin system: app, samsara, geofence, webhook, integration';

-- Helper function: logEvent() — standardized spine write
-- All Wave 2-5 blocks use this, never direct INSERT

create or replace function events.log_event(
    p_operating_company_id uuid,
    p_event_type text,
    p_actor_type text,
    p_actor_id uuid,
    p_subject_type text,
    p_subject_id uuid,
    p_payload jsonb default '{}',
    p_occurred_at timestamptz default now(),
    p_source text default 'app'
) returns uuid
language plpgsql
security definer
as $$
declare
    v_event_id uuid;
begin
    -- Validate event type format (domain.action)
    if p_event_type !~ '^[a-z]+\.[a-z_]+$' then
        raise exception 'Invalid event_type format: %. Expected: domain.action', p_event_type;
    end if;

    -- Validate actor/subject types
    if p_actor_type not in ('user', 'driver', 'system', 'broker', 'unit', 'integration') then
        raise exception 'Invalid actor_type: %', p_actor_type;
    end if;

    if p_subject_type not in ('load', 'driver', 'unit', 'geofence', 'document', 'assignment', 'status', 'broker', 'task', 'alert') then
        raise exception 'Invalid subject_type: %', p_subject_type;
    end if;

    insert into events.event_log (
        operating_company_id,
        event_type,
        actor_type,
        actor_id,
        subject_type,
        subject_id,
        payload,
        occurred_at,
        source
    ) values (
        p_operating_company_id,
        p_event_type,
        p_actor_type,
        p_actor_id,
        p_subject_type,
        p_subject_id,
        p_payload,
        p_occurred_at,
        p_source
    ) returning event_id into v_event_id;

    return v_event_id;
end;
$$;

comment on function events.log_event is 'Standardized event spine writer. All downstream blocks (Waves 2-5) use this — never direct INSERT to event_log.';

-- Migration metadata
-- Block: W1-EVENT-LOG-SPINE
-- Phase: Foundation
-- Classification: NON-FINANCIAL (no accounting writes)
