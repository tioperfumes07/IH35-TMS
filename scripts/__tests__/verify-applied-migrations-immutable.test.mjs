import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-applied-migrations-immutable.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/applied-migrations-immutable");

test("passes when ledger checksum matches disk migration", () => {
  const fixtureRoot = path.resolve(fixturesRoot, "matches");
  const run = spawnSync("node", [scriptPath], {
    encoding: "utf8",
    cwd: fixtureRoot,
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:applied-migrations-immutable OK/);
});

test("fails with remediation when applied migration checksum drifts", () => {
  const fixtureRoot = path.resolve(fixturesRoot, "mismatches");
  const run = spawnSync("node", [scriptPath], {
    encoding: "utf8",
    cwd: fixtureRoot,
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /verify:applied-migrations-immutable FAILED/);
  assert.match(run.stderr, /Applied migrations are immutable/);
  assert.match(run.stderr, /Do not modify 0001_sample\.sql/);
});

test("skips when no ledger file exists", () => {
  const fixtureRoot = path.resolve(fixturesRoot, "no-ledger");
  const run = spawnSync("node", [scriptPath], {
    encoding: "utf8",
    cwd: fixtureRoot,
  });
  assert.equal(run.status, 0);
  assert.match(run.stderr, /verify:applied-migrations-immutable SKIP/);
});
