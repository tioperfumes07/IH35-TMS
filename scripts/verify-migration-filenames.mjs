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
 *
 * A2-1 / E2-1 (added 2026-07-04): this guard ALSO fails on any NEW duplicate legacy
 * migration number. The legacy `NNNN[a]_` scheme historically reused the same number for
 * two unrelated objects on parallel lanes; a same-object collision like that once caused a
 * prod deploy outage. New migrations must use the timestamp format (also enforced by
 * .github/workflows/migration-guard.yml), so no NEW legacy-number collision should appear.
 * The 17 historical pairs already on main are grandfathered via HISTORICAL_DUP_ALLOWLIST.
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

// Legacy identity = 4 digits + optional single disambiguating letter, immediately followed
// by `_`. Captures the reuse-prone number. A 5th leading digit breaks the `_` anchor, so
// 12-digit timestamp files are naturally excluded — this is strictly about legacy-number reuse.
const LEGACY_IDENTITY = /^(\d{4}[a-z]?)_.+\.sql$/i;

// Historical duplicate legacy numbers already on main (verified 2026-07-04 by grouping
// db/migrations/ on the leading \d{4}[a-z]? token and keeping identities with >1 file).
// Grandfathered — the guard fires only on a NEW collision. Do NOT extend this to make a new
// collision pass; rename the new file to the next 12-digit timestamp number instead.
// (Note: 0193 and 0193a are DISTINCT identities — 0193a is the letter-disambiguated variant,
// not a true collision — so 0193 is intentionally absent; that yields 17 grandfathered pairs.)
const HISTORICAL_DUP_ALLOWLIST = new Set([
  "0050", "0051", "0146", "0167", "0195", "0217", "0218", "0219", "0220",
  "0221", "0222", "0223", "0224", "0233", "0234", "0340", "0363",
]);

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

// A2-1 / E2-1: group legacy files by number-identity and flag any NEW collision.
const byIdentity = new Map();
for (const name of sqlFiles) {
  const m = LEGACY_IDENTITY.exec(name);
  if (!m) continue; // timestamp-format or non-legacy — out of scope for number-reuse
  const identity = m[1].toLowerCase();
  if (!byIdentity.has(identity)) byIdentity.set(identity, []);
  byIdentity.get(identity).push(name);
}

for (const [identity, files] of byIdentity) {
  if (files.length > 1 && !HISTORICAL_DUP_ALLOWLIST.has(identity)) {
    violations.push(
      `NEW duplicate legacy migration number "${identity}" — ${files.sort().join(", ")}. ` +
        `Two migrations must never share a leading number. New migrations must use the ` +
        `12-digit timestamp format; rename the offending new file.`
    );
  }
}

// Keep the allowlist honest: if a grandfathered pair no longer collides (a file was renamed
// away), fail so the stale entry is removed rather than silently rubber-stamping.
for (const identity of HISTORICAL_DUP_ALLOWLIST) {
  if ((byIdentity.get(identity)?.length ?? 0) <= 1) {
    violations.push(
      `allowlisted historical dup "${identity}" no longer collides — remove it from HISTORICAL_DUP_ALLOWLIST.`
    );
  }
}

if (violations.length > 0) {
  fail(violations);
}

console.log(
  `verify:migration-filenames OK — ${sqlFiles.length} migration file(s), all match a recognized ` +
    `naming pattern; no NEW duplicate legacy number (grandfathered pairs=${HISTORICAL_DUP_ALLOWLIST.size}).`
);
