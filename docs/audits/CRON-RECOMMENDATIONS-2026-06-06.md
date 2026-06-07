# CRON RECOMMENDATIONS — IH35-TMS
**Date:** 2026-06-06  
**Block:** GAP-CRON-AUDIT-AND-RETUNE (Block 13, Wave B)  
**Based on:** CRON-INVENTORY-2026-06-06.md  
**Total cron jobs reviewed:** 46 distinct crons (51 schedule registrations including sub-schedules)

---

## RATING KEY

| Symbol | Meaning |
|--------|---------|
| 🟢 | No change — schedule and implementation are appropriate |
| 🟡 | Tune — schedule or minor implementation improvement recommended |
| 🔴 | Fix — correctness or safety issue requires remediation |

---

## 🔴 FIX — IMMEDIATE ATTENTION REQUIRED

### FIX-1: Compliance Reminder — Missing `is_active` Filter
**File:** `apps/backend/src/compliance/compliance-reminder.job.ts:354`  
**Issue:** Company query is `SELECT id::text FROM org.companies` with no `WHERE is_active = true` predicate. This means cron processes **deactivated companies** every day, wasting compute and potentially sending reminder emails to inactive tenants.  
**Verbatim code:**
```sql
SELECT id::text FROM org.companies
```
**Fix:** Change to:
```sql
SELECT id::text FROM org.companies WHERE is_active = true AND deactivated_at IS NULL
```
**Priority:** Medium-high — no financial data corrupted, but sends emails to inactive tenants daily. Fix in next PR.

---

### FIX-2: Deadhead Cache Refresh — Missing `is_active` Filter
**File:** `apps/backend/src/reports/deadhead-refresh.job.ts:1278`  
**Issue:** Company query is `SELECT id::text FROM org.companies` with no `is_active` filter. Computes deadhead cache for inactive tenants weekly.  
**Verbatim code:**
```sql
SELECT id::text FROM org.companies
```
**Fix:** Change to:
```sql
SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL
```
**Priority:** Low — weekly, compute waste only.

---

### FIX-3: Lane Profitability Refresh — Missing `is_active` Filter
**File:** `apps/backend/src/reports/lane-profitability-refresh.job.ts:1328`  
**Issue:** Company query is `SELECT id::text FROM org.companies` with no `is_active` filter. Computes lane profitability for inactive tenants daily.  
**Verbatim code:**
```sql
SELECT id::text FROM org.companies
```
**Fix:** Change to:
```sql
SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL
```
**Priority:** Low — compute waste, no safety risk.

---

### FIX-4: Anomaly Detector Inline Cron — No Disable Flag
**File:** `apps/backend/src/index.ts:850`  
**Issue:** This is the only cron in the codebase with **no environment flag** to disable it without a code change. All other crons have an `ENABLE_*` or similar env flag. If this cron causes issues (e.g., DB load, bad query), the only remediation is a code deploy.  
**Fix:** Add `if (process.env.ENABLE_ANOMALY_DETECTOR_CRON === "false") return;` guard, and extract to a dedicated `anomaly-detector.cron.ts` file (consistent with pattern used by all other cron files).  
**Priority:** Low-medium — currently working correctly, but operability gap.

---

## 🟡 TUNE — RECOMMENDED IMPROVEMENTS

### TUNE-1: QBO Historical Import Runner — Default Every-Minute Schedule Is Very Aggressive
**File:** `apps/backend/src/cron/qbo-historical-import-runner.ts:896`  
**Current schedule:** `"*/1 * * * *"` (every minute, default)  
**Issue:** This runs every 60 seconds to check for `in_progress` batches. If no forensic import is running, this ticks and does essentially nothing. When an import IS running, the cron re-enters the same `in_progress` batch concurrently (though the `lastHeartbeat` update serializes it somewhat). The default should be more conservative for production.  
**Recommendation:** Change default from `"*/1 * * * *"` to `"*/5 * * * *"` (every 5 minutes) to reduce pointless DB queries when no active batch exists. Override via `QBO_FORENSIC_CRON` is still available for operators who need faster recovery.  
**Priority:** Low — no correctness issue; cost/load reduction.

### TUNE-2: Samsara Webhook Projection + Geofence Breach Detector — Both at Every-Minute Rate
**Files:** `samsara-webhook-projection.cron.ts`, `geofence-breach-detector.cron.ts`  
**Current schedules:** `"*/1 * * * *"` each  
**Issue:** Two separate crons running every minute; while each serves a different purpose, both iterate over all active tenants on every tick. Consider whether 1-minute granularity is necessary in steady state.  
**Recommendation:** 🟢 Keep as-is for now — geofence breach requires near-real-time detection, and webhook projection latency should be <1 min. Revisit if DB load increases.  
**Priority:** N/A — currently acceptable.

