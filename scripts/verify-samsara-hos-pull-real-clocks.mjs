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

function enabledCheckProblems(source, label) {
  const failures = [];
  const catchStart = source.indexOf("enabled check failed");
  const heartbeatCatchStart = source.indexOf("heartbeat/enabled tx failed");
  const start = catchStart >= 0 ? catchStart : heartbeatCatchStart;
  const disabledStart = source.indexOf("if (!enabled)", start);
  const failureBlock = start >= 0 && disabledStart > start ? source.slice(start, disabledStart) : "";
  if (!failureBlock.includes('"cron_samsara_enabled_check_failed"')) {
    failures.push(`${label} capability-read failure lacks a distinct warning audit`);
  }
  if (!failureBlock.includes("continue;")) {
    failures.push(`${label} capability-read failure falls through as Samsara disabled`);
  }
  if (/let enabled\s*=\s*false/.test(source)) {
    failures.push(`${label} initializes capability state to false, conflating read failure with disabled`);
  }
  return failures;
}

const cron = read("apps/backend/src/cron/samsara-hos-pull.cron.ts");
for (const problem of enabledCheckProblems(cron, "HOS pull")) fail(problem);
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
const clocksPull = read("apps/backend/src/integrations/samsara/samsara-hos-clocks-pull.service.ts");
const roster = read("apps/backend/src/integrations/samsara/active-hos-driver-roster.service.ts");
const dcaMigration = read("db/migrations/0018_driver_profile_expansion.sql");
const schemaProjector = read("apps/backend/src/integrations/samsara/webhook-projectors/hos-projector.ts");
const schemaProbe = read("apps/backend/src/integrations/samsara/samsara-stats-probe.service.ts");
const schemaPairing = read("apps/backend/src/integrations/samsara/vehicle-driver-pairing/pairing.service.ts");
const dcaSources = [
  ["dca", roster],
  ["hos_projector_dca", schemaProjector],
  ["stats_mapped_dca", schemaProbe],
  ["stats_total_dca", schemaProbe],
  ["stats_clock_dca", schemaProbe],
  ["pairing_sync_dca", schemaPairing],
  ["pairing_history_dca", schemaPairing],
];
if (!/CREATE TABLE IF NOT EXISTS mdata\.driver_company_authorizations[\s\S]{0,300}\bcompany_id uuid NOT NULL/.test(dcaMigration))
  fail("canonical driver_company_authorizations schema must expose company_id");
for (const [alias, source] of dcaSources) {
  if (!new RegExp(`\\b${alias}\\.company_id = \\$1::uuid`).test(source))
    fail(`${alias} must use canonical driver_company_authorizations.company_id (never phantom operating_company_id)`);
  if (new RegExp(`\\b${alias}\\.operating_company_id`).test(source))
    fail(`${alias} references phantom driver_company_authorizations.operating_company_id`);
}
// SCOPE: pull only the tenant's ACTIVE board drivers (OPEN vehicle assignment) via the board-proven key — NOT the
// whole account (1358 drivers -> 1204 unmapped, missing the 8 that matter). Resolve their local+samsara ids here.
if (!/JOIN telematics\.vehicle_driver_assignments[\s\S]{0,220}ended_at IS NULL/.test(roster))
  fail("hos pull must scope to drivers with an OPEN vehicle assignment (the active board drivers), not account-wide");
if (!/mdata\.drivers[\s\S]{0,700}samsara_driver_id IS NOT NULL/.test(roster))
  fail("hos pull must resolve active drivers via mdata.drivers.samsara_driver_id (the board-proven key)");
if (!/\ba\.operating_company_id = \$1::uuid/.test(roster))
  fail("active HOS roster must scope the open vehicle assignment to the selected company");
if (!/driver_company_authorizations dca[\s\S]{0,260}dca\.company_id = \$1::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/.test(roster))
  fail("active HOS roster must admit only home-company or actively authorized shared drivers");
