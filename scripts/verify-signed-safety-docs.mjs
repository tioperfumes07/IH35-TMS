#!/usr/bin/env node
/**
 * Guard: verify-signed-safety-docs.mjs
 * Validates W4A-SIGNED-SAFETY-DOCS files are present and correctly wired.
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

console.log("\n── W4A-SIGNED-SAFETY-DOCS verification ──\n");

const MIGRATION = "db/migrations/202606111220_w4a_signed_safety_docs.sql";
const ROUTES    = "apps/backend/src/safetydoc/safetydoc.routes.ts";
const MANIFEST  = ".block-ready/W4A-SIGNED-SAFETY-DOCS.json";

// C1: migration
expectFile(MIGRATION);
expectContains(MIGRATION, /CREATE SCHEMA IF NOT EXISTS safetydoc/i,    "CREATE SCHEMA IF NOT EXISTS safetydoc");
expectContains(MIGRATION, /CREATE TABLE IF NOT EXISTS safetydoc\.document/i, "safetydoc.document table");
expectContains(MIGRATION, /CREATE TABLE IF NOT EXISTS safetydoc\.assignment/i, "safetydoc.assignment table");
expectContains(MIGRATION, /ENABLE ROW LEVEL SECURITY/i,                "RLS enabled");
expectContains(MIGRATION, /NULLIF\(current_setting/i,                  "NULLIF RLS pattern");
expectContains(MIGRATION, /events\.log_event\(/i,                      "spine logging via events.log_event()");
expectContains(MIGRATION, /RAISE EXCEPTION.*immutable/i,               "immutability RAISE EXCEPTION on signed records");
expectContains(MIGRATION, /BEFORE UPDATE OR DELETE/i,                  "immutability trigger on UPDATE OR DELETE");
expectNotContains(MIGRATION, /INSERT INTO events\.event_log/i,         "no direct insert into event_log (must use log_event())");

// C2: routes
expectFile(ROUTES);
expectContains(ROUTES, /safetydoc\.assignment/i,  "queries safetydoc.assignment");
expectContains(ROUTES, /safetydoc\.document/i,    "queries safetydoc.document");
expectContains(ROUTES, /requireAuth/,              "requireAuth used");
expectContains(ROUTES, /\/sign/,                   "sign endpoint");
expectContains(ROUTES, /\/evidence/,               "evidence endpoint");

// C3: CI + package.json
expectContains(".github/workflows/ci.yml", /verify:signed-safety-docs/, "CI gate step");
expectContains("package.json", /"verify:signed-safety-docs"\s*:/, "verify script in package.json");

// C4: manifest
expectFile(MANIFEST);
const abs = path.join(ROOT, MANIFEST);
if (fs.existsSync(abs)) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(abs, "utf8")); } catch { failures.push(`${MANIFEST}: invalid JSON`); }
  if (manifest && manifest.block_id !== "W4A-SIGNED-SAFETY-DOCS") {
    failures.push(`${MANIFEST}: block_id must be W4A-SIGNED-SAFETY-DOCS`);
  }
}

if (failures.length > 0) {
  console.error("verify:signed-safety-docs FAIL");
  for (const f of failures) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
console.log("── Result: ALL PASS ──\n");
