#!/usr/bin/env node
/**
 * Guard: verify-forced-driver-ack.mjs
 * Validates W3B-FORCED-DRIVER-ACK files are present and correctly wired.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function expectFile(p) {
  if (!fs.existsSync(path.join(ROOT, p))) failures.push(`MISSING: ${p}`);
}

function read(p) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) { failures.push(`MISSING: ${p}`); return null; }
  return fs.readFileSync(abs, "utf8");
}

function expectContains(p, pattern, label) {
  const text = read(p);
  if (text && !pattern.test(text)) failures.push(`${p}: missing ${label}`);
}

function expectNotContains(p, pattern, label) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) return;
  const text = fs.readFileSync(abs, "utf8");
  if (pattern.test(text)) failures.push(`${p}: contains forbidden pattern — ${label}`);
}

console.log("\n── W3B-FORCED-DRIVER-ACK verification ──\n");

const MIGRATION = "db/migrations/202606111210_w3b_forced_driver_ack.sql";
const ROUTES    = "apps/backend/src/driveralert/driveralert.routes.ts";
const MANIFEST  = ".block-ready/W3B-FORCED-DRIVER-ACK.json";

// C1: migration
expectFile(MIGRATION);
expectContains(MIGRATION, /CREATE SCHEMA IF NOT EXISTS driveralert/i,   "CREATE SCHEMA IF NOT EXISTS driveralert");
expectContains(MIGRATION, /CREATE TABLE IF NOT EXISTS driveralert\.dispatch/i, "driveralert.dispatch table");
expectContains(MIGRATION, /CREATE TABLE IF NOT EXISTS driveralert\.alarm_event/i, "driveralert.alarm_event table");
expectContains(MIGRATION, /ENABLE ROW LEVEL SECURITY/i,                 "RLS enabled");
expectContains(MIGRATION, /NULLIF\(current_setting/i,                   "NULLIF RLS pattern");
expectContains(MIGRATION, /events\.log_event\(/i,                       "spine logging via events.log_event()");
expectNotContains(MIGRATION, /INSERT INTO events\.event_log/i,          "no direct insert into event_log (must use log_event())");
expectNotContains(MIGRATION, /samsara_positions_cron|INSERT INTO integrations\.samsara/i, "does not duplicate samsara cron");

// C2: routes
expectFile(ROUTES);
expectContains(ROUTES, /driveralert\.dispatch/i,   "queries driveralert.dispatch");
expectContains(ROUTES, /driveralert\.alarm_event/i, "queries driveralert.alarm_event");
expectContains(ROUTES, /requireAuth/,               "requireAuth used");
expectContains(ROUTES, /\/api\/v1\/driver-alerts/,  "/api/v1/driver-alerts endpoint");
expectContains(ROUTES, /\/ack/,                     "ack endpoint");

// C3: ci.yml + package.json wired
expectContains(".github/workflows/ci.yml", /verify:forced-driver-ack/, "CI gate step");
expectContains("package.json", /"verify:forced-driver-ack"\s*:/, "verify script in package.json");

// C4: manifest
expectFile(MANIFEST);
const manifestText = read(MANIFEST);
if (manifestText) {
  let manifest;
  try { manifest = JSON.parse(manifestText); } catch { failures.push(`${MANIFEST}: invalid JSON`); }
  if (manifest && manifest.block_id !== "W3B-FORCED-DRIVER-ACK") {
    failures.push(`${MANIFEST}: block_id must be W3B-FORCED-DRIVER-ACK`);
  }
}

if (failures.length > 0) {
  console.error("verify:forced-driver-ack FAIL");
  for (const f of failures) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
console.log("── Result: ALL PASS ──\n");
