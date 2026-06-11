-- Migration 0170: W2A-PROFITABILITY-ENGINE
-- Read-only analytics rollup per load. Revenue/mile, cost/mile, margin/mile.
-- ONE engine, THREE groupings: By Lane / By Type / By Customer.
-- NON-FINANCIAL (computes from existing data; writes nothing to accounting).
-- Depends on W1-EVENT-LOG-SPINE for event logging.

create schema if not exists analytics;

-- Per-load profitability facts (the base table)
create table analytics.load_fact (
  fact_id               uuid primary key default gen_random_uuid(),
  operating_company_id  uuid not null,
  load_id               uuid not null unique,  -- one fact per load
  
  -- Identifiers for grouping
  customer_id           uuid,                  -- for By Customer grouping
  equipment_type        text,                  -- reefer / dry_van / flatbed / etc
  origin_city           text,
  origin_state          text,
  dest_city             text,
  dest_state            text,
  lane_key              text generated always as (origin_city || '->' || dest_city) stored,
  
  -- Miles (from loads or settlements)
  loaded_miles         numeric(12,2) default 0,
  empty_miles          numeric(12,2) default 0,
  total_miles          numeric(12,2) generated always as (loaded_miles + empty_miles) stored,
  
  -- Revenue (from accounting invoices or load records)
  linehaul_revenue     numeric(14,2) default 0,
  accessorial_revenue  numeric(14,2) default 0,
  detention_revenue    numeric(14,2) default 0,
  fuel_surcharge       numeric(14,2) default 0,
  total_revenue        numeric(14,2) generated always as (
    linehaul_revenue + accessorial_revenue + detention_revenue + fuel_surcharge
  ) stored,
  
  -- Direct costs (captured per-load where possible)
  driver_pay           numeric(14,2) default 0,   -- settlement portion for this load
  fuel_cost            numeric(14,2) default 0,    -- from fuel module / IFTA allocation
  tolls                numeric(14,2) default 0,
  layover_cost         numeric(14,2) default 0,
  lumper_wash_scale    numeric(14,2) default 0,
  
  -- Allocated costs (flagged as allocations — honesty over false precision)
  maintenance_alloc    numeric(14,2) default 0,    -- per-mile R&M accrual
  insurance_alloc      numeric(14,2) default 0,   -- per-mile insurance
  other_alloc          numeric(14,2) default 0,
  has_allocated_costs  boolean generated always as (
    maintenance_alloc > 0 OR insurance_alloc > 0 OR other_alloc > 0
  ) stored,
  
  total_cost           numeric(14,2) generated always as (
    driver_pay + fuel_cost + tolls + layover_cost + lumper_wash_scale +
    maintenance_alloc + insurance_alloc + other_alloc
  ) stored,
  
  margin               numeric(14,2) generated always as (
    total_revenue - total_cost
  ) stored,
  
  -- Per-mile metrics
  revenue_per_mile     numeric(10,4) generated always as (
    case when total_miles > 0 then total_revenue / total_miles else 0 end
  ) stored,
  cost_per_mile        numeric(10,4) generated always as (
    case when total_miles > 0 then total_cost / total_miles else 0 end
  ) stored,
  margin_per_mile      numeric(10,4) generated always as (
    case when total_miles > 0 then margin / total_miles else 0 end
  ) stored,
  
  -- Time (for period filtering)
  pickup_date          date,
  delivery_date        date,
  transit_days         int generated always as (
    case 
      when pickup_date is not null and delivery_date is not null 
      then delivery_date - pickup_date 
      else null 
    end
  ) stored,
  
  -- Audit
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  is_active            boolean not null default true,
  
  -- Source tracking (honesty)
  revenue_source       text default 'accounting',  -- 'accounting' | 'load_estimate' | 'unset'
  cost_source          text default 'mixed',        -- 'actual' | 'allocated' | 'mixed'
  
  constraint valid_equipment_type check (equipment_type in ('reefer', 'dry_van', 'flatbed', 'step_deck', 'other'))
);

-- Indexes for the three groupings
-- By Lane (the headline view)
create index idx_load_fact_lane on analytics.load_fact (operating_company_id, lane_key, pickup_date desc);
-- By Type
create index idx_load_fact_type on analytics.load_fact (operating_company_id, equipment_type, pickup_date desc);
-- By Customer
create index idx_load_fact_customer on analytics.load_fact (operating_company_id, customer_id, pickup_date desc);
-- By Load (detail view)
create index idx_load_fact_date on analytics.load_fact (operating_company_id, pickup_date desc);
-- Filters
create index idx_load_fact_revenue on analytics.load_fact (operating_company_id, total_revenue) where total_revenue > 0;

