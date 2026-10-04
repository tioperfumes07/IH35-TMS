#!/usr/bin/env node
// GUARD (CC-2, 2026-10-04, migration 202615400800): the reclassify engine's batch INSERT and the database CHECK
// reclassify_batches_changes_something must agree on what a "change" is. U24 added to_item_id / to_load_id to the engine
// and the table but not to the CHECK, so every load-only batch was refused at INSERT. This fails when a to_* target the
// engine writes (to_entity_type is a qualifier, not a target) is missing from the LATEST migration that defines the CHECK.
// Static, no database. Self-test: the CHECK as it stood before 202615400800 must fail this guard.
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-reclassify-batch-check-covers-targets";
const ROOT = process.cwd();
const SERVICE = path.join(ROOT, "apps/backend/src/accounting/reclassify/reclassify.service.ts");
const MIG_DIR = path.join(ROOT, "db/migrations");

function engineTargets() {
  const src = fs.readFileSync(SERVICE, "utf8");
  const m = src.match(/INSERT INTO accounting\.reclassify_batches\s*\(([^)]*)\)/);
  if (!m) throw new Error(`${LABEL}: FAIL — could not find the reclassify_batches INSERT in ${path.relative(ROOT, SERVICE)}`);
  return m[1].split(",").map((s) => s.trim()).filter((c) => /^to_/.test(c) && c !== "to_entity_type");
}

function checkBodies() {
  const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  const out = [];
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIG_DIR, f), "utf8").replace(/--[^\n]*/g, "");
    const m = sql.match(/ADD\s+CONSTRAINT\s+reclassify_batches_changes_something\s+CHECK\s*\(([\s\S]*?)\)\s*;/i)
      || sql.match(/CONSTRAINT\s+reclassify_batches_changes_something\s+CHECK\s*\(([\s\S]*?)\)\s*[,)]/i);
    if (m) out.push({ file: f, body: m[1] });
  }
  return out;
}

const missingFrom = (targets, body) => targets.filter((t) => !new RegExp(`\\b${t}\\b`).test(body));

const targets = engineTargets();
const bodies = checkBodies();
if (targets.length < 4 || bodies.length === 0) {
  console.error(`${LABEL}: FAIL — instrument: ${targets.length} engine targets, ${bodies.length} CHECK definitions found (expected >=4 and >=1)`);
  process.exit(1);
}
const latest = bodies[bodies.length - 1];
const missing = missingFrom(targets, latest.body);

// Self-test: the last definition BEFORE the fix must be caught (it omitted to_item_id / to_load_id).
const before = bodies.filter((b) => b.file < "202615400800").pop();
if (before && missingFrom(targets, before.body).length === 0) {
  console.error(`${LABEL}: FAIL — self-test: the pre-202615400800 CHECK (${before.file}) should be caught and was not`);
  process.exit(1);
}

if (missing.length) {
  console.error(`${LABEL}: FAIL — the engine writes ${missing.join(", ")} but ${latest.file}'s CHECK does not count it, so a batch changing only that is refused at INSERT`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — engine targets [${targets.join(", ")}] all counted by ${latest.file}${before ? `; self-test caught ${before.file}` : ""}`);
