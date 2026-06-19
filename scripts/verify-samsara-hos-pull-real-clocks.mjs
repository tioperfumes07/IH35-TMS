#!/usr/bin/env node
// Guard — the fleet board's HOS clocks must be REAL (ingested Samsara duty events), never the 14h "fresh shift"
// default. computeHosClocks([]) returns the full 14h/11h/70h "ok" window when a driver has zero rows in
// hos.duty_status_events; the samsara-hos-pull cron is what fills that table. It was wired but (a) held ONE DB
// transaction across the whole tenant loop + every /fleet/hos/logs fetch (the pre-#1211 stall-and-rollback shape,
// so it persisted nothing) and (b) mapped drivers ONLY via integrations.samsara_drivers (drifted/empty), so every
// driver was "unmapped". Result: empty table -> fabricated 14h compliance on a safety board. Lock the fix.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-samsara-hos-pull-real-clocks: ${m}`); process.exit(1); };

const cron = read("apps/backend/src/cron/samsara-hos-pull.cron.ts");
// Each tenant's HOS pull runs in its OWN short tenant-scoped tx (runScoped) — never one giant tx across the loop.
if (!/runScoped[\s\S]{0,200}set_config\('app\.operating_company_id'/.test(cron))
  fail("hos-pull cron must run each tenant in its own short tenant-scoped tx (runScoped), not one giant tx");
if (/withLuciaBypass\(async \(client\) => \{\s*\n\s*const activeTenantIds/.test(cron))
  fail("hos-pull cron must NOT wrap the whole tenant loop + all /fleet/hos/logs fetches in one withLuciaBypass tx");
if (!/runScoped\(operatingCompanyId, async \(c\) => \{[\s\S]{0,200}syncSamsaraHosLogs\(c, operatingCompanyId\)/.test(cron))
  fail("hos-pull cron must call syncSamsaraHosLogs inside a runScoped tenant tx");
// The pull must be observable on the clean path — a committed integration_sync_log row (sync_kind='samsara_hos_pull').
if (!/integration_sync_log[\s\S]{0,260}'samsara_hos_pull'/.test(cron))
  fail("hos-pull cron must write an integration_sync_log row (sync_kind='samsara_hos_pull') so the probe can verify it committed");

const svc = read("apps/backend/src/integrations/samsara/samsara-hos-pull.service.ts");
// Driver mapping must FALL BACK to the board-proven mdata.drivers.samsara_driver_id key, not only the drift-prone
// integrations.samsara_drivers table (which left every driver unmapped -> empty HOS -> 14h default).
if (!/FROM\s+mdata\.drivers[\s\S]{0,160}samsara_driver_id\s*=\s*\$2/.test(svc))
  fail("localDriverIdFor must fall back to mdata.drivers.samsara_driver_id (the board-proven pairing key)");
// Per-driver insert batches must be savepoint-isolated so one bad log can't abort the whole tenant tx + its log row.
if (!/withSavepoint[\s\S]{0,400}INSERT INTO hos\.duty_status_events/.test(svc))
  fail("each driver's HOS insert batch must run in a withSavepoint so one bad log can't roll back the others + the log");
// The service must NEVER throw (a throw inside the tenant tx rolls back the observability row) — record + return.
if (!/return \{ inserted: 0[\s\S]{0,80}error: `fetch:/.test(svc))
  fail("syncSamsaraHosLogs must record-and-return on fetch failure, never throw (a throw rolls back its own sync-log row)");
// HOS fetch must be timeout-bounded (samsaraFetch / AbortController) so a stalled socket can't hold the tx open.
const client = read("apps/backend/src/integrations/samsara/samsara-client.ts");
if (!/listHosLogs[\s\S]{0,600}samsaraFetch/.test(client))
  fail("listHosLogs must use the timeout-bounded samsaraFetch (no unbounded fetch holding a tx across HOS I/O)");

// The probe must surface the HOS-pull row + recent event count so HOS reality is verifiable without prod creds.
const probe = read("apps/backend/src/integrations/samsara/samsara-stats-probe.service.ts");
if (!/sync_kind = 'samsara_hos_pull'/.test(probe) || !/last_hos_pull/.test(probe))
  fail("probe must surface last_hos_pull (the committed samsara_hos_pull sync-log row)");
if (!/hos_events_24h/.test(probe))
  fail("probe must surface hos_events_24h (real ingested duty events) so a still-empty HOS table can't read as 'real'");

console.log("OK verify-samsara-hos-pull-real-clocks: HOS clocks fed by a runScoped, observable, board-keyed pull (no 14h default).");
