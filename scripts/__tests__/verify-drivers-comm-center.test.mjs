import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.resolve(root, "scripts/verify-drivers-comm-center.mjs");

describe("verify-drivers-comm-center", () => {
  it("passes on current tree", () => {
    const run = execFileSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });
    assert.match(run, /verify-drivers-comm-center.*OK/);
  });
});
