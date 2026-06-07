#!/usr/bin/env node
/**
 * TIER 1 TRUST — Block 5: Double-Entry Balance Guard
 *
 * Static (file-system) guard that asserts the double-entry balance constraint
 * is present in the migration files and that no subsequent migration silently
 * drops or replaces it.
 *
 * This is NOT a live-DB check (use db:verify:double-entry-balance for that).
 * This guard runs in CI without a Postgres connection.
 *
 * What it asserts:
 *   1. accounting.ensure_journal_entry_balanced() function is defined in the
 *      canonical migration (0092_p5_d4_manual_journal_entries.sql).
 *   2. trg_check_journal_entry_balanced CONSTRAINT TRIGGER is defined on
 *      accounting.journal_entry_postings in the same migration and is marked
 *      DEFERRABLE INITIALLY DEFERRED.
 *   3. No migration file drops accounting.ensure_journal_entry_balanced.
 *   4. No migration file drops trg_check_journal_entry_balanced.
 *   5. No migration file creates accounting.journal_entry_lines (forbidden by
 *      verify-accounting-backbone-schema — duplicated here as belt-and-suspenders).
 *
 * Exit 0 → all checks pass
 * Exit 1 → at least one check failed (message printed to stderr)
 */

import fs from "node:fs";
import path from "node:path";

const CANONICAL_MIGRATION = "db/migrations/0092_p5_d4_manual_journal_entries.sql";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertMatches(source, regex, message) {
  if (!regex.test(source)) {
    throw new Error(message);
  }
}

function assertNotMatches(source, regex, message) {
  if (regex.test(source)) {
    throw new Error(message);
  }
}

try {
  // ── 1 & 2. Function + trigger present in canonical migration ─────────────
  const canonical = read(CANONICAL_MIGRATION);

  assertMatches(
    canonical,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+accounting\.ensure_journal_entry_balanced\s*\(\s*\)/i,
    `accounting.ensure_journal_entry_balanced() function not found in ${CANONICAL_MIGRATION}`,
  );

  assertMatches(
    canonical,
    /CREATE\s+CONSTRAINT\s+TRIGGER\s+trg_check_journal_entry_balanced/i,
    `CONSTRAINT TRIGGER trg_check_journal_entry_balanced not found in ${CANONICAL_MIGRATION}`,
  );

  assertMatches(
    canonical,
    /trg_check_journal_entry_balanced[\s\S]{0,300}DEFERRABLE\s+INITIALLY\s+DEFERRED/i,
    `trg_check_journal_entry_balanced is not DEFERRABLE INITIALLY DEFERRED in ${CANONICAL_MIGRATION}`,
  );

  assertMatches(
    canonical,
    /AFTER\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE\s+ON\s+accounting\.journal_entry_postings/i,
    `trg_check_journal_entry_balanced is not on accounting.journal_entry_postings in ${CANONICAL_MIGRATION}`,
  );

  console.log(`✅ [1/4] ensure_journal_entry_balanced() defined in ${CANONICAL_MIGRATION}`);
  console.log(`✅ [2/4] trg_check_journal_entry_balanced CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED confirmed`);

  // ── 3 & 4. No subsequent migration drops the function or trigger ─────────
  const migrationsDir = "db/migrations";
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const dropsFunction = [];
  const dropsTrigger = [];
  const createsJournalEntryLines = [];

  for (const file of migrationFiles) {
    if (file === path.basename(CANONICAL_MIGRATION)) continue;

    const sql = read(path.join(migrationsDir, file));

    // DROP FUNCTION variants
    if (/DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?accounting\.ensure_journal_entry_balanced\b/i.test(sql)) {
      dropsFunction.push(file);
    }

    // CREATE OR REPLACE FUNCTION that replaces without preserving the balance check
    // We flag any re-definition outside the canonical file so it must be reviewed.
    if (
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+accounting\.ensure_journal_entry_balanced\s*\(/i.test(sql)
    ) {
      // A re-definition is only acceptable if it still raises an exception on imbalance.
      // Check that it still contains the imbalance RAISE EXCEPTION.
      if (!/RAISE\s+EXCEPTION\s+['"]journal\s+entry/i.test(sql)) {
        dropsFunction.push(`${file} (re-defines function WITHOUT balance RAISE EXCEPTION — balance check removed)`);
      }
    }

    // DROP TRIGGER variants
    if (/DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?trg_check_journal_entry_balanced\b/i.test(sql)) {
      // A DROP followed immediately by a CREATE in the SAME file is OK (idempotent re-creation).
      if (!/CREATE\s+CONSTRAINT\s+TRIGGER\s+trg_check_journal_entry_balanced/i.test(sql)) {
        dropsTrigger.push(`${file} (drops trigger without re-creating it)`);
      }
    }

    // Forbidden table
    if (
      /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?accounting\.journal_entry_lines\b/i.test(sql)
    ) {
      createsJournalEntryLines.push(file);
    }
  }

  const failures = [];

  if (dropsFunction.length > 0) {
    for (const f of dropsFunction) {
      failures.push(`accounting.ensure_journal_entry_balanced() dropped or replaced without balance check in: ${f}`);
    }
  } else {
    console.log(`✅ [3/4] No migration drops accounting.ensure_journal_entry_balanced() (${migrationFiles.length} files scanned)`);
  }

  if (dropsTrigger.length > 0) {
    for (const f of dropsTrigger) {
      failures.push(`trg_check_journal_entry_balanced dropped without re-creation in: ${f}`);
    }
  } else {
    console.log(`✅ [4/4] No migration drops trg_check_journal_entry_balanced without re-creating it`);
  }

  if (createsJournalEntryLines.length > 0) {
    for (const f of createsJournalEntryLines) {
      failures.push(`accounting.journal_entry_lines forbidden — canonical lines table is accounting.journal_entry_postings (found in: ${f})`);
    }
  }

  if (failures.length > 0) {
    for (const msg of failures) {
      console.error(`✘ ${msg}`);
    }
    process.exit(1);
  }

  console.log("✅ verify-double-entry-balance-trigger passed");
} catch (error) {
  console.error(`✘ verify-double-entry-balance-trigger: ${error.message}`);
  process.exit(1);
}
