#!/usr/bin/env node
/**
 * verify:migration-filenames
 *
 * Systemic guard against the migration silent-skip failure class.
 *
 * scripts/db-migrate.mjs only applies files whose names match one of:
 *   - legacy   ^\d{4}[a-z]?_.+\.sql$   (e.g. 0407_permits_toll_tags.sql)
 *   - timestamp ^\d{12}_.+\.sql$       (e.g. 202606071430_add_foo.sql)
 *
 * A file named YYYYMMDD_HHMMSS_slug.sql (8 digits, underscore, 6 digits) matches
 * NEITHER pattern. Before the runner was hardened it silently skipped such files:
 * they never applied, never ledgered, and never errored — leaving prod missing
 * grants/tables (e.g. master_data USAGE grant from #684, GAP-19 detention tables).
 *
 * This check scans db/migrations/*.sql and fails if ANY file does not match a
 * recognized pattern, with a targeted message for the YYYYMMDD_HHMMSS format.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");

const LEGACY = /^\d{4}[a-z]?_.+\.sql$/i;
const TIMESTAMP = /^\d{12}_.+\.sql$/i;
// The specific bad format that caused the silent-skip incidents.
const BAD_8_6 = /^\d{8}_\d{6}_.+\.sql$/i;

function fail(lines) {
  console.error("verify:migration-filenames FAILED");
  for (const line of lines) console.error(`- ${line}`);
  console.error(
    "\nRecognized patterns:\n" +
      "  legacy:    NNNN[a]_slug.sql        (frozen — no NEW legacy files)\n" +
      "  timestamp: YYYYMMDDHHMM_slug.sql   (12 continuous digits — use for all new migrations)\n" +
      "\nThe YYYYMMDD_HHMMSS form (8 digits _ 6 digits) is silently skipped by the runner. Rename it."
  );
  process.exit(1);
}

if (!fs.existsSync(MIGRATIONS_DIR)) {
  fail([`db/migrations directory not found: ${MIGRATIONS_DIR}`]);
}

const sqlFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.toLowerCase().endsWith(".sql"))
  .sort();

const violations = [];
for (const name of sqlFiles) {
  if (LEGACY.test(name) || TIMESTAMP.test(name)) continue;
  if (BAD_8_6.test(name)) {
    violations.push(
      `${name}: YYYYMMDD_HHMMSS (8+6) format — silently skipped by db-migrate.mjs. Rename to YYYYMMDDHHMM_slug.sql.`
    );
  } else {
    violations.push(
      `${name}: does not match any recognized naming pattern. Rename to YYYYMMDDHHMM_slug.sql.`
    );
  }
}

if (violations.length > 0) {
  fail(violations);
}

console.log(
  `verify:migration-filenames OK — ${sqlFiles.length} migration file(s), all match a recognized naming pattern.`
);
