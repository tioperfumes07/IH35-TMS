#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VITEST_REPORT_PATH = path.join(ROOT, ".tmp-vitest-backend.json");
const VERIFY_DB_URL = "postgres://verify:verify@localhost:54329/ih35_verify";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
    ...options,
  });
  return result.status ?? 1;
}

function fail(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

function assertDockerAvailable() {
  const result = spawnSync("docker", ["--version"], { stdio: "ignore" });
  return (result.status ?? 1) === 0;
}

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    if (!process.env.DATABASE_DIRECT_URL) {
      process.env.DATABASE_DIRECT_URL = process.env.DATABASE_URL;
    }
    return;
  }

  if (!assertDockerAvailable()) {
    fail(
      "Docker required for verify:pre-commit. Either install Docker Desktop and run npm run verify:db:start, or set DATABASE_URL to your own Postgres 16 instance and re-run.",
      2
    );
  }

  const startStatus = run("npm", ["run", "verify:db:start"]);
  if (startStatus !== 0) {
    fail("verify:pre-commit could not start verify database via docker compose.", 2);
  }

  process.env.DATABASE_URL = VERIFY_DB_URL;
  process.env.DATABASE_DIRECT_URL = VERIFY_DB_URL;
}

function parseBackendVitestReport() {
  if (!fs.existsSync(VITEST_REPORT_PATH)) {
    fail("verify:pre-commit backend-vitest did not produce JSON output.", 1);
  }

  const raw = fs.readFileSync(VITEST_REPORT_PATH, "utf8");
  const report = JSON.parse(raw);
  const migrationSuites = (report.testResults ?? []).filter((suite) => suite.name?.endsWith(".migration.test.ts"));
  const allMigrationAssertions = migrationSuites.flatMap((suite) => suite.assertionResults ?? []);
  const skippedMigrationAssertions = allMigrationAssertions.filter((assertion) => assertion.status === "skipped");

  console.log(
    `verify:pre-commit migration suites=${migrationSuites.length} assertions=${allMigrationAssertions.length} skipped=${skippedMigrationAssertions.length}`
  );

  if (allMigrationAssertions.length === 0) {
    fail("verify:pre-commit found zero migration assertions; expected migration suites to execute.", 1);
  }

  if (skippedMigrationAssertions.length > 0) {
    console.error("verify:pre-commit detected skipped migration tests:");
    for (const assertion of skippedMigrationAssertions) {
      console.error(` - ${assertion.fullName ?? assertion.title ?? "<unknown test>"}`);
    }
    process.exit(1);
  }
}

function cleanup() {
  if (fs.existsSync(VITEST_REPORT_PATH)) {
    fs.rmSync(VITEST_REPORT_PATH, { force: true });
  }
}

try {
  console.log("verify:pre-commit step 1/13: ensure-database-url");
  ensureDatabaseUrl();

  console.log("verify:pre-commit step 2/13: db-reset");
  if (run("npm", ["run", "verify:db:reset"]) !== 0) process.exit(1);

  console.log("verify:pre-commit step 3/13: build-backend-emit");
  if (run("npm", ["run", "build:backend"]) !== 0) process.exit(1);

  console.log("verify:pre-commit step 4/13: frontend-tsc");
  if (run("npx", ["tsc", "-b"], { cwd: path.join(ROOT, "apps/frontend") }) !== 0) process.exit(1);

  console.log("verify:pre-commit step 5/13: verify-arch-design");
  if (run("npm", ["run", "verify:arch-design"]) !== 0) process.exit(1);

  console.log("verify:pre-commit step 6/13: verify-geofence-breach-tenant-scope");
  if (run("node", ["scripts/verify-geofence-breach-tenant-scope.mjs"]) !== 0) process.exit(1);

  console.log("verify:pre-commit step 7/13: verify-scheduler-tenant-context");
  if (run("npm", ["run", "verify:scheduler-tenant-context"]) !== 0) process.exit(1);

  console.log("verify:pre-commit step 8/13: verify-canonical-schema-names");
  if (run("npm", ["run", "verify:canonical-schema-names"]) !== 0) process.exit(1);

  console.log("verify:pre-commit step 9/13: verify-outbox-handler-parity");
  if (run("npm", ["run", "verify:outbox-handler-parity"]) !== 0) process.exit(1);

  console.log("verify:pre-commit step 10/13: verify-migration-application-consistency");
  if (run("npm", ["run", "verify:migration-application-consistency"]) !== 0) process.exit(1);

  console.log("verify:pre-commit step 11/13: backend-vitest");
  if (
    run("npx", [
      "vitest",
      "run",
      "--config",
      "apps/backend/vitest.config.ts",
      "--reporter=json",
      "--outputFile",
      VITEST_REPORT_PATH,
    ]) !== 0
  ) {
    process.exit(1);
  }
  parseBackendVitestReport();

  console.log("verify:pre-commit step 12/13: frontend-vitest");
  if (run("npx", ["vitest", "run", "src/components/ErrorBoundary.test.tsx"], { cwd: path.join(ROOT, "apps/frontend") }) !== 0) {
    process.exit(1);
  }

  console.log("verify:pre-commit step 13/13: summary-report");
  console.log("verify:pre-commit PASS");
  process.exit(0);
} finally {
  cleanup();
}
