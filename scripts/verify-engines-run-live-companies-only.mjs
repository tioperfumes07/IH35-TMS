#!/usr/bin/env node
// ACCT-F11123 — a scheduled engine runs for the live entity (USMCA) only; IH 35 TRANSPORTATION / TRUCKING are frozen.
//
// Measured on prod 2026-11-10 01:21Z: _system.background_jobs customers.relationship_score_worker last success
// 2026-10-25 15:12Z (15 days) although USMCA scores were rewritten 11-09 (862) and 11-10 (355) — the worker loops
// every active org.companies row (all three entities are active) and the run never reaches its success record.
// The money engines had the same loop: depreciation auto-post (+ cash-flow snapshot, rolling-ledger notify,
// held-expense retry through its list), factoring default-interest accrual, collections sync, bank drift alerts,
// driver settlement auto-pay, insurance late fees and payment reminders — each would post / write for a frozen entity.
//
// RULE 1 — lib/live-engine-companies.ts is the one list: exactly [USMCA_OPERATING_COMPANY_ID].
// RULE 2 — the REQUIRED engines filter their company loop through it.
// RULE 3 — every other scheduled engine that lists active org.companies must filter through it (or the earlier
//          isUsmcaOperatingCompany rule) unless it is in PINNED (non-money engines, 11-10, shrink-only: a pinned file
//          that now complies or disappears must be removed).
import fs from "node:fs";
import path from "node:path";

const ROOT = "apps/backend/src";
const HELPER = "lib/live-engine-companies.ts";

