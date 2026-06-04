import { execSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";

test("verify:maint-dvir-defect-intake passes on current tree", () => {
  const out = execSync("npm run verify:maint-dvir-defect-intake", { encoding: "utf8" });
  assert.match(out, /verify:maint-dvir-defect-intake PASS/);
});
