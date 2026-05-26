import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-csv-import-gated-for-projected-entities.mjs");
const fixturesRoot = path.resolve(root, "scripts/__tests__/fixtures/csv-import-gated-for-projected-entities");

function runFixture(fixtureName) {
  const fixtureRoot = path.resolve(fixturesRoot, fixtureName);
  return spawnSync("node", [scriptPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_CSV_IMPORT_GATED_ROOT: fixtureRoot,
    },
  });
}

test("passes when projected entities are env-gated", () => {
  const run = runFixture("complete");
  assert.equal(run.status, 0);
  assert.match(run.stdout, /verify:csv-import-gated-for-projected-entities OK/);
});

test("fails when vehicles import is not env-gated", () => {
  const run = runFixture("missing-vehicle-gate");
  assert.equal(run.status, 1);
  assert.match(run.stderr, /ungated_csv_import:vehicles/);
});
