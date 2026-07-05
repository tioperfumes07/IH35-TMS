#!/usr/bin/env node
/**
 * verify-row-changes-evidence-coverage.mjs
 * CI guard for G10-M (item 2): the legal-evidence tables must stay covered by the audit.row_changes
 * mutation trigger, so who-changed-what is captured for every driver/unit/trailer/load-stop/customer/
 * vendor/assignment mutation.
 *
 * Regression it prevents: the audit.ensure_row_trigger(...) call for an evidence table is removed (or
 * the migration is reverted), silently dropping that table's mutation audit trail.
 *
 * Static check: scans db/migrations/*.sql for `audit.ensure_row_trigger('<schema>', '<table>')` calls
 * and asserts every required (schema, table) pair appears at least once.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIG_DIR = path.join(ROOT, "db", "migrations");

const REQUIRED = [
  ["mdata", "load_stops"],
  ["mdata", "drivers"],
  ["mdata", "units"],
  ["mdata", "equipment"],
  ["mdata", "customers"],
  ["mdata", "vendors"],
  ["dispatch", "load_assignment_history"],
];

if (!fs.existsSync(MIG_DIR)) {
  console.error("verify-row-changes-evidence-coverage: FAIL — db/migrations directory missing");
  process.exit(1);
}

const covered = new Set();
const callRe = /audit\.ensure_row_trigger\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/gi;
for (const f of fs.readdirSync(MIG_DIR)) {
  if (!f.endsWith(".sql")) continue;
  const sql = fs.readFileSync(path.join(MIG_DIR, f), "utf8");
  let m;
  while ((m = callRe.exec(sql)) !== null) covered.add(`${m[1]}.${m[2]}`);
}

const missing = REQUIRED.filter(([s, t]) => !covered.has(`${s}.${t}`));
if (missing.length > 0) {
  console.error("verify-row-changes-evidence-coverage: FAIL");
  for (const [s, t] of missing) {
    console.error(
      `  - ${s}.${t} has NO audit.ensure_row_trigger(...) call in any migration — evidence-table audit coverage dropped (G10-M regression).`,
    );
  }
  process.exit(1);
}

console.log(
  `verify-row-changes-evidence-coverage: OK (${REQUIRED.length} evidence tables covered by audit.row_changes triggers)`,
);