if (!/listActiveHosDriverRoster\(client, operatingCompanyId\)/.test(svc))
  fail("HOS logs pull must consume the canonical selected-company active-driver roster");
if (!/listActiveHosDriverRoster\(client, operatingCompanyId\)/.test(clocksPull))
  fail("verbatim HOS clocks pull must consume the canonical selected-company active-driver roster");
// The /fleet/hos/logs pull must be SCOPED to those driverIds (so unmapped ~0 and the active drivers are covered).
if (!/listHosLogs\([\s\S]{0,90}\[\.\.\.localBySamsara\.keys\(\)\]\)/.test(svc))
  fail("hos pull must call listHosLogs with the active driverIds (scoped), not the account-wide pull");
// 8-day window so the 70h cycle + hours-driven are REAL (48h can't carry the cycle).
if (!/windowHours = 192/.test(svc))
  fail("hos pull window must be 8 days (192h) so the 70h cycle + hours-driven are real");
// IDEMPOTENCY: /fleet/hos/logs clips a closed interval's logStartTime to the rolling request window while its
// logEndTime stays stable. Keying only on started_at therefore inserted the same logical interval every five
// minutes (live USMCA proof: up to 1,930 distinct starts for one driver/status/end). Closed poll rows must use
// ended_at as their stable identity; open rows retain the existing exact-start conflict key.
function closedIntervalDedupeProblems(source) {
  const failures = [];
  if (!/pg_advisory_xact_lock\(hashtextextended\('samsara_hos_pull:' \|\| \$1::text \|\| ':' \|\| \$2::text, 0\)\)/.test(source))
    failures.push("concurrent HOS cron paths must serialize closed-interval dedupe per company+driver");
  if (!/const closedIntervalKeys = new Set/.test(source))
    failures.push("closed Samsara intervals must preload their stable identities once per driver");
  for (const predicate of [
    "operating_company_id = $1::uuid",
    "driver_id = $2::uuid",
    "source = 'samsara_eld'",
    "ended_at >= $3::timestamptz",
  ]) {
    if (!source.includes(predicate)) failures.push(`closed interval dedupe is missing ${predicate}`);
  }
  if (!/closedIntervalKey = log\.endedAt[\s\S]{0,160}canonicalStatus[\s\S]{0,120}new Date\(log\.endedAt\)\.toISOString/.test(source))
    failures.push("closed interval identity must use canonical status plus stable ended_at");
  if (!/closedIntervalKey && closedIntervalKeys\.has\(closedIntervalKey\)\) continue/.test(source))
    failures.push("known closed intervals must be skipped before INSERT");
  if (!/if \(closedIntervalKey\) closedIntervalKeys\.add\(closedIntervalKey\)/.test(source))
    failures.push("new closed intervals must join the in-memory set to dedupe the current response");
  return failures;
}
for (const problem of closedIntervalDedupeProblems(svc)) fail(problem);
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
// The per-driver concurrency lock + preload now intentionally sit between SAVEPOINT and INSERT. Verify ordering
// across the service rather than maintaining a fragile character window.
if (!/SAVEPOINT \$\{sp\}[\s\S]*INSERT INTO hos\.duty_status_events[\s\S]*RELEASE SAVEPOINT \$\{sp\}[\s\S]*ROLLBACK TO SAVEPOINT \$\{sp\}/.test(svc))
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
// CONSISTENCY: the board's HOS events must use the SAME rolling 8-day window the HOS Tracker roster (getHosDaily)
// uses, so the board cycle MATCHES the tracker per driver (GUARD: board cyc=128 vs daily cyc=472 from full history).
if (!/COALESCE\(e\.ended_at, now\(\)\) > now\(\) - interval '8 days'/.test(reader))
  fail("board HOS query must bound to the same 8-day window as the HOS Tracker roster (cycle must match per driver)");

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
for (const problem of enabledCheckProblems(posCron, "positions pull")) fail(problem);
if (!/syncSamsaraHosLogs\(c, operatingCompanyId\)/.test(posCron))
  fail("the */5 positions cron must also drive syncSamsaraHosLogs so HOS populates within 5 min (not hourly-only)");
