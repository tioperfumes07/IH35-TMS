/**
 * Pure filename validation logic for migration files.
 * This module has NO side effects and is safe to import anywhere.
 *
 * These patterns MUST stay in sync with scripts/db-migrate.mjs
 */

import fs from "node:fs";

// Legacy format: 0001_name.sql, 0001a_name.sql
export const MIGRATION_FILE_PATTERN_LEGACY = /^\d{4}[a-z]?_.+\.sql$/i;

// New timestamp format: YYYYMMDDHHMM_name.sql (12 continuous digits)
export const MIGRATION_FILE_PATTERN_TIMESTAMP = /^\d{12}_.+\.sql$/i;

/**
 * Returns true if the filename matches a recognized migration pattern.
 */
export function isMigrationFile(name) {
  return MIGRATION_FILE_PATTERN_LEGACY.test(name) || MIGRATION_FILE_PATTERN_TIMESTAMP.test(name);
}

/**
 * Validates that all .sql files in the migrations directory match recognized patterns.
 * Throws a hard error if any unrecognized filenames are found, preventing silent skips.
 *
 * @param {string} migrationsDir - Path to the migrations directory
 */
export function validateMigrationFilenames(migrationsDir) {
  const allFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  const bad = allFiles.filter(
    (f) => !MIGRATION_FILE_PATTERN_LEGACY.test(f) && !MIGRATION_FILE_PATTERN_TIMESTAMP.test(f),
  );
  if (bad.length > 0) {
    throw new Error(
      `MIGRATION RUNNER: unrecognized migration filename(s) — these would be SILENTLY ` +
        `SKIPPED:\n  ${bad.join("\n  ")}\n` +
        `New migrations must use 12-digit timestamp format: YYYYMMDDHHMM_slug.sql`,
    );
  }
}

/**
 * Lists migration files in the directory that match recognized patterns.
 *
 * @param {string} migrationsDir - Path to the migrations directory
 * @returns {string[]} Sorted list of migration filenames
 */
export function listMigrationFiles(migrationsDir) {
  return fs.readdirSync(migrationsDir).filter((name) => isMigrationFile(name)).sort();
}
