-- 202616480100_capacity_engine_offers_and_postings.sql
-- LEAD · owner 10-26: "a system that sends … showing the available trucks in which city and the date it is free … try to get
-- them to confirm via email" + "a daily posting engine that will post the available trucks on the dates it will be available".
-- Owner 11-10 5:16 PM accepted the Lead recommendation: ONE capacity engine, two outputs — (A) a targeted daily offer email to
-- contacts the dispatcher flags, (B) load-board posting. Replies go to dispatch; a person books every load. Never auto-book.
--
-- Live facts (prod, USMCA, 11-10): mdata.customer_contacts had 0 USMCA rows; the only customer emails are billing/AP
-- addresses — so a contact receives offers ONLY when flagged here (never a blast to billing inboxes).
--
-- Additive + idempotent. New tables: operating_company_id NOT NULL, RLS ENABLED + FORCED, 0065 grants. No data written
-- except the catalog reasons for turning a truck's offer off (context 'dispatch', USMCA by company code).
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Audience flag on the existing contact (customer_contacts is scoped through its customer).
ALTER TABLE mdata.customer_contacts ADD COLUMN IF NOT EXISTS receives_truck_offers boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN mdata.customer_contacts.receives_truck_offers IS
  'Capacity engine: this contact receives the daily available-trucks email (flagged by dispatch on the customer Contacts tab).';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_contacts_truck_offers_need_email') THEN
    ALTER TABLE mdata.customer_contacts ADD CONSTRAINT customer_contacts_truck_offers_need_email
      CHECK (NOT receives_truck_offers OR NULLIF(btrim(email), '') IS NOT NULL);
  END IF;
END $$;

-- 2. Company switch — created OFF; the owner turns it on.
CREATE TABLE IF NOT EXISTS dispatch.capacity_settings (
  operating_company_id  uuid PRIMARY KEY REFERENCES org.companies(id),
  send_truck_offers     boolean NOT NULL DEFAULT false,
  reply_to_email        text NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id    uuid NULL REFERENCES identity.users(id)
);

-- 3. Per-unit offer switch (off needs a catalogs.override_reasons code — no typing).
CREATE TABLE IF NOT EXISTS dispatch.capacity_unit_offers (
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  unit_id               uuid NOT NULL REFERENCES mdata.units(id),
  offer_enabled         boolean NOT NULL DEFAULT true,
  off_reason_code       text NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id    uuid NULL REFERENCES identity.users(id),
  PRIMARY KEY (operating_company_id, unit_id),
  CONSTRAINT capacity_unit_offers_off_needs_reason CHECK (offer_enabled OR btrim(coalesce(off_reason_code, '')) <> '')
);

-- 4. Every offer email sent (morning digest or midday change alert).
CREATE TABLE IF NOT EXISTS dispatch.capacity_offer_sends (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  customer_id           uuid NOT NULL REFERENCES mdata.customers(id),
  contact_uuid          uuid NOT NULL REFERENCES mdata.customer_contacts(uuid),
  email                 text NOT NULL,
  kind                  text NOT NULL CHECK (kind IN ('morning', 'change')),
  send_date             date NOT NULL,
  units                 jsonb NOT NULL,
  email_queue_id        uuid NULL,
  sent_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS capacity_offer_sends_one_kind_per_day
  ON dispatch.capacity_offer_sends (operating_company_id, lower(email), send_date, kind);
CREATE INDEX IF NOT EXISTS capacity_offer_sends_company_date ON dispatch.capacity_offer_sends (operating_company_id, send_date);

-- 5. Unsubscribes / hard bounces for offer emails (external addresses — notifications.suppression_rules is keyed by
--    internal users, so external contacts need their own list). Never deleted.
CREATE TABLE IF NOT EXISTS dispatch.capacity_offer_suppressions (
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  email_lower           text NOT NULL CHECK (email_lower = lower(btrim(email_lower)) AND email_lower <> ''),
  reason                text NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operating_company_id, email_lower)
);

-- 6. Load-board postings (DAT / Truckstop) — one row per board per unit; the engine updates or withdraws it.
CREATE TABLE IF NOT EXISTS dispatch.load_board_postings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  unit_id               uuid NOT NULL REFERENCES mdata.units(id),
  board                 text NOT NULL CHECK (board IN ('dat', 'truckstop')),
  external_posting_id   text NULL,
  origin_city           text NULL,
  origin_state          text NULL,
  available_at          timestamptz NULL,
  equipment             text NULL,
  status                text NOT NULL CHECK (status IN ('posted', 'withdrawn', 'failed')),
  last_error            text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS load_board_postings_one_per_unit_board
  ON dispatch.load_board_postings (operating_company_id, unit_id, board);

-- 7. The email queue carries Reply-To and extra headers (List-Unsubscribe / List-Unsubscribe-Post) to the provider.
ALTER TABLE email.email_queue ADD COLUMN IF NOT EXISTS reply_to text NULL;
ALTER TABLE email.email_queue ADD COLUMN IF NOT EXISTS headers jsonb NULL;

-- RLS (0065 pattern) + grants on every new table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['capacity_settings','capacity_unit_offers','capacity_offer_sends','capacity_offer_suppressions','load_board_postings']
  LOOP
    EXECUTE format('ALTER TABLE dispatch.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE dispatch.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON dispatch.%I', t || '_company_scope', t);
    EXECUTE format($p$CREATE POLICY %I ON dispatch.%I FOR ALL
      USING ((operating_company_id)::text = current_setting('app.operating_company_id', true)
             OR current_setting('app.bypass_rls', true) = 'lucia')
      WITH CHECK ((operating_company_id)::text = current_setting('app.operating_company_id', true)
             OR current_setting('app.bypass_rls', true) = 'lucia')$p$, t || '_company_scope', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON dispatch.%I TO ih35_app', t);
    EXECUTE format('REVOKE DELETE ON dispatch.%I FROM ih35_app', t);
  END LOOP;
END $$;

-- 8. Catalog reasons for turning a truck's offer off (context 'dispatch'; owner/accountant just confirm).
SET LOCAL app.bypass_rls = 'lucia';
WITH owner_user AS (SELECT id FROM identity.users WHERE role = 'Owner' ORDER BY created_at LIMIT 1),
seed(reason_code, label_en, label_es, sort_order) AS (
  VALUES
    ('capacity_committed_elsewhere', 'Truck already committed (not yet in the app)', 'Camión ya comprometido (aún no en la app)', 210),
    ('capacity_driver_home_time',    'Driver home time',                              'Tiempo en casa del chofer',                  220),
    ('capacity_planned_maintenance', 'Planned maintenance',                           'Mantenimiento programado',                   230),
    ('capacity_local_only',          'Local / dedicated work only',                   'Solo trabajo local / dedicado',              240)
)
INSERT INTO catalogs.override_reasons
  (operating_company_id, reason_code, label_en, label_es, contexts, role_only, sort_order, system_seeded, created_by_user_id)
SELECT c.id, s.reason_code, s.label_en, s.label_es, ARRAY['dispatch'], false, s.sort_order, true, o.id
FROM org.companies c CROSS JOIN seed s CROSS JOIN owner_user o
WHERE c.code = 'USMCA' AND c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, reason_code) DO NOTHING;
SET LOCAL app.bypass_rls = '';

COMMIT;
