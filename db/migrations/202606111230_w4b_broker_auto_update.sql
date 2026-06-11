-- W4B-BROKER-AUTO-UPDATE: schema, tables, RLS, spine logging
-- Auto-email broker load status updates. Gated: hold-for-review queue by default.
-- Auto-send is OFF unless explicitly enabled per broker profile.
-- Recipients come ONLY from configured broker profiles — never free-typed.
-- Reuses alerts.broker_queue concept. Writes to spine via events.log_event().
-- NULLIF RLS pattern. NON-FINANCIAL.

CREATE SCHEMA IF NOT EXISTS brokerupdate;

-- ─── BROKER PROFILE ──────────────────────────────────────────────────────────
-- Configured broker contact profiles. Recipients ONLY from here — no free-type.
CREATE TABLE IF NOT EXISTS brokerupdate.profile (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  broker_name           text NOT NULL CHECK (char_length(broker_name) BETWEEN 1 AND 200),
  email                 text NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  auto_send_enabled     boolean NOT NULL DEFAULT false,  -- OFF by default; owner must enable
  auto_send_classes     text[] NOT NULL DEFAULT '{}',    -- only these event classes auto-send
  is_active             boolean NOT NULL DEFAULT true,
  created_by_user_id    uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, email)
);

ALTER TABLE brokerupdate.profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY brokerupdate_profile_tenant ON brokerupdate.profile
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_brokerupdate_profile_company
  ON brokerupdate.profile (operating_company_id, is_active);

-- ─── SEND ────────────────────────────────────────────────────────────────────
-- One row per outbound broker update attempt. All go to hold-for-review first
-- unless auto_send is explicitly enabled for this class on the profile.
CREATE TABLE IF NOT EXISTS brokerupdate.send (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  profile_id            uuid NOT NULL REFERENCES brokerupdate.profile(id),
  load_id               uuid NOT NULL,
  event_class           text NOT NULL CHECK (event_class IN (
    'pickup_confirmed',
    'in_transit',
    'delay_notification',
    'delivery_confirmed',
    'detention_alert',
    'custom'
  )),
  subject               text NOT NULL,
  body_text             text NOT NULL,
  status                text NOT NULL DEFAULT 'pending_review'
                          CHECK (status IN (
                            'pending_review',  -- default: awaiting office approval
                            'approved',        -- office approved — ready to send
                            'sent',            -- email dispatched
                            'rejected',        -- office rejected — will not send
                            'auto_sent'        -- sent automatically (auto_send enabled)
                          )),
  auto_sent             boolean NOT NULL DEFAULT false,
  reviewed_by_user_id   uuid,
  reviewed_at           timestamptz,
  sent_at               timestamptz,
  send_error            text,
  spine_event_id        uuid,
  is_active             boolean NOT NULL DEFAULT true,
  created_by_user_id    uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE brokerupdate.send ENABLE ROW LEVEL SECURITY;

CREATE POLICY brokerupdate_send_tenant ON brokerupdate.send
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_brokerupdate_send_company_status
  ON brokerupdate.send (operating_company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brokerupdate_send_load
  ON brokerupdate.send (load_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brokerupdate_send_pending
  ON brokerupdate.send (operating_company_id, is_active)
  WHERE status = 'pending_review';

-- ─── updated_at TRIGGERS ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION brokerupdate.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_profile ON brokerupdate.profile;
CREATE TRIGGER set_updated_at_profile
  BEFORE UPDATE ON brokerupdate.profile
  FOR EACH ROW EXECUTE FUNCTION brokerupdate.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_send ON brokerupdate.send;
CREATE TRIGGER set_updated_at_send
  BEFORE UPDATE ON brokerupdate.send
  FOR EACH ROW EXECUTE FUNCTION brokerupdate.set_updated_at();

-- ─── SPINE LOGGING TRIGGER ───────────────────────────────────────────────────
-- Logs send status transitions (created, approved, sent, rejected) to spine.
CREATE OR REPLACE FUNCTION brokerupdate.log_send_to_spine()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_spine_event_id uuid;
  v_event_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'brokerupdate.queued';
  ELSIF NEW.status = 'approved' AND OLD.status = 'pending_review' THEN
    v_event_type := 'brokerupdate.approved';
  ELSIF NEW.status IN ('sent', 'auto_sent') AND OLD.status NOT IN ('sent', 'auto_sent') THEN
    v_event_type := 'brokerupdate.sent';
  ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    v_event_type := 'brokerupdate.rejected';
  ELSE
    RETURN NEW;
  END IF;

  SELECT events.log_event(
    NEW.operating_company_id::text,
    v_event_type,
    'user',
    COALESCE(NEW.reviewed_by_user_id::text, NEW.created_by_user_id::text, 'system'),
    'brokerupdate.send',
    NEW.id::text,
    jsonb_build_object(
      'load_id', NEW.load_id,
      'profile_id', NEW.profile_id,
      'event_class', NEW.event_class,
      'status', NEW.status,
      'auto_sent', NEW.auto_sent
    ),
    now(),
    'brokerupdate'
  ) INTO v_spine_event_id;

  NEW.spine_event_id := v_spine_event_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_send_to_spine ON brokerupdate.send;
CREATE TRIGGER log_send_to_spine
  BEFORE INSERT OR UPDATE ON brokerupdate.send
  FOR EACH ROW EXECUTE FUNCTION brokerupdate.log_send_to_spine();

-- ─── GRANTS ───────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA brokerupdate TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON brokerupdate.profile TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON brokerupdate.send TO ih35_app;
