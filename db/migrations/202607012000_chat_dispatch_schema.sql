-- ============================================================================
-- CHAT-1 — DISPATCH-CHAT-01 — Per-load driver<->office chat: evidence-grade schema
-- TIER 1 [HOLD-FOR-JORGE]. Schema-only. NO money path. Chat NEVER posts GL.
-- Entity independence absolute: every table per-entity (operating_company_id) +
-- RLS ENABLE+FORCE, two-layer (entity AND participant). TRANSP/TRK/USMCA share nothing.
--
-- Verified FK targets (read live from db/migrations, not guessed):
--   org.companies(id) 0013 · mdata.loads(id) 0034 · mdata.drivers(id) 0008
--   identity.users(id) [uuid renamed->id in 0005] · docs.files(id) 0028
--     (docs.files.dispatch_load_id -> mdata.loads(id), upload_completed_at, deleted_at)
--   driver_finance.cash_advance_requests(id)
--   events.log_event(...) canonical writer + events.event_log_append_only_trigger auto-chains
--     hash (subject_type CHECK excludes 'message' -> CHAT-2 emits subject_type='load'/'driver'
--     with message_id in payload; NO spine ALTER, so no per-row hash cols here — correction #1)
--   RLS helpers: identity.current_user_id(), identity.is_lucia_bypass(),
--     org.user_accessible_company_ids(); idx_drivers_identity_user_id (RLS-perf) exists 0008
--   updated_at trigger: identity.set_updated_at()
-- Idempotent (IF NOT EXISTS / guarded DO). Fresh-DB safe. GRANTs inline. No CASCADE anywhere.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS chat;
GRANT USAGE ON SCHEMA chat TO ih35_app;

-- ---------------------------------------------------------------------------
-- 1) chat.threads — one per load (number = load), or driver_direct / broadcast.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.threads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id) ON DELETE RESTRICT,
  kind                  text NOT NULL CHECK (kind IN ('load','driver_direct','broadcast')),
  load_id               uuid REFERENCES mdata.loads(id) ON DELETE RESTRICT,
  subject               text,
  load_ref_cache        text,                        -- display only; source of truth = joined load
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','archived')),
  archived_at           timestamptz,
  last_seq              bigint NOT NULL DEFAULT 0,    -- per-thread monotonic counter (SEQ rule)
  created_by            uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_threads_load_requires_load_id  CHECK (kind <> 'load' OR load_id IS NOT NULL),
  CONSTRAINT chat_threads_direct_has_no_load     CHECK (kind <> 'driver_direct' OR load_id IS NULL)
);
-- one load-thread per load per entity
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_threads_load
  ON chat.threads (operating_company_id, load_id) WHERE kind = 'load';
