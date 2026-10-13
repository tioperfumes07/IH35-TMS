-- 202615760910_claim_prod_only_downtime_and_archived_driver_catalogs.sql
--
-- LEAD 443.103 item 3 (CC-3, R11) — schema drift. Prod has 21 relations that NO migration creates (measured 2026-10-12:
-- prod pg_class vs a fresh database migrated from db/migrations). The 9 that are LIVE and USED are claimed here:
--   downtime.events, downtime.event_day_reasons, downtime.event_costs, downtime.lost_opportunity
--     <- accounting/company-settlement-report.service.ts, maintenance/kpi.routes.ts (event_day_reasons is required by
--        the downtime.events close trigger downtime.enforce_close_requirements)
--   catalogs.license_classes, catalogs.cdl_endorsements, catalogs.cdl_restrictions, catalogs.medical_card_statuses,
--   catalogs.employment_statuses
--     <- the mounted read-only deprecated routes (lists/driver-catalogs.routes.ts -> catalogs/driver/factory.ts, writes 410);
--        202609040000 already locks them, but only "IF the table exists", so a fresh database never had them.
-- The other 12 (archive.*, catalogs.fuel_idle_rate_defaults, integrity.anomaly/metric/driver_metric, safety.citations /
-- violations / event_documents / fmcsa_events / roadside_inspections) are not read or written by app code: listed for the
-- Lead in ~/IH35-LEAD-CHANNEL/443-103-schema-drift.txt, not claimed.
--
-- Every statement restates PRODUCTION exactly (pg_dump --schema-only + pg_get_functiondef, read-only, 2026-10-12):
-- columns, defaults, CHECKs, PK / UNIQUE / FK, indexes, triggers + their functions, RLS + policies, grants, comments.
-- All guarded (IF NOT EXISTS / pg_constraint / pg_trigger / pg_policies / role-exists), so on production the only changes are:
--   * 12 foreign keys prod never had (verify-orphan-fk-inventory; 0 orphans measured on prod), NOT VALID then VALIDATE;
--   * downtime.event_day_reasons gains operating_company_id (derived from its event by trigger, 249 rows backfilled from
--     their events), NOT NULL, FK to org.companies, same-entity FK to the event, and a RESTRICTIVE company-scope policy;
--     downtime.events gains UNIQUE (operating_company_id, id) for that FK;
--   * the 5 catalogs.* comments regain the A17.2 deprecation line in front of the SWEEP-C11 text;
--   * FORCE ROW LEVEL SECURITY on the 4 downtime.* tables (RLS enabled but not forced on prod — the same entity-isolation
--     fix 202615750915 applied to the two downtime catalogs). The app role ih35_app is not the owner, so its reads/writes
--     already run through these policies; FORCE only stops the owner bypassing them.
-- CREATE OR REPLACE FUNCTION re-states the prod body verbatim (no behaviour change).

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS downtime;

-- Functions (bodies verbatim from prod).
CREATE OR REPLACE FUNCTION catalogs.assert_cdl_endorsements_split_brain_locked()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        RAISE EXCEPTION
          'catalogs.cdl_endorsements is archived (SWEEP-C11 split-brain fix, 2026-07-25) — canonical store is reference.cdl_endorsements via /api/v1/lists/drivers/endorsements. Read-only historical archive; writes must go through the canonical reference.* surface.';
        RETURN NULL;
      END;
      $function$;

CREATE OR REPLACE FUNCTION catalogs.assert_cdl_restrictions_split_brain_locked()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        RAISE EXCEPTION
          'catalogs.cdl_restrictions is archived (SWEEP-C11 split-brain fix, 2026-07-25) — canonical store is reference.cdl_restrictions via /api/v1/lists/drivers/restrictions. Read-only historical archive; writes must go through the canonical reference.* surface.';
        RETURN NULL;
      END;
      $function$;

CREATE OR REPLACE FUNCTION catalogs.assert_employment_statuses_split_brain_locked()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        RAISE EXCEPTION
          'catalogs.employment_statuses is archived (SWEEP-C11 split-brain fix, 2026-07-25) — canonical store is reference.employment_statuses via /api/v1/lists/drivers/employment-status. Read-only historical archive; writes must go through the canonical reference.* surface.';
        RETURN NULL;
      END;
      $function$;

CREATE OR REPLACE FUNCTION catalogs.assert_license_classes_split_brain_locked()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        RAISE EXCEPTION
          'catalogs.license_classes is archived (SWEEP-C11 split-brain fix, 2026-07-25) — canonical store is reference.license_classes via /api/v1/lists/drivers/license-classes. Read-only historical archive; writes must go through the canonical reference.* surface.';
        RETURN NULL;
      END;
      $function$;

CREATE OR REPLACE FUNCTION catalogs.assert_medical_card_statuses_split_brain_locked()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        RAISE EXCEPTION
          'catalogs.medical_card_statuses is archived (SWEEP-C11 split-brain fix, 2026-07-25) — canonical store is reference.medical_card_statuses via /api/v1/lists/drivers/medical-card-status. Read-only historical archive; writes must go through the canonical reference.* surface.';
        RETURN NULL;
      END;
      $function$;

