import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const script = path.join(root, "scripts/verify-escrow-page-mutation-onerror.mjs");

describe("verify-escrow-page-mutation-onerror", () => {
  it("passes on current tree", () => {
    const run = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /PASS/);
  });

  it("selftest passes (fail-closed plant)", () => {
    const run = spawnSync(process.execPath, [script, "--selftest"], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /selftest PASS/);
  });
});