-- Materialized rollups for fast dashboard queries
-- By Lane rollup
create table analytics.lane_rollup (
  rollup_id             uuid primary key default gen_random_uuid(),
  operating_company_id  uuid not null,
  lane_key              text not null,
  period_start          date not null,
  period_end            date not null,
  
  load_count            int not null default 0,
  total_miles           numeric(14,2) default 0,
  total_revenue         numeric(16,2) default 0,
  total_cost            numeric(16,2) default 0,
  total_margin          numeric(16,2) default 0,
  avg_revenue_per_mile  numeric(10,4) default 0,
  avg_cost_per_mile     numeric(10,4) default 0,
  avg_margin_per_mile   numeric(10,4) default 0,
  has_allocated_costs   boolean default false,
  
  unique(operating_company_id, lane_key, period_start, period_end)
);

-- By Type rollup
create table analytics.type_rollup (
  rollup_id             uuid primary key default gen_random_uuid(),
  operating_company_id  uuid not null,
  equipment_type        text not null,
  period_start          date not null,
  period_end            date not null,
  
  load_count            int not null default 0,
  total_miles           numeric(14,2) default 0,
  total_revenue         numeric(16,2) default 0,
  total_cost            numeric(16,2) default 0,
  total_margin          numeric(16,2) default 0,
  avg_revenue_per_mile  numeric(10,4) default 0,
  avg_cost_per_mile     numeric(10,4) default 0,
  avg_margin_per_mile   numeric(10,4) default 0,
  has_allocated_costs   boolean default false,
  
  unique(operating_company_id, equipment_type, period_start, period_end)
);

-- By Customer rollup
create table analytics.customer_rollup (
  rollup_id             uuid primary key default gen_random_uuid(),
  operating_company_id  uuid not null,
  customer_id           uuid not null,
  period_start          date not null,
  period_end            date not null,
  
  load_count            int not null default 0,
  total_miles           numeric(14,2) default 0,
  total_revenue         numeric(16,2) default 0,
  total_cost            numeric(16,2) default 0,
  total_margin          numeric(16,2) default 0,
  avg_revenue_per_mile  numeric(10,4) default 0,
  avg_cost_per_mile     numeric(10,4) default 0,
  avg_margin_per_mile   numeric(10,4) default 0,
  has_allocated_costs   boolean default false,
  
  unique(operating_company_id, customer_id, period_start, period_end)
);

-- RLS on all tables
alter table analytics.load_fact enable row level security;
alter table analytics.lane_rollup enable row level security;
alter table analytics.type_rollup enable row level security;
alter table analytics.customer_rollup enable row level security;

create policy load_fact_tenant on analytics.load_fact
  using (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);
create policy lane_rollup_tenant on analytics.lane_rollup
  using (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);
create policy type_rollup_tenant on analytics.type_rollup
  using (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);
create policy customer_rollup_tenant on analytics.customer_rollup
  using (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid);

