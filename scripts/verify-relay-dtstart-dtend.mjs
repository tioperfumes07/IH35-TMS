#!/usr/bin/env node
/**
 * verify-relay-dtstart-dtend.mjs
 *
 * GUARD 2026-07-16 (Mike Masteller / Relay): production date filters are `dtstart` + `dtend`.
 * Using `start_date`/`end_date` is a silent no-op — we lived that false "Relay ignores dates" finding.
 * Fail if the client sends the wrong names or loses applyRelayDateRangeParams.
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
if (!/RELAY_FUEL_INGEST_INTER_COMPANY_MS \?\? "10000"/.test(cron)) {
  failures.push("backfill inter-company delay default must be 10000ms (Mike: 10s pull limit)");
}

if (failures.length) {
  console.error(`[${LABEL}] FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — dtstart/dtend + 10s inter-company throttle locked.`);