### TUNE-3: QBO Inbound Sync — 15-Second `setInterval` Clock Drift Risk
**File:** `apps/backend/src/cron/qbo-inbound-sync.cron.ts:1127`  
**Current schedule:** `setInterval(15_000)` — process-uptime-based  
**Issue:** `setInterval` drifts from wall-clock over time and does not respect DST changes. For a high-frequency worker processing sync queue batches, this is acceptable. However, it cannot be controlled by node-cron's timezone feature.  
**Recommendation:** Monitor for queue backlog; if 15s becomes too aggressive (DB pressure), expose `QBO_INBOUND_SYNC_INTERVAL_MS` env var similar to how `DAILY_TASK_ALERTS_INTERVAL_MS` works in daily-task-alerts.cron.ts.  
**Priority:** Very low — operational nicety.

### TUNE-4: Email Queue Processor — Disabled by Default (Non-Obvious)
**File:** `apps/backend/src/email/cron.ts:962`  
**Current behavior:** Only runs if `EMAIL_CRON_ENABLED=true`. All other crons default to enabled with an opt-out flag. This is inverted.  
**Note:** This is likely intentional (email sending is a sensitive action), but it means that in a fresh deployment without `EMAIL_CRON_ENABLED=true`, **all emails queue up indefinitely and never send**.  
**Recommendation:** Confirm that `EMAIL_CRON_ENABLED=true` is set in Render prod environment. Add a startup warning log if the flag is not set and the queue table has pending rows.  
**Priority:** Low — likely already configured, but verify.

### TUNE-5: Multiple Daily Crons Clustered at 06:xx CT
**Files:** Multiple  
**Observation:** The following crons all fire between 05:30–07:35 CT daily:
- 05:30 — CSA BASIC Pull
- 06:00 — Compliance Reminder (+ Loves Card Import)
- 06:15 — Cash Advance Expiry, FMCSA SAFER Verification, Safety Reminders
- 07:00 — Dispatch Board Report
- 07:35 — Document Alert Engine

**Issue:** DB load may be elevated in the 06:00–07:35 CT window. No single spike is dangerous, but adding more crons to this window should be avoided.  
**Recommendation:** When adding Block 8 (Daily Financial Reconciliation, target 07:00 AM CST per spec), schedule it at 07:00 CT to cluster with the existing morning window, but document the window as congested. For Block 12 (Daily Financial Probe, also 07:00 CT), these are acceptable as they are read-heavy.  
**Priority:** Informational — no action needed now.

---

## 🟢 NO CHANGE — ALL OTHER CRONS