CREATE INDEX IF NOT EXISTS idx_chat_threads_oc_status ON chat.threads (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_threads_load      ON chat.threads (load_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_oc_kind   ON chat.threads (operating_company_id, kind);
CREATE INDEX IF NOT EXISTS idx_chat_threads_created_by ON chat.threads (created_by);

-- ---------------------------------------------------------------------------
-- 2) chat.participants — who is in the thread (office user OR driver).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.participants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id             uuid NOT NULL REFERENCES chat.threads(id) ON DELETE RESTRICT,
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id) ON DELETE RESTRICT,  -- denormalized for RLS
  party_type            text NOT NULL CHECK (party_type IN ('office','driver')),
  office_user_id        uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  driver_id             uuid REFERENCES mdata.drivers(id) ON DELETE RESTRICT,
  role                  text,                         -- dispatcher | primary_driver | co_driver | ...
  joined_at             timestamptz NOT NULL DEFAULT now(),
  left_at               timestamptz,                  -- reassignment freezes membership, audit-preserved
  CONSTRAINT chat_participants_exactly_one CHECK (
      (party_type = 'office' AND office_user_id IS NOT NULL AND driver_id IS NULL)
   OR (party_type = 'driver' AND driver_id     IS NOT NULL AND office_user_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_participants
  ON chat.participants (thread_id, party_type, office_user_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_thread ON chat.participants (thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_driver ON chat.participants (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_participants_office ON chat.participants (office_user_id) WHERE office_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_participants_oc ON chat.participants (operating_company_id);

-- ---------------------------------------------------------------------------
-- 3) chat.messages — append-only, sequenced, event-log-chained, tombstone-able.
--    NO prev_hash/hash cols (correction #1) — chain lives in events.event_log via
--    events.log_event(); event_log_id is the forward trace.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.messages (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id               uuid NOT NULL REFERENCES chat.threads(id) ON DELETE RESTRICT,
  operating_company_id    uuid NOT NULL REFERENCES org.companies(id) ON DELETE RESTRICT,
  seq                     bigint NOT NULL,            -- server-assigned monotonic per thread
  sender_party_type       text NOT NULL CHECK (sender_party_type IN ('office','driver','system')),
  sender_office_user_id   uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  sender_driver_id        uuid REFERENCES mdata.drivers(id) ON DELETE RESTRICT,
  msg_type                text NOT NULL CHECK (msg_type IN
                            ('text','photo','document','confirmation_request','confirmation_ack',
                             'cash_advance_card','system_event')),
  body                    text,                       -- verbatim; NULL for pure-attachment/system
  body_lang               text,                       -- original-language tag; content never translated
  client_key              text NOT NULL,              -- idempotency key from the driver outbox
  content_sha256          text NOT NULL,              -- sha256 of canonical content (feeds event-log chain)
  cash_advance_request_id uuid REFERENCES driver_finance.cash_advance_requests(id) ON DELETE RESTRICT,
  references_message_id   uuid REFERENCES chat.messages(id) ON DELETE RESTRICT,  -- ack->request; tombstone->original
  ack_content_sha256      text,                       -- confirmation_ack: sha256 of the acked confirmation content
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active','tombstoned')),
  tombstoned_at           timestamptz,
  tombstoned_by           uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  event_log_id            uuid,                       -- events.event_log row this message emitted (forward trace)
  server_ts               timestamptz NOT NULL DEFAULT now(),  -- UTC; render Central Time at the edge
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_sender_exactly_one CHECK (
      (sender_party_type = 'office' AND sender_office_user_id IS NOT NULL AND sender_driver_id IS NULL)
   OR (sender_party_type = 'driver' AND sender_driver_id     IS NOT NULL AND sender_office_user_id IS NULL)
   OR (sender_party_type = 'system' AND sender_office_user_id IS NULL AND sender_driver_id IS NULL)),
  CONSTRAINT chat_messages_advance_card_needs_ref CHECK (msg_type <> 'cash_advance_card' OR cash_advance_request_id IS NOT NULL),
  CONSTRAINT chat_messages_ref_only_on_advance_card CHECK (cash_advance_request_id IS NULL OR msg_type = 'cash_advance_card')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_client_key ON chat.messages (thread_id, client_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_seq        ON chat.messages (thread_id, seq);
CREATE INDEX IF NOT EXISTS idx_chat_messages_oc_thread   ON chat.messages (operating_company_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_advance     ON chat.messages (cash_advance_request_id) WHERE cash_advance_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_ref         ON chat.messages (references_message_id) WHERE references_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_office ON chat.messages (sender_office_user_id) WHERE sender_office_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_driver ON chat.messages (sender_driver_id) WHERE sender_driver_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) chat.attachments — content-addressed, upload-then-commit, dual-filed to docs.files.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.attachments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id            uuid NOT NULL REFERENCES chat.messages(id) ON DELETE RESTRICT,
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id) ON DELETE RESTRICT,
  document_id           uuid REFERENCES docs.files(id) ON DELETE RESTRICT,  -- dual-filed load doc (docs.files.dispatch_load_id -> load)
  r2_key                text NOT NULL,                -- content-addressed, write-once
  sha256                text NOT NULL,                -- content hash (immutability + dedup + chain)
  mime_type             text NOT NULL CHECK (mime_type IN
                          ('image/jpeg','image/png','image/heic','image/webp','application/pdf')),
  size_bytes            bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),  -- 25 MB cap
  doc_type              text CHECK (doc_type IN ('bol','pod','receipt','lumper','other')),
  upload_completed_at   timestamptz,                  -- upload-then-commit
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_message  ON chat.attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_document ON chat.attachments (document_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_oc_sha   ON chat.attachments (operating_company_id, sha256);

-- ---------------------------------------------------------------------------
-- 5) chat.message_receipts — delivery state per recipient per message.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat.message_receipts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id            uuid NOT NULL REFERENCES chat.messages(id) ON DELETE RESTRICT,
  participant_id        uuid NOT NULL REFERENCES chat.participants(id) ON DELETE RESTRICT,
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id) ON DELETE RESTRICT,
  state                 text NOT NULL CHECK (state IN ('sent','delivered','read')),
  state_at              timestamptz NOT NULL DEFAULT now(),  -- server-stamped UTC
  CONSTRAINT uq_chat_receipts UNIQUE (message_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_receipts_message     ON chat.message_receipts (message_id);
CREATE INDEX IF NOT EXISTS idx_chat_receipts_participant ON chat.message_receipts (participant_id);
CREATE INDEX IF NOT EXISTS idx_chat_receipts_oc          ON chat.message_receipts (operating_company_id);

-- ---------------------------------------------------------------------------
-- Immutability trigger on chat.messages: append-only; ONLY the tombstone
-- transition (active->tombstoned + tombstoned_at/by) and the one-time
-- event_log_id backfill (NULL->value) are permitted. Everything else RAISES.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION chat.messages_append_only() RETURNS trigger AS $$
BEGIN
  IF ( OLD.thread_id            IS DISTINCT FROM NEW.thread_id
    OR OLD.operating_company_id IS DISTINCT FROM NEW.operating_company_id
    OR OLD.seq                  IS DISTINCT FROM NEW.seq
    OR OLD.sender_party_type    IS DISTINCT FROM NEW.sender_party_type
    OR OLD.sender_office_user_id IS DISTINCT FROM NEW.sender_office_user_id
    OR OLD.sender_driver_id     IS DISTINCT FROM NEW.sender_driver_id
    OR OLD.msg_type             IS DISTINCT FROM NEW.msg_type
    OR OLD.body                 IS DISTINCT FROM NEW.body
    OR OLD.client_key           IS DISTINCT FROM NEW.client_key
    OR OLD.content_sha256       IS DISTINCT FROM NEW.content_sha256
    OR OLD.cash_advance_request_id IS DISTINCT FROM NEW.cash_advance_request_id
    OR OLD.references_message_id IS DISTINCT FROM NEW.references_message_id
    OR OLD.ack_content_sha256   IS DISTINCT FROM NEW.ack_content_sha256
    OR OLD.server_ts            IS DISTINCT FROM NEW.server_ts
    OR OLD.created_at           IS DISTINCT FROM NEW.created_at ) THEN
    RAISE EXCEPTION 'chat.messages is append-only: only tombstone + event_log_id backfill permitted';
  END IF;
  IF OLD.status = 'tombstoned' AND NEW.status <> 'tombstoned' THEN
    RAISE EXCEPTION 'chat.messages tombstone is irreversible';
  END IF;
  IF OLD.event_log_id IS NOT NULL AND NEW.event_log_id IS DISTINCT FROM OLD.event_log_id THEN
    RAISE EXCEPTION 'chat.messages.event_log_id is write-once';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_messages_append_only ON chat.messages;
CREATE TRIGGER trg_chat_messages_append_only
  BEFORE UPDATE ON chat.messages
  FOR EACH ROW EXECUTE FUNCTION chat.messages_append_only();

-- threads.updated_at touch (reuse canonical identity.set_updated_at()).
DROP TRIGGER IF EXISTS trg_chat_threads_touch_updated ON chat.threads;
CREATE TRIGGER trg_chat_threads_touch_updated
  BEFORE UPDATE ON chat.threads
  FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: ENABLE + FORCE on all five tables. Two-layer (entity AND participant).
-- Separate SELECT vs WRITE policies. is_lucia_bypass() escape for service context.
-- Driver resolves via mdata.drivers.identity_user_id (idx_drivers_identity_user_id).
-- ---------------------------------------------------------------------------
ALTER TABLE chat.threads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat.threads          FORCE  ROW LEVEL SECURITY;
ALTER TABLE chat.participants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat.participants     FORCE  ROW LEVEL SECURITY;
ALTER TABLE chat.messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat.messages         FORCE  ROW LEVEL SECURITY;
ALTER TABLE chat.attachments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat.attachments      FORCE  ROW LEVEL SECURITY;
ALTER TABLE chat.message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat.message_receipts FORCE  ROW LEVEL SECURITY;

-- Participant-membership predicate for a given thread id (entity + membership).
-- threads: SELECT = entity AND caller participates in THIS thread.
DROP POLICY IF EXISTS chat_threads_select ON chat.threads;
CREATE POLICY chat_threads_select ON chat.threads FOR SELECT USING (
  identity.is_lucia_bypass()
  OR ( operating_company_id IN (SELECT org.user_accessible_company_ids())
       AND EXISTS ( SELECT 1 FROM chat.participants p
                    WHERE p.thread_id = chat.threads.id AND p.left_at IS NULL
                      AND ( p.office_user_id = identity.current_user_id()
                         OR p.driver_id = (SELECT d.id FROM mdata.drivers d
                                           WHERE d.identity_user_id = identity.current_user_id()) ) ) )
);
DROP POLICY IF EXISTS chat_threads_insert ON chat.threads;
CREATE POLICY chat_threads_insert ON chat.threads FOR INSERT WITH CHECK (
  identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids())
);
DROP POLICY IF EXISTS chat_threads_update ON chat.threads;
CREATE POLICY chat_threads_update ON chat.threads FOR UPDATE
  USING ( identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) )
  WITH CHECK ( identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) );

-- participants: SELECT = entity AND caller is in the same thread (see co-participants).
DROP POLICY IF EXISTS chat_participants_select ON chat.participants;
CREATE POLICY chat_participants_select ON chat.participants FOR SELECT USING (
  identity.is_lucia_bypass()
  OR ( operating_company_id IN (SELECT org.user_accessible_company_ids())
       AND EXISTS ( SELECT 1 FROM chat.participants me
                    WHERE me.thread_id = chat.participants.thread_id AND me.left_at IS NULL
                      AND ( me.office_user_id = identity.current_user_id()
                         OR me.driver_id = (SELECT d.id FROM mdata.drivers d
                                            WHERE d.identity_user_id = identity.current_user_id()) ) ) )
);
DROP POLICY IF EXISTS chat_participants_write ON chat.participants;
CREATE POLICY chat_participants_write ON chat.participants FOR ALL
  USING ( identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) )
  WITH CHECK ( identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) );

