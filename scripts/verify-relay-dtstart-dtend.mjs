#!/usr/bin/env node
/**
 * verify-relay-dtstart-dtend.mjs
 *
 * GUARD 2026-07-16 (Mike Masteller / Relay): production date filters are `dtstart` + `dtend`.
 * Using `start_date`/`end_date` is a silent no-op — we lived that false "Relay ignores dates" finding.
 *
 * 2026-10-03 (Relay, relayed by the Lead): "You can pull all history via the API" + "We have a 10 second limit
 * on pulling transactions". History therefore goes through a SEQUENCE of dated windows, never one call.
 *
 * Must fail if:
 *  1. client loses applyRelayDateRangeParams / sets wrong param names
 *  2. fetchAllRelayFuelTransactions stops refusing an unfiltered pull or an over-wide single call
 *  3. the DAILY tick or the BACKFILL reach Relay any way other than fetchRelayFuelTransactionsInWindows
 *     with startDate/endDate (a direct fetchAll call in the cron = one unwindowed call)
 *  4. the windowed pull loses its >=10s pacer floor, its per-call budget, or its halve-on-timeout loop
 *  5. backfill OR daily omit the ≥10s inter-company pull gap
 *
 * --selftest plants each regression and proves the check catches it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "apps/backend/src/integrations/relay-payments");
const LABEL = "verify-relay-dtstart-dtend";

/** Body of `fnName` — from its declaration to the next top-level function or EOF. */
function fnBody(source, fnName) {
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${fnName}\\s*\\(`).exec(source);
  if (!m) return null;
  const rest = source.slice(m.index);
  const next = rest.slice(1).search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

export function check({ client, cron, windowed }) {
  const failures = [];

  if (!/export function applyRelayDateRangeParams/.test(client)) {
    failures.push("relay-client.ts must export applyRelayDateRangeParams");
  }
  if (!/searchParams\.set\("dtstart"/.test(client) || !/searchParams\.set\("dtend"/.test(client)) {
    failures.push('relay-client.ts must set query params "dtstart" and "dtend"');
  }
  if (/searchParams\.set\("start_date"/.test(client) || /searchParams\.set\("end_date"/.test(client)) {
    failures.push("relay-client.ts must NOT set start_date/end_date (Relay ignores those names)");
  }
  const fetchAll = fnBody(client, "fetchAllRelayFuelTransactions") ?? "";
  if (!/applyRelayDateRangeParams\(\s*new URL\(relayApiBase\(\)\)/.test(fetchAll)) {
    failures.push("fetchAllRelayFuelTransactions must pass relayApiBase() through applyRelayDateRangeParams");
  }
  if (!/relay_unbounded_pull_refused/.test(fetchAll)) {
    failures.push("fetchAllRelayFuelTransactions must refuse a pull without valid dtstart/dtend (relay_unbounded_pull_refused)");
  }
  if (!/relay_window_too_wide/.test(fetchAll) || !/RELAY_MAX_SINGLE_CALL_SPAN_DAYS/.test(fetchAll)) {
    failures.push("fetchAllRelayFuelTransactions must refuse a single call wider than RELAY_MAX_SINGLE_CALL_SPAN_DAYS");
  }
  // The refusals must come before the first HTTP call.
  const iRefuse = fetchAll.indexOf("relay_unbounded_pull_refused");
  const iGet = fetchAll.indexOf("relayGetWithRetry(");
  if (iRefuse < 0 || iGet < 0 || iRefuse > iGet) {
    failures.push("fetchAllRelayFuelTransactions must refuse an unbounded pull BEFORE any request is made");
  }
  if (!/pacer\?\.beforeCall\(\)/.test(fetchAll)) {
    failures.push("fetchAllRelayFuelTransactions must pace every page request (opts.pacer.beforeCall)");
  }

  // Windowed pull: dated calls, >=10s floor, per-call budget, halve on timeout down to 1 day, fail loud.
  const inWindows = fnBody(windowed, "fetchRelayFuelTransactionsInWindows") ?? "";
  if (!inWindows) failures.push("relay-fuel-windowed-pull.ts must export fetchRelayFuelTransactionsInWindows");
  if (!/RELAY_MIN_CALL_INTERVAL_FLOOR_MS\s*=\s*10_?000\b/.test(windowed)) {
    failures.push("windowed pull must floor the gap between Relay calls at 10000ms (Relay: 10 second limit)");
  }
  if (!/Math\.max\(RELAY_MIN_CALL_INTERVAL_FLOOR_MS/.test(inWindows)) {
    failures.push("windowed pull must never pace below RELAY_MIN_CALL_INTERVAL_FLOOR_MS");
  }
  if (!/maxRetries:\s*0/.test(inWindows)) {
    failures.push("windowed pull must disable the client's inner retries (maxRetries: 0) so every retry is paced");
  }
  if (!/timeoutMs:\s*callTimeoutMs/.test(inWindows)) {
    failures.push("windowed pull must pass a per-call budget (timeoutMs: callTimeoutMs)");
  }
  if (!/isRelayTimeoutClassError\(error\)/.test(inWindows) || !/Math\.ceil\(windowDays \/ 2\)/.test(inWindows)) {
    failures.push("windowed pull must halve a window that times out");
  }
  if (!/relay_window_timeout_at_min_window/.test(inWindows)) {
    failures.push("windowed pull must fail loudly when a 1-day window still times out");
  }

  for (const fn of ["runRelayFuelIngestTick", "runRelayFuelBackfill"]) {
    const body = fnBody(cron, fn) ?? "";
    if (!body) {
      failures.push(`cron must define ${fn}`);
      continue;
    }
    if (!/fetchRelayFuelTransactionsInWindows\(\s*entityCode\s*,\s*\{[\s\S]*?startDate[\s\S]*?endDate[\s\S]*?windowDays/.test(body)) {
      failures.push(`${fn} must pull through fetchRelayFuelTransactionsInWindows(entityCode, { startDate, endDate, windowDays, ... })`);
    }
  }
  if (/fetchAllRelayFuelTransactions\(/.test(cron)) {
    failures.push("relay-fuel-ingest.cron.ts must not call fetchAllRelayFuelTransactions directly (one unwindowed call)");
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
  return failures;
}

function read() {
  return {
    client: fs.readFileSync(path.join(DIR, "relay-client.ts"), "utf8"),
    cron: fs.readFileSync(path.join(DIR, "relay-fuel-ingest.cron.ts"), "utf8"),
    windowed: fs.readFileSync(path.join(DIR, "relay-fuel-windowed-pull.ts"), "utf8"),
  };
}

function selftest() {
  const real = read();
  const base = check(real);
  if (base.length) {
    console.error(`[${LABEL}] selftest FAIL — the real tree must pass first:\n  - ${base.join("\n  - ")}`);
    process.exit(1);
  }
  const plants = [
    ["unbounded pull allowed", { ...real, client: real.client.replaceAll("relay_unbounded_pull_refused", "relay_x") }],
    ["over-wide call allowed", { ...real, client: real.client.replaceAll("relay_window_too_wide", "relay_y") }],
    ["wrong param name", { ...real, client: real.client.replace('searchParams.set("dtstart"', 'searchParams.set("start_date"') }],
    ["tick calls fetchAll directly", { ...real, cron: real.cron.replace("const pull = await fetchRelayFuelTransactionsInWindows(entityCode, {", "const pull = await fetchAllRelayFuelTransactions(entityCode, {") }],
    ["pacer floor lowered", { ...real, windowed: real.windowed.replace(/RELAY_MIN_CALL_INTERVAL_FLOOR_MS\s*=\s*10_000/, "RELAY_MIN_CALL_INTERVAL_FLOOR_MS = 1_000") }],
    ["no halving", { ...real, windowed: real.windowed.replace("Math.ceil(windowDays / 2)", "windowDays") }],
    ["inner retries left on", { ...real, windowed: real.windowed.replace("maxRetries: 0", "maxRetries: 3") }],
  ];
  for (const [name, planted] of plants) {
    if (check(planted).length === 0) {
      console.error(`[${LABEL}] selftest FAIL — planted regression not caught: ${name}`);
      process.exit(1);
    }
  }
  console.log(`[${LABEL}] selftest PASS — ${plants.length} planted regressions caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = check(read());
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — daily+backfill pull dated dtstart/dtend windows (>=10s apart, halved on timeout); unbounded pulls refused; ≥10s inter-company gap.`);
}