if (!/integration_sync_log[\s\S]{0,260}'samsara_hos_pull'/.test(posCron))
  fail("the */5 positions cron must write the samsara_hos_pull sync-log row so the probe sees a fresh committed pull");

if (process.argv.includes("--selftest")) {
  const scopePlanted = [
    ["assignment company scope", roster.replace("a.operating_company_id = $1::uuid", "a.operating_company_id = a.operating_company_id")],
    ["authorization active flag", roster.replace("dca.is_authorized = true", "dca.is_authorized = false")],
    ["authorization lifecycle", roster.replace("dca.deactivated_at IS NULL", "dca.deactivated_at IS NOT NULL")],
  ];
  const schemaPlanted = dcaSources.map(([alias, source]) => [
      `${alias} canonical company column`,
      source.replace(`${alias}.company_id = $1::uuid`, `${alias}.operating_company_id = $1::uuid`),
    ]);
  const scopeCatches = scopePlanted.filter(([, source]) =>
    !/\ba\.operating_company_id = \$1::uuid/.test(source) ||
    !/dca\.is_authorized = true/.test(source) ||
    !/dca\.deactivated_at IS NULL/.test(source)
  ).length;
  const schemaCatches = schemaPlanted.filter(([, source]) =>
    /\b(?:dca|hos_projector_dca|stats_mapped_dca|stats_total_dca|stats_clock_dca|pairing_sync_dca|pairing_history_dca)\.operating_company_id/.test(source)
  ).length;
  const catches = scopeCatches + schemaCatches;
  const enabledCheckPlanted = [
    ["HOS capability failure fallthrough", cron.replace('              continue;\n            }\n            if (!enabled)', '              // planted fallthrough\n            }\n            if (!enabled)')],
    ["positions capability failure fallthrough", posCron.replace('              continue;\n            }\n            if (!enabled)', '              // planted fallthrough\n            }\n            if (!enabled)')],
  ];
  const enabledCheckCatches = enabledCheckPlanted.filter(([name, source]) =>
    enabledCheckProblems(source, name).length > 0
  ).length;
  const totalCaught = catches + enabledCheckCatches;
  const dedupePlanted = [
    ["concurrency lock", svc.replace("pg_advisory_xact_lock", "pg_advisory_unlock")],
    ["company", svc.replace("operating_company_id = $1::uuid", "operating_company_id = operating_company_id")],
    ["driver", svc.replace("driver_id = $2::uuid", "driver_id = driver_id")],
    ["window", svc.replace("ended_at >= $3::timestamptz", "started_at >= $3::timestamptz")],
    ["source", svc.replace("source = 'samsara_eld'", "source = source")],
    ["stable end", svc.replace("new Date(log.endedAt).toISOString()", "new Date(log.startedAt).toISOString()")],
    ["skip", svc.replace("closedIntervalKeys.has(closedIntervalKey)", "closedIntervalKeys.has('never')")],
    ["batch dedupe", svc.replace("closedIntervalKeys.add(closedIntervalKey)", "closedIntervalKeys.delete(closedIntervalKey)")],
  ];
  const dedupeCatches = dedupePlanted.filter(([, source]) => closedIntervalDedupeProblems(source).length > 0).length;
  const allCaught = totalCaught + dedupeCatches;
  const total = scopePlanted.length + schemaPlanted.length + enabledCheckPlanted.length + dedupePlanted.length;
  if (allCaught !== total) fail(`selftest caught ${allCaught}/${total} planted scope/schema/capability/dedupe defects`);
  console.log(`OK verify-samsara-hos-pull-real-clocks --selftest: caught ${allCaught}/${total} planted scope/schema/capability/dedupe defects`);
} else {
  console.log("OK verify-samsara-hos-pull-real-clocks: HOS clocks fed by a runScoped, observable, board-keyed pull on the */5 path; honest 'unavailable' when unknown (no 14h default).");
}
