#!/usr/bin/env node
// ROUND 306 E-19..E-22 (engine registry, CC-2 rows 1-4).
//   E-19 one fuel-purchase predicate: every fuel engine uses fuel/fuel-purchase-eligibility.ts
//        (CC-3's T-45 guard for it was never registered — this step runs it).
//   E-20 Relay tick: gap-aware window (resumes from the last covered day, overlap for
//        late-published fills, capped), single runner across instances, every tick in
//        integrations.integration_sync_log.
//   E-21 fraud detector: on ingest completion, not a timer; never a finding on one signal;
//        pump-time rules refused on date-only rows.
//   E-22 fuel<->GPS match: on ingest completion, not hourly.
//
// --selftest: classifyFraudMatches + computeRelayIngestWindow, every branch, no DB.
// static (always): the wiring above is in the code.
// live: CC-3's eligibility guard passes; no fraud alert is ever critical without a finding
//   classification; reports each company's Relay flag and last covered day.
import pg from "pg";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();

const LABEL = "verify-fuel-ingest-engines-e19-e22";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = new URL("../../", import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), "utf8");
const mod = (p) => import(new URL(p, ROOT));

async function selftest() {
  const assert = (await import("node:assert/strict")).default;
  const { classifyFraudMatches } = await mod("apps/backend/src/integrations/fuel/fraud-detector/signal-independence.ts");
  const { computeRelayIngestWindow } = await mod("apps/backend/src/integrations/relay-payments/relay-fuel-ingest-window.ts");
  const m = (rule_id, severity = "critical") => ({ rule_id, severity, evidence: {} });

  const one = classifyFraudMatches([m("RULE_TANK_OVERFLOW")], { dateOnly: false });
  assert.equal(one.classification, "suspicion", "one signal is never a finding");
  assert.equal(one.matches[0].severity, "warn", "a suspicion can never carry critical severity");
  assert.equal(classifyFraudMatches([m("RULE_GPS_MISMATCH"), m("RULE_INACTIVE_TRUCK")], { dateOnly: false }).classification, "suspicion", "both read the truck's GPS — one signal");
  const two = classifyFraudMatches([m("RULE_GPS_MISMATCH"), m("RULE_TANK_OVERFLOW")], { dateOnly: false });
  assert.equal(two.classification, "finding");
  assert.equal(two.matches[0].severity, "critical", "a finding keeps the rule's own severity");
  const dateOnly = classifyFraudMatches([m("RULE_OFF_DUTY"), m("RULE_TANK_OVERFLOW")], { dateOnly: true });
  assert.equal(dateOnly.classification, "suspicion", "off-duty at a date-only 00:00 is not evidence");
  assert.deepEqual(dateOnly.skipped_rules, ["RULE_OFF_DUTY"]);

  const y = "2026-10-01";
  assert.deepEqual(computeRelayIngestWindow(null, y), { startDate: "2026-09-29", endDate: y, reason: "no prior successful tick — last 3 days" });
  assert.equal(computeRelayIngestWindow("2026-09-26", y).startDate, "2026-09-27", "resumes the day after the last covered day");
  assert.equal(computeRelayIngestWindow("2026-09-30", y).startDate, "2026-09-29", "always re-reads the overlap for late-published fills");
  assert.equal(computeRelayIngestWindow("2026-07-01", y).startDate, "2026-09-02", "catch-up is capped at 30 days");
  console.log(`${LABEL} --selftest PASS (11/11)`);
}

