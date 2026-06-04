import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-dvir-schema-presence.mjs");

test("passes when DVIR foundation wiring is present", () => {
  const runResult = spawnSync("node", [scriptPath], { encoding: "utf8", env: { ...process.env, VERIFY_DVIR_SCHEMA_ROOT: root } });
  assert.equal(runResult.status, 0, runResult.stderr || runResult.stdout);
  assert.match(runResult.stdout, /verify:dvir-schema-presence OK/);
});
