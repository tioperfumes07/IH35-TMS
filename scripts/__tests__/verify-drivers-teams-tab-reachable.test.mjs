import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const scriptPath = path.resolve(root, "scripts/verify-drivers-teams-tab-reachable.mjs");

test("verify:drivers-teams-tab-reachable passes when Teams tab is wired", () => {
  const run = spawnSync("node", [scriptPath], { encoding: "utf8", cwd: root });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /verify-drivers-teams-tab-reachable.*OK/);
});
