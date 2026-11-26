-- PERFUME-CONTACTS (owner 2026-11-25 22:04 / 22:11 / 22:09 CT). The TIO Perfumes contacts database: vendors, customers and
-- the ones that are both, with how, where and when every contact started — and the Google business search that adds
-- prospects with their phone, website, hours and rating.
--   22:04 CT: "a contacts database … vendors … customers … country, state, city … multi combo filter boxes".
--   22:11 CT: "very important where or how the contact was imitated and where and dates etc for customers and vendors etc.
--              remember vendors can be customers as well etc."
--   22:09 CT (to the research session): "Yes ask for it and I want is possible all the data" — Google Places full fields.
--
-- 1) perfume.contact_companies — one company. role vendor / customer / both (NULL = not classified yet). Google fields are
--    kept with google_fetched_at: place_id is permanent, the rest is refreshed from Google, never treated as owned data.
-- 2) perfume.contact_people    — one person = one email (or one phone when there is no email). Never twice.
-- 3) perfume.contact_origins   — every first touch: when (may be unknown), how, where (source), source URL, detail.
-- 4) perfume.google_search_runs — one row per Google search or batch run, with the request count and per-city totals.
--
-- Isolated perfume schema (ScentsX LLC): no operating_company_id, never posts to accounting, references only perfume.* and
-- identity.users. FORCE RLS owner-only like every perfume table. No DELETE grant: contacts are archived, never deleted.
-- Additive, idempotent.

-- The name + city dedupe key: lower case, no accents, no punctuation, no company-form tail (LLC, Inc, S.A. de C.V., S. de R.L.).
-- One definition in SQL so the app's Google search and the Master / INEGI imports compute it the same way.
CREATE OR REPLACE FUNCTION perfume.name_key(s text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT nullif(btrim(regexp_replace(
      regexp_replace(
        lower(translate(coalesce(s, ''), 'ÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÇáéíóúüñàèìòùâêîôûç', 'AEIOUUNAEIOUAEIOUCaeiouunaeiouaeiouc')),
        '\m(llc|inc|corp|co|ltd|s\.?\s?a\.?(\s?de\s?c\.?\s?v\.?)?|s\.?\s?de\s?r\.?\s?l\.?(\s?de\s?c\.?\s?v\.?)?)\M\.?', ' ', 'g'),
      '[^a-z0-9]+', ' ', 'g')), '')
  $$;

-- Phone dedupe key: the last 10 digits of every phone ("+52 867 712 3456" = "(867) 712-3456"); shorter numbers give no key.
CREATE OR REPLACE FUNCTION perfume.phone_keys(p text[]) RETURNS text[]
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT coalesce(array_agg(DISTINCT right(d, 10)) FILTER (WHERE length(d) >= 10), '{}')
      FROM (SELECT regexp_replace(x, '\D', '', 'g') AS d FROM unnest(coalesce(p, '{}')) x) t
  $$;

CREATE TABLE IF NOT EXISTS perfume.contact_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 300),
  name_key text GENERATED ALWAYS AS (perfume.name_key(name)) STORED,
  domain text CHECK (domain IS NULL OR domain = lower(btrim(domain))),
  role text CHECK (role IS NULL OR role IN ('vendor', 'customer', 'both')),
  vendor_type text,
  customer_type text,
  main_category text,
  categories text[] NOT NULL DEFAULT '{}',
  brands text[] NOT NULL DEFAULT '{}',
  address text,
  city text,
  state text,
  zip text,
  country text,
  region text,
  website text,
  phone text,
  phone_intl text,
  maps_uri text,
  google_place_id text,
  google_business_status text,
  google_primary_type text,
  google_types text[],
  google_rating numeric(2,1) CHECK (google_rating IS NULL OR (google_rating >= 0 AND google_rating <= 5)),
  google_rating_count integer CHECK (google_rating_count IS NULL OR google_rating_count >= 0),
  google_hours text[],
  google_fetched_at timestamptz,
  linkedin text,
  owner_name text,
  -- An outside directory's own key (INEGI DENUE id, …) so a re-import never doubles a row; segment / SCIAN from that directory.
  external_source text,
  external_directory_id text,
  external_ref jsonb,
  segment text,
  scian_code text,
  status text NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect', 'active', 'dormant', 'do_not_email')),
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 120),
  first_contact_on date,
  last_email_on date,
  notes text,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_companies_place_uq ON perfume.contact_companies (google_place_id) WHERE google_place_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contact_companies_external_uq ON perfume.contact_companies (external_source, external_directory_id) WHERE external_directory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_companies_domain_idx ON perfume.contact_companies (domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_companies_name_trgm ON perfume.contact_companies USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contact_companies_name_key_idx ON perfume.contact_companies (name_key, lower(city)) WHERE name_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_companies_phone10_idx ON perfume.contact_companies (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10));

