#!/usr/bin/env node
/**
 * Guard: verify-broker-auto-update.mjs
 * Validates W4B-BROKER-AUTO-UPDATE files are present and correctly wired.
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

console.log("\n── W4B-BROKER-AUTO-UPDATE verification ──\n");

const MIGRATION = "db/migrations/202606111230_w4b_broker_auto_update.sql";
const ROUTES    = "apps/backend/src/brokerupdate/brokerupdate.routes.ts";
const MANIFEST  = ".block-ready/W4B-BROKER-AUTO-UPDATE.json";

// C1: migration
expectFile(MIGRATION);
expectContains(MIGRATION, /CREATE SCHEMA IF NOT EXISTS brokerupdate/i,       "CREATE SCHEMA IF NOT EXISTS brokerupdate");
expectContains(MIGRATION, /CREATE TABLE IF NOT EXISTS brokerupdate\.profile/i, "brokerupdate.profile table");
expectContains(MIGRATION, /CREATE TABLE IF NOT EXISTS brokerupdate\.send/i,    "brokerupdate.send table");
expectContains(MIGRATION, /ENABLE ROW LEVEL SECURITY/i,                       "RLS enabled");
expectContains(MIGRATION, /NULLIF\(current_setting/i,                         "NULLIF RLS pattern");
expectContains(MIGRATION, /events\.log_event\(/i,                             "spine logging via events.log_event()");
expectContains(MIGRATION, /auto_send_enabled.*boolean.*DEFAULT false/i,       "auto_send_enabled defaults to false");
expectContains(MIGRATION, /pending_review/i,                                  "hold-for-review queue status");
expectNotContains(MIGRATION, /INSERT INTO events\.event_log/i,                "no direct insert into event_log");

// C2: routes
expectFile(ROUTES);
expectContains(ROUTES, /brokerupdate\.send/i,    "queries brokerupdate.send");
expectContains(ROUTES, /brokerupdate\.profile/i, "queries brokerupdate.profile");
expectContains(ROUTES, /requireAuth/,             "requireAuth used");
expectContains(ROUTES, /pending_review/,          "pending_review hold queue");
expectContains(ROUTES, /approve/,                 "approve endpoint");
expectContains(ROUTES, /reject/,                  "reject endpoint");
expectContains(ROUTES, /auto_send_enabled/,       "auto_send_enabled gate check");

// C3: CI + package.json
expectContains(".github/workflows/ci.yml", /verify:broker-auto-update/, "CI gate step");
expectContains("package.json", /"verify:broker-auto-update"\s*:/, "verify script in package.json");

// C4: manifest
expectFile(MANIFEST);
const abs = path.join(ROOT, MANIFEST);
if (fs.existsSync(abs)) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(abs, "utf8")); } catch { failures.push(`${MANIFEST}: invalid JSON`); }
  if (manifest && manifest.block_id !== "W4B-BROKER-AUTO-UPDATE") {
    failures.push(`${MANIFEST}: block_id must be W4B-BROKER-AUTO-UPDATE`);
  }
}

if (failures.length > 0) {
  console.error("verify:broker-auto-update FAIL");
  for (const f of failures) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
console.log("── Result: ALL PASS ──\n");
