import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const result = spawnSync("node", ["scripts/verify-catalog-factory-coverage.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /verify:catalog-factory-coverage PASS/);
