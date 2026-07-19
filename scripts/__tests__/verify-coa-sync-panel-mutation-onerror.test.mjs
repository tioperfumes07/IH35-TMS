import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const script = path.join(process.cwd(), "scripts/verify-coa-sync-panel-mutation-onerror.mjs");

test("verify:coa-sync-panel-mutation-onerror --selftest passes", () => {
  const res = spawnSync(process.execPath, [script, "--selftest"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /--selftest PASS/);
});

test("verify:coa-sync-panel-mutation-onerror passes on current tree", () => {
  const res = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /PASS \(2 onError handlers for 2 mutations\)/);
});