-- messages/attachments/receipts: SELECT = entity AND membership in the parent thread.
DROP POLICY IF EXISTS chat_messages_select ON chat.messages;
CREATE POLICY chat_messages_select ON chat.messages FOR SELECT USING (
  identity.is_lucia_bypass()
  OR ( operating_company_id IN (SELECT org.user_accessible_company_ids())
       AND EXISTS ( SELECT 1 FROM chat.participants p
                    WHERE p.thread_id = chat.messages.thread_id AND p.left_at IS NULL
                      AND ( p.office_user_id = identity.current_user_id()
                         OR p.driver_id = (SELECT d.id FROM mdata.drivers d
                                           WHERE d.identity_user_id = identity.current_user_id()) ) ) )
);
DROP POLICY IF EXISTS chat_messages_write ON chat.messages;
CREATE POLICY chat_messages_write ON chat.messages FOR ALL
  USING ( identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) )
  WITH CHECK ( identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) );

DROP POLICY IF EXISTS chat_attachments_select ON chat.attachments;
CREATE POLICY chat_attachments_select ON chat.attachments FOR SELECT USING (
  identity.is_lucia_bypass()
  OR ( operating_company_id IN (SELECT org.user_accessible_company_ids())
       AND EXISTS ( SELECT 1 FROM chat.messages m JOIN chat.participants p ON p.thread_id = m.thread_id
                    WHERE m.id = chat.attachments.message_id AND p.left_at IS NULL
                      AND ( p.office_user_id = identity.current_user_id()
                         OR p.driver_id = (SELECT d.id FROM mdata.drivers d
                                           WHERE d.identity_user_id = identity.current_user_id()) ) ) )
);
DROP POLICY IF EXISTS chat_attachments_write ON chat.attachments;
CREATE POLICY chat_attachments_write ON chat.attachments FOR ALL
  USING ( identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) )
  WITH CHECK ( identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) );