CREATE OR REPLACE FUNCTION downtime.enforce_close_requirements()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If ended_at is being set (event is closing), verify day-reasons exist for every spanned day
  IF NEW.ended_at IS NOT NULL AND (OLD.ended_at IS NULL OR TG_OP = 'Insert') THEN
    -- Check that a day-reason row exists for EVERY calendar day the event spans
    -- Count distinct calendar dates from started_at::date to ended_at::date inclusive
    PERFORM 1 FROM downtime.event_day_reasons edr
    WHERE edr.event_id = NEW.id
    HAVING COUNT(DISTINCT edr.reason_date) = (
      -- Number of distinct calendar days from started_at to ended_at (inclusive)
      (NEW.ended_at::date - NEW.started_at::date) + 1
    );
    IF NOT FOUND THEN
      -- Only enforce if the event spans more than one day
      IF (NEW.ended_at::date - NEW.started_at::date) > 0 THEN
        RAISE EXCEPTION 'Cannot close downtime event %: missing day-reason rows for one or more spanned days', NEW.id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION downtime.enforce_day_reasons_on_close()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only enforce when closing (setting ended_at)
  IF NEW.ended_at IS NOT NULL AND (OLD.ended_at IS NULL OR OLD.ended_at IS DISTINCT FROM NEW.ended_at) THEN
    -- Must have category and fault party
    IF NEW.category_id IS NULL OR NEW.fault_party_id IS NULL THEN
      RAISE EXCEPTION 'Cannot close downtime event %: category_id and fault_party_id are required', NEW.id;
    END IF;

    -- If multi-day, must have day-reason for every spanned day
    IF NEW.ended_at::date > NEW.started_at::date THEN
      IF NOT EXISTS (
        SELECT 1 FROM downtime.event_day_reasons edr
        WHERE edr.event_id = NEW.id
        GROUP BY edr.event_id
        HAVING COUNT(*) >= (EXTRACT(DAY FROM NEW.ended_at - NEW.started_at)::integer + 1)
      ) THEN
        RAISE EXCEPTION 'Cannot close multi-day downtime event %: missing day-reason rows for one or more spanned days', NEW.id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- downtime.events
CREATE TABLE IF NOT EXISTS downtime.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operating_company_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    driver_id uuid,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    location_name text,
    location_city text,
    location_state text,
    location_lat numeric(9,6),
    location_lng numeric(9,6),
    category_id uuid NOT NULL,
    fault_party_id uuid NOT NULL,
    preceding_load_id uuid,
    following_load_id uuid,
    work_order_id uuid,
    engine_on_idle_hours numeric(8,2),
    idle_source text,
    closed_by_user_id uuid,
    closed_at timestamp with time zone,
    is_sample_data boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engine_on_idle_hours_within_elapsed CHECK (((engine_on_idle_hours IS NULL) OR (ended_at IS NULL) OR (engine_on_idle_hours <= (EXTRACT(epoch FROM (ended_at - started_at)) / (3600)::numeric)))),
    CONSTRAINT events_idle_source_check CHECK ((idle_source = ANY (ARRAY['samsara'::text, 'manual'::text])))
);

-- downtime.event_day_reasons
CREATE TABLE IF NOT EXISTS downtime.event_day_reasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    reason_date date NOT NULL,
    category_id uuid NOT NULL,
    fault_party_id uuid NOT NULL,
    reason_text text NOT NULL,
    entered_by_user_id uuid NOT NULL,
    entered_at timestamp with time zone DEFAULT now() NOT NULL
);

-- downtime.event_costs
CREATE TABLE IF NOT EXISTS downtime.event_costs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operating_company_id uuid NOT NULL,
    event_id uuid NOT NULL,
    cost_type text NOT NULL,
    amount_cents bigint NOT NULL,
    quantity numeric(10,3),
    unit_rate_cents integer,
    basis text NOT NULL,
    is_cash_cost boolean NOT NULL,
    expense_id uuid,
    tank_event_id uuid,
    journal_entry_id uuid,
    docs_file_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_costs_cost_type_check CHECK ((cost_type = ANY (ARRAY['idle_fuel'::text, 'hotel'::text, 'meals'::text, 'road_service'::text, 'towing'::text, 'repositioning_fuel'::text, 'repositioning_driver_pay'::text, 'permit'::text, 'other'::text])))
);

-- downtime.lost_opportunity
CREATE TABLE IF NOT EXISTS downtime.lost_opportunity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operating_company_id uuid NOT NULL,
    event_id uuid,
    cancelled_load_id uuid,
    replacement_load_id uuid,
    customer_id uuid,
    pu_date date,
    pu_location_name text,
    pu_city text,
    pu_state text,
    del_date date,
    del_location_name text,
    del_city text,
    del_state text,
    miles numeric(10,1),
    would_have_invoiced_cents bigint NOT NULL,
    cancellation_reason_id uuid NOT NULL,
    fault_party_id uuid NOT NULL,
    cancelled_at timestamp with time zone NOT NULL,
    cancelled_by_user_id uuid,
    reposition_miles numeric(10,1),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- catalogs.license_classes
