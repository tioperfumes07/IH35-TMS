═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-CRITICAL / TASK GAP-51 — Data Sovereignty DS-1..7 Suite (QBO/Samsara Mirror Integrity)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-A (post-CLOSURE-32 + Pass-2 ingest)  ·  LANE: A  ·  CURSOR-A
SEQUENCING: dispatch AFTER CLOSURE-32 QBO-parity audit ships + Pass-2 ingested 
            to main per Q2 decision
PAIRED WITH: GAP-52 (Lane B) — same wave P2-A

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-52 owned):
  apps/backend/src/integrations/integrity-monitors/driver-vendor-mapping.ts
  apps/frontend/src/pages/safety/integrity-reports/DriverVendorMappingTab.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/integrations/qbo/mirror-integrity.service.ts             (NEW DS-1)
  apps/backend/src/integrations/qbo/reconciliation-report.service.ts        (NEW DS-2)
  apps/backend/src/integrations/samsara/config-bootstrap.service.ts         (NEW DS-3)
  apps/backend/src/integrations/samsara/vehicle-import.service.ts           (NEW DS-4)
  apps/backend/src/integrations/samsara/driver-import.service.ts            (NEW DS-5)
  apps/backend/src/integrations/samsara/daily-sync-job.ts                   (NEW DS-6)
  apps/backend/src/integrations/integration-health.routes.ts                (EDIT — DS-7 indicator)
  apps/backend/src/integrations/__tests__/ds-suite.test.ts                  (NEW)
  apps/backend/scripts/ds-verify-and-report.mjs                             (NEW operator helper)
  migrations/0301_qbo_reconciliation_alerts.sql                             (NEW)
  scripts/verify-data-sovereignty-rows-exist.mjs                            (NEW CI guard)
  docs/runbooks/DATA-SOVEREIGNTY-EXECUTION.md                               (NEW)
  docs/specs/gap-51-data-sovereignty.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Tracker Data Sovereignty sheet (locked 2026-05-20) DS-1..7 NEVER 
        STARTED · Priority 1 · UNBLOCKS all Samsara feature work · 
        integrations.samsara_vehicles + integrations.samsara_drivers 
        currently 0 rows · integrations.samsara_config missing row for 
        IH 35 Transportation

PROBLEM: Data sovereignty foundation never executed. Production indicators 
show "Samsara: not configured" because:
  - DS-1: QBO mirror data not verified (Bug B from PR #156 era could have 
    caused gaps)
  - DS-2: No daily reconciliation drift detection
  - DS-3: integrations.samsara_config has 0 rows for TRANSP
  - DS-4: integrations.samsara_vehicles has 0 rows (need T120-T177/T178)
  - DS-5: integrations.samsara_drivers has 0 rows (need 25 active drivers)
  - DS-6: No daily sync job scheduled
  - DS-7: Production indicator stays red without DS-3 row

SCOPE — ADDITIVE ONLY (all 7 sub-blocks):

PIECE A (DS-1) — QBO mirror integrity verifier
  mirror-integrity.service.ts:
    verifyQboMirror() →
      For each entity type (customers, vendors, items, accounts, classes):
        - Count local mirror rows
        - Fetch QBO count via Intuit QuickBooks MCP
        - Compute checksum delta
        - Returns {entity, local_count, qbo_count, delta_pct, drift_detected}
    Runs as one-shot or scheduled.

PIECE B (DS-2) — Daily reconciliation report
  reconciliation-report.service.ts:
    runDailyReconciliation() →
      - Calls mirror-integrity.verifyQboMirror()
      - Persists snapshot to qbo.reconciliation_alerts (migration 0301)
      - If drift > 1% on any entity: notify Owner via WF-064 high-risk
  Migration 0301:
    CREATE TABLE qbo.reconciliation_alerts (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
      run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      entity_type TEXT NOT NULL,
      local_count INTEGER NOT NULL,
      qbo_count INTEGER NOT NULL,
      delta_pct NUMERIC(6,3) NOT NULL,
      severity TEXT CHECK (severity IN ('info','warn','critical')) NOT NULL,
      notified_at TIMESTAMPTZ NULL
    );

PIECE C (DS-3) — Samsara config bootstrap
  config-bootstrap.service.ts:
    bootstrapSamsaraConfig(operating_company_id, encrypted_token) →
      INSERT INTO integrations.samsara_config 
      with token encrypted via existing SAMSARA_TOKEN_ENCRYPTION_KEY pattern.
    Idempotent: ON CONFLICT DO NOTHING.

PIECE D (DS-4) — Vehicle import
  vehicle-import.service.ts:
    importSamsaraVehicles() →
      Pull from Samsara API /fleet/vehicles
      UPSERT into integrations.samsara_vehicles
      Map to master_data.units via vehicle_external_id
      Returns import summary.

PIECE E (DS-5) — Driver import  
  driver-import.service.ts:
    importSamsaraDrivers() →
      Pull from Samsara API /fleet/drivers
      UPSERT into integrations.samsara_drivers
      Map to master_data.drivers via driver_external_id
      Returns import summary.

PIECE F (DS-6) — Daily sync job
  daily-sync-job.ts:
    Scheduled (cron pattern in Render): runs every 24h at 04:00 CT.
    Calls importSamsaraVehicles() + importSamsaraDrivers() + 
    runDailyReconciliation() in sequence.
    Failures notify Owner.

PIECE G (DS-7) — Production indicator green
  integration-health.routes.ts EDIT:
    GET /api/integrations/health now returns "samsara: green" when 
    config row exists + last sync < 24h ago.

PIECE H — Operator helper
  ds-verify-and-report.mjs: one-shot CLI for ops to verify all 7 DS steps.

PIECE I — CI guard
  verify-data-sovereignty-rows-exist.mjs: post-deploy check that 
    integrations.samsara_config has ≥1 row per active operating_company_id 
    AND integrations.samsara_vehicles + samsara_drivers have ≥1 row.

PIECE J — Tests
  ds-suite.test.ts: each sub-block, idempotency, error handling, RLS.

PIECE K — Runbook + docs
  docs/runbooks/DATA-SOVEREIGNTY-EXECUTION.md: step-by-step operator guide
  docs/specs/gap-51-data-sovereignty.md: design + rationale

ACCEPTANCE:
[ ] All 7 DS sub-blocks complete
[ ] integrations.samsara_config has TRANSP row
[ ] integrations.samsara_vehicles has T120-T178 imported
[ ] integrations.samsara_drivers has 25 active drivers
[ ] Daily sync job runs + succeeds
[ ] Production health indicator shows green for Samsara
[ ] Reconciliation alerts table receives daily snapshots
[ ] verify-data-sovereignty-rows-exist.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if Samsara API calls fail in DS-4 or DS-5, STOP and verify token 
       encryption + API access. Do not retry blind.

POST-MERGE NEXT STEPS: UNBLOCKS GAP-52 through GAP-71 (all Samsara CAP work).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