DROP POLICY IF EXISTS chat_receipts_select ON chat.message_receipts;
CREATE POLICY chat_receipts_select ON chat.message_receipts FOR SELECT USING (
  identity.is_lucia_bypass()
  OR ( operating_company_id IN (SELECT org.user_accessible_company_ids())
       AND EXISTS ( SELECT 1 FROM chat.messages m JOIN chat.participants p ON p.thread_id = m.thread_id
                    WHERE m.id = chat.message_receipts.message_id AND p.left_at IS NULL
                      AND ( p.office_user_id = identity.current_user_id()
                         OR p.driver_id = (SELECT d.id FROM mdata.drivers d
                                           WHERE d.identity_user_id = identity.current_user_id()) ) ) )
);
DROP POLICY IF EXISTS chat_receipts_write ON chat.message_receipts;
CREATE POLICY chat_receipts_write ON chat.message_receipts FOR ALL
  USING ( identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) )
  WITH CHECK ( identity.is_lucia_bypass() OR operating_company_id IN (SELECT org.user_accessible_company_ids()) );

-- ---------------------------------------------------------------------------
-- Grants: SELECT/INSERT/UPDATE only (NO DELETE) — append-only at the grant layer
-- + the immutability trigger = defense in depth. No sequences (uuid PKs).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON chat.threads          TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON chat.participants     TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON chat.messages         TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON chat.attachments      TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON chat.message_receipts TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA chat GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;
