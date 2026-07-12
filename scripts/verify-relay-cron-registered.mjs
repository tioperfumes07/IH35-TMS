#!/usr/bin/env node
/**
 * verify-relay-cron-registered.mjs
 * CI guard (doc 21 Part A gap 1): the Relay fuel-transaction ingest cron must stay WIRED into the backend's
 * in-process scheduler so it can run once the owner sets RELAY_API_KEY + flips RELAY_FUEL_INGEST_ENABLED.
 *
 * Regression it prevents: initializeRelayFuelIngestCron was defined in
 * apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts but never imported/called in
 * index.ts — so the daily pull silently never ran (both tables empty on prod). This guard fails if the
 * in-process wiring is ever severed. (The cron is a no-op until the env key + per-entity flag are set;
 * ingest is staging-only, no GL.)
 *
 * FAILS IF ANY OF:
 *   1. relay-fuel-ingest.cron.ts does not export initializeRelayFuelIngestCron.
 *   2. index.ts does not IMPORT initializeRelayFuelIngestCron.
 *   3. index.ts does not CALL initializeRelayFuelIngestCron(app).
 *
 * Self-test: node scripts/verify-relay-cron-registered.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-cron-registered";

export function computeRelayCronFailures(files) {
  const cron = files.cron ?? "";
  const index = files.index ?? "";
  const errors = [];
  if (!/export\s+function\s+initializeRelayFuelIngestCron/.test(cron)) {
    errors.push("relay-fuel-ingest.cron.ts must export initializeRelayFuelIngestCron");
  }
  if (!/import\s*\{[^}]*initializeRelayFuelIngestCron[^}]*\}\s*from\s*["'][^"']*relay-fuel-ingest\.cron\.js["']/.test(index)) {
    errors.push("index.ts must IMPORT initializeRelayFuelIngestCron from relay-fuel-ingest.cron.js");
  }
  if (!/initializeRelayFuelIngestCron\s*\(\s*app\s*\)/.test(index)) {
    errors.push("index.ts must CALL initializeRelayFuelIngestCron(app) in the bootstrap");
  }
  return errors;
}

function selftest() {
  const goodCron = "export function initializeRelayFuelIngestCron(app) {}";
  const goodIndex = 'import { initializeRelayFuelIngestCron } from "./integrations/relay-payments/relay-fuel-ingest.cron.js";\ninitializeRelayFuelIngestCron(app);';
  if (computeRelayCronFailures({ cron: goodCron, index: goodIndex }).length) {
    console.error(`${LABEL} --selftest FAILED: wired case should pass`); process.exit(1);
  }
  if (computeRelayCronFailures({ cron: goodCron, index: "// nothing" }).length !== 2) {
    console.error(`${LABEL} --selftest FAILED: unwired index should report import+call missing`); process.exit(1);
  }
  if (computeRelayCronFailures({ cron: "// no export", index: goodIndex }).length !== 1) {
    console.error(`${LABEL} --selftest FAILED: missing export should be caught`); process.exit(1);
  }
  console.log(`${LABEL} --selftest — OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const cron = fs.readFileSync(path.join(ROOT, "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts"), "utf8");
  const index = fs.readFileSync(path.join(ROOT, "apps/backend/src/index.ts"), "utf8");
  const errors = computeRelayCronFailures({ cron, index });
  if (errors.length) {
    console.error(`${LABEL} — FAILED`);
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK (Relay fuel-ingest cron exported + imported + called in index.ts)`);
}