| Cron | Verdict | Notes |
|------|---------|-------|
| PM Auto-Engine (`"5 * * * *"`) | 🟢 | Hourly is appropriate; is_active ✅ |
| Driver Settlement Auto-Pay (`"0 6 * * 5"`) | 🟢 | Weekly Friday makes business sense; is_active ✅ |
| Collections Sync (`"0 4 * * *"`) | 🟢 | Pre-business-hours timing ideal; is_active ✅ |
| Recurring Templates (`setInterval(15min)`) | 🟢 | 15-min materialization appropriate |
| Daily Task Alerts (`setInterval(60s)`) | 🟢 | Near-real-time alert delivery; ON CONFLICT deduped |
| Error Digest (`setInterval(60s)`) | 🟢 | 5-min window check, threshold-gated |
| Fuel GPS Match (`"0 * * * *"`) | 🟢 | Hourly matches telematics freshness |
| Geofence Breach Detector (`"*/1 * * * *"`) | 🟢 | Real-time safety; watermark prevents re-processing |
| Plaid Daily Sync (`"0 2 * * *"`) | 🟢 | Overnight sync at low-traffic time; failure email ✅ |
| QBO CDC Poll (`setInterval(5min)`) | 🟢 | 5-min CDC is aligned with QBO limits |
| QBO Inbound Sync (`setInterval(15s)`) | 🟢 | Queue-draining pattern is correct |
| QBO Remote Count Delta (`"10 */6 * * *"`) | 🟢 | 6h cadence + minute offset avoids top-of-hour surge |
| QBO Remote Count Full (`"20 2 * * *"`) | 🟢 | Overnight full scan |
| QBO Sync Queue Runner (`"* * * * *"`) | 🟢 | Event-driven queue must run every minute |
| QBO Token Refresh (`"0 * * * *"`) | 🟢 | Hourly token refresh prevents expiry in active sessions |
| QBO Token Watchdog (`"*/15 * * * *"`) | 🟢 | 15-min watchdog + 12h cooldown prevents alert spam |
| QBO Sync Alerts Retry (`"*/5 * * * *"`) | 🟢 | Disabled by default; enable only when needed |
| QBO Master Data Full (opt-in) (`"0 2 * * *"`) | 🟢 | Disabled by default; appropriate for opt-in scenarios |
| QBO Master Data Delta (opt-in) (`"*/15 * * * *"`) | 🟢 | Disabled by default |
| QBO Drift Sync Scheduler (`"0 */4 * * *"`) | 🟢 | 4h drift detection is appropriate for master data |
| Reconciliation QBO Refdata (`"35 */6 * * *"`) | 🟢 | Minute offset avoids conflicts |
| Reconciliation QBO Txn (`"45 * * * *"`) | 🟢 | Hourly transactional reconciliation |
| Reconciliation Samsara Static (`"50 */12 * * *"`) | 🟢 | 12h is adequate for static data |
| Reconciliation CAP-15 Identity (`"55 * * * *"`) | 🟢 | Zero-tolerance check correctly hourly |
| Samsara Health Check (`"0 * * * *"`) | 🟢 | Hourly health check appropriate |
| Samsara Master Sync (`"30 * * * *"`) | 🟢 | Offset from :00 to avoid surge |
| Samsara Positions (`"*/5 * * * *"`) | 🟢 | 5-min GPS refresh is appropriate for TMS operations |
| Samsara Remote Count (`"5 */12 * * *"`) | 🟢 | 12h collection aligned with Samsara rate limits |
| Samsara Webhook Projection (`"*/1 * * * *"`) | 🟢 | Minute latency is acceptable |
| Scheduled Reports (6 definitions) | 🟢 | All schedules match business intent |
| Email Queue Processor (`"* * * * *"`) | 🟡 | See TUNE-4 — verify `EMAIL_CRON_ENABLED=true` in prod |
| Insurance Payment Reminder (`"0 8 * * *"`) | 🟢 | Morning send is correct |
| Legal Matters Reminder (`"0 8 * * *"`) | 🟢 | Morning send is correct |
| CSA BASIC Pull (`"30 5 * * *"`) | 🟢 | Pre-morning-rush timing; USDOT filter ✅ |
| FMCSA SAFER Verification (`"15 6 * * *"`) | 🟢 | Rate-limited correctly (1.5s between calls) |
| Document Alert Engine (`"35 7 * * *"`) | 🟢 | Post-morning-rush timing |
| Safety Reminders (`"15 6 * * *"`) | 🟢 | Morning refresh; ON CONFLICT upsert ✅ |
| Integrity Alert Engine (`"20 */6 * * *"`) | 🟢 | 6h cadence with offset |
| CBP Wait Times (`"*/5 * * * *"`) | 🟢 | Business-hours self-gate is elegant |

---

## PRIORITIZED FIX LIST

| Priority | ID | File | Action |
|----------|----|------|--------|
| **High** | FIX-1 | `compliance/compliance-reminder.job.ts:354` | Add `WHERE is_active = true AND deactivated_at IS NULL` |
| **Medium** | FIX-2 | `reports/deadhead-refresh.job.ts:1278` | Add `WHERE is_active = true AND deactivated_at IS NULL` |
| **Medium** | FIX-3 | `reports/lane-profitability-refresh.job.ts:1328` | Add `WHERE is_active = true AND deactivated_at IS NULL` |
| **Low** | FIX-4 | `src/index.ts:850` | Extract anomaly detector to dedicated file + add disable flag |
| **Low** | TUNE-1 | `cron/qbo-historical-import-runner.ts:896` | Change default cron expression to `"*/5 * * * *"` |
| **Very Low** | TUNE-4 | `email/cron.ts:962` | Verify `EMAIL_CRON_ENABLED=true` in Render prod env |

---

## NOTES FOR DOWNSTREAM BLOCKS

- **Block 2 (Test Data Cleanup):** The three TEST-TRUCK-* unit UUIDs will be included in cron outputs only if their company's `is_active = true`. After FIX-1/FIX-2/FIX-3 are applied, inactive company cleanup will no longer process test data.
- **Block 8 (Daily Financial Reconciliation):** Schedule at 07:00 CT aligns with existing morning window. Note window is dense 05:30–07:35; acceptable but document.
- **Block 9 (Active/Inactive Standardize):** After Block 9 lands, all `org.companies` queries must use `is_active`. FIX-1/FIX-2/FIX-3 are precursors.
