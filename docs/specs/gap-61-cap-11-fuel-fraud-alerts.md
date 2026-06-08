# GAP-61 — CAP-11 Fuel Card Real-Time Fraud Alerts

**Source:** CAP-11 Samsara capabilities · GAP-59 vehicle-driver pairing  
**Block:** GAP-61 (Wave P2-F, Lane A)

## Problem

Fuel card fraud (GPS mismatch, tank overflow, off-duty fills, rapid multi-station activity, inactive truck fills) was not detected, leaving thousands in monthly theft exposure.

## Solution

1. **Migration** (`202606071800_fuel_fraud_alerts.sql`) — `fuel.fraud_alerts` with tenant RLS + `resolved_at` for Today's Attention (GAP-65).
2. **Rules** (`rules.service.ts`) — five detection rules using telematics GPS, HOS duty status, and vehicle-driver pairing.
3. **Worker** (`fuel-fraud-detector-worker.ts`) — 15-minute cron over recent fuel transactions.
4. **Alerter** (`alerter.service.ts`) — critical alerts notify Owner/Operations in-app.
5. **API** — list/investigate/confirm-fraud/dismiss under `/api/fuel/fraud-alerts`.
6. **Frontend** — `FraudAlertsList`, `FuelFraudBadge`, `FuelHome` KPI card.

## Rules

| Rule | Severity | Trigger |
|------|----------|---------|
| `RULE_GPS_MISMATCH` | critical | Pump vs truck GPS > 1 mi at txn time |
| `RULE_TANK_OVERFLOW` | warn | Gallons > tank capacity × 1.1 |
| `RULE_OFF_DUTY` | warn | Txn during HOS `off_duty` |
| `RULE_RAPID_MULTI` | critical | 2+ txns in 30 min at different stations |
| `RULE_INACTIVE_TRUCK` | warn | Txn while truck moved < 0.25 mi in 24 h |

## CI

`verify:cap-11-fuel-fraud` — structural guard wired into CI and block manifest.
