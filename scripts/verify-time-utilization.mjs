#!/usr/bin/env node
/**
 * Guard: verify-time-utilization.mjs
 * Validates W5-TIME-UTILIZATION files are present and correctly wired.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function expectFile(p) {
  if (!fs.existsSync(path.join(ROOT, p))) failures.push(`MISSING: ${p}`);
}

function expectContains(p, pattern, label) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) { failures.push(`MISSING: ${p}`); return; }
  if (!pattern.test(fs.readFileSync(abs, "utf8"))) failures.push(`${p}: missing ${label}`);
}

function expectNotContains(p, pattern, label) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) return;
  if (pattern.test(fs.readFileSync(abs, "utf8"))) failures.push(`${p}: contains forbidden pattern — ${label}`);
}

console.log("\n── W5-TIME-UTILIZATION verification ──\n");

const MIGRATION = "db/migrations/202606111240_w5_time_utilization.sql";
const ROUTES    = "apps/backend/src/utilization/utilization.routes.ts";
const MANIFEST  = ".block-ready/W5-TIME-UTILIZATION.json";

// C1: migration
expectFile(MIGRATION);
expectContains(MIGRATION, /CREATE SCHEMA IF NOT EXISTS utilization/i,       "CREATE SCHEMA IF NOT EXISTS utilization");
expectContains(MIGRATION, /CREATE TABLE IF NOT EXISTS utilization\.driver_period/i, "utilization.driver_period table");
expectContains(MIGRATION, /CREATE TABLE IF NOT EXISTS utilization\.unit_period/i,   "utilization.unit_period table");
expectContains(MIGRATION, /ENABLE ROW LEVEL SECURITY/i,                            "RLS enabled");
expectContains(MIGRATION, /NULLIF\(current_setting/i,                              "NULLIF RLS pattern");
expectContains(MIGRATION, /events\.log_event\(/i,                                  "spine logging via events.log_event()");
expectContains(MIGRATION, /minutes_unaccounted/i,                                  "minutes_unaccounted column");
expectNotContains(MIGRATION, /INSERT INTO events\.event_log/i,                     "no direct insert into event_log");

// C2: read-only — no financial writes, no double-entry
expectNotContains(ROUTES, /INSERT INTO (accounting|payments|journal)/i,  "no financial writes in utilization routes");

// C3: routes
expectFile(ROUTES);
expectContains(ROUTES, /utilization\.driver_period/i, "queries driver_period");
expectContains(ROUTES, /utilization\.unit_period/i,   "queries unit_period");
expectContains(ROUTES, /requireAuth/,                  "requireAuth used");
expectContains(ROUTES, /by-driver/,                    "by-driver endpoint");
expectContains(ROUTES, /by-truck/,                     "by-truck endpoint");

// C4: CI + package.json
expectContains(".github/workflows/ci.yml", /verify:time-utilization/, "CI gate step");
expectContains("package.json", /"verify:time-utilization"\s*:/, "verify script in package.json");

// C5: manifest
expectFile(MANIFEST);
const abs = path.join(ROOT, MANIFEST);
if (fs.existsSync(abs)) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(abs, "utf8")); } catch { failures.push(`${MANIFEST}: invalid JSON`); }
  if (manifest && manifest.block_id !== "W5-TIME-UTILIZATION") {
    failures.push(`${MANIFEST}: block_id must be W5-TIME-UTILIZATION`);
  }
}

if (failures.length > 0) {
  console.error("verify:time-utilization FAIL");
  for (const f of failures) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
console.log("── Result: ALL PASS ──\n");
