import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const scriptPath = path.resolve(root, "scripts/verify-drivers-pwa-live-data.mjs");

describe("verify-drivers-pwa-live-data", () => {
  it("passes on current tree", () => {
    const run = spawnSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /verify-drivers-pwa-live-data.*OK/);
  });
});
