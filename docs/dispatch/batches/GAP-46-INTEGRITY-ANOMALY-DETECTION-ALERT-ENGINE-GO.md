═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-46 — §4 Integrity & Anomaly Detection Alert Engine (Phase 6)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-V  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-47 (Lane B) — same wave G-V

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-47 owned):
  apps/backend/src/dispatch/auth-gates/**
  apps/frontend/src/components/dispatch/AuthGatePanel.tsx

ALLOWED FILES (disjoint from Lane B):
  migrations/0319_anomaly_alert_rules.sql                                    (NEW)
  apps/backend/src/safety/anomaly/rule-engine.service.ts                     (NEW)
  apps/backend/src/safety/anomaly/detector.service.ts                        (NEW)
  apps/backend/src/safety/anomaly/notification.service.ts                    (NEW)
  apps/backend/src/safety/anomaly/routes.ts                                  (NEW)
  apps/backend/src/safety/anomaly/__tests__/                                 (NEW dir)
  apps/backend/src/safety/anomaly/seed-default-rules.ts                      (NEW)
  apps/backend/src/jobs/anomaly-detector-worker.ts                           (NEW)
  apps/frontend/src/pages/safety/anomaly/AnomalyDashboard.tsx                (NEW)
  apps/frontend/src/pages/safety/anomaly/RuleEditor.tsx                      (NEW)
  apps/frontend/src/components/safety/AnomalyAlertBadge.tsx                  (NEW)
  scripts/verify-anomaly-detection-engine.mjs                                (NEW CI guard)
  docs/specs/gap-46-anomaly-detection.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Unified Additions §4 Integrity & Anomaly Detection (locked 2026-05-06) ·
        Phase 6 deferred · Detects financial + operational anomalies before 
        they compound · Embezzlement-prevention focus per Jorge 2023-24 history

PROBLEM: System has rich audit data but no automated anomaly detection. 
Patterns that should fire alerts:
  - Bill posted to same vendor twice in 24h (potential duplicate)
  - Settlement amount > 1.5× driver's 90-day average (anomaly)
  - Fuel transaction at off-route location (theft/personal use)
  - Same load number twice (data integrity)
  - Bank balance drops > 10% in 1 day (cash flow alert)
  - Vendor invoice 3× higher than rolling 90-day average from same vendor
All currently caught (if at all) by manual review weeks later.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0319
  CREATE TABLE IF NOT EXISTS safety.anomaly_alert_rules (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    rule_slug TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    description TEXT,
    category TEXT CHECK (category IN ('financial','operational','security','integrity')) NOT NULL,
    detector_function TEXT NOT NULL,
    threshold_config JSONB NOT NULL,
    severity TEXT CHECK (severity IN ('info','warn','high','critical')) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notify_roles TEXT[] NOT NULL,
    last_evaluated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (operating_company_id, rule_slug)
  );
  CREATE TABLE IF NOT EXISTS safety.anomaly_alerts (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    rule_uuid UUID NOT NULL REFERENCES safety.anomaly_alert_rules(uuid),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    severity TEXT NOT NULL,
    subject_kind TEXT,
    subject_uuid UUID,
    evidence JSONB NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by_user_uuid UUID,
    resolution_status TEXT CHECK (resolution_status IN ('open','investigating','resolved','false_positive')) NOT NULL DEFAULT 'open',
    resolution_notes TEXT
  );
  CREATE INDEX idx_alerts_open ON safety.anomaly_alerts(detected_at DESC) WHERE resolution_status = 'open';
  GRANT SELECT, INSERT, UPDATE ON safety.anomaly_alert_rules TO app_user;
  GRANT SELECT, INSERT, UPDATE ON safety.anomaly_alerts TO app_user;

PIECE B — Seed default rules (6+ rules)
  seed-default-rules.ts:
    Inserts default rules covering above patterns:
      - duplicate_bill_same_vendor_24h
      - settlement_outlier_15x_avg
      - fuel_off_route_geo
      - duplicate_load_number
      - bank_balance_10pct_drop_1d
      - vendor_invoice_3x_avg_90d

PIECE C — Rule engine + detectors
  rule-engine.service.ts:
    evaluateRule(rule_uuid) → 
      Loads detector function by name (from registry)
      Runs against latest data
      Creates anomaly_alerts row for each finding
  detector.service.ts:
    Registry of detector functions (one per rule_slug).
    Each detector is pure: takes (config, recent_data_window) → findings[]

PIECE D — Notification service
  notification.service.ts:
    On new alert: notify users in notify_roles via existing 
    Twilio + Resend + in-app notification pattern.

PIECE E — Routes
  GET    /api/safety/anomaly/rules
  POST   /api/safety/anomaly/rules (Owner)
  PATCH  /api/safety/anomaly/rules/:uuid
  GET    /api/safety/anomaly/alerts?status=&severity=&from=&to=
  PATCH  /api/safety/anomaly/alerts/:uuid/acknowledge
  PATCH  /api/safety/anomaly/alerts/:uuid/resolve body: {status, notes}

PIECE F — Worker
  anomaly-detector-worker.ts: runs every 30min for high-frequency rules, 
    every 6h for slower rules. Per-rule cadence configurable.

PIECE G — Frontend
  AnomalyDashboard.tsx (/safety/anomaly): open alerts list, severity filter, 
    drill into evidence, acknowledge/resolve workflow.
  RuleEditor.tsx (Owner only): add/edit detection rules.
  AnomalyAlertBadge.tsx: top-bar bell badge with open-critical count.

PIECE H — CI guard
  verify-anomaly-detection-engine.mjs: migration applied, 6 default rules 
    seeded, worker registered, routes registered, dashboard renders.

PIECE I — Tests
  detector.test.ts: each detector accuracy on known patterns
  rule-engine.test.ts: per-rule lifecycle, RLS, notification fanout
  notification.test.ts: role-based fanout, Resend + Twilio mocks

PIECE J — Docs
  docs/specs/gap-46-anomaly-detection.md (cite §4, list all default rules + 
  add-rule procedure)

ACCEPTANCE:
[ ] Migration 0319 applied + 6 default rules seeded
[ ] Worker runs per rule cadence
[ ] Alerts surface in /safety/anomaly dashboard
[ ] Notification fires for high/critical severity
[ ] Acknowledge + resolve workflow audited
[ ] verify-anomaly-detection-engine.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if false-positive rate >20% on default rules in dev data, STOP — 
       thresholds need tuning before notifying real users.

POST-MERGE NEXT STEPS: feeds Safety > Integrity Reports tab; rule library 
       can grow as patterns are discovered.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
