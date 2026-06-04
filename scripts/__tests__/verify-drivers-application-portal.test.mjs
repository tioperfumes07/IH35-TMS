import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const scriptPath = path.resolve(root, "scripts/verify-drivers-application-portal.mjs");

describe("verify-drivers-application-portal", () => {
  it("passes on current tree", () => {
    const run = execSync(`node ${scriptPath}`, { cwd: root, encoding: "utf8" });
    assert.match(run, /verify-drivers-application-portal.*OK/);
  });
});
