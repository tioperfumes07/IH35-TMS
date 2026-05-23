#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["apps", "packages", "scripts", "db/migrations"];
const ALLOWED_AUDIT_EVENTS_FILE = "db/migrations/0216_audit_canonical_name_drift_capture.sql";
const LEGACY_AUDIT_NAME = "audit" + ".events";
const CANONICAL_PATTERN = /\baudit\.audit_events\b/;
const LEGACY_PATTERN = /\baudit[.]events\b/;
const LEGACY_WRITE_PATTERN = /\b(insert\s+into|update|delete\s+from|merge\s+into)\s+audit[.]events\b/i;

function fail(message) {
  console.error(`verify:canonical-audit-table-name FAILED\n- ${message}`);
  process.exit(1);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    out.push(full);
  }
  return out;
}

function relative(p) {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

function collectMatches(file, pattern) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const matches = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) matches.push(`${relative(file)}:${i + 1}`);
  }
  return matches;
}

const offenders = [];
const writeOffenders = [];

for (const relDir of SCAN_DIRS) {
  const dir = path.join(ROOT, relDir);
  for (const file of walk(dir)) {
    const rel = relative(file);
    if (rel === ALLOWED_AUDIT_EVENTS_FILE) continue;
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (LEGACY_PATTERN.test(line)) offenders.push(`${rel}:${i + 1}`);
      if (LEGACY_WRITE_PATTERN.test(line)) writeOffenders.push(`${rel}:${i + 1}`);
    }
  }
}

if (offenders.length > 0) {
  fail(`legacy ${LEGACY_AUDIT_NAME} references found:\n${offenders.map((v) => `  - ${v}`).join("\n")}`);
}

if (writeOffenders.length > 0) {
  fail(`write operations against ${LEGACY_AUDIT_NAME} are forbidden:\n${writeOffenders.map((v) => `  - ${v}`).join("\n")}`);
}

const backendDir = path.join(ROOT, "apps/backend");
const backendFiles = walk(backendDir);
const canonicalHits = backendFiles.flatMap((file) => collectMatches(file, CANONICAL_PATTERN));

if (canonicalHits.length === 0) {
  fail("expected at least one canonical reference to audit.audit_events in backend code");
}

console.log(
  JSON.stringify({
    event: "verify_canonical_audit_table_name_ok",
    backend_canonical_hits: canonicalHits.length,
    allowed_legacy_file: ALLOWED_AUDIT_EVENTS_FILE,
  })
);
