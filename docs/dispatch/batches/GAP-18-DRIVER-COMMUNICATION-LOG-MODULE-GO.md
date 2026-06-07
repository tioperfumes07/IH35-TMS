═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-18 — Driver Communication Log Module
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-H  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-19 (Lane B) — same wave G-H

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-19 owned):
  apps/backend/src/dispatch/loads/detention/**
  apps/frontend/src/pages/dispatch/loads/DetentionRequest.tsx

ALLOWED FILES (disjoint from Lane B):
  migrations/0305_driver_communication_log.sql                               (NEW)
  apps/backend/src/drivers/communication-log/log.service.ts                  (NEW)
  apps/backend/src/drivers/communication-log/log.routes.ts                   (NEW)
  apps/backend/src/drivers/communication-log/__tests__/log.test.ts           (NEW)
  apps/backend/src/integrations/twilio/sms-callback-webhook.ts               (EDIT — log inbound)
  apps/backend/src/integrations/twilio/whatsapp-callback-webhook.ts          (NEW)
  apps/backend/src/integrations/twilio/voice-callback-webhook.ts             (NEW)
  apps/frontend/src/pages/drivers/DriverDetail.tsx                           (EDIT — add tab)
  apps/frontend/src/components/drivers/DriverCommunicationLogTab.tsx         (NEW)
  apps/frontend/src/components/drivers/SendMessageDrawer.tsx                 (NEW)
  scripts/verify-driver-comm-log.mjs                                         (NEW CI guard)
  docs/specs/gap-18-driver-communication-log.md                              (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: POLISH-DRIVER-CHAT consolidator (tracker row 178) · Jorge spec —
        unified view of calls/texts/PWA messages/WhatsApp per driver ·
        compliance + accountability requirement

PROBLEM: Communication with drivers happens through 4 channels:
  1. Twilio SMS (TMS dispatcher → driver phone)
  2. WhatsApp Business (some brokers + drivers)
  3. Voice calls (logged ad-hoc)
  4. Driver PWA in-app messages
No unified timeline per driver. When dispatch disputes arise, ops must dig
through 4 separate systems. No compliance audit trail.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0305
  CREATE TABLE IF NOT EXISTS drivers.communication_log (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    driver_uuid UUID NOT NULL,
    channel TEXT CHECK (channel IN ('sms','whatsapp','voice','pwa_inbox','email')) NOT NULL,
    direction TEXT CHECK (direction IN ('inbound','outbound')) NOT NULL,
    body TEXT,
    media_url TEXT,
    duration_seconds INTEGER,  -- for voice
    twilio_sid TEXT,            -- for SMS / voice / WhatsApp
    sender_user_uuid UUID,      -- if outbound from TMS
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_comm_driver_time ON drivers.communication_log(driver_uuid, occurred_at DESC);
  CREATE INDEX idx_comm_channel ON drivers.communication_log(channel);
  GRANT SELECT, INSERT ON drivers.communication_log TO app_user;

PIECE B — Service
  log.service.ts:
    appendLog({driver_uuid, channel, direction, body, ...}) → uuid
    getDriverTimeline(driver_uuid, opts={from, to, channel?}) → entries
    sendMessage({driver_uuid, channel, body}) → dispatches via Twilio + logs

PIECE C — Routes
  GET  /api/drivers/:uuid/communication-log
  POST /api/drivers/:uuid/communication-log/send body: {channel, body}

PIECE D — Webhook handlers
  sms-callback-webhook.ts EDIT: log every inbound SMS to driver matched row
  whatsapp-callback-webhook.ts NEW: same pattern for WhatsApp Business API
  voice-callback-webhook.ts NEW: log voice calls (when integrated)

PIECE E — Frontend tab
  DriverDetail.tsx EDIT: add "Communication" tab (8th tab after Vendor (QBO)).
  DriverCommunicationLogTab.tsx: timeline view, channel icon per entry, 
    filter by channel, "Send message" drawer.
  SendMessageDrawer.tsx: channel picker + body + send button.

PIECE F — CI guard
  verify-driver-comm-log.mjs: migration applied, routes registered, tab 
    rendered, webhook handlers registered.

PIECE G — Tests
  log.test.ts: append per channel, timeline retrieval, send via Twilio mock, 
    RLS isolation.

PIECE H — Docs
  docs/specs/gap-18-driver-communication-log.md

ACCEPTANCE:
[ ] Migration 0305 applied
[ ] All 4 channels log to single timeline
[ ] DriverDetail Communication tab renders timeline
[ ] Send drawer dispatches via Twilio
[ ] verify-driver-comm-log.mjs in CI chain
[ ] No regression on existing Twilio integration

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if WhatsApp Business API auth fails in test, STOP — verify FB/Meta
       business account credentials in env before continuing.

POST-MERGE NEXT STEPS: dispatcher analytics (GAP-29 booking-gap) can use 
                      message-response times as input.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
