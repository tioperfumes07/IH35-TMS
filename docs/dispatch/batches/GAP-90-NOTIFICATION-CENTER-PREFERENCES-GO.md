═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-90 — Notification Center + Preference Management
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-T  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-89 (Lane A) — same wave P2-T

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-89 owned):
  apps/backend/src/search/universal/**
  apps/frontend/src/components/shared/CmdKQuickSwitcher.tsx

ALLOWED FILES (disjoint from Lane A):
  migrations/0333_notification_center.sql                                    (NEW)
  apps/backend/src/notifications/center/service.ts                           (NEW)
  apps/backend/src/notifications/center/preferences.service.ts               (NEW)
  apps/backend/src/notifications/center/routes.ts                            (NEW)
  apps/backend/src/notifications/center/__tests__/                           (NEW)
  apps/frontend/src/components/notifications/NotificationCenter.tsx          (NEW)
  apps/frontend/src/components/notifications/NotificationBell.tsx            (NEW)
  apps/frontend/src/pages/settings/NotificationPreferences.tsx               (NEW)
  apps/frontend/src/layouts/AppLayout.tsx                                    (EDIT — add bell to topbar)
  scripts/verify-notification-center.mjs                                     (NEW CI guard)
  docs/specs/gap-90-notification-center.md                                   (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: All blocks send notifications (SMS, email, push) · Need central 
        inbox + per-user preferences to control noise

PROBLEM: Notifications fire to email/SMS/push without central log + user 
control. Users complain about notification overload or missing critical 
ones. Need single inbox + preferences.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0333
  CREATE TABLE IF NOT EXISTS notifications.center_messages (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    recipient_user_uuid UUID NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('info','warn','critical')) NOT NULL,
    action_url TEXT,
    related_entity_type TEXT,
    related_entity_uuid UUID,
    delivered_via TEXT[] NOT NULL DEFAULT '{}',
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS notifications.user_preferences (
    user_uuid UUID PRIMARY KEY,
    operating_company_id TEXT NOT NULL,
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    sms_enabled BOOLEAN NOT NULL DEFAULT true,
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    in_app_only_categories TEXT[] NOT NULL DEFAULT '{}',
    muted_categories TEXT[] NOT NULL DEFAULT '{}',
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_notif_recipient_unread ON notifications.center_messages(recipient_user_uuid, created_at DESC) 
    WHERE read_at IS NULL;
  GRANT SELECT, INSERT, UPDATE ON notifications.center_messages TO app_user;
  GRANT SELECT, INSERT, UPDATE ON notifications.user_preferences TO app_user;

PIECE B — Service
  service.ts:
    sendNotification({recipient, category, title, body, severity, action_url}) →
      Always inserts to center_messages
      Per preferences: also dispatches to email/sms/push
      Respects quiet hours + muted categories
    getUnreadCount(user_uuid)
    markRead(message_uuid)
    markAllRead(user_uuid)

PIECE C — Preferences
  preferences.service.ts:
    getPreferences(user_uuid)
    updatePreferences(user_uuid, prefs)

PIECE D — Routes
  GET   /api/notifications/center?unread=true
  PATCH /api/notifications/center/:uuid/read
  PATCH /api/notifications/center/mark-all-read
  GET   /api/notifications/preferences
  PATCH /api/notifications/preferences

PIECE E — Frontend
  NotificationBell.tsx: bell icon in topbar with unread count badge
  NotificationCenter.tsx: dropdown panel from bell with notifications list
  NotificationPreferences.tsx (route /settings/notifications):
    Channel toggles + per-category settings + quiet hours
  AppLayout.tsx EDIT: add bell to topbar.

PIECE F — CI guard
  verify-notification-center.mjs: migration, routes, bell + center + 
    preferences page render.

PIECE G — Tests
  service.test.ts: send with preferences, quiet hours, muting, RLS
  preferences.test.ts: CRUD, defaults

PIECE H — Docs
  docs/specs/gap-90-notification-center.md

ACCEPTANCE:
[ ] Migration 0333 applied
[ ] Bell shows unread count
[ ] Center dropdown lists notifications
[ ] Preferences page works
[ ] Quiet hours respected
[ ] Muted categories not delivered
[ ] verify-notification-center.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if preference change doesn't take effect within 1 minute, STOP — 
       caching issue.

POST-MERGE NEXT STEPS: existing notification consumers (GAP-58 engine 
       faults, GAP-61 fuel fraud, etc.) all dispatch via this center.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