function staticWiring() {
  const problems = [];
  const need = (file, re, what) => { if (!re.test(src(file))) problems.push(`${file}: ${what}`); };
  const forbid = (file, re, what) => { if (re.test(src(file))) problems.push(`${file}: ${what}`); };
  need("apps/backend/src/maintenance/fuel-driver-scorecard.service.ts", /fuelPurchaseIneligibleReason/, "scorecard must use the shared purchase predicate (E-19)");
  need("apps/backend/src/jobs/fuel-fraud-detector-worker.ts", /fuelPurchaseIneligibleReason/, "fraud detector must use the shared purchase predicate (E-19)");
  need("apps/backend/src/jobs/fuel-fraud-detector-worker.ts", /classifyFraudMatches/, "fraud detector must classify by independent signals (E-21)");
  forbid("apps/backend/src/jobs/fuel-fraud-detector-worker.ts", /cron\.schedule\(/, "fraud detector must not run on a timer (E-21)");
  forbid("apps/backend/src/cron/fuel-gps-match.cron.ts", /cron\.schedule\(/, "fuel<->GPS match must not run hourly (E-22)");
  need("apps/backend/src/fuel/fuel-ingest-hooks.ts", /runFuelFraudDetectorTick/, "ingest hook runs fraud detection");
  forbid("apps/backend/src/fuel/fuel-ingest-hooks.ts", /runFuelGpsMatchBatch/, "the bank-line GPS matcher can only guess; E-22's verdict is computed on read (fuel-gps-verdict.service.ts)");
  need("apps/backend/src/cron/loves-card-import.cron.ts", /onFuelIngestComplete/, "Loves import triggers the ingest hook");
  need("apps/backend/src/fuel/fuel-transaction-import.routes.ts", /onFuelIngestComplete/, "statement upload triggers the ingest hook");
  need("apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts", /computeRelayIngestWindow/, "Relay tick uses the gap-aware window (E-20)");
  need("apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts", /claimRelayTick/, "Relay tick claims a single runner (E-20)");
  need("apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts", /integration_sync_log/, "Relay tick is visible in integration_sync_log (E-20)");
  return problems;
}

if (process.argv.includes("--selftest")) {
  await selftest();
  const p = staticWiring();
  if (p.length) { console.error(`${LABEL}: FAIL — ${p.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: static wiring PASS`);
  process.exit(0);
}

const wiring = staticWiring();
if (wiring.length) { console.error(`${LABEL}: FAIL — ${wiring.join("; ")}`); process.exit(1); }

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP.`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
// CI's verify:pre-commit runs verify-steps against a fresh, empty database: without the USMCA row
// there is nothing production-shaped to measure, so only the offline proof runs, and it says so.
const probe = await client.query("SELECT 1 FROM org.companies WHERE id = $1::uuid", [USMCA]);
if (probe.rows.length === 0) {
  await client.end();
  await selftest();
  console.log(`DATABASE PHASE: USMCA company absent (fresh CI DB) — selftest + static wiring only, NOT live proof`);
  process.exit(0);
}

let critNoFinding;
let relay;
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  critNoFinding = await client.query(
    `SELECT count(*)::int AS n FROM fuel.fraud_alerts
      WHERE severity = 'critical' AND detected_at > '2026-10-01'
        AND coalesce(evidence->>'classification', '') <> 'finding'`
  );
  relay = await client.query(
    `SELECT c.code,
            (SELECT o.enabled FROM lib.feature_flag_overrides o
              WHERE o.flag_key = 'RELAY_FUEL_INGEST_ENABLED' AND o.operating_company_id = c.id) AS flag_on,
            (SELECT max((payload->>'end_date')::date)::text FROM audit.audit_events
              WHERE source = 'RELAY-FUEL-INGEST-1' AND event_class = 'integrations.relay_fuel_ingest_daily_pull'
                AND payload->>'operating_company_id' = c.id::text) AS last_covered
       FROM org.companies c ORDER BY c.code`
  );
  await client.query("ROLLBACK");
} finally {
  await client.end();
}

const eligibility = spawnSync(process.execPath, ["scripts/verify-fuel-purchases-have-gallons-and-real-stamps.mjs"], {
  cwd: new URL(ROOT).pathname,
  encoding: "utf8",
  env: process.env,
});
if (eligibility.status !== 0) {
  console.error(`${LABEL}: FAIL — CC-3's fuel-purchase eligibility guard failed:\n${eligibility.stdout}${eligibility.stderr}`);
  process.exit(1);
}
if (critNoFinding.rows[0].n > 0) {
  console.error(`${LABEL}: FAIL — ${critNoFinding.rows[0].n} critical fraud alert(s) since E-21 without a two-signal finding classification.`);
  process.exit(1);
}
console.log(
  `${LABEL}: LIVE PASS — static wiring holds; fuel-purchase eligibility guard passes; 0 critical fraud alerts without a finding. ` +
    `Relay flags/last covered day: ${relay.rows.map((r) => `${r.code} flag=${r.flag_on === null ? "default" : r.flag_on ? "ON" : "OFF"} covered_to=${r.last_covered ?? "never"}`).join("; ")}.`
);
