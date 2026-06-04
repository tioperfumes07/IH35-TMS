import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const scriptPath = path.resolve(root, "scripts/verify-drivers-training-crud-on-profile.mjs");

describe("verify-drivers-training-crud-on-profile", () => {
  it("passes when A24-7 wiring is present", () => {
    const runResult = execFileSync(process.execPath, [scriptPath], {
      cwd: root,
      encoding: "utf8",
    });
    assert.match(runResult, /verify-drivers-training-crud-on-profile OK/);
  });
});