-- Refresh function for rollups (called by cron or after data ingestion)
create or replace function analytics.refresh_rollups(
  p_operating_company_id uuid,
  p_period_start date,
  p_period_end date
) returns void
language plpgsql
as $$
begin
  -- Lane rollup
  insert into analytics.lane_rollup (
    operating_company_id, lane_key, period_start, period_end,
    load_count, total_miles, total_revenue, total_cost, total_margin,
    avg_revenue_per_mile, avg_cost_per_mile, avg_margin_per_mile, has_allocated_costs
  )
  select 
    operating_company_id,
    lane_key,
    p_period_start,
    p_period_end,
    count(*) as load_count,
    sum(total_miles) as total_miles,
    sum(total_revenue) as total_revenue,
    sum(total_cost) as total_cost,
    sum(margin) as total_margin,
    case when sum(total_miles) > 0 then sum(total_revenue) / sum(total_miles) else 0 end as avg_revenue_per_mile,
    case when sum(total_miles) > 0 then sum(total_cost) / sum(total_miles) else 0 end as avg_cost_per_mile,
    case when sum(total_miles) > 0 then sum(margin) / sum(total_miles) else 0 end as avg_margin_per_mile,
    bool_or(has_allocated_costs) as has_allocated_costs
  from analytics.load_fact
  where operating_company_id = p_operating_company_id
    and pickup_date between p_period_start and p_period_end
  group by operating_company_id, lane_key
  on conflict (operating_company_id, lane_key, period_start, period_end)
  do update set
    load_count = excluded.load_count,
    total_miles = excluded.total_miles,
    total_revenue = excluded.total_revenue,
    total_cost = excluded.total_cost,
    total_margin = excluded.total_margin,
    avg_revenue_per_mile = excluded.avg_revenue_per_mile,
    avg_cost_per_mile = excluded.avg_cost_per_mile,
    avg_margin_per_mile = excluded.avg_margin_per_mile,
    has_allocated_costs = excluded.has_allocated_costs;

  -- Type rollup
  insert into analytics.type_rollup (
    operating_company_id, equipment_type, period_start, period_end,
    load_count, total_miles, total_revenue, total_cost, total_margin,
    avg_revenue_per_mile, avg_cost_per_mile, avg_margin_per_mile, has_allocated_costs
  )
  select 
    operating_company_id,
    equipment_type,
    p_period_start,
    p_period_end,
    count(*) as load_count,
    sum(total_miles) as total_miles,
    sum(total_revenue) as total_revenue,
    sum(total_cost) as total_cost,
    sum(margin) as total_margin,
    case when sum(total_miles) > 0 then sum(total_revenue) / sum(total_miles) else 0 end as avg_revenue_per_mile,
    case when sum(total_miles) > 0 then sum(total_cost) / sum(total_miles) else 0 end as avg_cost_per_mile,
    case when sum(total_miles) > 0 then sum(margin) / sum(total_miles) else 0 end as avg_margin_per_mile,
    bool_or(has_allocated_costs) as has_allocated_costs
  from analytics.load_fact
  where operating_company_id = p_operating_company_id
    and pickup_date between p_period_start and p_period_end
    and equipment_type is not null
  group by operating_company_id, equipment_type
  on conflict (operating_company_id, equipment_type, period_start, period_end)
  do update set
    load_count = excluded.load_count,
    total_miles = excluded.total_miles,
    total_revenue = excluded.total_revenue,
    total_cost = excluded.total_cost,
    total_margin = excluded.total_margin,
    avg_revenue_per_mile = excluded.avg_revenue_per_mile,
    avg_cost_per_mile = excluded.avg_cost_per_mile,
    avg_margin_per_mile = excluded.avg_margin_per_mile,
    has_allocated_costs = excluded.has_allocated_costs;

  -- Customer rollup
  insert into analytics.customer_rollup (
    operating_company_id, customer_id, period_start, period_end,
    load_count, total_miles, total_revenue, total_cost, total_margin,
    avg_revenue_per_mile, avg_cost_per_mile, avg_margin_per_mile, has_allocated_costs
  )
  select 
    operating_company_id,
    customer_id,
    p_period_start,
    p_period_end,
    count(*) as load_count,
    sum(total_miles) as total_miles,
    sum(total_revenue) as total_revenue,
    sum(total_cost) as total_cost,
    sum(margin) as total_margin,
    case when sum(total_miles) > 0 then sum(total_revenue) / sum(total_miles) else 0 end as avg_revenue_per_mile,
    case when sum(total_miles) > 0 then sum(total_cost) / sum(total_miles) else 0 end as avg_cost_per_mile,
    case when sum(total_miles) > 0 then sum(margin) / sum(total_miles) else 0 end as avg_margin_per_mile,
    bool_or(has_allocated_costs) as has_allocated_costs
  from analytics.load_fact
  where operating_company_id = p_operating_company_id
    and pickup_date between p_period_start and p_period_end
    and customer_id is not null
  group by operating_company_id, customer_id
  on conflict (operating_company_id, customer_id, period_start, period_end)
  do update set
    load_count = excluded.load_count,
    total_miles = excluded.total_miles,
    total_revenue = excluded.total_revenue,
    total_cost = excluded.total_cost,
    total_margin = excluded.total_margin,
    avg_revenue_per_mile = excluded.avg_revenue_per_mile,
    avg_cost_per_mile = excluded.avg_cost_per_mile,
    avg_margin_per_mile = excluded.avg_margin_per_mile,
    has_allocated_costs = excluded.has_allocated_costs;
end;
$$;

-- Comments
comment on table analytics.load_fact is 'Per-load profitability facts. Source of truth for all profitability analytics. Allocated costs flagged.';
comment on column analytics.load_fact.has_allocated_costs is 'True if any costs are allocations rather than direct capture. Shows honesty, not false precision.';
comment on table analytics.lane_rollup is 'Pre-aggregated profitability by lane (origin->dest city). Refreshed by refresh_rollups().';
comment on table analytics.type_rollup is 'Pre-aggregated profitability by equipment type. Refreshed by refresh_rollups().';
comment on table analytics.customer_rollup is 'Pre-aggregated profitability by customer. Refreshed by refresh_rollups().';

-- Block metadata
-- Block: W2A-PROFITABILITY-ENGINE
-- Phase: Finance / Analytics
-- Classification: NON-FINANCIAL (read-only aggregation, no accounting writes)
-- Depends: W1-EVENT-LOG-SPINE (for logging compute events)
