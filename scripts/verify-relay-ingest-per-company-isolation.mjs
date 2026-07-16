#!/usr/bin/env node
/**
 * verify-relay-ingest-per-company-isolation.mjs
 *
 * GUARD 2026-07-16 BUG-2: backfill must not wrap the multi-company loop in one
 * withLuciaBypass transaction (one abort killed every company + rolled back upserts).
 * Static shape check: runRelayFuelBackfill's company for-loop body must call
 * withLuciaBypass (per-company commits), and the loop itself must not be nested
 * inside a single outer withLuciaBypass spanning all companies.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-ingest-per-company-isolation";
const FILE = path.join(
  ROOT,
  "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts"
);

const src = fs.readFileSync(FILE, "utf8");
const fnStart = src.indexOf("export async function runRelayFuelBackfill");
if (fnStart < 0) {
  console.error(`[${LABEL}] FAIL — runRelayFuelBackfill not found`);
  process.exit(1);
}
// Rough slice to next export or EOF
const nextExport = src.indexOf("\nexport ", fnStart + 10);
const body = src.slice(fnStart, nextExport < 0 ? undefined : nextExport);

const forLoop = body.match(/for\s*\(\s*const\s*\{[^}]+\}\s*of\s*companyIds\s*\)\s*\{/);
if (!forLoop) {
  console.error(`[${LABEL}] FAIL — companyIds for-loop not found in runRelayFuelBackfill`);
  process.exit(1);
}

const loopStart = body.indexOf(forLoop[0]);
const beforeLoop = body.slice(0, loopStart);
// Count withLuciaBypass opens that are still "open" conceptually is hard; instead:
// forbid a pattern where withLuciaBypass wraps the for-loop (async (client) => { ... for (const ... of companyIds)
if (/withLuciaBypass\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{[\s\S]{0,800}?for\s*\(\s*const\s*\{[^}]+\}\s*of\s*companyIds/.test(beforeLoop + forLoop[0])) {
  console.error(`[${LABEL}] FAIL — company loop appears nested inside a single withLuciaBypass`);
  process.exit(1);
}

const afterLoopOpen = body.slice(loopStart);
if (!/await\s+withLuciaBypass\s*\(/.test(afterLoopOpen)) {
  console.error(`[${LABEL}] FAIL — no withLuciaBypass inside company loop (expected per-company txn)`);
  process.exit(1);
}

if (!/RELAY_FUEL_INGEST_INTER_COMPANY_MS/.test(body)) {
  console.error(`[${LABEL}] FAIL — missing inter-company throttle env (BUG-3)`);
  process.exit(1);
}

console.log(`[${LABEL}] OK — per-company withLuciaBypass + inter-company delay present`);
