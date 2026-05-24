import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-accounting-autoload-coverage.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/accounting-autoload-coverage");

test("passes when src and dist route files cover all smoke endpoints", () => {
  const fixtureRoot = path.resolve(fixturesRoot, "ok");
  const run = spawnSync(
    "node",
    [
      scriptPath,
      "--smoke-script",
      path.resolve(fixtureRoot, "smoke.ts"),
      "--src-root",
      path.resolve(fixtureRoot, "src/accounting"),
      "--dist-root",
      path.resolve(fixtureRoot, "dist/accounting"),
    ],
    { encoding: "utf8" }
  );

  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:accounting-autoload-coverage OK/);
});

test("fails when dist route files miss a smoke endpoint", () => {
  const fixtureRoot = path.resolve(fixturesRoot, "missing-dist");
  const run = spawnSync(
    "node",
    [
      scriptPath,
      "--smoke-script",
      path.resolve(fixtureRoot, "smoke.ts"),
      "--src-root",
      path.resolve(fixtureRoot, "src/accounting"),
      "--dist-root",
      path.resolve(fixtureRoot, "dist/accounting"),
    ],
    { encoding: "utf8" }
  );

  assert.equal(run.status, 1);
  assert.match(run.stderr, /dist: missing endpoints/);
  assert.match(run.stderr, /\/api\/v1\/accounting\/profit-loss/);
});
