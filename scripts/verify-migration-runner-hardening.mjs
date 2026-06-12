#!/usr/bin/env node
/**
 * verify:migration-runner-hardening
 *
 * Tests that the migration runner correctly rejects unrecognized filename patterns
 * and accepts valid patterns. Uses the SAME pure validation logic as db-migrate.mjs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIGRATION_FILE_PATTERN_LEGACY,
  MIGRATION_FILE_PATTERN_TIMESTAMP,
  isMigrationFile,
  validateMigrationFilenames,
} from "./lib/migration-filename-validation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "db", "migrations");

// Test helper that tests the real validation logic against an array of filenames
function assertNoUnrecognizedMigrations(names) {
  const sqlFiles = names.filter((n) => n.endsWith(".sql"));
  const bad = sqlFiles.filter((n) => !isMigrationFile(n));
  if (bad.length > 0) {
    throw new Error(
      `MIGRATION RUNNER: unrecognized migration filename(s) — these would be SILENTLY ` +
        `SKIPPED:\n  ${bad.join("\n  ")}\n` +
        `New migrations must use 12-digit timestamp format: YYYYMMDDHHMM_slug.sql`,
    );
  }
}

// Test cases: [filename, shouldBeAccepted]
const TEST_CASES = [
  // BAD filenames (should be rejected)
  { filename: "20260612_221500_x.sql", shouldBeAccepted: false, reason: "YYYYMMDD_HHMMSS (8+6) format" },
  { filename: "99_x.sql", shouldBeAccepted: false, reason: "too few digits" },
  { filename: "foo.sql", shouldBeAccepted: false, reason: "no numeric prefix" },
  { filename: "2026061_221500_x.sql", shouldBeAccepted: false, reason: "7-digit date" },
  { filename: "20260612221500_x.sql.sql", shouldBeAccepted: false, reason: "double extension" },
  { filename: "20260612221500.sql", shouldBeAccepted: false, reason: "no slug" },
  { filename: "_20260612221500_x.sql", shouldBeAccepted: false, reason: "leading underscore" },

  // GOOD filenames (should be accepted)
  { filename: "202606122215_x.sql", shouldBeAccepted: true, reason: "12-digit timestamp format" },
  { filename: "0397_x.sql", shouldBeAccepted: true, reason: "4-digit legacy format" },
  { filename: "0001_audit_init.sql", shouldBeAccepted: true, reason: "4-digit legacy format" },
  { filename: "0001a_audit_init.sql", shouldBeAccepted: true, reason: "4-digit + letter legacy" },
  { filename: "202606071430_add_foo_column.sql", shouldBeAccepted: true, reason: "12-digit timestamp (YYYYMMDDHHMM)" },
  { filename: "9999_final_legacy.sql", shouldBeAccepted: true, reason: "max 4-digit legacy" },
];

let passed = 0;
let failed = 0;

console.log("Testing filename pattern recognition...\n");

// Test individual pattern matching
for (const tc of TEST_CASES) {
  const isAccepted = isMigrationFile(tc.filename);
  const status = isAccepted === tc.shouldBeAccepted ? "PASS" : "FAIL";

  if (status === "PASS") {
    passed++;
    console.log(`  [PASS] ${tc.filename} — ${tc.reason}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${tc.filename} — expected ${tc.shouldBeAccepted ? "accepted" : "rejected"}, got ${isAccepted ? "accepted" : "rejected"}`);
  }
}

console.log("\nTesting assertNoUnrecognizedMigrations() throws on bad filenames...");

// Test that validation throws for bad filenames
const badFilenames = TEST_CASES.filter((tc) => !tc.shouldBeAccepted).map((tc) => tc.filename);
try {
  assertNoUnrecognizedMigrations(badFilenames);
  console.log("  [FAIL] Expected validation to throw for bad filenames, but it did not");
  failed++;
} catch (error) {
  if (error.message.includes("SILENTLY SKIPPED") && error.message.includes("20260612_221500_x.sql")) {
    console.log("  [PASS] Validation correctly throws for bad filenames");
    passed++;
  } else {
    console.log(`  [FAIL] Validation threw but with unexpected message: ${error.message.slice(0, 100)}...`);
    failed++;
  }
}

console.log("\nTesting assertNoUnrecognizedMigrations() passes on good filenames...");

// Test that validation passes for good filenames
const goodFilenames = TEST_CASES.filter((tc) => tc.shouldBeAccepted).map((tc) => tc.filename);
try {
  assertNoUnrecognizedMigrations(goodFilenames);
  console.log("  [PASS] Validation passes for good filenames");
  passed++;
} catch (error) {
  console.log(`  [FAIL] Validation unexpectedly threw for good filenames: ${error.message.slice(0, 100)}...`);
  failed++;
}

console.log("\nTesting assertNoUnrecognizedMigrations() passes on empty array...");

// Test that validation passes for empty array
try {
  assertNoUnrecognizedMigrations([]);
  console.log("  [PASS] Validation passes for empty array");
  passed++;
} catch (error) {
  console.log(`  [FAIL] Validation unexpectedly threw for empty array: ${error.message.slice(0, 100)}...`);
  failed++;
}

console.log("\nTesting non-.sql files are ignored (e.g. README.md)...");

// Test that non-.sql files are ignored (not flagged as bad)
try {
  assertNoUnrecognizedMigrations(["README.md", "20260612_221500_x.sql", "foo.txt"]);
  console.log("  [FAIL] Expected validation to throw when bad .sql files present");
  failed++;
} catch (error) {
  if (error.message.includes("20260612_221500_x.sql") && !error.message.includes("README.md")) {
    console.log("  [PASS] Non-.sql files are correctly ignored");
    passed++;
  } else {
    console.log(`  [FAIL] Validation threw but message incorrect: ${error.message.slice(0, 100)}...`);
    failed++;
  }
}

console.log("\nTesting real validateMigrationFilenames() against actual db/migrations/...");
try {
  // This will throw if ANY .sql file in db/migrations/ doesn't match the patterns
  validateMigrationFilenames(MIGRATIONS_DIR);
  console.log("  [PASS] All migration files in db/migrations/ have valid filenames");
  passed++;
} catch (error) {
  console.log(`  [FAIL] ${error.message}`);
  failed++;
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\nverify:migration-runner-hardening FAILED");
  process.exit(1);
}

console.log("\nverify:migration-runner-hardening OK");
process.exit(0);
