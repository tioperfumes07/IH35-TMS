import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const scriptPath = path.resolve(root, "scripts/verify-drivers-onboarding-wizard.mjs");

describe("verify-drivers-onboarding-wizard", () => {
  it("passes when A24-8 artifacts are present", () => {
    const run = execFileSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
    assert.match(run, /verify-drivers-onboarding-wizard.*OK/);
  });
});
