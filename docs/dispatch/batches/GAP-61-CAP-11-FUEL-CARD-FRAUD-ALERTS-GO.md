═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-61 — CAP-11 Fuel Card Real-Time Fraud Alerts
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-F  ·  LANE: A  ·  CURSOR-A
SEQUENCING: dispatch AFTER GAP queue unpauses + GAP-51 DS-suite ships
PAIRED WITH: GAP-62 (Lane B) — same wave P2-F

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-62 owned):
  apps/backend/src/integrations/samsara/cap-12-tire-tread/**
  apps/backend/src/jobs/cap-12-tire-tread-worker.ts

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/integrations/fuel/fraud-detector/rules.service.ts         (NEW)
  apps/backend/src/integrations/fuel/fraud-detector/alerter.service.ts       (NEW)
  apps/backend/src/integrations/fuel/fraud-detector/routes.ts                (NEW)
  apps/backend/src/integrations/fuel/fraud-detector/__tests__/               (NEW dir)
  apps/backend/src/jobs/fuel-fraud-detector-worker.ts                        (NEW)
  apps/frontend/src/pages/fuel/fraud-alerts/FraudAlertsList.tsx              (NEW)
  apps/frontend/src/components/fuel/FuelFraudBadge.tsx                       (NEW)
  apps/frontend/src/pages/fuel/FuelHome.tsx                                  (EDIT — add card)
  migrations/0317_fuel_fraud_alerts.sql                                      (NEW)
  scripts/verify-cap-11-fuel-fraud.mjs                                       (NEW CI guard)
  docs/specs/gap-61-cap-11-fuel-fraud-alerts.md                              (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-11 from Samsara Capabilities sheet · Cross-references Samsara
        GPS at time of fuel transaction · Detect impossible scenarios
        (driver fueling while truck 500mi away)

PROBLEM: Fuel card fraud signals:
  - Truck location ≠ pump location at transaction time (impossible)
  - Gallons exceed tank capacity (×1.1 tolerance for fill estimation drift)
  - Transaction outside HOS on-duty window
  - Multiple transactions within 30min at different stations
  - Card swiped without truck activity
None detected today. Theft estimated thousands per month.

SCOPE — ADDITIVE ONLY (consumes GAP-59 vehicle-driver pairing):

PIECE A — Migration 0317
  CREATE TABLE IF NOT EXISTS fuel.fraud_alerts (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    fuel_transaction_uuid UUID NOT NULL,
    rule_id TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('info','warn','critical')) NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    evidence JSONB NOT NULL,
    status TEXT CHECK (status IN ('open','investigating','dismissed','confirmed_fraud','recovered')) NOT NULL DEFAULT 'open',
    investigated_by_user_uuid UUID,
    investigated_at TIMESTAMPTZ,
    resolution_notes TEXT
  );
  CREATE INDEX idx_fraud_status ON fuel.fraud_alerts(status, severity);
  GRANT SELECT, INSERT, UPDATE ON fuel.fraud_alerts TO app_user;

PIECE B — Rules service
  rules.service.ts:
    Detection rules:
      RULE_GPS_MISMATCH: distance(pump_lat, truck_lat) > 1mi at txn time → critical
      RULE_TANK_OVERFLOW: gallons > tank_capacity × 1.1 → warn
      RULE_OFF_DUTY: txn during driver hos.status='off_duty' → warn
      RULE_RAPID_MULTI: 2+ txns in 30min at different stations → critical
      RULE_INACTIVE_TRUCK: txn while truck stationary >24h → warn

PIECE C — Worker
  fuel-fraud-detector-worker.ts: runs every 15min over new fuel transactions.
  For each: evaluate all rules, create alerts for matches.

PIECE D — Alerter
  alerter.service.ts:
    On critical alert: notify Owner + Operations + create high-priority 
    Today's Attention item. Includes evidence (GPS lat/lng, txn timestamp, 
    pump address, driver assignment).

PIECE E — Routes
  GET   /api/fuel/fraud-alerts?status=open&severity=critical
  PATCH /api/fuel/fraud-alerts/:uuid/investigate
  PATCH /api/fuel/fraud-alerts/:uuid/confirm-fraud
  PATCH /api/fuel/fraud-alerts/:uuid/dismiss body: {reason}

PIECE F — Frontend
  FraudAlertsList.tsx (route /fuel/fraud-alerts): sortable table, 
    severity color-coding, investigate/confirm/dismiss actions
  FuelFraudBadge.tsx: red pill on transaction rows with open critical alert
  FuelHome.tsx EDIT: add "Open Fraud Alerts" KPI card at top

PIECE G — CI guard
  verify-cap-11-fuel-fraud.mjs: migration, worker, routes, UI all present

PIECE H — Tests
  rules.test.ts: each rule fires correctly, false positive rate <5% on 
    test transaction set, RLS isolation
  alerter.test.ts: critical alerts notify correctly

PIECE I — Docs
  docs/specs/gap-61-cap-11-fuel-fraud-alerts.md

ACCEPTANCE:
[ ] Migration 0317 applied
[ ] Worker runs every 15min
[ ] All 5 rules detect correctly
[ ] Critical alerts surface on Fuel Home + notify Owner
[ ] Investigate/dismiss flow audited
[ ] verify-cap-11-fuel-fraud.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if false positive rate >10% in test data, STOP — operator alert 
       fatigue would tank usefulness. Tune thresholds.

POST-MERGE NEXT STEPS: confirmed_fraud cases can auto-create driver 
       liability entries (consumer of GAP-12 non-load invoice).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
