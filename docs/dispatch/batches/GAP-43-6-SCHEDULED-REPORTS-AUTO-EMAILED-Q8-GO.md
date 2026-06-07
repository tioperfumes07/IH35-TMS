═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-43 — 6 Scheduled Reports Auto-Emailed Per Q8 Rules
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-T  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-42 (Lane A) — same wave G-T

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-42 owned):
  apps/backend/src/reports/ifta/**
  apps/frontend/src/pages/reports/tax-regulatory/IftaPreparer.tsx

ALLOWED FILES (disjoint from Lane A):
  migrations/0318_scheduled_report_subscriptions.sql                         (NEW)
  apps/backend/src/reports/scheduled/subscription.service.ts                 (NEW)
  apps/backend/src/reports/scheduled/runner.service.ts                       (NEW)
  apps/backend/src/reports/scheduled/routes.ts                               (NEW)
  apps/backend/src/reports/scheduled/__tests__/scheduled.test.ts             (NEW)
  apps/backend/src/jobs/scheduled-reports-emailer.ts                         (NEW)
  apps/frontend/src/pages/reports/SubscriptionManager.tsx                    (NEW)
  apps/frontend/src/components/reports/SubscriptionEditor.tsx                (NEW)
  scripts/verify-scheduled-reports.mjs                                       (NEW CI guard)
  docs/specs/gap-43-scheduled-reports.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Q8 master rule (B_Jorge_Directives) · 6 standard auto-emailed reports
        with locked cadences · Owner + Accounting + Safety recipients

PROBLEM: 6 reports should auto-email per Jorge spec but require manual 
generation today:
  1. Weekly cash position (Monday 7am → Owner)
  2. Weekly driver settlement preview (Friday 8am → Owner + Accountant)
  3. Weekly AR aging > 60 days (Monday 8am → Owner)
  4. Monthly P&L (1st of month 6am → Owner + CPA email)
  5. Quarterly IFTA preview (Q-end + 7 days → Owner)
  6. Daily safety alerts digest (5am daily → Safety + Owner)

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0318
  CREATE TABLE IF NOT EXISTS reports.scheduled_subscriptions (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    report_slug TEXT NOT NULL,
    cadence TEXT CHECK (cadence IN ('daily','weekly','monthly','quarterly')) NOT NULL,
    day_of_week INTEGER,
    day_of_month INTEGER,
    time_of_day TIME NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Chicago',
    recipient_emails TEXT[] NOT NULL,
    recipient_user_uuids UUID[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_sent_at TIMESTAMPTZ,
    next_scheduled_at TIMESTAMPTZ,
    delivery_format TEXT CHECK (delivery_format IN ('pdf','xlsx','html')) NOT NULL DEFAULT 'pdf',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS reports.scheduled_delivery_log (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    subscription_uuid UUID NOT NULL REFERENCES reports.scheduled_subscriptions(uuid),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT CHECK (status IN ('success','failed','bounced')) NOT NULL,
    error_message TEXT,
    recipients TEXT[]
  );
  CREATE INDEX idx_subs_next ON reports.scheduled_subscriptions(next_scheduled_at) WHERE is_active = true;
  GRANT SELECT, INSERT, UPDATE ON reports.scheduled_subscriptions TO app_user;
  GRANT SELECT, INSERT ON reports.scheduled_delivery_log TO app_user;

PIECE B — Seed 6 default subscriptions
  In migration 0318 final block:
    INSERT INTO reports.scheduled_subscriptions per Q8 spec.

PIECE C — Subscription + runner services
  subscription.service.ts: CRUD for subscriptions (Owner-only mutations)
  runner.service.ts:
    runDue() →
      For each subscription where next_scheduled_at <= now() AND is_active:
        Generate report (calls existing report endpoints)
        Render to PDF/xlsx via existing export pattern
        Email via existing Resend integration
        Update last_sent_at, compute next_scheduled_at
        Log delivery

PIECE D — Worker
  scheduled-reports-emailer.ts: runs every 15min (fine-grained for daily 5am 
    cadences to fire on time).

PIECE E — Routes
  GET    /api/reports/scheduled/subscriptions
  POST   /api/reports/scheduled/subscriptions (Owner)
  PATCH  /api/reports/scheduled/subscriptions/:uuid (Owner)
  PATCH  /api/reports/scheduled/subscriptions/:uuid/deactivate (Owner — NEVER delete)
  GET    /api/reports/scheduled/delivery-log

PIECE F — Frontend
  SubscriptionManager.tsx (/reports/scheduled): table of subscriptions + 
    delivery history.
  SubscriptionEditor.tsx: form (cadence, recipients, format) modal.

PIECE G — CI guard
  verify-scheduled-reports.mjs: migration applied, 6 default subs seeded,
    worker registered, routes registered, Owner-only RBAC enforced.

PIECE H — Tests
  scheduled.test.ts: cadence computation, next_at calc, email dispatch (Resend
    mock), delivery log, Owner RBAC, RLS.

PIECE I — Docs
  docs/specs/gap-43-scheduled-reports.md (cite Q8, list all 6 defaults)

ACCEPTANCE:
[ ] Migration 0318 applied + 6 defaults seeded
[ ] Worker runs every 15min
[ ] All 6 cadences fire correctly
[ ] PDFs/xlsx generated + emailed via Resend
[ ] Delivery log captures every send
[ ] verify-scheduled-reports.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if Resend mock bounces in test (email format invalid), STOP — 
       prod will bounce too.

POST-MERGE NEXT STEPS: schedules feed Reports Hub categories per GAP-41; 
       can extend to per-user custom subscriptions later.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
