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
// SCOPE: pull only the tenant's ACTIVE board drivers (OPEN vehicle assignment) via the board-proven key — NOT the
// whole account (1358 drivers -> 1204 unmapped, missing the 8 that matter). Resolve their local+samsara ids here.
if (!/JOIN telematics\.vehicle_driver_assignments[\s\S]{0,120}ended_at IS NULL/.test(svc))
  fail("hos pull must scope to drivers with an OPEN vehicle assignment (the active board drivers), not account-wide");
if (!/mdata\.drivers[\s\S]{0,200}samsara_driver_id IS NOT NULL/.test(svc))
  fail("hos pull must resolve active drivers via mdata.drivers.samsara_driver_id (the board-proven key)");
// The /fleet/hos/logs pull must be SCOPED to those driverIds (so unmapped ~0 and the active drivers are covered).
if (!/listHosLogs\([\s\S]{0,90}\[\.\.\.localBySamsara\.keys\(\)\]\)/.test(svc))
  fail("hos pull must call listHosLogs with the active driverIds (scoped), not the account-wide pull");
// 8-day window so the 70h cycle + hours-driven are REAL (48h can't carry the cycle).
if (!/windowHours = 192/.test(svc))
  fail("hos pull window must be 8 days (192h) so the 70h cycle + hours-driven are real");
// CANONICAL duty_status: the inserter must map Samsara hosStatusType to the FMCSA-canonical set the CHECK constraint
// allows (off_duty/sleeper/driving/on_duty_not_driving/personal_conveyance/yard_moves). The old mapper emitted
// "on_duty"/"yard_move"/sanitized unknowns -> CHECK rejected -> 47 driver_errors -> half-default clocks. NEVER again.
if (!/toCanonicalDutyStatus\(log\.hosStatusType\)/.test(svc))
  fail("HOS insert must map via toCanonicalDutyStatus (FMCSA-canonical values the CHECK allows), not the old mapDutyStatus");
if (/return "on_duty"[^_]|return "yard_move"[^s]/.test(svc))
  fail("duty_status mapper must NOT emit non-canonical values (on_duty / yard_move) — the CHECK rejects them");
if (!/return "on_duty_not_driving"; \/\/ unknown/.test(svc))
  fail("unknown duty_status must normalize to a CHECK-allowed value (conservative on_duty_not_driving), never throw");
// HONEST ERROR: a committed sync row must NEVER be success=false with a null reason. Capture the per-driver error.
if (!/firstError = `driver_insert:/.test(svc))
  fail("syncSamsaraHosLogs must capture the per-driver insert error (no success=false + null error_message)");
// Per-driver inserts savepoint-isolated (manual SAVEPOINT + ROLLBACK TO) so one bad log can't abort the others/log.
if (!/SAVEPOINT \$\{sp\}[\s\S]{0,400}INSERT INTO hos\.duty_status_events/.test(svc))
  fail("each driver's HOS insert batch must be savepoint-isolated (SAVEPOINT/ROLLBACK TO)");
// The service must NEVER throw on fetch failure (a throw rolls back the observability row) — record + return.
if (!/return \{ inserted: 0[\s\S]{0,120}error: `fetch:/.test(svc))
  fail("syncSamsaraHosLogs must record-and-return on fetch failure, never throw");
// HOS fetch timeout-bounded (samsaraFetch) AND accepts the driverIds scope param.
const client = read("apps/backend/src/integrations/samsara/samsara-client.ts");
if (!/\/fleet\/hos\/logs[\s\S]{0,400}samsaraFetch/.test(client))
  fail("listHosLogs must use the timeout-bounded samsaraFetch");
if (!/listHosLogs\([\s\S]{0,120}driverIds\?: string\[\]/.test(client) || !/searchParams\.set\("driverIds"/.test(client))
  fail("listHosLogs must accept + apply a driverIds scope param (GET /fleet/hos/logs?driverIds=...)");

// The probe must surface the HOS-pull row + recent event count so HOS reality is verifiable without prod creds.
const probe = read("apps/backend/src/integrations/samsara/samsara-stats-probe.service.ts");
if (!/sync_kind = 'samsara_hos_pull'/.test(probe) || !/last_hos_pull/.test(probe))
  fail("probe must surface last_hos_pull (the committed samsara_hos_pull sync-log row)");
if (!/hos_events_24h/.test(probe))
  fail("probe must surface hos_events_24h (real ingested duty events) so a still-empty HOS table can't read as 'real'");

// HONEST DEFAULT: the fleet board reader must NEVER present computeHosClocks([])'s fabricated 14h "ok" window for
// an assigned driver with zero ingested duty events — it must show "unavailable" + blank clocks instead. A safety
// board claiming every driver is legal-to-drive is the trust violation #1215 was meant to kill.
const reader = read("apps/backend/src/telematics/fleet-location-hos.service.ts");
if (!/evs\.length > 0 \? computeHosClocks\([\s\S]{0,40}: "no_data"/.test(reader))
  fail('reader must mark assigned-but-no-events drivers "no_data" (NOT computeHosClocks([])\'s fabricated 840 default)');
if (!/hosUnknown \? "unavailable"/.test(reader))
  fail('reader must surface hos_status="unavailable" (with blank clocks) when HOS is unknown, never a fabricated full clock');
// COHERENCE: an internally-impossible clock set (gapped stream) must read "unavailable", never a false "violation".
if (!/hosClocksCoherent\(computed\)/.test(reader))
  fail("reader must suppress INCOHERENT clock sets to unavailable (false-violation killer; e.g. drive=0 + brk>0)");
// PER-DRIVER STALENESS (MUST 3.15.6): a fix older than the 2h cutoff must suppress HOS to unavailable, never "ok".
if (!/HOS_STALE_CUTOFF_MIN/.test(reader))
  fail("reader must suppress HOS to unavailable when the driver's fix is older than the 2h cutoff (no stale 'ok')");

// UNION (no double-count): computeHosClocks must aggregate over the NON-OVERLAPPING flattened timeline so
// overlapping/duplicate/open-ended segments don't sum the 8-day cycle past 70h -> false cyc:0 (GUARD: CAZARES/
// SINGH/CORONADO). The clocks + the daily breakdown share flattenDutySegments.
const clocksSvc = read("apps/backend/src/telematics/hos-clocks.service.ts");
if (!/export function flattenDutySegments/.test(clocksSvc))
  fail("hos-clocks must export flattenDutySegments (the shared non-overlapping reconstruction)");
if (!/const flattened = flattenDutySegments\(events, asOf\)/.test(clocksSvc))
  fail("computeHosClocks must aggregate over flattenDutySegments (union), not raw overlapping segments");

// FAST + RELIABLE: the HOS pull must also run on the proven */5 positions cron (not only the single hourly :15
// cron whose firing GUARD couldn't confirm) so hos.duty_status_events populates within 5 min and last_hos_pull commits.
const posCron = read("apps/backend/src/cron/samsara-positions-cron.ts");
if (!/syncSamsaraHosLogs\(c, operatingCompanyId\)/.test(posCron))
  fail("the */5 positions cron must also drive syncSamsaraHosLogs so HOS populates within 5 min (not hourly-only)");
if (!/integration_sync_log[\s\S]{0,260}'samsara_hos_pull'/.test(posCron))
  fail("the */5 positions cron must write the samsara_hos_pull sync-log row so the probe sees a fresh committed pull");

console.log("OK verify-samsara-hos-pull-real-clocks: HOS clocks fed by a runScoped, observable, board-keyed pull on the */5 path; honest 'unavailable' when unknown (no 14h default).");
