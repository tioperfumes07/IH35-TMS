-- PERFUME-TRADE-SHOWS (owner 2026-11-26 15:56 CT: "i am still missing all the other views that you or he other agent
-- deisnged"). The trade show planner the contacts research designed (11-25 handoff #4): every perfume / beauty / duty free
-- show with its dates, city and whether the owner goes ("I go" — 7 of 60 on the 2027 calendar), and the contacts who
-- attend each one, so a meeting can be asked, booked and kept per show.
--
-- 1) perfume.trade_shows          — one show edition (name + start date). i_go = the owner's own mark.
-- 2) perfume.trade_show_contacts  — a company (and optionally one person) linked to a show: attends / meeting asked /
--                                   meeting booked / met, the meeting time and a note.
--
-- Isolated perfume schema (ScentsX LLC): no operating_company_id, never posts to accounting, references only perfume.* and
-- identity.users. FORCE RLS owner-only like every perfume table. No DELETE grant: rows are archived, never deleted.
-- Additive, idempotent.

CREATE TABLE IF NOT EXISTS perfume.trade_shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 300),
  starts_on date,
  ends_on date CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  city text,
  country text,
  kind text,
  dates_status text,
  i_go boolean NOT NULL DEFAULT false,
  venue text,
  website text,
  notes text,
  source text,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One row per edition: the same show next year is a new row.
CREATE UNIQUE INDEX IF NOT EXISTS trade_shows_name_start_uq ON perfume.trade_shows (lower(name), coalesce(starts_on, '1900-01-01'::date));
CREATE INDEX IF NOT EXISTS trade_shows_starts_idx ON perfume.trade_shows (starts_on) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS perfume.trade_show_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES perfume.trade_shows(id),
  company_id uuid NOT NULL REFERENCES perfume.contact_companies(id),
  person_id uuid REFERENCES perfume.contact_people(id),
  status text NOT NULL DEFAULT 'attends' CHECK (status IN ('attends', 'meeting_asked', 'meeting_booked', 'met')),
  meeting_at timestamptz,
  booth text,
  note text,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_show_contacts_uq ON perfume.trade_show_contacts
  (show_id, company_id, coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS trade_show_contacts_company_idx ON perfume.trade_show_contacts (company_id);

ALTER TABLE perfume.trade_shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.trade_shows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trade_shows_owner_only ON perfume.trade_shows;
CREATE POLICY trade_shows_owner_only ON perfume.trade_shows USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.trade_shows TO ih35_app;

ALTER TABLE perfume.trade_show_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.trade_show_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trade_show_contacts_owner_only ON perfume.trade_show_contacts;
CREATE POLICY trade_show_contacts_owner_only ON perfume.trade_show_contacts USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.trade_show_contacts TO ih35_app;
