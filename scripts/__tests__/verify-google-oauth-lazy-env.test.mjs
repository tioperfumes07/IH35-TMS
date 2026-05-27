import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-google-oauth-lazy-env.mjs");

test("passes when oauth lazy guard is compiled into dist", () => {
  const run = spawnSync("node", [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /verify:google-oauth-lazy-env: ok/);
});
