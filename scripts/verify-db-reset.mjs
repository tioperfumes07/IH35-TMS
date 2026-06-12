#!/usr/bin/env node
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const verifyUrl = process.env.DATABASE_URL ?? "";

function redact(url) {
  if (!url) return "<empty>";
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "****";
    return parsed.toString();
  } catch {
    return "<unparseable>";
  }
}

const isCiMigrationTest = process.env.CI_MIGRATION_TEST === "1";
const isLocalVerifyDb = verifyUrl.includes("localhost:54329") && verifyUrl.includes("ih35_verify");
const isNeonHost = verifyUrl.includes("neon.tech");
const isNeonBranch = isNeonHost && verifyUrl.includes("neondb");
// Strict: must be the specific ci-migration-test branch
const isCiMigrationTestBranch = verifyUrl.includes("ci-migration-test") ||
  (isNeonHost && process.env.NEON_BRANCH_NAME === "ci-migration-test");

// Default: localhost only
// With CI_MIGRATION_TEST=1: localhost OR ci-migration-test branch only
if (!isLocalVerifyDb && !(isCiMigrationTest && isNeonBranch && isCiMigrationTestBranch)) {
  console.error("verify:db:reset refusing to run. DATABASE_URL");
  console.error(" must point to either:");
  console.error("  - localhost:54329 + ih35_verify (local), OR");
  console.error("  - Neon ci-migration-test branch (CI_MIGRATION_TEST=1 + NEON_BRANCH_NAME=ci-migration-test)");
  if (isCiMigrationTest && !isCiMigrationTestBranch) {
    console.error("");
    console.error(" ERROR: CI_MIGRATION_TEST=1 is set but target is NOT ci-migration-test branch!");
    console.error(" To protect production/main data, this operation is blocked.");
    console.error("");
    console.error(" Target: " + redact(verifyUrl));
    console.error("");
    console.error(" To reset ci-migration-test branch:");
    console.error("   1. Set NEON_BRANCH_NAME=ci-migration-test");
    console.error("   2. Or ensure DATABASE_URL contains 'ci-migration-test'");
  }
  console.error(" Got: " + redact(verifyUrl));
  process.exit(1);
}

// HARD SAFETY PRINT: target host + database/branch
const parsedUrl = (() => {
  try { return new URL(verifyUrl); } catch { return null; }
})();
const targetHost = parsedUrl?.host ?? "unknown";
const targetDb = parsedUrl?.pathname?.replace("/", "") ?? "unknown";
const neonBranchName = process.env.NEON_BRANCH_NAME ?? "not-set";

console.log("========================================");
console.log("HARD SAFETY CHECK");
console.log("Target Host:     " + targetHost);
console.log("Target Database: " + targetDb);
console.log("Neon Branch:     " + neonBranchName);
console.log("========================================");

const safetyCheck = verifyUrl.includes("ci-migration-test") || neonBranchName === "ci-migration-test";
if (isNeonHost && !safetyCheck) {
  console.error("");
  console.error("SAFETY ASSERTION FAILED: Target does NOT contain 'ci-migration-test'");
  console.error("This Neon host is NOT the ci-migration-test branch.");
  console.error("ABORTED — No reset performed.");
  console.error("");
  process.exit(1);
}
console.log("SAFETY CHECK PASSED: ci-migration-test branch confirmed.");
console.log("");

// For Neon CI branches: skip drop/recreate (branch is already isolated), just run migrations
// For local: do full drop/recreate cycle
if (isLocalVerifyDb) {
  const adminUrl = new URL(verifyUrl);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";

  const adminClient = new Client(buildPgClientConfig(adminUrl.toString()));

  try {
    await adminClient.connect();
    await adminClient.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = 'ih35_verify'
          AND pid <> pg_backend_pid()
      `
    );
    await adminClient.query("DROP DATABASE IF EXISTS ih35_verify");
    await adminClient.query("CREATE DATABASE ih35_verify");
  } catch (error) {
    console.error("verify:db:reset failed during drop/recreate:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await adminClient.end();
  }
} else {
  console.log("Neon CI branch detected — skipping drop/recreate, running migrations directly...");
}

const migrateResult = spawnSync("npm", ["run", "db:migrate"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: verifyUrl,
    DATABASE_DIRECT_URL: verifyUrl,
  },
});

if ((migrateResult.status ?? 1) !== 0) {
  process.exit(migrateResult.status ?? 1);
}

console.log("verify:db:reset completed.");
