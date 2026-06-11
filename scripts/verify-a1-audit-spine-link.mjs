#!/usr/bin/env node
/**
 * Guard: verify-a1-audit-spine-link.mjs
 * Validates A1-AUDIT-SPINE-LINK-COLUMNS files are present and correct.
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
  if (pattern.test(fs.readFileSync(abs, "utf8"))) failures.push(`${p}: contains forbidden — ${label}`);
}

console.log("\n── A1-AUDIT-SPINE-LINK-COLUMNS verification ──\n");

const MIGRATION = "db/migrations/202606111250_a1_audit_spine_link_columns.sql";
const MANIFEST  = ".block-ready/A1-AUDIT-SPINE-LINK-COLUMNS.json";

// C1: migration exists
expectFile(MIGRATION);

// C2: additive columns present
expectContains(MIGRATION, /ADD COLUMN IF NOT EXISTS source_table/i,        "source_table column");
expectContains(MIGRATION, /ADD COLUMN IF NOT EXISTS source_reference_id/i, "source_reference_id column");
expectContains(MIGRATION, /ADD COLUMN IF NOT EXISTS actor_user_id/i,       "actor_user_id column");
expectContains(MIGRATION, /ADD COLUMN IF NOT EXISTS correlation_id/i,      "correlation_id column");

// C3: indexes
expectContains(MIGRATION, /idx_event_log_source/i,       "idx_event_log_source index");
expectContains(MIGRATION, /idx_event_log_entity/i,       "idx_event_log_entity index");
expectContains(MIGRATION, /idx_event_log_correlation/i,  "idx_event_log_correlation index");

// C4: immutability check (DO block verifies trigger still intact)
expectContains(MIGRATION, /immutability trigger.*MISSING|MISSING.*immutability/i, "immutability trigger guard in DO block");

// C5: log_event extended with new optional params (backward-compatible)
expectContains(MIGRATION, /p_source_table.*text.*DEFAULT NULL/i,          "p_source_table optional param in log_event");
expectContains(MIGRATION, /p_source_reference_id.*uuid.*DEFAULT NULL/i,   "p_source_reference_id optional param");
expectContains(MIGRATION, /p_correlation_id.*uuid.*DEFAULT NULL/i,        "p_correlation_id optional param");

// C6: NO backfill of old rows (immutable)
expectNotContains(MIGRATION, /UPDATE events\.event_log/i, "no UPDATE on event_log (immutable)");

// C7: CI + package.json
expectContains(".github/workflows/ci.yml", /verify:a1-audit-spine-link/, "CI gate step");
expectContains("package.json", /"verify:a1-audit-spine-link"\s*:/, "verify script in package.json");

// C8: manifest
expectFile(MANIFEST);
const abs = path.join(ROOT, MANIFEST);
if (fs.existsSync(abs)) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(abs, "utf8")); } catch { failures.push(`${MANIFEST}: invalid JSON`); }
  if (manifest && manifest.block_id !== "A1-AUDIT-SPINE-LINK-COLUMNS") {
    failures.push(`${MANIFEST}: block_id must be A1-AUDIT-SPINE-LINK-COLUMNS`);
  }
}

if (failures.length > 0) {
  console.error("verify:a1-audit-spine-link FAIL");
  for (const f of failures) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
console.log("── Result: ALL PASS ──\n");
