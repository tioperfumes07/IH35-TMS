#!/usr/bin/env node
/**
 * RPT-S06 — Scheduled reports panel must honestly show a zero count when no schedules exist,
 * not fabricate a non-zero count or hide the empty state.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const FILE = "apps/frontend/src/pages/reports/ScheduledReportsPanel.tsx";

function read(relativePath, root = ROOT) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath, root = ROOT) {
  return fs.existsSync(path.join(root, relativePath));
}

export function run(root = ROOT) {
  const failures = [];
  if (!exists(FILE, root)) {
    failures.push(`MISSING: ${FILE}`);
    return failures;
  }
  const src = read(FILE, root);

  if (!/apiRequest\s*<\{ rows: ScheduledRow\[\] \}>\s*\(\s*withCompany\("\/api\/v1\/reports\/scheduled"/.test(src)) {
    failures.push(`${FILE}: must fetch scheduled reports from /api/v1/reports/scheduled scoped by company`);
  }

  if (!/rows\.length === 0/.test(src)) {
    failures.push(`${FILE}: must explicitly handle the zero-row case`);
  }

  // Real copy is "No custom schedules — add daily dispatch board or AR aging." (more specific/
  // helpful than a bare "No active schedules") — still an honest, non-fabricated zero-row message.
  // Accept any of the equivalent honest empty-state phrasings.
  if (!/No active schedules|0 scheduled|0 active|No custom schedules/.test(src)) {
    failures.push(`${FILE}: must display an honest empty/zero message to the user`);
  }

  if (!/listQuery\.data\?\.rows\s*\?\?\s*\[\]/.test(src) && !/listQuery\.data\.rows\s*\?\?\s*\[\]/.test(src)) {
    failures.push(`${FILE}: must default to empty array when data is missing`);
  }

  // Ensure count is not hardcoded non-zero.
  if (/\b(?:\d{1,2})\s+scheduled|\b\d+\s+active\b/.test(src)) {
    failures.push(`${FILE}: must not hardcode a non-zero scheduled count`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "verify-rpt-s06-scheduled-count-honest-selftest-"));
    for (const rel of [FILE]) {
      fs.mkdirSync(path.dirname(path.join(tmpRoot, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, rel), read(rel), "utf8");
    }
    const realPath = path.join(tmpRoot, FILE);
    const backup = fs.readFileSync(realPath, "utf8");
    try {
      // Real copy is "No custom schedules ..." — plant the mutation against the actual phrase so
      // it isn't a silent no-op.
      fs.writeFileSync(realPath, backup.replace(/No custom schedules/g, "5 active schedules"), "utf8");
      const planted = run(tmpRoot);
      if (planted.length === 0) {
        console.error("[verify-rpt-s06-scheduled-count-honest] SELFTEST FAIL: planted hardcoded count did not fail");
        process.exit(1);
      }
      console.log(`[verify-rpt-s06-scheduled-count-honest] SELFTEST PASS (${planted.length} planted failures detected)`);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
    process.exit(0);
  }

  const failures = run();
  if (failures.length > 0) {
    console.error("\n[verify-rpt-s06-scheduled-count-honest] FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }
  console.log("[verify-rpt-s06-scheduled-count-honest] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
