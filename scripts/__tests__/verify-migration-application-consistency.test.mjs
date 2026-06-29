import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-migration-application-consistency.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/migration-application-consistency");

test("fails when migration-declared objects are missing", () => {
  const migrationsDir = path.resolve(fixturesRoot, "broken-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-empty.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /verify:migration-application-consistency FAILED/);
  assert.match(run.stderr, /table missing: qa\.test_table/);
});

test("passes when all migration-declared objects exist", () => {
  const migrationsDir = path.resolve(fixturesRoot, "ok-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-ok.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:migration-application-consistency OK/);
});

test("handles table rename across migration order", () => {
  const migrationsDir = path.resolve(fixturesRoot, "rename-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-rename-ok.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:migration-application-consistency OK/);
});

test("handles table rename inside DO block", () => {
  const migrationsDir = path.resolve(fixturesRoot, "do-rename-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-do-rename-ok.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:migration-application-consistency OK/);
});

test("ignores comments and notices containing the word would", () => {
  const migrationsDir = path.resolve(fixturesRoot, "would-noise-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-would-noise-ok.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:migration-application-consistency OK/);
});

test("ignores conditional foreign keys added inside DO blocks", () => {
  const migrationsDir = path.resolve(fixturesRoot, "do-conditional-fk-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-do-conditional-fk-ok.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:migration-application-consistency OK/);
});

test("fails when declared table is missing out-of-band", () => {
  const migrationsDir = path.resolve(fixturesRoot, "ok-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-missing-table.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /table missing: qa\.child/);
});

test("fails when declared index is missing out-of-band", () => {
  const migrationsDir = path.resolve(fixturesRoot, "ok-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-missing-index.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /index missing: qa\.idx_child_parent/);
});

test("fails when declared foreign key is missing out-of-band", () => {
  const migrationsDir = path.resolve(fixturesRoot, "ok-migrations");
  const stateFile = path.resolve(fixturesRoot, "state-missing-fk.json");
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--state-file", stateFile], {
    encoding: "utf8",
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /foreign_key missing: qa\.child\.fk_child_parent/);
});

// ── CODER-21: §1.5 no-prod-fallback lock ──────────────────────────────────────
// The guard must REFUSE the prod endpoint and REQUIRE an explicit fresh-DB url, so a bare run can
// never silently connect to production via .env DATABASE_DIRECT_URL.

test("refuses to connect to the production endpoint (no silent prod read)", () => {
  const migrationsDir = path.resolve(fixturesRoot, "ok-migrations");
  const prodUrl = "postgres://u:p@ep-broad-block-akykk7bw.us-east-1.aws.neon.tech/neondb?sslmode=require";
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir, "--database-url", prodUrl], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "", DATABASE_DIRECT_URL: "" },
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /refusing to connect to the PRODUCTION endpoint/);
});

test("requires an explicit database url (no .env DATABASE_DIRECT_URL fallback)", () => {
  const migrationsDir = path.resolve(fixturesRoot, "ok-migrations");
  // No --database-url, no --state-file, and a cleared env: must fail with the require-url message,
  // NOT fall back to .env prod creds.
  const run = spawnSync("node", [scriptPath, "--migrations-dir", migrationsDir], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "", DATABASE_DIRECT_URL: "" },
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no database url|FRESH-migrated DB/);
});
