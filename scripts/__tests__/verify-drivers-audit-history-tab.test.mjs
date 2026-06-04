import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.resolve(root, "scripts/verify-drivers-audit-history-tab.mjs");

describe("verify-drivers-audit-history-tab", () => {
  it("passes when A24-6 wiring is present", () => {
    const runResult = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });
    assert.equal(runResult.status, 0, runResult.stderr || runResult.stdout);
    assert.match(runResult.stdout, /verify-drivers-audit-history-tab.*OK/);
  });
});
