import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function createVerifyPrecommitContext(rootDir) {
  const VITEST_REPORT_PATH = path.join(rootDir, ".tmp-vitest-backend.json");
  const VERIFY_DB_URL = "postgres://verify:verify@localhost:54329/ih35_verify";

  const run = (cmd, args, options = {}) => {
    const result = spawnSync(cmd, args, {
      stdio: "inherit",
      cwd: rootDir,
      env: process.env,
      ...options,
    });
    return result.status ?? 1;
  };

  const fail = (message, exitCode = 1) => {
    console.error(message);
    process.exit(exitCode);
  };

  const assertDockerAvailable = () => {
    const result = spawnSync("docker", ["--version"], { stdio: "ignore" });
    return (result.status ?? 1) === 0;
  };

  const ensureDatabaseUrl = () => {
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
  };

  const parseBackendVitestReport = () => {
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
  };

  const cleanup = () => {
    if (fs.existsSync(VITEST_REPORT_PATH)) {
      fs.rmSync(VITEST_REPORT_PATH, { force: true });
    }
  };

  return {
    ROOT: rootDir,
    VITEST_REPORT_PATH,
    run,
    fail,
    ensureDatabaseUrl,
    parseBackendVitestReport,
    cleanup,
  };
}
