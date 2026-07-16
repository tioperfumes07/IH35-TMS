#!/usr/bin/env node
/**
 * verify-relay-dtstart-dtend.mjs
 *
 * GUARD 2026-07-16 (Mike Masteller / Relay): production date filters are `dtstart` + `dtend`.
 * Using `start_date`/`end_date` is a silent no-op — we lived that false "Relay ignores dates" finding.
 *
 * Must fail if:
 *  1. client loses applyRelayDateRangeParams / sets wrong param names
 *  2. DAILY cron still full-pulls without date opts (review finding on PR #2567)
 *  3. backfill OR daily omit the ≥10s inter-company pull gap
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT = path.join(ROOT, "apps/backend/src/integrations/relay-payments/relay-client.ts");
const CRON = path.join(ROOT, "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts");
const LABEL = "verify-relay-dtstart-dtend";
const failures = [];

const client = fs.readFileSync(CLIENT, "utf8");
const cron = fs.readFileSync(CRON, "utf8");

if (!/export function applyRelayDateRangeParams/.test(client)) {
  failures.push("relay-client.ts must export applyRelayDateRangeParams");
}
if (!/searchParams\.set\("dtstart"/.test(client) || !/searchParams\.set\("dtend"/.test(client)) {
  failures.push('relay-client.ts must set query params "dtstart" and "dtend"');
}
if (/searchParams\.set\("start_date"/.test(client) || /searchParams\.set\("end_date"/.test(client)) {
  failures.push("relay-client.ts must NOT set start_date/end_date (Relay ignores those names)");
}
if (!/applyRelayDateRangeParams\(/.test(client)) {
  failures.push("fetch path must call applyRelayDateRangeParams");
}

/** True if `fnName` body contains a fetchAll call that passes a 2nd opts arg with startDate+endDate. */
function fetchAllInFnPassesDates(source, fnName) {
  const fnRe = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${fnName}\\s*\\(`);
  const m = fnRe.exec(source);
  if (!m) return false;
  // Slice from fn start to next top-level export/function or EOF — good enough for this file shape.
  const from = m.index;
  const rest = source.slice(from);
  const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+/);
  const body = next === -1 ? rest : rest.slice(0, next);
  // Reject bare single-arg calls in this function.
  if (/fetchAllRelayFuelTransactions\(\s*entityCode\s*\)/.test(body)) return false;
  return /fetchAllRelayFuelTransactions\(\s*entityCode\s*,[\s\S]*?startDate[\s\S]*?endDate[\s\S]*?\)/.test(body);
}

if (!fetchAllInFnPassesDates(cron, "initializeRelayFuelIngestCron")) {
  failures.push(
    "daily cron must call fetchAllRelayFuelTransactions(entityCode, { startDate, endDate }) — bare call = full dump every night"
  );
}
if (!fetchAllInFnPassesDates(cron, "runRelayFuelBackfill")) {
  failures.push(
    "backfill must call fetchAllRelayFuelTransactions(entityCode, { startDate, endDate })"
  );
}

// Shared ≥10s inter-company gap (Mike: 10s pull limit) used by BOTH daily and backfill.
if (!/function relayInterCompanyDelayMs\s*\(/.test(cron)) {
  failures.push("cron must define relayInterCompanyDelayMs() shared by daily + backfill");
}
if (!/RELAY_FUEL_INGEST_INTER_COMPANY_MS \?\? "10000"/.test(cron)) {
  failures.push("inter-company delay default must be 10000ms (Mike: 10s pull limit)");
}
const delayUsages = cron.match(/relayInterCompanyDelayMs\(\)/g) ?? [];
if (delayUsages.length < 2) {
  failures.push("both daily cron and backfill must call relayInterCompanyDelayMs() (got " + delayUsages.length + ")");
}

if (failures.length) {
  console.error(`[${LABEL}] FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — daily+backfill use dtstart/dtend; ≥10s inter-company gap on both paths.`);