export const REQUIRED = {
  "cron/depreciation-autopost.cron.ts": /return filterLiveEngineCompanies\(result\.rows\.map/,
  "cron/factoring-default-interest-accrual.cron.ts": /return filterLiveEngineCompanies\(res\.rows\.map/,
  "cron/collections-sync.cron.ts": /return filterLiveEngineCompanies\(res\.rows\.map/,
  "cron/bank-drift-alerts.cron.ts": /return filterLiveEngineCompanies\(result\.rows\.map/,
  "driver-finance/auto-pay.cron.ts": /return filterLiveEngineCompanies\(res\.rows\.map/,
  "insurance/late-fee.service.ts": /for \(const company of companies\.rows\.filter\(\(c\) => isLiveEngineCompany\(c\.id\)\)\)/,
  "insurance/payment-reminder.service.ts": /for \(const company of companies\.rows\.filter\(\(c\) => isLiveEngineCompany\(c\.id\)\)\)/,
  "jobs/customer-relationship-scorer.ts": /for \(const company of companies\.rows\.filter\(\(c\) => isLiveEngineCompany\(c\.id\)\)\)/,
};

export const PINNED = new Set([
  "compliance/compliance-reminder.job.ts",
  "compliance/csa-basic-pull.ts",
  "cron/draft-crew-status-selfheal.cron.ts",
  "cron/driver-leave-balance-rollover.cron.ts",
  "cron/event-spine-heartbeat.cron.ts",
  "cron/geofence-breach-detector.cron.ts",
  "cron/qbo-token-refresh.ts",
  "cron/reefer-hours-poll.cron.ts",
  "cron/samsara-health-cron.ts",
  "cron/samsara-remote-count-collector.cron.ts",
  "cron/samsara-webhook-projection.cron.ts",
  "drivers/document-alerts.cron.ts",
  "factoring/packet-assemble.service.ts",
  "integrations/samsara/fault-poll.cron.ts",
  "integrations/samsara/fuel-purchase-push.cron.ts",
  "jobs/active-driver-set-recompute.ts",
  "jobs/booking-gap-aggregator-worker.ts",
  "jobs/cap-12-tire-tread-worker.ts",
  "jobs/cap-13-brake-wear-worker.ts",
  "jobs/cap-14-cargo-sensor-worker.ts",
  "jobs/da-random-pool-draw-worker.ts",
  "jobs/driver-active-30d-worker.ts",
  "jobs/driver-retention-scorer-worker.ts",
  "jobs/driver-scoring-aggregator-worker.ts",
  "jobs/layover-detector-worker.ts",
  "jobs/predictive-alerts-worker.ts",
  "jobs/todays-attention-worker.ts",
  "jobs/vehicle-driver-pairing-worker.ts",
  "qbo-sync/sync-scheduler.ts",
  "reports/deadhead-refresh.job.ts",
  "reports/lane-profitability-refresh.job.ts",
  "safety/harsh-events-poll.cron.ts",
  "safety/samsara-dvir-poll.cron.ts",
  "tasks/task-alarm.job.ts",
  "telematics/load-real-driven-miles.cron.ts",
  "telematics/odometer-snapshot.cron.ts",
]);

const ENGINE = /wrapBackgroundJobTick|cron\.schedule|setInterval|withJobLease/;
const LISTS_ACTIVE_COMPANIES = /FROM\s+org\.companies[\s\S]{0,300}?is_active/;
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

export function audit(files) {
  const out = [];
  const h = files[HELPER];
  if (h == null) out.push(`RULE 1: ${HELPER} is missing`);
  else if (!/export const LIVE_ENGINE_COMPANY_IDS: readonly string\[\] = Object\.freeze\(\[USMCA_OPERATING_COMPANY_ID\]\);/.test(h)) {
    out.push("RULE 1: LIVE_ENGINE_COMPANY_IDS is no longer exactly [USMCA_OPERATING_COMPANY_ID]");
  }
  for (const [rel, re] of Object.entries(REQUIRED)) {
    const src = files[rel];
    if (src == null) out.push(`RULE 2: ${rel} is missing`);
    else if (!re.test(strip(src))) out.push(`RULE 2: ${rel} no longer filters its company loop through lib/live-engine-companies.ts`);
  }
  for (const [rel, src] of Object.entries(files)) {
    if (src == null || rel === HELPER || rel in REQUIRED) continue;
    const code = strip(src);
    if (!LISTS_ACTIVE_COMPANIES.test(code) || !ENGINE.test(code)) {
      if (PINNED.has(rel)) out.push(`RULE 3: ${rel} is pinned but no longer loops active companies — remove the pin (shrink-only)`);
      continue;
    }
    const filtered = /live-engine-companies/.test(code) || /isUsmcaOperatingCompany/.test(code);
    if (filtered && PINNED.has(rel)) out.push(`RULE 3: ${rel} now runs live entities only — remove it from PINNED (shrink-only)`);
    if (!filtered && !PINNED.has(rel)) out.push(`RULE 3: ${rel} is a scheduled engine looping every active org.companies row (frozen entities included) — filter through lib/live-engine-companies.ts`);
  }
  for (const rel of PINNED) if (!(rel in files) || files[rel] == null) out.push(`RULE 3: pinned ${rel} no longer exists — remove the pin`);
  return out;
}

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, acc);
    } else if (e.name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function load(root) {
  const files = {};
  const base = path.join(root, ROOT);
  for (const p of walk(base, [])) files[path.relative(base, p).split(path.sep).join("/")] = fs.readFileSync(p, "utf8");
  for (const k of [HELPER, ...Object.keys(REQUIRED)]) if (!(k in files)) files[k] = null;
  return files;
}

if (process.argv.includes("--selftest")) {
  const good = load(process.cwd());
  const clean = audit(good);
  if (clean.length) throw new Error("SELFTEST FAIL (live tree should be clean): " + JSON.stringify(clean));
  const plant = (file, from, to) => {
    const f = { ...good };
    if (!f[file] || !f[file].includes(from)) throw new Error(`SELFTEST setup broken: '${from}' not in ${file}`);
    f[file] = f[file].replace(from, to);
    return f;
  };
  const newEngine = "import cron from 'node-cron';\ncron.schedule('0 * * * *', async () => { const r = await c.query(`SELECT id FROM org.companies WHERE is_active = true`); });\n";
  const cases = [
    ["helper widened to every entity", plant(HELPER, "Object.freeze([USMCA_OPERATING_COMPANY_ID])", "Object.freeze([USMCA_OPERATING_COMPANY_ID, \"x\"])")],
    ["depreciation back to all companies", plant("cron/depreciation-autopost.cron.ts", "return filterLiveEngineCompanies(result.rows.map((row) => row.operating_company_id));", "return result.rows.map((row) => row.operating_company_id);")],
    ["factoring interest back to all companies", plant("cron/factoring-default-interest-accrual.cron.ts", "return filterLiveEngineCompanies(res.rows.map((row) => row.operating_company_id));", "return res.rows.map((row) => row.operating_company_id);")],
    ["late fee loop unfiltered", plant("insurance/late-fee.service.ts", "for (const company of companies.rows.filter((c) => isLiveEngineCompany(c.id))) {", "for (const company of companies.rows) {")],
    ["relationship scorer unfiltered", plant("jobs/customer-relationship-scorer.ts", "for (const company of companies.rows.filter((c) => isLiveEngineCompany(c.id))) {", "for (const company of companies.rows) {")],
    ["a new unfiltered engine", { ...good, "cron/new-money.cron.ts": newEngine }],
    ["a pinned file that complies keeps its pin", { ...good, "jobs/todays-attention-worker.ts": good["jobs/todays-attention-worker.ts"] + "\nimport { isLiveEngineCompany } from \"../lib/live-engine-companies.js\";\n" }],
    ["a pinned file deleted", (() => { const f = { ...good }; delete f["jobs/todays-attention-worker.ts"]; return f; })()],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  console.log(`verify-engines-run-live-companies-only: SELFTEST PASS (${caught}/${cases.length} planted defects caught)`);
  process.exit(0);
}

const failures = audit(load(process.cwd()));
if (failures.length) {
  console.error("verify-engines-run-live-companies-only FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-engines-run-live-companies-only: PASS — ${Object.keys(REQUIRED).length} money/scorer engines on the live-company list; ${PINNED.size} pinned non-money engines (shrink-only)`);