CREATE TABLE IF NOT EXISTS catalogs.license_classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operating_company_id uuid NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- catalogs.cdl_endorsements
CREATE TABLE IF NOT EXISTS catalogs.cdl_endorsements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operating_company_id uuid NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- catalogs.cdl_restrictions
CREATE TABLE IF NOT EXISTS catalogs.cdl_restrictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operating_company_id uuid NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- catalogs.medical_card_statuses
CREATE TABLE IF NOT EXISTS catalogs.medical_card_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operating_company_id uuid NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- catalogs.employment_statuses
CREATE TABLE IF NOT EXISTS catalogs.employment_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operating_company_id uuid NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Constraints (PK / UNIQUE, then FK).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_pkey' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE ONLY downtime.events     ADD CONSTRAINT events_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_day_reasons_event_id_reason_date_key' AND conrelid = 'downtime.event_day_reasons'::regclass) THEN
    ALTER TABLE ONLY downtime.event_day_reasons     ADD CONSTRAINT event_day_reasons_event_id_reason_date_key UNIQUE (event_id, reason_date);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_day_reasons_pkey' AND conrelid = 'downtime.event_day_reasons'::regclass) THEN
    ALTER TABLE ONLY downtime.event_day_reasons     ADD CONSTRAINT event_day_reasons_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_costs_pkey' AND conrelid = 'downtime.event_costs'::regclass) THEN
    ALTER TABLE ONLY downtime.event_costs     ADD CONSTRAINT event_costs_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lost_opportunity_pkey' AND conrelid = 'downtime.lost_opportunity'::regclass) THEN
    ALTER TABLE ONLY downtime.lost_opportunity     ADD CONSTRAINT lost_opportunity_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'license_classes_operating_company_id_code_key' AND conrelid = 'catalogs.license_classes'::regclass) THEN
    ALTER TABLE ONLY catalogs.license_classes     ADD CONSTRAINT license_classes_operating_company_id_code_key UNIQUE (operating_company_id, code);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'license_classes_pkey' AND conrelid = 'catalogs.license_classes'::regclass) THEN
    ALTER TABLE ONLY catalogs.license_classes     ADD CONSTRAINT license_classes_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cdl_endorsements_operating_company_id_code_key' AND conrelid = 'catalogs.cdl_endorsements'::regclass) THEN
    ALTER TABLE ONLY catalogs.cdl_endorsements     ADD CONSTRAINT cdl_endorsements_operating_company_id_code_key UNIQUE (operating_company_id, code);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cdl_endorsements_pkey' AND conrelid = 'catalogs.cdl_endorsements'::regclass) THEN
    ALTER TABLE ONLY catalogs.cdl_endorsements     ADD CONSTRAINT cdl_endorsements_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cdl_restrictions_operating_company_id_code_key' AND conrelid = 'catalogs.cdl_restrictions'::regclass) THEN
    ALTER TABLE ONLY catalogs.cdl_restrictions     ADD CONSTRAINT cdl_restrictions_operating_company_id_code_key UNIQUE (operating_company_id, code);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cdl_restrictions_pkey' AND conrelid = 'catalogs.cdl_restrictions'::regclass) THEN
    ALTER TABLE ONLY catalogs.cdl_restrictions     ADD CONSTRAINT cdl_restrictions_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medical_card_statuses_operating_company_id_code_key' AND conrelid = 'catalogs.medical_card_statuses'::regclass) THEN
    ALTER TABLE ONLY catalogs.medical_card_statuses     ADD CONSTRAINT medical_card_statuses_operating_company_id_code_key UNIQUE (operating_company_id, code);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medical_card_statuses_pkey' AND conrelid = 'catalogs.medical_card_statuses'::regclass) THEN
    ALTER TABLE ONLY catalogs.medical_card_statuses     ADD CONSTRAINT medical_card_statuses_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employment_statuses_operating_company_id_code_key' AND conrelid = 'catalogs.employment_statuses'::regclass) THEN
    ALTER TABLE ONLY catalogs.employment_statuses     ADD CONSTRAINT employment_statuses_operating_company_id_code_key UNIQUE (operating_company_id, code);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employment_statuses_pkey' AND conrelid = 'catalogs.employment_statuses'::regclass) THEN
    ALTER TABLE ONLY catalogs.employment_statuses     ADD CONSTRAINT employment_statuses_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_category_id_fkey' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE ONLY downtime.events     ADD CONSTRAINT events_category_id_fkey FOREIGN KEY (category_id) REFERENCES catalogs.downtime_categories(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_driver_id_fkey' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE ONLY downtime.events     ADD CONSTRAINT events_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_fault_party_id_fkey' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE ONLY downtime.events     ADD CONSTRAINT events_fault_party_id_fkey FOREIGN KEY (fault_party_id) REFERENCES catalogs.downtime_fault_parties(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_following_load_id_fkey' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE ONLY downtime.events     ADD CONSTRAINT events_following_load_id_fkey FOREIGN KEY (following_load_id) REFERENCES mdata.loads(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_preceding_load_id_fkey' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE ONLY downtime.events     ADD CONSTRAINT events_preceding_load_id_fkey FOREIGN KEY (preceding_load_id) REFERENCES mdata.loads(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_unit_id_fkey' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE ONLY downtime.events     ADD CONSTRAINT events_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES mdata.units(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_day_reasons_category_id_fkey' AND conrelid = 'downtime.event_day_reasons'::regclass) THEN
    ALTER TABLE ONLY downtime.event_day_reasons     ADD CONSTRAINT event_day_reasons_category_id_fkey FOREIGN KEY (category_id) REFERENCES catalogs.downtime_categories(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_day_reasons_event_id_fkey' AND conrelid = 'downtime.event_day_reasons'::regclass) THEN
    ALTER TABLE ONLY downtime.event_day_reasons     ADD CONSTRAINT event_day_reasons_event_id_fkey FOREIGN KEY (event_id) REFERENCES downtime.events(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_day_reasons_fault_party_id_fkey' AND conrelid = 'downtime.event_day_reasons'::regclass) THEN
    ALTER TABLE ONLY downtime.event_day_reasons     ADD CONSTRAINT event_day_reasons_fault_party_id_fkey FOREIGN KEY (fault_party_id) REFERENCES catalogs.downtime_fault_parties(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_costs_event_id_fkey' AND conrelid = 'downtime.event_costs'::regclass) THEN
    ALTER TABLE ONLY downtime.event_costs     ADD CONSTRAINT event_costs_event_id_fkey FOREIGN KEY (event_id) REFERENCES downtime.events(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_costs_tank_event_id_fkey' AND conrelid = 'downtime.event_costs'::regclass) THEN
    ALTER TABLE ONLY downtime.event_costs     ADD CONSTRAINT event_costs_tank_event_id_fkey FOREIGN KEY (tank_event_id) REFERENCES fuel.tank_events(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lost_opportunity_cancelled_load_id_fkey' AND conrelid = 'downtime.lost_opportunity'::regclass) THEN
    ALTER TABLE ONLY downtime.lost_opportunity     ADD CONSTRAINT lost_opportunity_cancelled_load_id_fkey FOREIGN KEY (cancelled_load_id) REFERENCES mdata.loads(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lost_opportunity_event_id_fkey' AND conrelid = 'downtime.lost_opportunity'::regclass) THEN
    ALTER TABLE ONLY downtime.lost_opportunity     ADD CONSTRAINT lost_opportunity_event_id_fkey FOREIGN KEY (event_id) REFERENCES downtime.events(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lost_opportunity_fault_party_id_fkey' AND conrelid = 'downtime.lost_opportunity'::regclass) THEN
    ALTER TABLE ONLY downtime.lost_opportunity     ADD CONSTRAINT lost_opportunity_fault_party_id_fkey FOREIGN KEY (fault_party_id) REFERENCES catalogs.downtime_fault_parties(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lost_opportunity_replacement_load_id_fkey' AND conrelid = 'downtime.lost_opportunity'::regclass) THEN
    ALTER TABLE ONLY downtime.lost_opportunity     ADD CONSTRAINT lost_opportunity_replacement_load_id_fkey FOREIGN KEY (replacement_load_id) REFERENCES mdata.loads(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'license_classes_operating_company_id_fkey' AND conrelid = 'catalogs.license_classes'::regclass) THEN
    ALTER TABLE ONLY catalogs.license_classes     ADD CONSTRAINT license_classes_operating_company_id_fkey FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cdl_endorsements_operating_company_id_fkey' AND conrelid = 'catalogs.cdl_endorsements'::regclass) THEN
    ALTER TABLE ONLY catalogs.cdl_endorsements     ADD CONSTRAINT cdl_endorsements_operating_company_id_fkey FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cdl_restrictions_operating_company_id_fkey' AND conrelid = 'catalogs.cdl_restrictions'::regclass) THEN
    ALTER TABLE ONLY catalogs.cdl_restrictions     ADD CONSTRAINT cdl_restrictions_operating_company_id_fkey FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medical_card_statuses_operating_company_id_fkey' AND conrelid = 'catalogs.medical_card_statuses'::regclass) THEN
    ALTER TABLE ONLY catalogs.medical_card_statuses     ADD CONSTRAINT medical_card_statuses_operating_company_id_fkey FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employment_statuses_operating_company_id_fkey' AND conrelid = 'catalogs.employment_statuses'::regclass) THEN
    ALTER TABLE ONLY catalogs.employment_statuses     ADD CONSTRAINT employment_statuses_operating_company_id_fkey FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END $$;

-- Foreign keys prod never had (verify-orphan-fk-inventory). Measured on prod read-only 2026-10-12: 0 orphans on every one
-- (event_costs expense/JE/docs links all NULL today; lost_opportunity has 0 rows). Composite same-entity where the parent
-- carries (operating_company_id, id); added NOT VALID, then VALIDATEd.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_events_operating_company_id_fkey' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE downtime.events ADD CONSTRAINT downtime_events_operating_company_id_fkey FOREIGN KEY (operating_company_id) REFERENCES org.companies(id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.events VALIDATE CONSTRAINT downtime_events_operating_company_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_events_work_order_id_fkey' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE downtime.events ADD CONSTRAINT downtime_events_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES maintenance.work_orders(id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.events VALIDATE CONSTRAINT downtime_events_work_order_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_events_closed_by_user_id_fkey' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE downtime.events ADD CONSTRAINT downtime_events_closed_by_user_id_fkey FOREIGN KEY (closed_by_user_id) REFERENCES identity.users(id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.events VALIDATE CONSTRAINT downtime_events_closed_by_user_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_event_day_reasons_entered_by_user_id_fkey' AND conrelid = 'downtime.event_day_reasons'::regclass) THEN
    ALTER TABLE downtime.event_day_reasons ADD CONSTRAINT downtime_event_day_reasons_entered_by_user_id_fkey FOREIGN KEY (entered_by_user_id) REFERENCES identity.users(id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.event_day_reasons VALIDATE CONSTRAINT downtime_event_day_reasons_entered_by_user_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_event_costs_operating_company_id_fkey' AND conrelid = 'downtime.event_costs'::regclass) THEN
    ALTER TABLE downtime.event_costs ADD CONSTRAINT downtime_event_costs_operating_company_id_fkey FOREIGN KEY (operating_company_id) REFERENCES org.companies(id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.event_costs VALIDATE CONSTRAINT downtime_event_costs_operating_company_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_event_costs_expense_same_entity_fkey' AND conrelid = 'downtime.event_costs'::regclass) THEN
    ALTER TABLE downtime.event_costs ADD CONSTRAINT downtime_event_costs_expense_same_entity_fkey FOREIGN KEY (operating_company_id, expense_id) REFERENCES accounting.expenses(operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.event_costs VALIDATE CONSTRAINT downtime_event_costs_expense_same_entity_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_event_costs_journal_entry_same_entity_fkey' AND conrelid = 'downtime.event_costs'::regclass) THEN
    ALTER TABLE downtime.event_costs ADD CONSTRAINT downtime_event_costs_journal_entry_same_entity_fkey FOREIGN KEY (operating_company_id, journal_entry_id) REFERENCES accounting.journal_entries(operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.event_costs VALIDATE CONSTRAINT downtime_event_costs_journal_entry_same_entity_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_event_costs_docs_file_id_fkey' AND conrelid = 'downtime.event_costs'::regclass) THEN
    ALTER TABLE downtime.event_costs ADD CONSTRAINT downtime_event_costs_docs_file_id_fkey FOREIGN KEY (docs_file_id) REFERENCES docs.files(id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.event_costs VALIDATE CONSTRAINT downtime_event_costs_docs_file_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_lost_opportunity_operating_company_id_fkey' AND conrelid = 'downtime.lost_opportunity'::regclass) THEN
    ALTER TABLE downtime.lost_opportunity ADD CONSTRAINT downtime_lost_opportunity_operating_company_id_fkey FOREIGN KEY (operating_company_id) REFERENCES org.companies(id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.lost_opportunity VALIDATE CONSTRAINT downtime_lost_opportunity_operating_company_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_lost_opportunity_customer_same_entity_fkey' AND conrelid = 'downtime.lost_opportunity'::regclass) THEN
    ALTER TABLE downtime.lost_opportunity ADD CONSTRAINT downtime_lost_opportunity_customer_same_entity_fkey FOREIGN KEY (operating_company_id, customer_id) REFERENCES mdata.customers(operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.lost_opportunity VALIDATE CONSTRAINT downtime_lost_opportunity_customer_same_entity_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_lost_opportunity_cancelled_by_user_id_fkey' AND conrelid = 'downtime.lost_opportunity'::regclass) THEN
    ALTER TABLE downtime.lost_opportunity ADD CONSTRAINT downtime_lost_opportunity_cancelled_by_user_id_fkey FOREIGN KEY (cancelled_by_user_id) REFERENCES identity.users(id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.lost_opportunity VALIDATE CONSTRAINT downtime_lost_opportunity_cancelled_by_user_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_lost_opportunity_cancellation_reason_id_fkey' AND conrelid = 'downtime.lost_opportunity'::regclass) THEN
    ALTER TABLE downtime.lost_opportunity ADD CONSTRAINT downtime_lost_opportunity_cancellation_reason_id_fkey FOREIGN KEY (cancellation_reason_id) REFERENCES catalogs.load_cancellation_reasons(id) NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.lost_opportunity VALIDATE CONSTRAINT downtime_lost_opportunity_cancellation_reason_id_fkey;

-- Indexes.
CREATE INDEX IF NOT EXISTS idx_cdl_endorsements_company_active ON catalogs.cdl_endorsements USING btree (operating_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cdl_restrictions_company_active ON catalogs.cdl_restrictions USING btree (operating_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_employment_statuses_company_active ON catalogs.employment_statuses USING btree (operating_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_license_classes_company_active ON catalogs.license_classes USING btree (operating_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_medical_card_statuses_company_active ON catalogs.medical_card_statuses USING btree (operating_company_id, is_active);
CREATE INDEX IF NOT EXISTS event_costs_event_idx ON downtime.event_costs USING btree (event_id);
CREATE INDEX IF NOT EXISTS lost_opp_cancelled_load_idx ON downtime.lost_opportunity USING btree (cancelled_load_id) WHERE (cancelled_load_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS lost_opp_event_idx ON downtime.lost_opportunity USING btree (event_id) WHERE (event_id IS NOT NULL);

-- Triggers.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cdl_endorsements_split_brain_locked' AND tgrelid = 'catalogs.cdl_endorsements'::regclass) THEN
    CREATE TRIGGER trg_cdl_endorsements_split_brain_locked BEFORE INSERT OR UPDATE ON catalogs.cdl_endorsements FOR EACH ROW EXECUTE FUNCTION catalogs.assert_cdl_endorsements_split_brain_locked();
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cdl_restrictions_split_brain_locked' AND tgrelid = 'catalogs.cdl_restrictions'::regclass) THEN
    CREATE TRIGGER trg_cdl_restrictions_split_brain_locked BEFORE INSERT OR UPDATE ON catalogs.cdl_restrictions FOR EACH ROW EXECUTE FUNCTION catalogs.assert_cdl_restrictions_split_brain_locked();
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_employment_statuses_split_brain_locked' AND tgrelid = 'catalogs.employment_statuses'::regclass) THEN
    CREATE TRIGGER trg_employment_statuses_split_brain_locked BEFORE INSERT OR UPDATE ON catalogs.employment_statuses FOR EACH ROW EXECUTE FUNCTION catalogs.assert_employment_statuses_split_brain_locked();
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_license_classes_split_brain_locked' AND tgrelid = 'catalogs.license_classes'::regclass) THEN
    CREATE TRIGGER trg_license_classes_split_brain_locked BEFORE INSERT OR UPDATE ON catalogs.license_classes FOR EACH ROW EXECUTE FUNCTION catalogs.assert_license_classes_split_brain_locked();
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_medical_card_statuses_split_brain_locked' AND tgrelid = 'catalogs.medical_card_statuses'::regclass) THEN
    CREATE TRIGGER trg_medical_card_statuses_split_brain_locked BEFORE INSERT OR UPDATE ON catalogs.medical_card_statuses FOR EACH ROW EXECUTE FUNCTION catalogs.assert_medical_card_statuses_split_brain_locked();
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'downtime_enforce_close' AND tgrelid = 'downtime.events'::regclass) THEN
    CREATE TRIGGER downtime_enforce_close BEFORE INSERT OR UPDATE OF ended_at ON downtime.events FOR EACH ROW EXECUTE FUNCTION downtime.enforce_close_requirements();
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'downtime_event_close_day_reasons_check' AND tgrelid = 'downtime.events'::regclass) THEN
    CREATE TRIGGER downtime_event_close_day_reasons_check BEFORE UPDATE OF ended_at ON downtime.events FOR EACH ROW EXECUTE FUNCTION downtime.enforce_day_reasons_on_close();
  END IF;
END $$;

-- Entity wall for downtime.event_day_reasons (verify-entity-isolation). Prod scopes it only THROUGH its parent event
-- (EXISTS policies), so it has no company column of its own. It gains operating_company_id, always DERIVED from the parent
-- event by trigger (never caller-supplied, so any writer stays correct), backfilled from the event for the existing rows
-- (metadata, not data entry), then NOT NULL + FK to org.companies + same-entity FK to the event + a RESTRICTIVE
-- company-scope policy (restrictive = ANDed with the existing EXISTS policies: it can only narrow, never widen access).
SET LOCAL app.bypass_rls = 'lucia';
ALTER TABLE downtime.event_day_reasons ADD COLUMN IF NOT EXISTS operating_company_id uuid;

CREATE OR REPLACE FUNCTION downtime.event_day_reasons_company_from_event()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT e.operating_company_id INTO NEW.operating_company_id FROM downtime.events e WHERE e.id = NEW.event_id;
  IF NEW.operating_company_id IS NULL THEN
    RAISE EXCEPTION 'downtime.event_day_reasons: event % not found (or not visible) — the day reason takes its company from its event', NEW.event_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_event_day_reasons_company_from_event' AND tgrelid = 'downtime.event_day_reasons'::regclass) THEN
    CREATE TRIGGER trg_event_day_reasons_company_from_event BEFORE INSERT OR UPDATE OF event_id, operating_company_id
      ON downtime.event_day_reasons FOR EACH ROW EXECUTE FUNCTION downtime.event_day_reasons_company_from_event();
  END IF;
END $$;

UPDATE downtime.event_day_reasons r
   SET operating_company_id = e.operating_company_id
  FROM downtime.events e
 WHERE e.id = r.event_id
   AND r.operating_company_id IS DISTINCT FROM e.operating_company_id;

ALTER TABLE downtime.event_day_reasons ALTER COLUMN operating_company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_operating_company_id_id_key' AND conrelid = 'downtime.events'::regclass) THEN
    ALTER TABLE downtime.events ADD CONSTRAINT events_operating_company_id_id_key UNIQUE (operating_company_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_event_day_reasons_operating_company_id_fkey' AND conrelid = 'downtime.event_day_reasons'::regclass) THEN
    ALTER TABLE downtime.event_day_reasons ADD CONSTRAINT downtime_event_day_reasons_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'downtime_event_day_reasons_event_same_entity_fkey' AND conrelid = 'downtime.event_day_reasons'::regclass) THEN
    ALTER TABLE downtime.event_day_reasons ADD CONSTRAINT downtime_event_day_reasons_event_same_entity_fkey
      FOREIGN KEY (operating_company_id, event_id) REFERENCES downtime.events(operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE downtime.event_day_reasons VALIDATE CONSTRAINT downtime_event_day_reasons_operating_company_id_fkey;
ALTER TABLE downtime.event_day_reasons VALIDATE CONSTRAINT downtime_event_day_reasons_event_same_entity_fkey;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'downtime' AND tablename = 'event_day_reasons' AND policyname = 'event_day_reasons_company_scope') THEN
    CREATE POLICY event_day_reasons_company_scope ON downtime.event_day_reasons AS RESTRICTIVE FOR ALL
      USING (identity.is_lucia_bypass() OR operating_company_id = (NULLIF(current_setting('app.operating_company_id', true), ''))::uuid)
      WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = (NULLIF(current_setting('app.operating_company_id', true), ''))::uuid);
  END IF;
END $$;

-- Row level security (prod state) + FORCE on the downtime tables (entity isolation).
ALTER TABLE catalogs.cdl_endorsements FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.cdl_restrictions FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.employment_statuses FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.license_classes FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.medical_card_statuses FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.cdl_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.cdl_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.employment_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.license_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.medical_card_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE downtime.event_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE downtime.event_day_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE downtime.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE downtime.lost_opportunity ENABLE ROW LEVEL SECURITY;
ALTER TABLE downtime.events FORCE ROW LEVEL SECURITY;
ALTER TABLE downtime.event_day_reasons FORCE ROW LEVEL SECURITY;
ALTER TABLE downtime.event_costs FORCE ROW LEVEL SECURITY;
ALTER TABLE downtime.lost_opportunity FORCE ROW LEVEL SECURITY;

-- Policies.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'cdl_endorsements' AND policyname = 'cdl_endorsements_lucia_bypass') THEN
    CREATE POLICY cdl_endorsements_lucia_bypass ON catalogs.cdl_endorsements FOR SELECT TO ih35_app USING (identity.is_lucia_bypass());
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'cdl_restrictions' AND policyname = 'cdl_restrictions_lucia_bypass') THEN
    CREATE POLICY cdl_restrictions_lucia_bypass ON catalogs.cdl_restrictions FOR SELECT TO ih35_app USING (identity.is_lucia_bypass());
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'cdl_endorsements' AND policyname = 'company_scope') THEN
    CREATE POLICY company_scope ON catalogs.cdl_endorsements TO ih35_app USING (((operating_company_id)::text = current_setting('app.operating_company_id'::text, true))) WITH CHECK (((operating_company_id)::text = current_setting('app.operating_company_id'::text, true)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'cdl_restrictions' AND policyname = 'company_scope') THEN
    CREATE POLICY company_scope ON catalogs.cdl_restrictions TO ih35_app USING (((operating_company_id)::text = current_setting('app.operating_company_id'::text, true))) WITH CHECK (((operating_company_id)::text = current_setting('app.operating_company_id'::text, true)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'employment_statuses' AND policyname = 'company_scope') THEN
    CREATE POLICY company_scope ON catalogs.employment_statuses TO ih35_app USING (((operating_company_id)::text = current_setting('app.operating_company_id'::text, true))) WITH CHECK (((operating_company_id)::text = current_setting('app.operating_company_id'::text, true)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'license_classes' AND policyname = 'company_scope') THEN
    CREATE POLICY company_scope ON catalogs.license_classes TO ih35_app USING (((operating_company_id)::text = current_setting('app.operating_company_id'::text, true))) WITH CHECK (((operating_company_id)::text = current_setting('app.operating_company_id'::text, true)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'medical_card_statuses' AND policyname = 'company_scope') THEN
    CREATE POLICY company_scope ON catalogs.medical_card_statuses TO ih35_app USING (((operating_company_id)::text = current_setting('app.operating_company_id'::text, true))) WITH CHECK (((operating_company_id)::text = current_setting('app.operating_company_id'::text, true)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'employment_statuses' AND policyname = 'employment_statuses_lucia_bypass') THEN
    CREATE POLICY employment_statuses_lucia_bypass ON catalogs.employment_statuses FOR SELECT TO ih35_app USING (identity.is_lucia_bypass());
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'license_classes' AND policyname = 'license_classes_lucia_bypass') THEN
    CREATE POLICY license_classes_lucia_bypass ON catalogs.license_classes FOR SELECT TO ih35_app USING (identity.is_lucia_bypass());
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'medical_card_statuses' AND policyname = 'medical_card_statuses_lucia_bypass') THEN
    CREATE POLICY medical_card_statuses_lucia_bypass ON catalogs.medical_card_statuses FOR SELECT TO ih35_app USING (identity.is_lucia_bypass());
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'downtime' AND tablename = 'events' AND policyname = 'downtime_events_insert') THEN
    CREATE POLICY downtime_events_insert ON downtime.events FOR INSERT WITH CHECK ((identity.is_lucia_bypass() OR (operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'downtime' AND tablename = 'events' AND policyname = 'downtime_events_select') THEN
    CREATE POLICY downtime_events_select ON downtime.events FOR SELECT USING ((identity.is_lucia_bypass() OR (operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'downtime' AND tablename = 'events' AND policyname = 'downtime_events_update') THEN
    CREATE POLICY downtime_events_update ON downtime.events FOR UPDATE USING ((identity.is_lucia_bypass() OR (operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'downtime' AND tablename = 'event_costs' AND policyname = 'event_costs_insert') THEN
    CREATE POLICY event_costs_insert ON downtime.event_costs FOR INSERT WITH CHECK ((identity.is_lucia_bypass() OR (operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'downtime' AND tablename = 'event_costs' AND policyname = 'event_costs_select') THEN
    CREATE POLICY event_costs_select ON downtime.event_costs FOR SELECT USING ((identity.is_lucia_bypass() OR (operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'downtime' AND tablename = 'event_day_reasons' AND policyname = 'event_day_reasons_insert') THEN
    CREATE POLICY event_day_reasons_insert ON downtime.event_day_reasons FOR INSERT WITH CHECK ((EXISTS ( SELECT 1    FROM downtime.events e   WHERE ((e.id = event_day_reasons.event_id) AND (identity.is_lucia_bypass() OR (e.operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid))))));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'downtime' AND tablename = 'event_day_reasons' AND policyname = 'event_day_reasons_select') THEN
    CREATE POLICY event_day_reasons_select ON downtime.event_day_reasons FOR SELECT USING ((EXISTS ( SELECT 1    FROM downtime.events e   WHERE ((e.id = event_day_reasons.event_id) AND (identity.is_lucia_bypass() OR (e.operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid))))));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'downtime' AND tablename = 'lost_opportunity' AND policyname = 'lost_opp_insert') THEN
    CREATE POLICY lost_opp_insert ON downtime.lost_opportunity FOR INSERT WITH CHECK ((identity.is_lucia_bypass() OR (operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid)));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'downtime' AND tablename = 'lost_opportunity' AND policyname = 'lost_opp_select') THEN
    CREATE POLICY lost_opp_select ON downtime.lost_opportunity FOR SELECT USING ((identity.is_lucia_bypass() OR (operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid)));
  END IF;
END $$;

-- Grants (roles that exist only on prod are skipped elsewhere).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE catalogs.cdl_endorsements TO ih35_app;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_rw') THEN
    GRANT SELECT ON TABLE catalogs.cdl_endorsements TO agent_rw;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON TABLE catalogs.cdl_endorsements TO ih35_ci_readonly;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE catalogs.cdl_restrictions TO ih35_app;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_rw') THEN
    GRANT SELECT ON TABLE catalogs.cdl_restrictions TO agent_rw;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON TABLE catalogs.cdl_restrictions TO ih35_ci_readonly;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE catalogs.employment_statuses TO ih35_app;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_rw') THEN
    GRANT SELECT ON TABLE catalogs.employment_statuses TO agent_rw;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON TABLE catalogs.employment_statuses TO ih35_ci_readonly;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE catalogs.license_classes TO ih35_app;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_rw') THEN
    GRANT SELECT ON TABLE catalogs.license_classes TO agent_rw;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON TABLE catalogs.license_classes TO ih35_ci_readonly;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE catalogs.medical_card_statuses TO ih35_app;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_rw') THEN
    GRANT SELECT ON TABLE catalogs.medical_card_statuses TO agent_rw;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON TABLE catalogs.medical_card_statuses TO ih35_ci_readonly;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE downtime.event_costs TO ih35_app;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE downtime.event_day_reasons TO ih35_app;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE downtime.events TO ih35_app;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE downtime.lost_opportunity TO ih35_app;
  END IF;
END $$;

-- Comments: prod's SWEEP-C11 archive text, prefixed with the A17.2 deprecation line verify-a17-deprecation-comments
-- requires (SWEEP-C11 202609040000 replaced the A17.2 comment on prod; both statements are true, so both are kept).
COMMENT ON TABLE catalogs.cdl_endorsements IS 'DEPRECATED (A17.2) — superseded by reference.cdl_endorsements. ARCHIVED (SWEEP-C11, 2026-07-25) — confirmed split-brain LOSER vs reference.cdl_endorsements (Neon lucia count 2026-07-25: catalogs=0 rows, reference=6 canonical rows). INSERT/UPDATE permanently blocked by trg_cdl_endorsements_split_brain_locked; API returns 410 (apps/backend/src/catalogs/driver/factory.ts writesBlocked). Read-only history. Never DROP (Rule 07) — supersedes the 0340 comment (2026-06-03) which only documented, never enforced, the split.';
COMMENT ON TABLE catalogs.cdl_restrictions IS 'DEPRECATED (A17.2) — superseded by reference.cdl_restrictions. ARCHIVED (SWEEP-C11, 2026-07-25) — confirmed split-brain LOSER vs reference.cdl_restrictions (Neon lucia count 2026-07-25: catalogs=0 rows, reference=7 canonical rows). INSERT/UPDATE permanently blocked by trg_cdl_restrictions_split_brain_locked; API returns 410 (apps/backend/src/catalogs/driver/factory.ts writesBlocked). Read-only history. Never DROP (Rule 07) — supersedes the 0340 comment (2026-06-03) which only documented, never enforced, the split.';
COMMENT ON TABLE catalogs.employment_statuses IS 'DEPRECATED (A17.2) — superseded by reference.employment_statuses. ARCHIVED (SWEEP-C11, 2026-07-25) — confirmed split-brain LOSER vs reference.employment_statuses (Neon lucia count 2026-07-25: catalogs=0 rows, reference=11 canonical rows). INSERT/UPDATE permanently blocked by trg_employment_statuses_split_brain_locked; API returns 410 (apps/backend/src/catalogs/driver/factory.ts writesBlocked). Read-only history. Never DROP (Rule 07) — supersedes the 0340 comment (2026-06-03) which only documented, never enforced, the split.';
COMMENT ON TABLE catalogs.license_classes IS 'DEPRECATED (A17.2) — superseded by reference.license_classes. ARCHIVED (SWEEP-C11, 2026-07-25) — confirmed split-brain LOSER vs reference.license_classes (Neon lucia count 2026-07-25: catalogs=0 rows, reference=9 canonical rows). INSERT/UPDATE permanently blocked by trg_license_classes_split_brain_locked; API returns 410 (apps/backend/src/catalogs/driver/factory.ts writesBlocked). Read-only history. Never DROP (Rule 07) — supersedes the 0340 comment (2026-06-03) which only documented, never enforced, the split.';
COMMENT ON TABLE catalogs.medical_card_statuses IS 'DEPRECATED (A17.2) — superseded by reference.medical_card_statuses. ARCHIVED (SWEEP-C11, 2026-07-25) — confirmed split-brain LOSER vs reference.medical_card_statuses (Neon lucia count 2026-07-25: catalogs=0 rows, reference=9 canonical rows). INSERT/UPDATE permanently blocked by trg_medical_card_statuses_split_brain_locked; API returns 410 (apps/backend/src/catalogs/driver/factory.ts writesBlocked). Read-only history. Never DROP (Rule 07) — supersedes the 0340 comment (2026-06-03) which only documented, never enforced, the split.';

COMMIT;
