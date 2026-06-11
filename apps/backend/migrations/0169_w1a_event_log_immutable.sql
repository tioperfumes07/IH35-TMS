-- W1-A EVENT-LOG-SPINE Append-Only Enforcement (Fix-Forward Migration)
-- Block: W1A-EVENT-LOG-IMMUTABLE
-- Adds hash chain + append-only trigger to events.event_log
-- NON-FINANCIAL

create extension if not exists pgcrypto;

-- 1. Add hash chain columns for tamper detection
alter table events.event_log add column if not exists prev_hash text;
alter table events.event_log add column if not exists hash text;

-- Index for hash verification
 create index if not exists idx_event_log_hash_chain on events.event_log(operating_company_id, occurred_at, hash);

-- 2. Function to calculate event hash
-- Hash = sha256(prev_hash || event_id || occurred_at || actor_id || event_type || subject_id || payload::text)
create or replace function events.calculate_event_hash(
    p_prev_hash text,
    p_event_id uuid,
    p_occurred_at timestamptz,
    p_actor_id uuid,
    p_event_type text,
    p_subject_id uuid,
    p_payload jsonb
) returns text as $$
begin
    return encode(
        digest(
            coalesce(p_prev_hash, '') || 
            p_event_id::text || 
            p_occurred_at::text || 
            coalesce(p_actor_id::text, '') || 
            p_event_type || 
            coalesce(p_subject_id::text, '') || 
            coalesce(p_payload::text, ''),
            'sha256'
        ),
        'hex'
    );
end;
$$ language plpgsql immutable;

-- 3. Trigger function to enforce append-only and populate hash chain
create or replace function events.event_log_append_only_trigger()
returns trigger as $$
decl
    v_prev_hash text;
    v_calculated_hash text;
begin
    -- BLOCK UPDATE: Events are immutable - corrections are NEW rows
    if TG_OP = 'UPDATE' then
        raise exception 'events.event_log is append-only: UPDATE not allowed. Create a correction event with event_type=''correction.appended'' referencing the original event_id instead.';
    end if;
    
    -- BLOCK DELETE: Events can never be deleted
    if TG_OP = 'DELETE' then
        raise exception 'events.event_log is append-only: DELETE not allowed.';
    end if;
    
    -- For INSERT: Populate hash chain
    if TG_OP = 'INSERT' then
        -- Get the hash of the most recent event for this company
        select hash into v_prev_hash
        from events.event_log
        where operating_company_id = NEW.operating_company_id
          and is_active = true
        order by occurred_at desc, event_id desc
        limit 1;
        
        NEW.prev_hash := v_prev_hash;
        NEW.hash := events.calculate_event_hash(
            v_prev_hash,
            NEW.event_id,
            NEW.occurred_at,
            NEW.actor_id,
            NEW.event_type,
            NEW.subject_id,
            NEW.payload
        );
    end if;
    
    return NEW;
end;
$$ language plpgsql;

-- 4. Create the append-only trigger
drop trigger if exists event_log_append_only on events.event_log;
create trigger event_log_append_only
    before insert or update or delete on events.event_log
    for each row
    execute function events.event_log_append_only_trigger();

-- 5. Revoke direct write permissions (all writes must go through log_event())
revoke update, delete on events.event_log from ih35_app;

comment on table events.event_log is 'Append-only event spine with hash chain. UPDATE/DELETE blocked at trigger level. Corrections are new rows with event_type=correction.appended';
comment on column events.event_log.prev_hash is 'Hash of previous event in chain for this company (null for first event)';
comment on column events.event_log.hash is 'SHA256 hash of prev_hash || event_id || occurred_at || actor_id || event_type || subject_id || payload';

-- Block metadata
-- Block: W1A-EVENT-LOG-IMMUTABLE
-- Phase: Foundation Fix-Forward
-- Classification: NON-FINANCIAL
-- Depends: W1-EVENT-LOG-SPINE (migration that created the table)