CREATE TABLE IF NOT EXISTS perfume.contact_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  name text,
  title text,
  email text CHECK (email IS NULL OR (email = lower(btrim(email)) AND email LIKE '%_@_%')),
  other_emails text[] NOT NULL DEFAULT '{}',
  phones text[] NOT NULL DEFAULT '{}',
  phone_keys text[] GENERATED ALWAYS AS (perfume.phone_keys(phones)) STORED,
  role text CHECK (role IS NULL OR role IN ('vendor', 'customer', 'both')),
  how_started text,
  found_in text,
  first_contact_on date,
  last_email_on date,
  email_count integer CHECK (email_count IS NULL OR email_count >= 0),
  sent_lists boolean NOT NULL DEFAULT false,
  opted_out_at timestamptz,
  bounced_at timestamptz,
  master_row integer,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR cardinality(phones) > 0 OR name IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_people_email_uq ON perfume.contact_people (email) WHERE email IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS contact_people_company_idx ON perfume.contact_people (company_id);
CREATE INDEX IF NOT EXISTS contact_people_phone_keys_idx ON perfume.contact_people USING gin (phone_keys);

CREATE TABLE IF NOT EXISTS perfume.contact_origins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  person_id uuid REFERENCES perfume.contact_people(id),
  occurred_on date,
  how text NOT NULL CHECK (length(btrim(how)) BETWEEN 1 AND 200),
  source text NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 300),
  source_url text,
  detail text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_origins_company_idx ON perfume.contact_origins (company_id, occurred_on);

CREATE TABLE IF NOT EXISTS perfume.google_search_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('single', 'batch')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'stopped', 'failed')),
  planned_searches integer NOT NULL DEFAULT 0 CHECK (planned_searches >= 0),
  searches_done integer NOT NULL DEFAULT 0 CHECK (searches_done >= 0),
  requests_made integer NOT NULL DEFAULT 0 CHECK (requests_made >= 0),
  results integer NOT NULL DEFAULT 0 CHECK (results >= 0),
  inserted integer NOT NULL DEFAULT 0 CHECK (inserted >= 0),
  matched integer NOT NULL DEFAULT 0 CHECK (matched >= 0),
  skipped_closed integer NOT NULL DEFAULT 0 CHECK (skipped_closed >= 0),
  by_city jsonb NOT NULL DEFAULT '{}'::jsonb,
  query jsonb,
  error text,
  started_by uuid REFERENCES identity.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS google_search_runs_started_idx ON perfume.google_search_runs (started_at DESC);

ALTER TABLE perfume.contact_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.contact_companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_companies_owner_only ON perfume.contact_companies;
CREATE POLICY contact_companies_owner_only ON perfume.contact_companies USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.contact_companies TO ih35_app;

ALTER TABLE perfume.contact_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.contact_people FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_people_owner_only ON perfume.contact_people;
CREATE POLICY contact_people_owner_only ON perfume.contact_people USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.contact_people TO ih35_app;

ALTER TABLE perfume.contact_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.contact_origins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_origins_owner_only ON perfume.contact_origins;
CREATE POLICY contact_origins_owner_only ON perfume.contact_origins USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.contact_origins TO ih35_app;

ALTER TABLE perfume.google_search_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.google_search_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS google_search_runs_owner_only ON perfume.google_search_runs;
CREATE POLICY google_search_runs_owner_only ON perfume.google_search_runs USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.google_search_runs TO ih35_app;
